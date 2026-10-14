import React from "react";
import { useEffect } from "react";
import { Link } from "wouter";
import { PredictionCard } from "@/components/prediction/PredictionCard";
import type { PredictionCard as Card } from "@/lib/predictionCardContract";
import demo from "@/lib/paidBetaDemo.json";
import { COMPARISON, FAQ, HERO_COPIES, landingConfig, notePurchaseUrl, participation, type LandingConfig } from "@/lib/paidBetaLanding";
import { trackLandingEvent, type LandingEventName } from "@/lib/paidBetaAnalytics";
import "./paid-beta-landing.css";
const TITLE="KEIBA TRACE 分析β｜AI候補6頭と評価理由を比較";
const DESCRIPTION="JRA限定の分析β。AI候補6頭と理由を比較し、自分の判断を整理します。Simulatorと主要実績は無料。";
const VALUE_CARDS=[['AI候補6頭','◎○▲☆△△を候補順位として確認。公開本命◎とは別です。'],['短い理由','候補ごとの評価理由を読み比べます。'],['詳細説明','取得できる説明を、必要なときに開きます。'],['説明根拠','評価を支える入力と未評価項目を確認。'],['候補同士の比較','pairwiseで順位差の説明を確認。'],['候補収束度','JRAのSelectivity。◎の的中確率ではありません。']];
function useMetadata() {
 useEffect(()=>{
  const originalTitle=document.title;document.title=TITLE;
  const changes:Array<{element:Element;attribute:string;value:string|null}>=[];
  const update=(selector:string,attribute:string,value:string)=>{const element=document.querySelector(selector);if(element){changes.push({element,attribute,value:element.getAttribute(attribute)});element.setAttribute(attribute,value);}};
  const root=document.querySelector('link[rel="canonical"]')?.getAttribute('href')||'https://santasan0221-dev.github.io/keiba-simulator/';
  const canonical=new URL('beta',root.endsWith('/')?root:root+'/').href;
  update('meta[name="viewport"]','content','width=device-width, initial-scale=1');
  update('meta[name="description"]','content',DESCRIPTION);update('link[rel="canonical"]','href',canonical);
  for(const type of ['og','twitter']){update(`meta[${type==='og'?'property':'name'}="${type}:title"]`,'content',TITLE);update(`meta[${type==='og'?'property':'name'}="${type}:description"]`,'content',DESCRIPTION);}
  update('meta[property="og:url"]','content',canonical);
  return()=>{document.title=originalTitle;changes.forEach(({element,attribute,value})=>{if(value===null)element.removeAttribute(attribute);else element.setAttribute(attribute,value);});};
 },[]);
}
export default function PaidBetaLanding({config=landingConfig()}:{config?:LandingConfig}) {
 useMetadata();
 const track=(name:LandingEventName)=>trackLandingEvent(name,config.state);
 useEffect(()=>{if(config.enabled)trackLandingEvent('landing_view',config.state);},[config.enabled,config.state]);
 if(!config.enabled)return null;
 const interest=participation(config);const note=notePurchaseUrl(config);
 return <div className="paid-beta-shell">
  <a className="pb-skip" href="#beta-main">本文へ移動</a>
  <header className="pb-top"><Link href="/" aria-label="KEIBA TRACE ホーム">KEIBA <span>TRACE</span></Link><nav aria-label="分析βの案内"><a href="#pricing">提供範囲・料金</a><a href="#faq">FAQ</a></nav></header>
  <main id="beta-main">
   <section className="pb-hero" aria-labelledby="beta-title"><p className="pb-eyebrow">分析情報 · β版 · JRA限定</p><h1 id="beta-title">KEIBA TRACE <span>分析β</span></h1><p className="pb-value">{HERO_COPIES[0]}</p><p>候補と根拠を見比べて、自分の判断を整理する。</p><p className="pb-price-inline">月額 <strong>980円</strong><span>招待制20名</span></p><p className="pb-status">{config.state==='PRELAUNCH'?'β開始前':config.state==='INVITE_OPEN'?'参加希望受付':interest.label}</p><div className="pb-actions"><a className="pb-primary" href="#sample" onClick={()=>track('sample_cta')}>無料サンプルを見る</a><a href="#pricing">β参加について見る</a></div></section>
   <section className="pb-section" aria-labelledby="value-title"><h2 id="value-title">候補だけでなく、理由まで比較する</h2><p>980円の対象は、当日の全対象JRAを比較できる範囲と説明です。以下はβ開始後の提供内容です。</p><div className="pb-value-grid">{VALUE_CARDS.map(([title,text])=><article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></section>
   <section id="sample" className="pb-section" aria-labelledby="sample-title"><h2 id="sample-title">無料サンプルと表示デモ</h2><p>JRA開催日1Rの実カードサンプルは、開催日に公開予定です。現在このページでは対象レースを選定していません。</p><p><strong>以下は既存fixtureによるデモです。</strong> 実レースの予想・成績・有料データではありません。</p><details className="pb-demo"><summary>候補6頭と説明の表示デモを見る</summary><PredictionCard card={demo as Card}/></details><Link href="/free" className="pb-text-link">現在の無料公開範囲を見る</Link></section>
   <section id="pricing" className="pb-section" aria-labelledby="pricing-title"><h2 id="pricing-title">FREEと分析βの提供範囲</h2><p>β開始後の比較です。Simulatorと主要実績は無料のままです。</p><table className="pb-comparison"><caption>FREE／分析β比較</caption><thead><tr><th scope="col">機能</th><th scope="col">FREE</th><th scope="col">分析β</th></tr></thead><tbody>{COMPARISON.map(([feature,free,beta])=><tr key={feature}><th scope="row">{feature}</th><td>{free}</td><td>{beta}</td></tr>)}</tbody></table>
    <article className="pb-pricing" aria-labelledby="plan-title"><p className="pb-eyebrow">JRA限定 · β版 · 招待制20名</p><h3 id="plan-title">KEIBA TRACE 分析β</h3><p className="pb-price">月額 <strong>980円</strong></p><p>当日の全対象JRA Prediction Card、候補6頭、理由・詳細説明・根拠・pairwise・Selectivity。</p><p>決済・更新・解約はnoteメンバーシップで行います。加入後、会員限定記事の月替わりコードをWebで入力します。</p><p>販売開始前です。税込表記・自動更新・解約・請求条件を確認できる状態にしてから開始します。</p><p>対象外：NAR有料カード、Race Eligibility、Market Consensus、カード履歴。</p><p className="pb-disclaimer">AI分析は参考情報です。的中や利益を保証せず、馬券購入を推奨するものではありません。</p>
     {interest.url?<a className="pb-primary" href={interest.url} target="_blank" rel="noopener noreferrer" onClick={()=>track('beta_interest_cta')}>{interest.label}</a>:<p role="status">{interest.label}{config.state==='PRELAUNCH'||config.state==='INVITE_OPEN'?'：受付リンクは公開前です。':''}</p>}
     {note&&<a href={note} target="_blank" rel="noopener noreferrer" onClick={()=>track('note_cta')}>noteメンバーシップの加入条件を見る</a>}
    </article>
   </section>
   <section className="pb-section" aria-labelledby="flow-title"><h2 id="flow-title">β開始後の利用手順</h2><ol className="pb-flow">{['β参加を希望','招待後、noteメンバーシップに加入','会員限定記事を確認','月替わりコードをコピー','KEIBA TRACEの対象レース画面でコード入力','JRA Prediction Cardを閲覧'].map(x=><li key={x}>{x}</li>)}</ol><p>コードには有効期限があります。第三者共有は禁止です。月替わり、別端末・別タブ、アクセス期限などで再入力が必要になる場合があります。コードは本人identityではありません。</p></section>
   <section className="pb-section pb-free" aria-labelledby="free-title"><h2 id="free-title">無料で確認できること</h2><p>Simulator 2D／3DとShare View、基本結果、主要forward実績は無料です。</p><div className="pb-actions"><Link href="/simulator" onClick={()=>track('simulator_cta')}>無料Simulatorを使う</Link><Link href="/performance-analysis">実績・分析を見る</Link><Link href="/ai-history">結果・履歴を見る</Link></div><p>実績は対象件数・評価期間・forwardとhistoricalの区分を、各ページの正本表示で確認してください。このページに成績値は掲載しません。</p></section>
   <section id="faq" className="pb-section" aria-labelledby="faq-title"><h2 id="faq-title">よくある質問</h2>{FAQ.map(([question,answer])=><details className="pb-faq" key={question} onToggle={e=>{if(e.currentTarget.open)track('faq_open');}}><summary>{question}</summary><p>{answer}</p></details>)}</section>
   <section className="pb-section" aria-labelledby="beta-notice"><h2 id="beta-notice">β版としてのご案内</h2><p>表示や機能の変更、一時停止、入力欠損が発生する場合があります。feedbackを反映しながら検証します。的中・利益保証、買い目販売、購入推奨は行いません。</p><p>公開◎とAI候補◎は別です。候補収束度は◎の的中確率を示しません。</p></section>
  </main>
  <footer className="pb-footer"><Link href="/">KEIBA TRACE ホーム</Link><a href="#flow-title">利用案内</a><a href="#faq">解約・利用FAQ</a>{[[config.termsUrl,'利用規約'],[config.privacyUrl,'プライバシー'],[config.commerceUrl,'取引条件'],[config.contactUrl,'問い合わせ']].map(([href,label])=>href?<a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>:null)}<p>分析情報を、自分の判断の参考に。</p></footer>
 </div>;
}
