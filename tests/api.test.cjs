const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('functions/api/domain.js','utf8').replaceAll('export ','');
async function run(domain,mode='registered'){
 const calls=[];const stored=new Map();const waits=[];
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
 const cache={match:async r=>stored.get(r.url)?.clone(),put:async(r,s)=>stored.set(r.url,s)};
 const context=vm.createContext({URL,Request,Response,caches:{default:cache},fetch:async(url)=>{
  calls.push(String(url));
  if(String(url).includes('iana.org'))return json({services:[[['com'],['https://rdap.example/']]]});
  if(String(url).includes('rdap.example'))return mode==='missing'?json({},404):mode==='error'?json({},503):json({ldhName:'EXAMPLE.COM',nameservers:[{ldhName:'one.ns.cloudflare.com'}],secureDNS:{delegationSigned:true},events:[{eventAction:'registration',eventDate:'2000-01-01'}],entities:[{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','Test Registrar']]]}],status:['ok']});
  return json({Status:0,Answer:[{type:String(url).includes('type=NS')?2:1,data:'192.0.2.1',TTL:300}]});
 }});
 vm.runInContext(source,context);
 const request=new Request('https://local/api/domain?domain='+encodeURIComponent(domain));
 const response=await context.onRequest({request,waitUntil:p=>waits.push(p)});await Promise.all(waits);
 return {response,data:await response.json(),calls,context};
}
test('registered RDAP, DNS, four ECS regions and cache contract',async()=>{const {response,data,calls}=await run('https://www.Example.com/path');assert.equal(response.status,200);assert.equal(data.domain,'example.com');assert.equal(data.registrar.name,'Test Registrar');assert.equal(data.cloudflareDns,true);assert.equal(data.dnssec,true);assert.deepEqual(data.propagation.map(r=>r.code),['TW','US','JP','SG']);assert.equal(calls.filter(u=>u.includes('edns_client_subnet')).length,8);assert.match(response.headers.get('cache-control'),/s-maxage=300/);});
test('invalid input rejected before upstream',async()=>{const r=await run('invalid');assert.equal(r.response.status,400);assert.equal(r.calls.length,0);});
test('authoritative 404 remains unregistered',async()=>{assert.equal((await run('example.com','missing')).data.registered,false);});
test('upstream error remains unknown',async()=>{assert.equal((await run('example.com','error')).data.registered,null);});
test('unsupported TLD remains unknown',async()=>{assert.equal((await run('example.test')).data.registered,null);});
test('unsupported method rejected',async()=>{const r=await run('example.com');assert.equal(r.context.onRequest({request:new Request('https://local/api/domain',{method:'POST'})}).status,405);});
