import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const {chromium}=createRequire('/workspace/.onboarding-tools/node_modules/')('playwright');
const dir=path.dirname(new URL(import.meta.url).pathname);const bodies=JSON.parse(fs.readFileSync(path.resolve(dir,'../../ui/prediction_card_public_ui_prep_evidence/api-fixtures.json')));const keys=Object.keys(bodies);
const server=http.createServer((req,res)=>{let file=path.join('/tmp/note-beta-ui-on',decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file='/tmp/note-beta-ui-on/index.html';res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const report={kind:'ISOLATED_SYNTHETIC_API_BROWSER_EXTERNAL_RESOURCES_STUBBED',checks:[],errors:[]};
const route=k=>{const[o,d,v,n]=k.split('|');return `/race/${o}/${d}/${encodeURIComponent(v)}/${n}`;};
try{for(const [width,height] of [[390,844],[667,375],[1440,900]]){
 const context=await browser.newContext({viewport:{width,height}});await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'text/css',body:''}));const page=await context.newPage();let token=null,expires=0;let paidRequests=0;
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('https://api.keibalab.net/**',async r=>{const u=new URL(r.request().url());const auth=r.request().headers().authorization;let payload;
 if(u.pathname==='/api/beta/access'){token=crypto.randomBytes(32).toString('base64url');expires=Date.now()+20000;payload={access_token:token,expires_at:new Date(expires).toISOString(),tier:'BETA_ACCESS',scope:'JRA'};}
 else if(u.pathname==='/api/beta/logout'){token=null;payload={active:false,tier:'FREE'};}
 else if(u.pathname==='/api/beta/session'){payload={active:!!token&&auth===`Bearer ${token}`&&Date.now()<expires,tier:'BETA_ACCESS',scope:'JRA',expires_at:new Date(expires).toISOString()};}
 else if(u.pathname.startsWith('/api/lab/race/')){const key=decodeURIComponent(u.pathname.slice('/api/lab/race/'.length));const paid=!!token&&auth===`Bearer ${token}`&&Date.now()<expires&&key.startsWith('JRA|');if(paid)paidRequests++;payload=structuredClone((bodies[key]||bodies[keys[0]])[paid?'on':'off']);}
 else if(u.pathname==='/api/lab/races')payload={races:keys.map(k=>({...bodies[k].off.race,race_date:bodies[k].off.race.date}))};
 else payload={};
 await r.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'private, no-store'},body:JSON.stringify(payload)});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}${route(keys[0])}`);await page.getByRole('button',{name:'アクセスを有効化'}).waitFor();assert.equal(await page.locator('.prediction-card').count(),0);
 await page.getByLabel('βアクセスコードを入力').fill('synthetic-input-only');await page.getByRole('button',{name:'アクセスを有効化'}).click();await page.locator('.prediction-card').waitFor({state:'attached'});assert.equal(await page.locator('.prediction-card').count(),1);assert(paidRequests>0);
 await page.locator('.prediction-card-production > details > summary').click();assert.equal(await page.getByLabel('βアクセスコードを入力').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(dir,`${width}-beta.png`),fullPage:true});
 // Cross-race document navigation restores only after server validation.
 await page.goto(`http://127.0.0.1:${server.address().port}${route(keys[1])}`);await page.locator('.prediction-card').waitFor({state:'attached'});assert.equal(await page.locator('.prediction-card-production').getAttribute('data-card-race-key'),keys[1]);
 await page.goBack();await page.locator('.prediction-card').waitFor({state:'attached'});assert.equal(await page.locator('.prediction-card-production').getAttribute('data-card-race-key'),keys[0]);
 await page.getByRole('button',{name:'βアクセスを解除'}).click();await page.getByRole('button',{name:'アクセスを有効化'}).waitFor();assert.equal(await page.locator('.prediction-card').count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('keiba_beta_session')),null);
 await page.goForward();await page.getByRole('button',{name:'アクセスを有効化'}).waitFor();assert.equal(await page.locator('.prediction-card').count(),0);
 report.checks.push({width,height,free_card:0,beta_card:1,logout_card:0,back_forward_stale:0,overflow:0});await context.close();
}}finally{await browser.close();server.close();}
fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify(report,null,2));assert.equal(report.errors.length,0);console.log(`PASS ${report.checks.length} widths`);
