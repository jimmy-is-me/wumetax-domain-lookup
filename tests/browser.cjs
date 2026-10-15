const { chromium }=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const payload={domain:'example.com',registered:true,source:'rdap',nameserverSource:'dns',nameserverTtl:0,checkedAt:'2026-10-15T08:00:00Z',rdapNameservers:['old.gandi.net'],nameserverMismatch:true,registrar:{name:'Example Registrar'},dates:{registration:'2000-01-01'},nameservers:['one.ns.cloudflare.com'],dnssec:true,cloudflareDns:true,dns:{A:['192.0.2.1'],AAAA:['2001:db8::1'],MX:['10 mail.example.com'],NS:['one.ns.cloudflare.com']},propagation:['台灣','美國','日本','新加坡'].map(name=>({name,status:'resolved',a:['192.0.2.1'],ns:['one.ns.cloudflare.com'],ttl:300})),raw:{objectClassName:'domain'}};
 await page.route('**/api/domain?*',r=>r.fulfill({json:payload}));
 await page.goto('http://127.0.0.1:4173');
 await page.locator('.hero-copy').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});await page.screenshot({path:`tests/preview-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 await page.setViewportSize({width:1440,height:1000});await page.locator('#domainInput').fill('https://www.example.com/path');await page.locator('#lookupButton').click();await page.locator('#resultSection:not([hidden])').waitFor();assert.equal(await page.locator('.propagation-region').count(),4);assert.equal(await page.locator('.dns-group').count(),4);assert.equal(await page.locator('.history-item').count(),1);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.locator('#shareResult').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/\?domain=example.com/);
 await page.locator('#copyNs').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'one.ns.cloudflare.com');
 assert.match(await page.locator('#nameserverSource').textContent(),/DNS NS/);assert.match(await page.locator('#nameserverFreshness').textContent(),/TTL：0/);assert(await page.locator('#nameserverDifference').isVisible());
 await page.locator('.registry-ns summary').click();assert.match(await page.locator('#rdapNameserverList').textContent(),/old.gandi.net/);assert.match(await page.locator('#nameserverList').textContent(),/one.ns.cloudflare.com/);
 payload.nameservers=['updated.ns.cloudflare.com'];payload.dns.NS=payload.nameservers;
 await page.locator('#refreshResult').click();await page.waitForFunction(()=>document.querySelector('#nameserverList').textContent.includes('updated.ns.cloudflare.com'));
 await page.locator('#copyNs').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'updated.ns.cloudflare.com');
 await page.locator('.raw-details summary').click();assert.match(await page.locator('#rawJson').textContent(),/objectClassName/);
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`result overflow ${width}`);await page.screenshot({path:`tests/result-${width}.png`,fullPage:true});}
 await page.locator('#clearHistory').click();assert.equal(await page.locator('.history-item').count(),0);
 for(const registered of [false,null]){await page.route('**/api/domain?*',r=>r.fulfill({json:{domain:'example.com',registered}}));await page.locator('#lookupButton').click();await page.waitForFunction(v=>document.querySelector('#statusPanel').classList.contains(v),registered===false?'available':'unknown');assert(await page.locator('#registeredContent').isHidden());}
 await page.route('**/api/domain?*',r=>r.fulfill({status:502,json:{registered:null,message:'服務暫時無法連線'}}));await page.locator('#lookupButton').click();await page.locator('.message-box.error').waitFor();assert(await page.locator('#resultSection').isHidden());
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.orbit').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>localStorage.setItem('wumetax_domain_lookup_history_v1','{}'));await page.reload();assert.equal(await page.locator('.history-item').count(),0);
 await page.route('**/api/domain?*',r=>r.fulfill({json:payload}));
 await page.goto('http://127.0.0.1:4173/?domain=example.com');await page.locator('#resultSection:not([hidden])').waitFor();assert.equal(await page.locator('#resultDomain').textContent(),'example.com');
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('blocked storage')};});await page.goto('http://127.0.0.1:4173/?domain=example.com');await page.locator('#resultSection:not([hidden])').waitFor();assert(await page.locator('#messageSection').isHidden());
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: responsive layout, DNS/RDAP sources, refresh/copy latest NS, TTL zero, statuses, history, raw JSON, reduced motion, storage.');
})().catch(e=>{console.error(e);process.exit(1)});

