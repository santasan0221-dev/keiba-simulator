import React from "react";
import { CircleCheck, CircleHelp, Eye, MinusCircle, Trophy } from "lucide-react";
import type { LabRace } from "@/lib/singlePickAi";
import { formatOdds, formatPercent } from "@/lib/displayFormat";
import {
  AGREEMENT_COPY,
  agreementOf,
  countdownLabel,
  pickCards,
  rankingRows,
  startTime,
  VERDICT_COPY,
  verdictOf,
  type PickCard,
  type RankingRow,
  type Verdict,
} from "@/lib/raceView";

const VERDICT_ICON: Record<Verdict, typeof CircleCheck> = { BUY: CircleCheck, WATCH: Eye, PASS: MinusCircle, UNKNOWN: CircleHelp };

/** BUY / WATCH / PASS / UNKNOWN: label + icon + Japanese, never color alone. */
export function VerdictChip({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  const Icon = VERDICT_ICON[verdict];
  const copy = VERDICT_COPY[verdict];
  return <span className={`kt-verdict kt-verdict--${verdict.toLowerCase()} kt-verdict--${size}`}>
    <Icon size={size === "lg" ? 22 : 13} aria-hidden="true" />
    <b>{copy.label}</b>
    <span>{copy.ja}</span>
  </span>;
}

export function VerdictBanner({ verdict, reasons }: { verdict: Verdict; reasons: string[] }) {
  const copy = VERDICT_COPY[verdict];
  return <section className={`kt-verdict-banner kt-verdict-banner--${verdict.toLowerCase()}`} aria-label={`買い判定 ${copy.label} ${copy.ja}`}>
    <div>
      <span className="kt-eyebrow">BET DECISION · 買い判定</span>
      <VerdictChip verdict={verdict} size="lg" />
    </div>
    <p>{copy.explanation}{reasons.length ? <small> 根拠: {reasons.join(" / ")}</small> : null}</p>
    <p className="kt-verdict-note">◎本命＝購入推奨ではありません。本命と買い判定は別々に表示しています。</p>
  </section>;
}

/** A 0–1 probability as a meter. null renders an explicit "—" track, never a 0-width bar that reads as 0%. */
export function ProbabilityMeter({ value, tone, label }: { value: number | null; tone: "ai" | "market" | "honmei"; label: string }) {
  if (value === null) return <span className="kt-meter kt-meter--empty" role="img" aria-label={`${label} データなし`}><span className="kt-meter-value">—</span></span>;
  const pct = Math.max(0, Math.min(100, value * 100));
  return <span className={`kt-meter kt-meter--${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 10) / 10}>
    <span className="kt-meter-track"><span className="kt-meter-fill" style={{ "--kt-fill": `${Math.max(pct, 1.5)}%` } as React.CSSProperties} /></span>
    <span className="kt-meter-value">{formatPercent(value)}</span>
  </span>;
}

const PICK_META: Record<PickCard["kind"], { tag: string; title: string; tone: "honmei" | "ai" | "market"; probLabel: string }> = {
  HONMEI: { tag: "HONMEI", title: "公開◎本命", tone: "honmei", probLabel: "AI勝率" },
  AI_TOP: { tag: "AI TOP", title: "AI評価1位", tone: "ai", probLabel: "AI勝率" },
  MARKET_TOP: { tag: "MARKET TOP", title: "市場評価1位", tone: "market", probLabel: "市場勝率" },
};

export function PickCardView({ card, compact = false }: { card: PickCard; compact?: boolean }) {
  const meta = PICK_META[card.kind];
  return <article className={`kt-pick kt-pick--${meta.tone}${card.available ? "" : " is-unavailable"}${compact ? " kt-pick--compact" : ""}`}>
    <header><span className="kt-pick-tag">{meta.tag}</span><small>{meta.title}</small></header>
    {card.available ? <>
      <div className="kt-pick-horse">
        {card.mark ? <span className="kt-honmei-mark" aria-label="本命">{card.mark}</span> : null}
        <span className="kt-horse-no">{card.horseNo}</span>
        <strong>{card.horseName ?? "馬名取得不能"}</strong>
      </div>
      {!compact && <div className="kt-pick-stats">
        <div><small>{meta.probLabel}</small><ProbabilityMeter value={card.probability} tone={meta.tone} label={`${meta.title} ${meta.probLabel}`} /></div>
        <div><small>単勝オッズ</small><b className="kt-num">{formatOdds(card.odds)}</b></div>
      </div>}
      {compact && <div className="kt-pick-inline"><span>{meta.probLabel} <b className="kt-num">{formatPercent(card.probability)}</b></span></div>}
      {card.caution ? <p className="kt-pick-caution">⚠ {card.caution}</p> : null}
    </> : <div className="kt-pick-unavailable"><strong>UNAVAILABLE</strong><small>{card.reason}</small></div>}
  </article>;
}

export function PickTrio({ race }: { race: LabRace }) {
  const cards = pickCards(race);
  return <section className="kt-pick-trio" aria-label="公開本命・AI評価1位・市場評価1位">
    <PickCardView card={cards.honmei} />
    <PickCardView card={cards.aiTop} />
    <PickCardView card={cards.marketTop} />
  </section>;
}

function PairLink({ label, value }: { label: string; value: boolean | null }) {
  const text = value === null ? "照合不可" : value ? "一致" : "不一致";
  return <li className={`kt-pair ${value === null ? "is-na" : value ? "is-match" : "is-miss"}`}><span>{label}</span><b>{value === null ? "—" : value ? "＝" : "≠"}</b><small>{text}</small></li>;
}

export function AgreementPanel({ race }: { race: LabRace }) {
  const agreement = agreementOf(race);
  const copy = AGREEMENT_COPY[agreement.state];
  return <section className={`kt-agreement kt-agreement--${agreement.state.toLowerCase()}`} aria-label="AI × MARKET 一致状況">
    <div><span className="kt-eyebrow">AI × MARKET</span><strong className="kt-agreement-state">{copy.label}</strong><p>{copy.explanation}</p></div>
    <ul>
      <PairLink label="◎ × AI" value={agreement.honmeiAi} />
      <PairLink label="◎ × 市場" value={agreement.honmeiMarket} />
      <PairLink label="AI × 市場" value={agreement.aiMarket} />
    </ul>
  </section>;
}

export function RaceHero({ race, nowMs }: { race: LabRace; nowMs: number }) {
  const meta = race.race;
  const course = [meta.surface, meta.distance ? `${meta.distance.toLocaleString()}m` : null].filter(Boolean).join(" ");
  const result = race.result;
  return <header className="kt-race-hero">
    <div className="kt-race-hero-main">
      <span className="kt-eyebrow">{meta.organization ?? "—"} · {meta.date ?? "日付未取得"}</span>
      <h1><span>{meta.venue ?? "会場未取得"}</span> <b>{meta.race_no ?? "—"}<small>R</small></b></h1>
      <dl className="kt-race-facts">
        <div><dt>発走</dt><dd className="kt-num">{startTime(meta.scheduled_start_at)}</dd></div>
        <div><dt>コース</dt><dd>{course || "未取得"}</dd></div>
        {meta.going ? <div><dt>馬場</dt><dd>{meta.going}</dd></div> : null}
        {(meta as { weather?: string | null }).weather ? <div><dt>天候</dt><dd>{(meta as { weather?: string | null }).weather}</dd></div> : null}
        <div><dt>頭数</dt><dd className="kt-num">{race.horses.length}頭</dd></div>
      </dl>
    </div>
    <div className={`kt-race-clock${result ? " is-final" : ""}`} aria-live="polite">
      <span className="kt-eyebrow">{result ? "OFFICIAL" : "POST TIME"}</span>
      <strong>{result ? "結果確定" : countdownLabel(meta.scheduled_start_at, nowMs)}</strong>
    </div>
  </header>;
}

export function WinnerStrip({ race }: { race: LabRace }) {
  const result = race.result;
  if (!result?.official_order?.length) return null;
  const honmei = pickCards(race).honmei;
  const pick = result.ai_pick;
  const outcome = pick?.won ? "hit" : pick?.placed ? "placed" : pick ? "miss" : "na";
  return <section className={`kt-winner kt-winner--${outcome}`} aria-label="公式結果">
    <div className="kt-winner-head"><Trophy size={18} aria-hidden="true" /><span className="kt-eyebrow">OFFICIAL RESULT</span>
      <strong>{outcome === "hit" ? "◎ 的中（1着）" : outcome === "placed" ? `◎ ${pick?.finish}着（3着内）` : outcome === "miss" ? `◎ ${pick?.finish ?? "—"}着（圏外）` : "◎ 結果照合なし"}</strong></div>
    <ol>{result.official_order.slice(0, 3).map(entry => <li key={entry.horse_no} className={entry.horse_no === honmei.horseNo ? "is-honmei" : ""}>
      <b className="kt-num">{entry.finish}</b><span className="kt-horse-no">{entry.horse_no}</span><strong>{entry.horse_name}</strong>
      {entry.horse_no === honmei.horseNo ? <em>◎</em> : null}
    </li>)}</ol>
  </section>;
}

function MarkCell({ row }: { row: RankingRow }) {
  return <span className={`kt-mark${row.mark === "◎" ? " is-honmei" : ""}`} aria-label={row.mark ? `印 ${row.mark}` : "印なし"}>{row.mark ?? "·"}</span>;
}

function Badges({ row }: { row: RankingRow }) {
  return <span className="kt-row-badges">
    {row.isAiTop ? <span className="kt-src kt-src--ai">AI TOP</span> : null}
    {row.isMarketTop ? <span className="kt-src kt-src--market">MKT TOP</span> : null}
  </span>;
}

/** Horse ranking: analysis table on desktop, stacked cards on mobile (same DOM, CSS switches). */
export function RankingBoard({ race }: { race: LabRace }) {
  const rows = rankingRows(race);
  if (!rows.length) return null;
  return <section className="kt-ranking" aria-label="出走馬ランキング">
    <header className="kt-section-head"><div><span className="kt-eyebrow">FIELD ANALYSIS</span><h2>出走馬ランキング</h2></div>
      <p className="kt-legend"><span className="kt-src kt-src--ai">AI</span> 事前AI勝率 <span className="kt-src kt-src--market">MARKET</span> 発走前オッズ由来の市場勝率。印は公開印のみ。</p></header>
    <div className="kt-ranking-table" role="table" aria-label="出走馬のAI確率・市場確率・オッズ">
      <div className="kt-ranking-row kt-ranking-row--head" role="row">
        <span role="columnheader">印</span><span role="columnheader">馬番</span><span role="columnheader">馬名</span>
        <span role="columnheader">AI勝率</span><span role="columnheader">市場勝率</span><span role="columnheader">単勝</span>
        <span role="columnheader">AI順位</span><span role="columnheader">人気</span>
      </div>
      {rows.map((row, index) => <div role="row" key={`${row.no}-${row.name}`} className={`kt-ranking-row${row.isHonmei ? " is-honmei" : ""}`} style={{ "--kt-i": index } as React.CSSProperties}>
        <span role="cell" className="kt-cell-mark"><MarkCell row={row} /></span>
        <span role="cell" className="kt-cell-no"><span className="kt-horse-no">{row.no ?? "?"}</span></span>
        <span role="cell" className="kt-cell-name"><strong>{row.name ?? "馬名取得不能"}</strong><Badges row={row} />
          <small className="kt-secondary">{[row.style ? `脚質 ${row.style}` : null, ...row.notes.slice(0, 2)].filter(Boolean).join(" · ")}{row.cautions.length ? <span className="kt-caution"> ⚠ {row.cautions.join("・")}</span> : null}</small></span>
        <span role="cell" className="kt-cell-ai" data-label="AI勝率"><ProbabilityMeter value={row.aiProbability} tone="ai" label={`#${row.no} AI勝率`} /></span>
        <span role="cell" className="kt-cell-market" data-label="市場勝率"><ProbabilityMeter value={row.marketProbability} tone="market" label={`#${row.no} 市場勝率`} /></span>
        <span role="cell" className="kt-cell-odds kt-num" data-label="単勝">{formatOdds(row.odds)}</span>
        <span role="cell" className="kt-cell-rank kt-num" data-label="AI順位">{row.aiRank ?? "—"}</span>
        <span role="cell" className="kt-cell-rank kt-num" data-label="人気">{row.marketRank ?? "—"}</span>
      </div>)}
    </div>
    <p className="kt-footnote">「—」はデータなし（0ではありません）。AI順位はAPIが公開するAI勝率ランキングのみ表示します。騎手データはAPI未提供のため表示していません。</p>
  </section>;
}

function reasonLabel(code: string): string | null {
  if (code.startsWith("GATE_STATUS:")) return null;
  if (code === "ODDS_NOT_PUBLISHED") return "オッズ未公開";
  return code;
}

export function raceVerdict(race: LabRace) {
  const raw = race.bet_decision?.reasons ?? [race.decision?.reason, race.decision?.gate_reason].filter((value): value is string => Boolean(value));
  return { verdict: verdictOf(race), reasons: raw.map(reasonLabel).filter((value): value is string => Boolean(value)) };
}
