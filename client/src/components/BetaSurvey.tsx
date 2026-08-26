import { useState } from "react";
import { Check, MessageSquareText, X } from "lucide-react";
import { normalizeAnalyticsConfig, trackBetaEvent } from "@/lib/betaAnalytics";

const COMPLETED_KEY = "keiba-lab:beta:survey-completed:v1";

const valueOptions = [
  ["information", "情報整理"],
  ["comparison", "レース比較"],
  ["time_saving", "時短"],
  ["decision_support", "判断補助"],
  ["not_sure", "まだ分からない"],
] as const;
const reuseOptions = [["yes", "使いたい"], ["maybe", "検討する"], ["no", "使わない"]] as const;
const memberOptions = [["yes", "興味あり"], ["depends", "内容次第"], ["no", "不要"]] as const;

export function BetaSurvey() {
  const analyticsConfigured = Boolean(normalizeAnalyticsConfig(
    import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "",
    import.meta.env.VITE_ANALYTICS_WEBSITE_ID ?? "",
  ));
  const [completed, setCompleted] = useState(() => {
    try { return localStorage.getItem(COMPLETED_KEY) === "true"; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const [primaryValue, setPrimaryValue] = useState("");
  const [reuseIntent, setReuseIntent] = useState("");
  const [memberInterest, setMemberInterest] = useState("");

  if (!analyticsConfigured || completed) return null;

  const show = () => {
    setOpen(true);
    trackBetaEvent({ name: "beta_survey_open", properties: {} });
  };
  const submit = () => {
    const accepted = trackBetaEvent({
      name: "beta_survey_submit",
      properties: {
        primary_value: primaryValue,
        reuse_intent: reuseIntent,
        member_interest: memberInterest,
      },
    });
    if (!accepted) return;
    try { localStorage.setItem(COMPLETED_KEY, "true"); } catch { /* optional */ }
    setCompleted(true);
  };

  if (!open) {
    return <button type="button" className="beta-survey-trigger" onClick={show}>
      <MessageSquareText size={16} /> 3問アンケート
    </button>;
  }

  return <aside className="beta-survey" aria-labelledby="beta-survey-title">
    <header><div><span>PUBLIC BETA</span><h2 id="beta-survey-title">3問アンケート</h2></div><button type="button" aria-label="アンケートを閉じる" onClick={() => setOpen(false)}><X size={16} /></button></header>
    <p>個人情報・自由記述は収集しません。</p>
    <fieldset><legend>1. 一番役立ったのは？</legend><div>{valueOptions.map(([value, label]) => <label key={value}><input type="radio" name="beta-value" value={value} checked={primaryValue === value} onChange={() => setPrimaryValue(value)} /><span>{label}</span></label>)}</div></fieldset>
    <fieldset><legend>2. 次の開催日も使いたい？</legend><div>{reuseOptions.map(([value, label]) => <label key={value}><input type="radio" name="beta-reuse" value={value} checked={reuseIntent === value} onChange={() => setReuseIntent(value)} /><span>{label}</span></label>)}</div></fieldset>
    <fieldset><legend>3. MEMBER機能に興味は？</legend><div>{memberOptions.map(([value, label]) => <label key={value}><input type="radio" name="beta-member" value={value} checked={memberInterest === value} onChange={() => setMemberInterest(value)} /><span>{label}</span></label>)}</div></fieldset>
    <button type="button" className="beta-survey-submit" disabled={!primaryValue || !reuseIntent || !memberInterest} onClick={submit}><Check size={15} /> 回答する</button>
  </aside>;
}
