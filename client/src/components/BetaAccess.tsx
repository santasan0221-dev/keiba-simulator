import { useEffect, useState } from "react";
import { activateBeta, betaExpiry, betaGeneration, logoutBeta, restoreBeta, subscribeBeta } from "@/lib/betaAccess";
import { getApiBase } from "@/lib/singlePickAi";
export function BetaAccess() {
  const [, render] = useState(betaGeneration());
  const [code,setCode]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  useEffect(()=>{const off=subscribeBeta(()=>render(betaGeneration())); void restoreBeta(getApiBase()); const revisit=()=>{if(document.visibilityState === "visible") void restoreBeta(getApiBase());}; window.addEventListener("pageshow",revisit); document.addEventListener("visibilitychange",revisit); return()=>{off();window.removeEventListener("pageshow",revisit);document.removeEventListener("visibilitychange",revisit);};},[]);
  return <section aria-label="βアクセス"><h2>βアクセス</h2>{betaExpiry()>Date.now()?<><p>βアクセス有効（JRA限定）</p><p>有効期限: {new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"short",timeStyle:"short"}).format(betaExpiry())}（日本時間）</p><button disabled={busy} onClick={async()=>{setBusy(true);try{await logoutBeta(getApiBase());setMessage("");}catch(e){setMessage(String(e));}finally{setBusy(false);}}}>βアクセスを解除</button></>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{await activateBeta(getApiBase(),code);setCode("");}catch{setMessage("コードを確認してください");}finally{setBusy(false);}}}><label>βアクセスコードを入力<input value={code} maxLength={80} autoComplete="off" onChange={e=>setCode(e.target.value)}/></label><button disabled={busy}>アクセスを有効化</button></form>}<p role="status">{message}</p><p>準備中のβ機能です。note加入者向け月替わりコード。有効期限があります。Eligibility・Market Consensusは含みません。</p></section>;
}
