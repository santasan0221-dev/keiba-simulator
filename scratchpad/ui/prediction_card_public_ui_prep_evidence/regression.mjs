import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire('/workspace/.onboarding-tools/node_modules/')('playwright');
const dir=path.dirname(new URL(import.meta.url).pathname);const bodies=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json')));const keys=Object.keys(bodies);
const roots={main:'/tmp/public-card-prep-main-real',off:'/tmp/public-card-prep-off',on:'/tmp/public-card-prep-on'};const servers={};
for(const [name,root]of Object.entries(roots)){const s=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/')||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>s.listen(0,'127.0.0.1',r));servers[name]=s;}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const report={scope:'NEW_CANDIDATE_SYNTHETIC_API_NOT_PRODUCTION',checks:[],errors:[],failedRequests:[],comparisons:[],raceSwitch:[]};
function fixture(key,kind){const body=structuredClone(bodies[key].on);const c=body.prediction_card;
 if(kind==='missing')delete body.prediction_card;
 if(kind==='no-explanation'||kind==='marks-only'){c.explanation.available=false;c.pairwise=[];for(const m of c.marks)Object.assign(m,{short:null,medium:null,evidence:null,unknown:[]});}
 if(kind==='no-selectivity'||kind==='marks-only')c.selectivity=null;
 if(kind==='long')for(const m of c.marks)m.horse_name='非常に長い名前の競走馬ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3);
 if(kind==='malformed')c.pairwise=null;
 if(kind==='optional-omitted'){delete c.explanation;delete c.pairwise;delete c.selectivity;for(const m of c.marks)for(const k of ['short','medium','evidence','unknown'])delete m[k];}
 if(kind==='three'){c.marks=c.marks.slice(0,3);c.pairwise=c.pairwise.filter(p=>c.marks.some(m=>m.horse_no===p.lower));}
 c && Object.assign(c,{raw_score:999999,contribution:'RAW_LEAK',weights:'RAW_LEAK',candidate_width:'RAW_LEAK'});return body;
}
const routeFor=key=>{const[o,d,v,n]=key.split('|');return `/race/${o}/${d}/${encodeURIComponent(v)}/${n}`;};
async function open(mode,width,kind='full',org='JRA'){
 const page=await browser.newPage({viewport:{width,height:width<500?844:1000}});const requests=[];let currentKind=kind;const key=keys.find(k=>k.startsWith(org+'|'));
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('requestfailed',r=>report.failedRequests.push(r.url()));
 await page.addInitScript(()=>{window.__shifts=[];window.__meaningful=[];new PerformanceObserver(l=>window.__shifts.push(...l.getEntries().filter(e=>!e.hadRecentInput).map(e=>e.value))).observe({type:'layout-shift',buffered:true});new MutationObserver(()=>{if(document.querySelector('.kt-race')&&!window.__meaningful.length)window.__meaningful.push(performance.now());}).observe(document,{childList:true,subtree:true});const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-10-10T10:00:00+09:00']));}static now(){return new NativeDate('2026-10-10T10:00:00+09:00').getTime();}};});
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(['fetch','xhr'].includes(r.request().resourceType()))requests.push(u.pathname);
  if(u.pathname.startsWith('/api/')){let data={};if(u.pathname.endsWith('/available-dates'))data={available_dates:['2026-10-10'],latest_prediction_date:'2026-10-10'};else if(u.pathname.endsWith('/races'))data={date:'2026-10-10',races:keys.filter(k=>!u.searchParams.get('organization')||k.startsWith(u.searchParams.get('organization')+'|')).map(k=>({...bodies[k].on.race,race_key:k}))};else if(u.pathname.includes('/race/')){const k=decodeURIComponent(u.pathname.split('/race/')[1]);await new Promise(r=>setTimeout(r,80));data=fixture(k,currentKind);}else if(u.pathname.includes('/trpc'))data=[{result:{data:{json:null}}}];else data={results:[],rows:[]};return r.fulfill({json:data});}
  if(u.hostname!=='127.0.0.1')return r.fulfill({body:'',contentType:'text/css'});return r.continue();
 });
 await page.goto(`http://127.0.0.1:${servers[mode].address().port}${routeFor(key)}`);await page.locator('.kt-race').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(650);
 const disclosure=page.locator('.prediction-card-production > details > summary');
 if(await disclosure.count()){assert((await disclosure.boundingBox()).height>=44);await disclosure.focus();await page.keyboard.press('Enter');assert(await page.locator('.prediction-card-production > details').evaluate(e=>e.open));}

 return {page,requests,key,setKind:v=>currentKind=v};
}
async function metrics(page){return page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{overflow:document.documentElement.scrollWidth-innerWidth,cardDOM:document.querySelectorAll('.prediction-card-production').length,marks:document.querySelectorAll('.prediction-card-marks>li').length,domNodes:document.querySelectorAll('*').length,layoutShifts:window.__shifts,firstMeaningfulMs:window.__meaningful[0],raceRect:rect('.kt-race'),publication:[...document.querySelectorAll('.kt-pick-trio')].map(e=>e.textContent),text:document.querySelector('.kt-race').textContent};});}
try{
 for(const mode of ['main','off','on'])for(const route of ['/','/ai-history','/betting-candidates','/performance-analysis']){
  const {page}=await open(mode,390);const origin=new URL(page.url()).origin;
  await page.goto(origin+route);await page.waitForTimeout(800);
  assert.equal(await page.locator('.prediction-card-production').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  assert((await page.locator('body').innerText()).length>50);
  report.checks.push({mode,route,cardDOM:0,overflow:0,bodyAvailable:true,scope:'fixture navigation/fallback'});
  await page.close();
 }
 assert.equal(report.errors.length,0);assert.equal(report.failedRequests.length,0);
}finally{fs.writeFileSync(path.join(dir,'regression-results.json'),JSON.stringify(report,null,2)+'\n');await browser.close();for(const s of Object.values(servers))s.close();}
console.log('PASS '+report.checks.length+' browser cases');
