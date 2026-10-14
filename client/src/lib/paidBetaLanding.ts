import { paidBetaLandingEnabled } from "./paidBetaLandingFlag";
export { paidBetaLandingEnabled } from "./paidBetaLandingFlag";
export const LANDING_STATES = ["PRELAUNCH", "INVITE_OPEN", "FULL", "PAUSED"] as const;
export type LandingState = (typeof LANDING_STATES)[number];
export type LandingConfig = { enabled:boolean; state:LandingState; interestUrl:string|null; noteUrl:string|null; termsUrl:string|null; privacyUrl:string|null; commerceUrl:string|null; contactUrl:string|null; purchaseApproved:boolean };
export const HERO_COPIES = [
 "全対象JRAのAI候補6頭と、その理由を比較する分析β",
 "候補と根拠を見比べて、自分の判断を整理する。",
 "発走前の候補と説明を、forward検証とともに確認する。",
] as const;
// Operator-owned build configuration; no query/localStorage/client membership reads.

function url(value: unknown, kind:"form"|"note"|"legal") {
 if(typeof value!=="string"||!value.trim())return null;
 try{const u=new URL(value.trim());if(u.protocol!=="https:"||u.username||u.password)return null;
 if(kind==="form"&&!['forms.gle','docs.google.com'].includes(u.hostname))return null;
 if(kind==="note"&&u.hostname!=="note.com")return null;
 return u.href;}catch{return null;}
}
export function landingConfig(env:Record<string,unknown> = import.meta.env):LandingConfig {
 const raw=env.VITE_PAID_BETA_LANDING_STATE;
 return {enabled:paidBetaLandingEnabled(env.VITE_PAID_BETA_LANDING_ENABLED),state:LANDING_STATES.includes(raw as LandingState)?raw as LandingState:'PRELAUNCH',
 interestUrl:url(env.VITE_PAID_BETA_INTEREST_URL,'form'),noteUrl:url(env.VITE_NOTE_MEMBERSHIP_URL,'note'),
 termsUrl:url(env.VITE_PAID_BETA_TERMS_URL,'legal'),privacyUrl:url(env.VITE_PAID_BETA_PRIVACY_URL,'legal'),commerceUrl:url(env.VITE_PAID_BETA_COMMERCE_URL,'legal'),contactUrl:url(env.VITE_PAID_BETA_CONTACT_URL,'legal'),
 purchaseApproved:false}; // No purchase authorization in this prep, even if a URL exists.
}
export const COMPARISON = [
 ['公開◎','無料','無料'],['JRA開催日1Rの完全カード','無料サンプル','無料サンプル'],
 ['通常レースのPrediction Card','対象外','全対象JRA'],['AI候補6頭','サンプル','全対象JRA'],
 ['詳細説明・根拠・pairwise','サンプル','全対象JRA'],['候補収束度（Selectivity）','JRAサンプル','全対象JRA'],
 ['Simulator 2D / 3D・Share View','無料','無料'],['基本結果・主要forward実績','無料','無料'],
 ['NAR有料カード','対象外','対象外'],['Race Eligibility','対象外','対象外'],['Market Consensus','対象外','対象外'],['Prediction Card履歴','対象外','対象外'],
] as const;
export const FAQ = [
 ['何が見られますか？','β開始後は当日の全対象JRAの候補6頭、短い理由、詳細説明、説明根拠、候補間の比較を確認できます。'],
 ['公開◎とカード◎は違いますか？','別です。カード◎はAI候補順位1位で、公開本命ではありません。'],
 ['6頭は買い目ですか？','候補6頭は買い目でも購入推奨でもありません。'],
 ['JRA限定ですか？ NARは使えますか？','初期βはJRA限定です。NAR有料カードは含みません。'],
 ['Simulatorは有料ですか？','Simulator 2D / 3DとShare Viewは無料です。'],
 ['候補収束度とは？','候補6頭への収まりやすさを示す分析です。◎の的中確率ではありません。'],
 ['アクセスコードとは？','加入後、note会員限定記事で配布する月替わりコードです。有効期限があり、第三者共有は禁止です。'],
 ['別端末や別タブで使えますか？','有効なコードを再入力してください。タブを閉じた場合やアクセス期限でも再入力が必要になることがあります。'],
 ['更新・解約はどこで行いますか？','決済・更新・解約はnoteメンバーシップで行います。Webのアクセス解除はnoteの解約になりません。請求・返金条件は加入前にnote側で確認してください。'],
 ['β版とは何ですか？','feedbackを反映する検証段階です。機能・表示変更、一時停止、データ欠損が発生する場合があります。'],
 ['説明やカードが欠けることは？','入力不足や不整合で省略する場合があります。理由を推測で補いません。'],
 ['EligibilityやMarket Consensusは含みますか？','初期βには含みません。raw score、candidate_width、内部confidence・diagnosticsも公開しません。'],
] as const;
export function participation(config:LandingConfig) {
 if(config.state==='FULL')return {label:'募集停止中',url:null};
 if(config.state==='PAUSED')return {label:'現在募集を停止しています',url:null};
 return {label:config.state==='INVITE_OPEN'?'β参加を希望する':'β開始のお知らせを受け取る',url:config.interestUrl};
}
export function notePurchaseUrl(config:LandingConfig) {
 return config.state==='INVITE_OPEN'&&config.purchaseApproved&&config.termsUrl&&config.privacyUrl&&config.commerceUrl&&config.contactUrl?config.noteUrl:null;
}
