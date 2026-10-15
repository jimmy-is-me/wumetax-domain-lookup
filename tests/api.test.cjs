const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('functions/api/domain.js','utf8').replaceAll('export ','');
function harness(mode='registered') {
 const calls=[], stored=new Map(), writes=[];
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
 const cache={match:async r=>stored.get(r.url)?.clone(),put:async(r,s)=>{writes.push(r.url);stored.set(r.url,s)}};
 const context=vm.createContext({URL,Request,Response,caches:{default:cache},fetch:async(url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url).includes('iana.org')) return json({services:[[['com'],['https://rdap.example/']]]});
  if(String(url).includes('rdap.example')) return mode==='missing'?json({},404):mode==='error'?json({},503):json({ldhName:'EXAMPLE.COM',nameservers:[{ldhName:'old.gandi.net.'}],secureDNS:{delegationSigned:true},events:[{eventAction:'registration',eventDate:'2000-01-01'}],entities:[{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','Test Registrar']]]}],status:['ok']});
  const type=new URL(url).searchParams.get('type');
  if(mode==='dns-failed' && String(url).includes('cloudflare-dns')) return json({},503);
  const types={A:1,AAAA:28,MX:15,NS:2};
  const records={A:'192.0.2.1',AAAA:'2001:db8::1',MX:'10 mail.example.com.',NS:'new.ns.cloudflare.com.'};
  return json({Status:0,Answer:mode==='dns-empty'?[]:[{type:5,data:'alias.example.com.',TTL:900},{type:types[type],data:records[type],TTL:mode==='zero-ttl'?0:300}]});
 }});
 vm.runInContext(source,context);
 return {calls,writes,context,async run(domain='example.com') {
  const response=await context.onRequest({request:new Request('https://local/api/domain?domain='+encodeURIComponent(domain)),waitUntil:()=>{}});
  return {response,data:await response.json()};
 }};
}
test('DNS NS replaces stale RDAP NS and identifies mismatch',async()=>{const h=harness();const {response,data}=await h.run('https://www.Example.com/path');assert.equal(response.status,200);assert.equal(data.domain,'example.com');assert.deepEqual(data.nameservers,['new.ns.cloudflare.com']);assert.deepEqual(data.rdapNameservers,['old.gandi.net']);assert.equal(data.nameserverSource,'dns');assert.equal(data.nameserverMismatch,true);assert.equal(data.nameserverTtl,300);assert.equal(data.cloudflareDns,true);assert.equal(data.registrar.name,'Test Registrar');assert.equal(data.dnssec,true);assert(Number.isFinite(Date.parse(data.checkedAt)));assert.deepEqual(data.propagation.map(r=>r.code),['TW','US','JP','SG']);assert.equal(h.calls.filter(c=>c.url.includes('edns_client_subnet')).length,8);assert.match(response.headers.get('cache-control'),/no-store/);});
test('every lookup repeats target RDAP and DNS requests without HTTP cache',async()=>{const h=harness();await h.run();await h.run();assert.equal(h.calls.filter(c=>c.url.includes('rdap.example')).length,2);assert.equal(h.calls.filter(c=>c.url.includes('cloudflare-dns')).length,8);assert(h.calls.filter(c=>!c.url.includes('iana.org')).every(c=>c.options.cache==='no-store'));assert(h.writes.every(url=>url.includes('iana.org')));});
test('only matching DNS record types are shown',async()=>{const {data}=await harness().run();assert.deepEqual(data.dns.A,['192.0.2.1']);assert.deepEqual(data.dns.AAAA,['2001:db8::1']);assert.deepEqual(data.dns.MX,['10 mail.example.com']);assert.deepEqual(data.dns.NS,['new.ns.cloudflare.com']);});
test('failed DNS explicitly falls back to RDAP',async()=>{const {data}=await harness('dns-failed').run();assert.equal(data.nameserverSource,'rdap');assert.equal(data.nameserverDnsOk,false);assert.deepEqual(data.nameservers,['old.gandi.net']);assert.equal(data.nameserverTtl,null);assert.equal(data.cloudflareDns,false);});
test('empty DNS explicitly falls back without claiming DNS failure',async()=>{const {data}=await harness('dns-empty').run();assert.equal(data.nameserverSource,'rdap');assert.equal(data.nameserverDnsOk,true);assert.equal(data.nameserverMismatch,false);});
test('TTL zero is preserved for current and regional records',async()=>{const {data}=await harness('zero-ttl').run();assert.equal(data.nameserverTtl,0);assert(data.propagation.every(r=>r.ttl===0));});
test('invalid input rejected before upstream',async()=>{const h=harness();assert.equal((await h.run('invalid')).response.status,400);assert.equal(h.calls.length,0);});
test('authoritative 404 remains unregistered',async()=>{assert.equal((await harness('missing').run()).data.registered,false);});
test('upstream error remains unknown',async()=>{assert.equal((await harness('error').run()).data.registered,null);});
test('unsupported TLD remains unknown',async()=>{assert.equal((await harness().run('example.test')).data.registered,null);});
test('unsupported method rejected',()=>{assert.equal(harness().context.onRequest({request:new Request('https://local/api/domain',{method:'POST'})}).status,405);});
