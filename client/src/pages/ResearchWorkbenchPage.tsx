import { ChangeEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { Activity, AlertTriangle, ArrowLeft, BarChart3, FileSpreadsheet, FlaskConical, ShieldCheck, Upload } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

/**
 * Research-only workspace. It never writes to the scenario archive, never calls
 * the prediction API, and never substitutes local CSV probabilities for TRUTH
 * PANEL probabilities. It is deliberately a separate route from WHAT-IF.
 */
type ProbabilityKind = "truth_calibrated" | "shadow_score" | "what_if" | "unknown";
type FieldKey = "date" | "raceId" | "venue" | "modelId" | "probabilityKind" | "probability" | "shadowScore" | "odds" | "won" | "payout";
type Mapping = Record<FieldKey, string>;
type RawRow = Record<string, string>;
type ResearchRow = {
  date: string;
  raceId: string;
  venue: string;
  modelId: string;
  probabilityKind: ProbabilityKind;
  probability: number;
  shadowScore: number | null;
  odds: number | null;
  won: boolean;
  payout: number | null;
};

const fieldLabels: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "date", label: "開催日", required: true },
  { key: "raceId", label: "レースID", required: false },
  { key: "venue", label: "競馬場", required: false },
  { key: "modelId", label: "モデルID", required: false },
  { key: "probabilityKind", label: "確率種別", required: true },
  { key: "probability", label: "予測確率（校正済み / WHAT-IF）", required: true },
  { key: "shadowScore", label: "未校正shadow score（比較用）", required: false },
  { key: "odds", label: "発走前単勝オッズ", required: false },
  { key: "won", label: "確定1着フラグ", required: true },
  { key: "payout", label: "確定単勝払戻倍率（任意）", required: false },
];

const aliases: Record<FieldKey, string[]> = {
  date: ["date", "race_date", "開催日", "日付"],
  raceId: ["race_id", "raceid", "レースid"],
  venue: ["venue", "track", "racecourse", "競馬場", "開催場"],
  modelId: ["model_id", "model", "prediction_version", "モデルid"],
  probabilityKind: ["probability_kind", "probability_source", "prediction_type", "確率種別", "確率ソース"],
  probability: ["win_prob_calibrated", "probability", "pred_prob", "prediction", "win_rate", "予測確率", "勝率"],
  shadowScore: ["shadow_score", "raw_score", "uncalibrated_score", "shadow", "未校正スコア", "shadow score"],
  odds: ["odds", "win_odds", "decimal_odds", "単勝オッズ"],
  won: ["won", "is_winner", "winner", "finish_position", "着順", "結果"],
  payout: ["win_payout", "payout_multiplier", "単勝払戻倍率", "払戻倍率"],
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_\-\/]/g, "");
const toNumber = (value: string | undefined) => {
  const result = Number(String(value ?? "").replace(/[,%]/g, ""));
  return Number.isFinite(result) ? result : null;
};
const parseProbability = (value: string | undefined) => {
  const raw = toNumber(value);
  if (raw === null) return null;
  const probability = raw > 1 ? raw / 100 : raw;
  return probability > 0 && probability < 1 ? probability : null;
};
const isWinner = (value: string | undefined) => ["1", "true", "win", "winner", "1着", "１着"].includes(String(value ?? "").trim().toLowerCase());
const toProbabilityKind = (value: string | undefined): ProbabilityKind => {
  const normalized = normalize(String(value ?? ""));
  if (["truthcalibrated", "calibrated", "winprobcalibrated", "校正済み"].includes(normalized)) return "truth_calibrated";
  if (["shadowscore", "shadow", "uncalibrated", "未校正"].includes(normalized)) return "shadow_score";
  if (["whatif", "simulation", "scenario", "シミュレーション"].includes(normalized)) return "what_if";
  return "unknown";
};
const kindLabel: Record<ProbabilityKind, string> = {
  truth_calibrated: "TRUTH PANEL 校正済み確率",
  shadow_score: "未校正 shadow score",
  what_if: "WHAT-IF シナリオ勝率",
  unknown: "種別未確認（分析対象外）",
};
const initialMapping = {} as Mapping;

function parseCsv(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string) => {
    const cells: string[] = []; let value = ""; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
      else value += char;
    }
    cells.push(value.trim()); return cells;
  };
  const headers = parseLine(lines[0]);
  return { headers, rows: lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] ?? ""]))) };
}

function inferMapping(headers: string[]): Mapping {
  return Object.fromEntries(fieldLabels.map((field) => {
    const match = headers.find((header) => aliases[field.key].some((alias) => normalize(header) === normalize(alias)))
      ?? headers.find((header) => aliases[field.key].some((alias) => normalize(header).includes(normalize(alias))));
    return [field.key, match ?? "__none"];
  })) as Mapping;
}

function normaliseRows(rows: RawRow[], mapping: Mapping): { valid: ResearchRow[]; rejected: number } {
  let rejected = 0;
  const valid = rows.flatMap((row, index) => {
    const probability = parseProbability(row[mapping.probability]);
    const kind = toProbabilityKind(row[mapping.probabilityKind]);
    const date = row[mapping.date]?.trim();
    if (!date || probability === null || kind === "unknown") { rejected += 1; return []; }
    const odds = toNumber(row[mapping.odds]);
    const payout = toNumber(row[mapping.payout]);
    return [{
      date,
      raceId: mapping.raceId === "__none" ? `row-${index + 1}` : row[mapping.raceId] || `row-${index + 1}`,
      venue: mapping.venue === "__none" ? "未設定" : row[mapping.venue] || "未設定",
      modelId: mapping.modelId === "__none" ? "未指定" : row[mapping.modelId] || "未指定",
      probabilityKind: kind,
      probability,
      shadowScore: toNumber(row[mapping.shadowScore]),
      odds: odds && odds > 1 ? odds : null,
      won: isWinner(row[mapping.won]),
      payout: payout && payout > 0 ? payout : null,
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
  return { valid, rejected };
}

function analyze(rows: ResearchRow[], fractionalKelly: number) {
  let capital = 100_000;
  let peak = capital;
  const curve = rows.map((row) => {
    const edge = row.odds ? row.probability * row.odds - 1 : null;
    const rawKelly = row.odds && edge && edge > 0 ? edge / (row.odds - 1) : 0;
    const stake = row.payout === null ? 0 : Math.floor(Math.min(capital * 0.02, capital * rawKelly * fractionalKelly) / 100) * 100;
    const profit = row.payout === null ? 0 : row.won ? stake * (row.payout - 1) : -stake;
    capital += profit;
    peak = Math.max(peak, capital);
    return { ...row, capital, drawdown: peak ? (capital - peak) / peak : 0, stake, profit };
  });
  const brier = rows.length ? rows.reduce((sum, row) => sum + (row.probability - Number(row.won)) ** 2, 0) / rows.length : null;
  const logLoss = rows.length ? rows.reduce((sum, row) => {
    const p = Math.min(0.999999, Math.max(0.000001, row.probability));
    return sum - (row.won ? Math.log(p) : Math.log(1 - p));
  }, 0) / rows.length : null;
  const payouts = curve.filter((row) => row.payout !== null);
  const staked = payouts.reduce((sum, row) => sum + row.stake, 0);
  const returned = payouts.reduce((sum, row) => sum + row.stake + row.profit, 0);
  return {
    curve,
    brier,
    logLoss,
    hitRate: rows.length ? rows.filter((row) => row.won).length / rows.length : null,
    roi: staked > 0 ? returned / staked - 1 : null,
    payoutCoverage: payouts.length,
    maxDrawdown: curve.length ? Math.min(...curve.map((row) => row.drawdown)) : null,
  };
}

function scoreComparison(rows: ResearchRow[]) {
  const paired = rows.filter((row) => row.probabilityKind === "truth_calibrated" && row.shadowScore !== null);
  if (!paired.length) return { paired, summary: null };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const scores = paired.map((row) => row.shadowScore as number);
  const probabilities = paired.map((row) => row.probability);
  const scoreMean = mean(scores); const probabilityMean = mean(probabilities);
  const covariance = scores.reduce((sum, score, index) => sum + (score - scoreMean) * (probabilities[index] - probabilityMean), 0);
  const scoreVariance = scores.reduce((sum, score) => sum + (score - scoreMean) ** 2, 0);
  const probabilityVariance = probabilities.reduce((sum, probability) => sum + (probability - probabilityMean) ** 2, 0);
  const correlation = scoreVariance && probabilityVariance ? covariance / Math.sqrt(scoreVariance * probabilityVariance) : null;
  return { paired, summary: { count: paired.length, scoreMean, probabilityMean, correlation, observedRate: paired.filter((row) => row.won).length / paired.length } };
}

function calibration(rows: ResearchRow[]) {
  return Array.from({ length: 10 }, (_, index) => {
    const low = index / 10; const high = (index + 1) / 10;
    const bucket = rows.filter((row) => row.probability >= low && (index === 9 ? row.probability <= high : row.probability < high));
    return {
      label: `${Math.round(low * 100)}–${Math.round(high * 100)}%`,
      predicted: bucket.length ? bucket.reduce((sum, row) => sum + row.probability, 0) / bucket.length : null,
      observed: bucket.length ? bucket.filter((row) => row.won).length / bucket.length : null,
      count: bucket.length,
    };
  }).filter((row) => row.count > 0);
}

export default function ResearchWorkbenchPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>(initialMapping);
  const [fileName, setFileName] = useState("未選択");
  const [kind, setKind] = useState<ProbabilityKind>("truth_calibrated");
  const [venue, setVenue] = useState("all");
  const [modelId, setModelId] = useState("all");
  const [fractionalKelly, setFractionalKelly] = useState(0.25);
  const [notice, setNotice] = useState<string | null>(null);

  const imported = useMemo(() => normaliseRows(rawRows, mapping), [rawRows, mapping]);
  const availableKinds = useMemo(() => Array.from(new Set(imported.valid.map((row) => row.probabilityKind))), [imported.valid]);
  const venues = useMemo(() => Array.from(new Set(imported.valid.map((row) => row.venue))).sort(), [imported.valid]);
  const models = useMemo(() => Array.from(new Set(imported.valid.map((row) => row.modelId))).sort(), [imported.valid]);
  const filtered = useMemo(() => imported.valid.filter((row) => row.probabilityKind === kind && (venue === "all" || row.venue === venue) && (modelId === "all" || row.modelId === modelId)), [imported.valid, kind, venue, modelId]);
  const metrics = useMemo(() => analyze(filtered, fractionalKelly), [filtered, fractionalKelly]);
  const calibrationData = useMemo(() => calibration(filtered), [filtered]);
  const comparison = useMemo(() => scoreComparison(imported.valid), [imported.valid]);
  const requiredMissing = fieldLabels.filter((field) => field.required && (!mapping[field.key] || mapping[field.key] === "__none"));
  const chartData = metrics.curve.map((row) => ({ date: row.date, capital: row.capital, drawdown: Number((row.drawdown * 100).toFixed(2)) }));

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setNotice("この研究画面はCSVのみをブラウザ内で読み込みます。"); return; }
    if (file.size > 20 * 1024 * 1024) { setNotice("CSVは20MB以下に分割してください。ファイルは外部送信されません。"); return; }
    const parsed = parseCsv(await file.text());
    setHeaders(parsed.headers); setRawRows(parsed.rows); setMapping(inferMapping(parsed.headers)); setFileName(file.name); setVenue("all"); setModelId("all"); setNotice("列マッピングを確認してから分析してください。確率種別が未指定の行は除外します。");
  };

  return <main className="min-h-screen bg-[#101719] px-4 py-6 text-[#ecf2ed] md:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-[#315247] pb-5 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-semibold tracking-[0.2em] text-[#8bb89a]">KEIBA LAB / RESEARCH WORKBENCH</p><h1 className="mt-2 text-3xl font-semibold">検証用バックテスト分析</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#b5c1b9]">CSVはこのブラウザだけで処理します。TRUTH PANELの校正済み確率、未校正shadow score、WHAT-IFシナリオ勝率を同一の評価表へ混在させません。</p></div>
        <Link href="/" className="inline-flex items-center gap-2 self-start rounded border border-[#527566] px-3 py-2 text-sm text-[#d8e9dd] transition hover:bg-[#1d3029]"><ArrowLeft size={15} /> レースラボへ戻る</Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 text-[#8cc4a0]" /><div><h2 className="font-semibold">CSVを読み込む</h2><p className="mt-1 text-sm text-[#aebbb2]">必須: 開催日、確率種別、予測確率、確定1着フラグ。オッズ・払戻倍率はROI分析にのみ使用します。</p></div></div><label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded bg-[#2f766a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3f8b7d]"><Upload size={15} /> CSVを選択<input className="hidden" type="file" accept=".csv,text/csv" onChange={onUpload} /></label><span className="ml-3 text-sm text-[#aebbb2]">{fileName}</span>{notice && <p className="mt-3 rounded border border-[#80663c] bg-[#332919] px-3 py-2 text-sm text-[#e9d2a0]">{notice}</p>}</div>
        <aside className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex items-center gap-2 text-[#8cc4a0]"><ShieldCheck size={17} /><span className="text-sm font-semibold">分離ルール</span></div><ul className="mt-3 space-y-2 text-sm leading-5 text-[#b5c1b9]"><li>• 校正済み確率は再校正しません。</li><li>• shadow scoreは未校正として明示します。</li><li>• WHAT-IFはシナリオ分析であり、実測確率ではありません。</li><li>• この画面は本番予測・履歴・シミュレーションへ書き込みません。</li></ul></aside>
      </section>

      {headers.length > 0 && <section className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">列マッピング</h2><p className="mt-1 text-sm text-[#aebbb2]">{rawRows.length.toLocaleString()}行読み込み。{requiredMissing.length ? `必須項目 ${requiredMissing.map((field) => field.label).join("、")} を確認してください。` : "必須項目を確認済みです。"}</p></div><span className="rounded bg-[#20332b] px-2 py-1 text-xs text-[#a9d7b8]">有効 {imported.valid.length.toLocaleString()}行 / 除外 {imported.rejected.toLocaleString()}行</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fieldLabels.map((field) => <label key={field.key} className="text-sm"><span className="mb-1 block text-[#b5c1b9]">{field.label}{field.required && <b className="ml-1 text-[#e9b7a1]">必須</b>}</span><select className="w-full rounded border border-[#456357] bg-[#101719] px-2 py-2 text-[#ecf2ed]" value={mapping[field.key] ?? "__none"} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="__none">未使用</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></section>}

      {imported.valid.length > 0 && <>
        <section className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex items-center gap-2"><FlaskConical size={17} className="text-[#8cc4a0]" /><h2 className="font-semibold">評価対象を分離する</h2></div><div className="mt-4 grid gap-3 md:grid-cols-4"><label className="text-sm text-[#b5c1b9]">確率種別<select className="mt-1 w-full rounded border border-[#456357] bg-[#101719] px-2 py-2 text-[#ecf2ed]" value={kind} onChange={(event) => setKind(event.target.value as ProbabilityKind)}>{availableKinds.map((item) => <option key={item} value={item}>{kindLabel[item]}</option>)}</select></label><label className="text-sm text-[#b5c1b9]">競馬場<select className="mt-1 w-full rounded border border-[#456357] bg-[#101719] px-2 py-2 text-[#ecf2ed]" value={venue} onChange={(event) => setVenue(event.target.value)}><option value="all">全競馬場</option>{venues.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm text-[#b5c1b9]">モデルID<select className="mt-1 w-full rounded border border-[#456357] bg-[#101719] px-2 py-2 text-[#ecf2ed]" value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="all">全モデル</option>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm text-[#b5c1b9]">Fractional Kelly: {fractionalKelly.toFixed(2)}<input className="mt-3 w-full accent-[#5eb782]" type="range" min="0" max="0.5" step="0.05" value={fractionalKelly} onChange={(event) => setFractionalKelly(Number(event.target.value))} /></label></div><p className="mt-3 text-xs leading-5 text-[#91a59a]">資金曲線とROIは、確定払戻倍率がある履歴だけで計算します。オッズから払戻を推測せず、払戻なしの行は確率品質評価だけに使用します。</p></section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
          ["対象行", filtered.length.toLocaleString()], ["Brier", metrics.brier?.toFixed(4) ?? "データなし"], ["Log loss", metrics.logLoss?.toFixed(4) ?? "データなし"], ["実績的中率", metrics.hitRate === null ? "データなし" : `${(metrics.hitRate * 100).toFixed(1)}%`], ["ROI", metrics.roi === null ? "払戻なし" : `${(metrics.roi * 100).toFixed(1)}%`], ["最大DD", metrics.maxDrawdown === null ? "払戻なし" : `${(metrics.maxDrawdown * 100).toFixed(1)}%`],
        ].map(([label, value]) => <div className="rounded-lg border border-[#315247] bg-[#17211f] p-4" key={label}><p className="text-xs text-[#9bb0a4]">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</section>

        <section className="grid gap-5 xl:grid-cols-2"><article className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex items-center gap-2"><Activity size={17} className="text-[#8cc4a0]" /><div><h2 className="font-semibold">確率校正曲線</h2><p className="text-xs text-[#aebbb2]">{kindLabel[kind]}のみを表示</p></div></div><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={calibrationData}><CartesianGrid stroke="#315247" strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fill: "#aebbb2", fontSize: 11 }} /><YAxis domain={[0, 1]} tick={{ fill: "#aebbb2", fontSize: 11 }} tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip contentStyle={{ background: "#101719", border: "1px solid #456357" }} formatter={(value: number) => `${(value * 100).toFixed(1)}%`} /><Line type="monotone" dataKey="predicted" name="平均予測確率" stroke="#e7bc62" strokeWidth={2} connectNulls /><Line type="monotone" dataKey="observed" name="実績的中率" stroke="#68c197" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div><p className="mt-2 text-xs text-[#91a59a]">確率帯ごとの件数: {calibrationData.map((row) => row.count).join(" / ") || "データなし"}</p></article>
          <article className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex items-center gap-2"><BarChart3 size={17} className="text-[#8cc4a0]" /><div><h2 className="font-semibold">資金・ドローダウン</h2><p className="text-xs text-[#aebbb2]">払戻データのある履歴のみ</p></div></div><div className="mt-4 h-72">{metrics.payoutCoverage ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid stroke="#315247" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: "#aebbb2", fontSize: 10 }} /><YAxis yAxisId="capital" tick={{ fill: "#aebbb2", fontSize: 11 }} /><YAxis yAxisId="dd" orientation="right" tick={{ fill: "#aebbb2", fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={{ background: "#101719", border: "1px solid #456357" }} /><ReferenceLine yAxisId="dd" y={0} stroke="#6d8477" /><Area yAxisId="capital" type="monotone" dataKey="capital" name="資金" stroke="#68c197" fill="#68c197" fillOpacity={0.12} /><Area yAxisId="dd" type="monotone" dataKey="drawdown" name="DD%" stroke="#d67a68" fill="#d67a68" fillOpacity={0.15} /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-[#aebbb2]">確定単勝払戻倍率を読み込むと資金曲線を表示します。</div>}</div></article>
        </section>

        <section className="rounded-lg border border-[#315247] bg-[#17211f] p-5"><div className="flex items-start gap-2"><FlaskConical size={17} className="mt-0.5 text-[#8cc4a0]" /><div><h2 className="font-semibold">TRUTH PANEL × shadow score 比較</h2><p className="mt-1 text-xs leading-5 text-[#aebbb2]">同一行にある <code>win_prob_calibrated</code> と <code>shadow_score</code> を比較します。shadow scoreは未校正の順位・分離確認用スコアであり、確率・Brier・Log loss・ROIの計算には使用しません。</p></div></div>{comparison.summary ? <><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["ペア行数", comparison.summary.count.toLocaleString()], ["校正済み確率平均", `${(comparison.summary.probabilityMean * 100).toFixed(1)}%`], ["shadow score平均", comparison.summary.scoreMean.toFixed(3)], ["順位相関の参考値", comparison.summary.correlation === null ? "算出不可" : comparison.summary.correlation.toFixed(3)], ["ペア行の実績的中率", `${(comparison.summary.observedRate * 100).toFixed(1)}%`]].map(([label, value]) => <div key={label} className="rounded border border-[#315247] bg-[#101719] p-3"><p className="text-xs text-[#9bb0a4]">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 16, bottom: 10, left: 0 }}><CartesianGrid stroke="#315247" strokeDasharray="3 3" /><XAxis type="number" dataKey="shadowScore" name="未校正shadow score" tick={{ fill: "#aebbb2", fontSize: 11 }} /><YAxis type="number" dataKey="probability" name="校正済み確率" domain={[0, 1]} tick={{ fill: "#aebbb2", fontSize: 11 }} tickFormatter={(value) => `${Math.round(value * 100)}%`} /><ZAxis range={[45, 45]} /><Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "#101719", border: "1px solid #456357" }} formatter={(value: number, name: string) => name === "校正済み確率" ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)} /><Scatter name="校正済み確率とshadow score" data={comparison.paired} fill="#e7bc62" /></ScatterChart></ResponsiveContainer></div></> : <p className="mt-4 rounded border border-dashed border-[#456357] px-4 py-5 text-sm text-[#aebbb2]">比較対象はありません。確率種別を <code>truth_calibrated</code> とし、同一行へ <code>shadow_score</code> 列をマッピングしてください。</p>}</section>
      </>}

      {headers.length === 0 && <section className="rounded-lg border border-dashed border-[#456357] bg-[#17211f] p-10 text-center"><AlertTriangle className="mx-auto text-[#e7bc62]" /><h2 className="mt-3 font-semibold">CSVを選択すると研究用分析を開始できます</h2><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#aebbb2]">JRA-VAN等から正当に取得・エクスポートした履歴を利用してください。ここでの分析は研究・検証用であり、単一の指標や短期のROIだけでモデル優位性を判断しません。</p></section>}
    </div>
  </main>;
}
