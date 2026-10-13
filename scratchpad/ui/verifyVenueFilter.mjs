import { chromium } from '/workspace/.onboarding-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const output = '/workspace/keiba-simulator/scratchpad/ui/race_list_venue_filter_evidence';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const metrics = { widths: [], fixtures: [], errors: [], requestChecks: [] };
let venues = ['東京', '京都', '新潟'];
let mode = 'normal';
let requests = 0;
const detail = JSON.parse(fs.readFileSync('client/src/__fixtures__/lab-race-v2.json', 'utf8'));
const page = await browser.newPage();
page.on('pageerror', error => { metrics.errors.push(String(error)); console.log('PAGEERROR', String(error)); });
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.includes('/api/lab/')) {
    if (url.pathname.endsWith('available-dates')) return route.fulfill({ json: { available_dates: ['2026-09-20'], latest_prediction_date: '2026-09-20' } });
    if (url.pathname.endsWith('/races')) {
      requests++;
      if (mode === 'error') return route.fulfill({status: 400, json: {error:'fixture'}});
      if (mode === 'loading') await new Promise(resolve => setTimeout(resolve, 1200));
      const races = venues.flatMap((venue, i) => [1, 2].map(race_no => ({ organization: 'NAR', venue, race_no, race_key: `NAR|2026-09-20|${venue}|${race_no}`, scheduled_start_at: null, decision: {status:'BET'}, top_pick: {name:`本命${i}`,final_mark:'◎'} })));
      return route.fulfill({ json: {date: url.searchParams.get('date'), races} });
    }
    if (url.pathname.includes('/race/')) return route.fulfill({json: detail});
    return route.fulfill({json:{rows:[],races:[],results:[]}});
  }
  if (url.hostname !== '127.0.0.1') return route.fulfill({body:''});
  return route.continue();
});
const bar = page.getByRole('group', {name:'開催場で絞り込み'});
for (const width of [320,360,390,430,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:3000/');
  await bar.waitFor();
  console.log('WIDTH', width, await page.locator('.real-race-card').count());
  await page.locator('.real-race-card').first().waitFor({timeout:5000}).catch(async error => { console.log(await page.locator('body').innerText(), metrics.errors); throw error; });
  const allCount = await page.locator('.real-race-card').count();
  const before = requests;
  const firstY = await page.locator('.real-race-card').first().evaluate(e=>e.getBoundingClientRect().top + scrollY);
  const dimensions = await bar.evaluate(e=>({height:e.getBoundingClientRect().height, minTarget:Math.min(...Array.from(e.querySelectorAll('button')).map(b=>b.getBoundingClientRect().height)),overflow:document.documentElement.scrollWidth-innerWidth,stripOverflow:e.scrollWidth-e.clientWidth}));
  const baselineY=await page.evaluate(()=>{const bar=document.querySelector('.race-venue-filter'); const display=bar.style.display;bar.style.display='none';const y=document.querySelector('.real-race-card').getBoundingClientRect().top+scrollY;bar.style.display=display;return y;});
  const baselineOverflow=await page.evaluate(()=>{const bar=document.querySelector('.race-venue-filter');bar.style.display='none';const overflow=document.documentElement.scrollWidth-innerWidth;bar.style.display='';return overflow;});
  console.log('LAYOUT',width,dimensions);
  if(dimensions.minTarget<44) throw Error('touch target');
  await bar.getByRole('button', {name:/東京/}).click();
  await page.waitForTimeout(100);
  if (await page.locator('.real-race-card').count() !== 2) throw Error('filter failed');
  if (requests !== before) throw Error('extra fetch');
  if (await bar.getByRole('button',{name:/東京/}).getAttribute('aria-pressed') !== 'true') throw Error('active');
  await page.reload(); await bar.waitFor();
  if(await page.locator('.real-race-card').count() !== 2) throw Error('reload');
  metrics.widths.push({width,allCount,firstRaceY:firstY,baselineWithoutBarY:baselineY,baselineOverflow,addedHeight:firstY-baselineY,clicksToSwitch:1,...dimensions});
  if([390,1440].includes(width)) {
    await page.screenshot({path:`${output}/${width}-selected.png`,fullPage:true});
    await bar.getByRole('button',{name:/すべて/}).click();
    await page.screenshot({path:`${output}/${width}-all.png`,fullPage:true});
    await page.goBack(); await page.waitForTimeout(100);
    if(await page.locator('.real-race-card').count()!==2) throw Error('back');
    await page.goForward(); await page.waitForTimeout(100);
    if(await page.locator('.real-race-card').count()!==6) throw Error('forward');
    await bar.getByRole('button',{name:/京都/}).focus(); await page.keyboard.press('Enter');
    if(await page.locator('.real-race-card').count()!==2) throw Error('keyboard');
    await page.screenshot({path:`${output}/${width}-keyboard.png`,fullPage:true});
  }
  metrics.requestChecks.push({width,extraRequestsOnSwitch:0});
}
for (const fixture of [[],['東京'],['東京','京都'],['東京','京都','新潟'],['東京','京都','新潟','中山'],['とても長い開催場名のテスト会場']]) {
  venues=fixture;
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:1000}); await page.goto('http://127.0.0.1:3000/?venue=invalid');
    await page.waitForFunction(expected=>document.querySelectorAll('.real-race-card').length===expected, fixture.length*2);
    await page.waitForTimeout(250);
    const count=await page.locator('.real-race-card').count();
    console.log('FIXTURE',width,fixture,count);
    if(count!==fixture.length*2) throw Error('fixture count');
    await page.screenshot({path:`${output}/${width}-fixture-${fixture.length}-${fixture[0]?.length||0}.png`,fullPage:true});
    metrics.fixtures.push({width,venues:fixture,count,overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});
  }
}
venues=['東京','京都'];
await page.goto('http://127.0.0.1:3000/'); await bar.waitFor();
await bar.getByRole('button',{name:/東京/}).click();
await page.locator('input[type=date]').fill('2026-09-21'); await page.waitForTimeout(300);
if(await page.locator('.real-race-card').count()!==2) throw Error('date retention');
venues=['京都']; await page.locator('input[type=date]').fill('2026-09-22'); await page.waitForTimeout(300);
if(await bar.getByRole('button',{name:/すべて/}).getAttribute('aria-pressed')!=='true') throw Error('date fallback');
for(const state of ['loading','error']) {
 mode=state; await page.goto('http://127.0.0.1:3000/'); await page.waitForTimeout(300);
 if(await bar.count()) throw Error('bar visible '+state);
 metrics.fixtures.push({state,barVisible:false});
}
await browser.close();
fs.writeFileSync('/workspace/keiba-simulator/scratchpad/ui/race_list_venue_filter_metrics.json',JSON.stringify(metrics,null,2));
console.log(JSON.stringify(metrics));
