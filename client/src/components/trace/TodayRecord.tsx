import React from "react";
import { Link } from "wouter";
import { Activity, Target } from "lucide-react";
import type { LabDailyOperations } from "@/lib/singlePickAi";
import { formatPercent } from "@/lib/displayFormat";
import { VERDICT_COPY, type Verdict } from "@/lib/raceView";
import type { TodayRecord as TodayRecordCounts } from "@/lib/todayRecord";
import { trackCta } from "@/lib/betaAnalytics";
import { VerdictChip } from "./RaceParts";

export type RecordLoad = "loading" | "ready" | "unavailable";

const VERDICTS: Verdict[] = ["BUY", "WATCH", "PASS", "UNKNOWN"];

const jst = (value: string | null | undefined) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })
    : "取得不能";

/** Same visual weight for every outcome: no hit is colored or enlarged. */
function Cell({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="kt-record-cell"><dt>{label}</dt><dd className="kt-num">{value}</dd>{note ? <small>{note}</small> : null}</div>;
}

/**
 * 今日の記録. Counts first; a rate appears only when nothing is undecided, and
 * always as numerator/denominator. Unknown values are "—" / "取得不能", never 0.
 */
export function TodayRecord({ record, state, daily, healthOk, verdicts, verdictsReady }: {
  record: TodayRecordCounts | null;
  state: RecordLoad;
  daily: LabDailyOperations | null;
  healthOk: boolean | null;
  verdicts: Record<Verdict, number>;
  verdictsReady: boolean;
}) {
  const ready = state === "ready" && record !== null;
  const n = (value: number | undefined) => (ready && typeof value === "number" ? String(value) : state === "loading" ? "…" : "取得不能");
  const reviewTotal = record ? record.review + record.failed : undefined;
  const healthLabel = healthOk === null ? "確認中" : healthOk ? "正常" : "要確認";

  return <section className="kt-panel kt-record" aria-label="今日の記録">
    <header className="kt-panel-head">
      <span className="kt-eyebrow"><Activity size={12} aria-hidden="true" /> TODAY'S RECORD · 今日の記録</span>
      <span className={`kt-health kt-health--${healthOk === null ? "loading" : healthOk ? "ok" : "warn"}`}>{healthLabel}</span>
    </header>

    <dl className="kt-record-grid" aria-label="本日の対象と確定状況">
      <Cell label="対象R" value={n(record?.total)} note={ready && record!.unpublished > 0 ? `◎未公開 ${record!.unpublished}` : undefined} />
      <Cell label="確定" value={n(record?.confirmed)} />
      <Cell label="確定待ち" value={n(record?.pending)} />
      <Cell label="要確認" value={n(reviewTotal)} note={ready && record!.failed > 0 ? `うち取得失敗 ${record!.failed}` : undefined} />
    </dl>

    <div className="kt-record-block">
      <h3>◎の結果{ready ? <small>（率の母数 {record!.base}R）</small> : null}</h3>
      <dl className="kt-record-grid kt-record-grid--outcome">
        <Cell label="1着" value={n(record?.win)} />
        <Cell label="3着内" value={n(record?.top3)} note="1着を含む" />
        <Cell label="着外" value={n(record?.outside)} />
        <Cell label="競走中止" value={n(record?.dnf)} note="母数に含む" />
        <Cell label="未確定" value={n(record?.undetermined)} note="母数に含む" />
      </dl>
      {ready && (record!.otherSpecial > 0 || record!.dataGap > 0) ? <p className="kt-footnote">
        {record!.otherSpecial > 0 ? `その他の特殊状態 ${record!.otherSpecial}件（母数に含め、的中には数えません）` : null}
        {record!.otherSpecial > 0 && record!.dataGap > 0 ? " ／ " : null}
        {record!.dataGap > 0 ? `着順取得不能 ${record!.dataGap}件（母数に含む）` : null}
      </p> : null}
      <p className="kt-record-excluded">
        率の母数に<b>含めない</b>もの: {ready ? `非出走（取消・除外）${record!.nonStarter}件 ／ レース不成立 ${record!.raceStopped}件` : "取得不能"}
      </p>
      <p className="kt-record-rate" aria-live="polite">
        {!ready ? "率は集計後に表示します。"
          : record!.rateReady ? <>◎1着 <b>{record!.win}/{record!.base}</b>（{formatPercent(record!.win / record!.base)}） ／ ◎3着内 <b>{record!.top3}/{record!.base}</b>（{formatPercent(record!.top3 / record!.base)}）</>
            : record!.base === 0 ? "対象のレースがまだありません。"
              : "確定待ち・要確認のレースが残っているため、率は表示していません。"}
      </p>
    </div>

    <div className="kt-record-block" aria-label="買い判定の内訳">
      <h3><Target size={12} aria-hidden="true" /> 買い判定<small>（◎とは別の判定です）</small></h3>
      <ul className="kt-tally">{VERDICTS.map(verdict => <li key={verdict} className={`kt-tally-${verdict.toLowerCase()}`}><VerdictChip verdict={verdict} /><b className="kt-num">{verdictsReady ? verdicts[verdict] : "—"}</b></li>)}</ul>
      <p className="kt-footnote">{VERDICT_COPY.WATCH.explanation}</p>
    </div>

    <p className="kt-record-notice"><strong>◎は購入推奨ではありません。</strong>数え方は<Link href="/rules" onClick={() => trackCta("rules_link")}>記録ルール</Link>をご覧ください。</p>
    <footer className="kt-record-foot">
      <span>結果の最終取得 {jst(daily?.last_result_at)}</span>
      <span>予測の最終生成 {jst(daily?.last_prediction_at)}</span>
      <Link href="/ai-history#operations" className="kt-link">運用状況を見る</Link>
    </footer>
  </section>;
}
