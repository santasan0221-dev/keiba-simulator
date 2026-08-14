import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ChevronDown, Download, ExternalLink, Heart, MapPinned, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { aggregateCourseTrends, downloadTextFile, parseCourseTrendCsv, parseOddsCsv, parsePreviousRunsCsv, type CourseTrendRecord, type ImportedOdds, type PreviousRun } from "@/lib/raceCatalogAnalytics";
import { getOfficialRaceStorage, weekendOfficialRaces, type OfficialRaceCard } from "@/lib/officialRaceData";

const FAVORITES_KEY = "keiba-lab-catalog-favorites";
const ODDS_KEY = "keiba-lab-catalog-previous-day-odds";
const PREVIOUS_RUNS_KEY = "keiba-lab-catalog-previous-runs";
const COURSE_TRENDS_KEY = "keiba-lab-catalog-course-trends";
const styleColors: Record<string, string> = { "逃げ": "#d89a78", "先行": "#d4ba70", "差し": "#81adc7", "追込": "#a48dc9" };

function readLocal<T>(key: string, fallback: T) {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function readTextFile(file: File, onLoad: (text: string) => void) {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ""));
  reader.onerror = () => toast.error("CSVファイルを読み取れませんでした。");
  reader.readAsText(file);
}

function csvTemplateForOdds(race: OfficialRaceCard) {
  return ["horse_name,odds,popularity", ...race.horses.map((horse) => `${horse.name},,`)].join("\n");
}

function previousRunsTemplate() {
  return "horse_name,race_name,date,venue,surface,distance,going,finish,field_size,style,margin,days_ago\n";
}

function courseTrendTemplate() {
  return "venue,surface,distance,pace,style,finish\n";
}

export function OfficialRaceCatalog() {
  const [favorites, setFavorites] = useState<string[]>(() => readLocal(FAVORITES_KEY, []));
  const [selectedRaceId, setSelectedRaceId] = useState(weekendOfficialRaces[0]?.id ?? "");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [previousMetric, setPreviousMetric] = useState<"finish" | "distance" | "margin" | "daysAgo">("finish");
  const [oddsByRace, setOddsByRace] = useState<Record<string, ImportedOdds[]>>(() => readLocal(ODDS_KEY, {}));
  const [oddsErrors, setOddsErrors] = useState<string[]>([]);
  const [previousRuns, setPreviousRuns] = useState<PreviousRun[]>(() => readLocal(PREVIOUS_RUNS_KEY, []));
  const [previousRunErrors, setPreviousRunErrors] = useState<string[]>([]);
  const [courseRecords, setCourseRecords] = useState<CourseTrendRecord[]>(() => readLocal(COURSE_TRENDS_KEY, []));
  const [trendErrors, setTrendErrors] = useState<string[]>([]);
  const [selectedTrendKey, setSelectedTrendKey] = useState("");
  const selectedRace = weekendOfficialRaces.find((race) => race.id === selectedRaceId) ?? weekendOfficialRaces[0];
  const visibleRaces = favoritesOnly ? weekendOfficialRaces.filter((race) => favorites.includes(race.id)) : weekendOfficialRaces;
  const trendGroups = useMemo(() => aggregateCourseTrends(courseRecords), [courseRecords]);
  const selectedTrend = trendGroups.find((trend) => trend.key === selectedTrendKey) ?? trendGroups[0];
  const trendChartData = selectedTrend ? selectedTrend.byStyle.map((row) => ({ label: row.style, winRate: row.winRate, color: styleColors[row.style] })) : [];

  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(ODDS_KEY, JSON.stringify(oddsByRace)); }, [oddsByRace]);
  useEffect(() => { localStorage.setItem(PREVIOUS_RUNS_KEY, JSON.stringify(previousRuns)); }, [previousRuns]);
  useEffect(() => { localStorage.setItem(COURSE_TRENDS_KEY, JSON.stringify(courseRecords)); }, [courseRecords]);
  useEffect(() => { if (selectedTrend && selectedTrend.key !== selectedTrendKey) setSelectedTrendKey(selectedTrend.key); }, [selectedTrend, selectedTrendKey]);

  const loadRace = (race: OfficialRaceCard) => {
    const entries = getOfficialRaceStorage(race);
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    localStorage.removeItem("keiba-lab-manual-adjustments");
    toast.success(`${race.label}を読み込みます`, { description: `${race.venue} ${race.raceNumber}・${race.surface}${race.distance.toLocaleString()}mの推奨初期条件を保存しました。` });
    window.setTimeout(() => window.location.reload(), 260);
  };

  const toggleFavorite = (raceId: string) => setFavorites((items) => items.includes(raceId) ? items.filter((item) => item !== raceId) : [...items, raceId]);

  const importOdds = (race: OfficialRaceCard, file?: File) => {
    if (!file) return;
    readTextFile(file, (text) => {
      const parsed = parseOddsCsv(text, race.horses.map((horse) => horse.name));
      setOddsErrors(parsed.errors);
      if (!parsed.rows.length) { toast.error("有効な前日オッズがありません。", { description: parsed.errors[0] }); return; }
      setOddsByRace((records) => ({ ...records, [race.id]: parsed.rows }));
      toast.success(`${race.label}の前日オッズを${parsed.rows.length}頭分読み込みました。`);
    });
  };

  const importPreviousRuns = (file?: File) => {
    if (!file) return;
    readTextFile(file, (text) => {
      const parsed = parsePreviousRunsCsv(text);
      setPreviousRunErrors(parsed.errors);
      if (!parsed.rows.length) { toast.error("有効な前走成績がありません。", { description: parsed.errors[0] }); return; }
      setPreviousRuns(parsed.rows);
      toast.success(`前走成績を${parsed.rows.length}件読み込みました。`);
    });
  };

  const importCourseTrends = (file?: File) => {
    if (!file) return;
    readTextFile(file, (text) => {
      const parsed = parseCourseTrendCsv(text);
      setTrendErrors(parsed.errors);
      if (!parsed.rows.length) { toast.error("有効な過去レースデータがありません。", { description: parsed.errors[0] }); return; }
      setCourseRecords(parsed.rows);
      toast.success(`コース別展開分析用に${parsed.rows.length}件を読み込みました。`);
    });
  };

  const currentOdds = selectedRace ? oddsByRace[selectedRace.id] ?? [] : [];
  const previousRunsForRace = selectedRace ? selectedRace.horses.map((horse) => ({ horse, run: previousRuns.find((run) => run.horseName === horse.name) })) : [];
  const previousMetricInfo = { finish: { label: "前走着順", note: "数値が小さいほど上位です。" }, distance: { label: "前走距離", note: "メートルで表示します。" }, margin: { label: "前走着差", note: "着差を馬身換算の入力値で表示します。" }, daysAgo: { label: "レース間隔", note: "今回までの間隔（日数）です。" } }[previousMetric];
  const previousRunChartData = previousRunsForRace.filter((item) => item.run).map(({ horse, run }) => ({ name: horse.name.length > 7 ? `${horse.name.slice(0, 7)}…` : horse.name, fullName: horse.name, value: Number(run?.[previousMetric] ?? 0) }));

  return <section className="official-race-catalog" aria-label="今週末の公式レースデータ">
    <div className="official-race-catalog-heading"><span className="eyebrow">WEEKEND RACE CATALOG</span><strong>札幌以外の実レースを読み込む</strong><small>天候・馬場は標準初期設定です。当日の確定情報は「直前情報を反映」で上書きできます。</small></div>
    <div className="catalog-favorite-controls"><button className={favoritesOnly ? "is-active" : ""} onClick={() => setFavoritesOnly((value) => !value)}><Heart size={13} fill={favoritesOnly ? "currentColor" : "none"} /> お気に入りのみ（{favorites.length}）</button>{favorites.length > 0 && <div><span>クイック呼出し</span>{weekendOfficialRaces.filter((race) => favorites.includes(race.id)).map((race) => <button className={selectedRaceId === race.id ? "is-current" : ""} key={race.id} onClick={() => setSelectedRaceId(race.id)}>{race.label.replace(/^第\d+回\s*/, "")}</button>)}</div>}</div>
    <div className="official-race-card-grid">{visibleRaces.length ? visibleRaces.map((race) => <article className={`official-race-card ${selectedRaceId === race.id ? "is-selected" : ""}`} key={race.id}><div><div className="catalog-card-tools"><span className="eyebrow">{race.surface === "芝" ? "TURF / LEFT" : "DIRT / LEFT"}</span><button className={favorites.includes(race.id) ? "catalog-heart is-favorite" : "catalog-heart"} onClick={() => toggleFavorite(race.id)} aria-label={`${race.label}をお気に入りに追加`}><Heart size={14} fill={favorites.includes(race.id) ? "currentColor" : "none"} /></button></div><strong>{race.label}</strong><small><MapPinned size={12} /> {race.venue} {race.raceNumber} · {race.surface}{race.distance.toLocaleString()}m · {race.horses.length}頭</small><p>{race.courseNote}</p><a href={race.sourceUrl} target="_blank" rel="noreferrer">出馬表を確認 <ExternalLink size={11} /></a></div><div className="catalog-card-actions"><button onClick={() => setSelectedRaceId(race.id)}>分析を開く <ChevronDown size={13} /></button><button onClick={() => loadRace(race)}><RefreshCw size={13} /> 推奨条件で読み込む</button></div></article>) : <div className="catalog-favorite-empty"><Heart size={16} /> お気に入り登録済みのレースはありません。カード右上のハートから追加できます。</div>}</div>
    {selectedRace && <div className="catalog-workbench">
      <div className="catalog-workbench-heading"><div><span className="eyebrow">RACE INTELLIGENCE</span><h3>{selectedRace.label}<small>{selectedRace.venue} {selectedRace.raceNumber} · {selectedRace.surface}{selectedRace.distance.toLocaleString()}m</small></h3></div><span>{favorites.includes(selectedRace.id) ? "お気に入り登録済み" : "分析対象レース"}</span></div>
      <div className="catalog-analysis-grid">
        <article className="catalog-analysis-card"><div className="catalog-section-title"><div><span className="eyebrow">PREVIOUS-DAY ODDS</span><h4>前日オッズ</h4></div><div className="catalog-actions"><button onClick={() => downloadTextFile(`${selectedRace.id}-odds-template.csv`, csvTemplateForOdds(selectedRace))}><Download size={13} /> テンプレート</button><label><Upload size={13} /> CSV取込<input type="file" accept=".csv,text/csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => importOdds(selectedRace, event.target.files?.[0])} /></label></div></div>{currentOdds.length ? <div className="catalog-odds-list">{currentOdds.map((row) => <div key={row.horseName}><strong>{row.horseName}</strong><span>{row.popularity ? `${row.popularity}番人気` : "人気未入力"}</span><b>{row.odds.toFixed(1)}<small>倍</small></b></div>)}</div> : <p className="catalog-empty">前日オッズCSVを読み込むと、単勝オッズと人気順をここに表示します。</p>}{oddsErrors.length > 0 && <p className="catalog-error">{oddsErrors[0]}{oddsErrors.length > 1 ? ` ほか${oddsErrors.length - 1}件` : ""}</p>}</article>
        <article className="catalog-analysis-card"><div className="catalog-section-title"><div><span className="eyebrow">LAST-RACE COMPARISON</span><h4>前走成績を比較</h4></div><div className="catalog-actions"><button onClick={() => downloadTextFile("previous-runs-template.csv", previousRunsTemplate())}><Download size={13} /> テンプレート</button><label><Upload size={13} /> CSV取込<input type="file" accept=".csv,text/csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => importPreviousRuns(event.target.files?.[0])} /></label></div></div>{previousRunsForRace.some((row) => row.run) ? <><div className="previous-run-list">{previousRunsForRace.map(({ horse, run }) => <div key={horse.name}><strong>{horse.name}</strong>{run ? <><span>{run.raceName || "レース名未入力"} · {run.venue || "会場未入力"}{run.distance ? ` ${run.distance.toLocaleString()}m` : ""}</span><b>{run.finish}着<small>{run.fieldSize ? ` / ${run.fieldSize}頭` : ""}</small></b><em>{run.style || "脚質未入力"}{run.daysAgo ? ` · ${run.daysAgo}日間隔` : ""}</em></> : <span className="not-imported">前走データ未取込</span>}</div>)}</div><div className="previous-run-visual"><div><strong>{previousMetricInfo.label}</strong><select value={previousMetric} onChange={(event) => setPreviousMetric(event.target.value as typeof previousMetric)}><option value="finish">着順</option><option value="distance">距離</option><option value="margin">着差</option><option value="daysAgo">間隔</option></select></div><ResponsiveContainer width="100%" height={172}><BarChart data={previousRunChartData} margin={{ top: 12, right: 4, left: -20, bottom: 24 }}><CartesianGrid stroke="#334958" strokeDasharray="3 3" /><XAxis dataKey="name" angle={-34} textAnchor="end" interval={0} stroke="#9dacb1" fontSize={8} /><YAxis stroke="#9dacb1" fontSize={9} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""} formatter={(value: number) => [previousMetric === "distance" ? `${value.toLocaleString()}m` : previousMetric === "daysAgo" ? `${value}日` : previousMetric === "margin" ? `${value}馬身` : `${value}着`, previousMetricInfo.label]} contentStyle={{ background: "#0c1722", border: "1px solid #435868", color: "#e9e5d7" }} /><Bar dataKey="value" fill="#d2b56f" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer><p>{previousMetricInfo.note}</p></div></> : <p className="catalog-empty">前走成績CSVを読み込むと、全出走馬の直近レースを横並びで比較できます。</p>}{previousRunErrors.length > 0 && <p className="catalog-error">{previousRunErrors[0]}{previousRunErrors.length > 1 ? ` ほか${previousRunErrors.length - 1}件` : ""}</p>}</article>
      </div>
      <article className="course-trend-panel"><div className="catalog-section-title"><div><span className="eyebrow">COURSE PACE INTELLIGENCE</span><h4>過去データから読むコース別展開傾向</h4><p>同一の競馬場・コース種別・距離ごとに、脚質別の勝率・複勝率とペース構成を集計します。</p></div><div className="catalog-actions"><button onClick={() => downloadTextFile("course-trend-template.csv", courseTrendTemplate())}><Download size={13} /> テンプレート</button><label><Upload size={13} /> 過去レースCSV<input type="file" accept=".csv,text/csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => importCourseTrends(event.target.files?.[0])} /></label></div></div>{trendGroups.length && selectedTrend ? <><div className="trend-control"><label>分析コース<select value={selectedTrend.key} onChange={(event) => setSelectedTrendKey(event.target.value)}>{trendGroups.map((trend) => <option key={trend.key} value={trend.key}>{trend.label}（{trend.samples}件）</option>)}</select></label><span>ペース構成: {Object.entries(selectedTrend.paceCounts).map(([pace, count]) => `${pace} ${count}件`).join(" / ")}</span></div><div className="trend-visual-grid"><div className="trend-chart"><ResponsiveContainer width="100%" height={210}><BarChart data={trendChartData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}><CartesianGrid stroke="#334958" strokeDasharray="3 3" /><XAxis dataKey="label" stroke="#9dacb1" fontSize={10} /><YAxis unit="%" stroke="#9dacb1" fontSize={10} /><Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} contentStyle={{ background: "#0c1722", border: "1px solid #435868", color: "#e9e5d7" }} /><Bar dataKey="winRate" name="勝率" radius={[3, 3, 0, 0]}>{trendChartData.map((entry) => <Cell key={entry.label} fill={entry.color} />)}</Bar></BarChart></ResponsiveContainer></div><div className="trend-table"><div><span>脚質</span><span>件数</span><span>勝率</span><span>複勝率</span></div>{selectedTrend.byStyle.map((row) => <div key={row.style}><b style={{ color: styleColors[row.style] }}>{row.style}</b><span>{row.samples}</span><strong>{row.winRate.toFixed(1)}%</strong><strong>{row.top3Rate.toFixed(1)}%</strong></div>)}</div></div></> : <div className="catalog-empty trend-empty"><BarChart3 size={18} /><span>過去レースCSVを読み込むと、コースごとの脚質別勝率・複勝率とペース構成を表示します。</span></div>}{trendErrors.length > 0 && <p className="catalog-error">{trendErrors[0]}{trendErrors.length > 1 ? ` ほか${trendErrors.length - 1}件` : ""}</p>}</article>
    </div>}
  </section>;
}
