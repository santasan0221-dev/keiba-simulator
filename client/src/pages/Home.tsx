/* Velvet Turf design: premium sports-editorial dashboard, asymmetrical race-lab layout, navy/ivory/brass palette. */
import { useMemo, useState } from "react";
import { Activity, ChevronDown, Gauge, Info, Play, RotateCcw, SlidersHorizontal, Trophy, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";

const horseSeeds = [
  { no: 1, name: "ノーブル・アーチ", color: "#b9c3d4", style: "差し", speed: 88, stamina: 82, start: 78, form: 91, popularity: 2 },
  { no: 2, name: "サウス・レガシー", color: "#e7b66a", style: "先行", speed: 84, stamina: 87, start: 90, form: 86, popularity: 4 },
  { no: 3, name: "ヴェルヴェット・R", color: "#db7e70", style: "逃げ", speed: 91, stamina: 70, start: 95, form: 80, popularity: 1 },
  { no: 4, name: "ミッドナイト・ベル", color: "#95c6b0", style: "追込", speed: 86, stamina: 89, start: 74, form: 88, popularity: 3 },
  { no: 5, name: "オーブ・オブ・ライト", color: "#aa9ad6", style: "差し", speed: 80, stamina: 90, start: 81, form: 76, popularity: 7 },
  { no: 6, name: "クロスロード", color: "#d7a5ca", style: "先行", speed: 83, stamina: 79, start: 88, form: 84, popularity: 5 },
  { no: 7, name: "グリーン・モーメント", color: "#8ebc83", style: "追込", speed: 79, stamina: 92, start: 69, form: 81, popularity: 8 },
  { no: 8, name: "アステル・コール", color: "#9bbbd2", style: "差し", speed: 85, stamina: 84, start: 76, form: 79, popularity: 6 },
];

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function runSimulation(distance: number, going: string, pace: string, runs: number) {
  const goingFactor: Record<string, number> = { 良: 1, 稍重: 0.97, 重: 0.93, 不良: 0.88 };
  const paceFactor: Record<string, Record<string, number>> = {
    スロー: { 逃げ: 1.04, 先行: 1.02, 差し: 0.98, 追込: 0.95 },
    平均: { 逃げ: 1, 先行: 1, 差し: 1, 追込: 1 },
    ハイ: { 逃げ: 0.94, 先行: 0.97, 差し: 1.03, 追込: 1.06 },
  };
  const totals = horseSeeds.map((horse) => ({ ...horse, wins: 0, places: 0, points: 0, samples: [] as number[] }));
  for (let i = 0; i < runs; i++) {
    const ranked = totals.map((horse) => {
      const distanceFit = distance >= 2000 ? horse.stamina * 0.16 : horse.speed * 0.16;
      const paceFit = paceFactor[pace][horse.style];
      const goingFit = 1 + (horse.stamina - 80) * (1 - goingFactor[going]) * 0.006;
      const noise = (Math.random() - 0.5) * 16;
      const score = (horse.speed * 0.35 + horse.stamina * 0.25 + horse.start * 0.12 + horse.form * 0.28 + distanceFit) * paceFit * goingFit + noise;
      return { horse, score };
    }).sort((a, b) => b.score - a.score);
    ranked.forEach((item, index) => {
      item.horse.points += Math.max(0, 9 - index);
      item.horse.samples.push(item.score);
      if (index === 0) item.horse.wins++;
      if (index < 3) item.horse.places++;
    });
  }
  return totals.map((horse) => ({ ...horse, winRate: horse.wins / runs * 100, placeRate: horse.places / runs * 100, avgScore: horse.samples.reduce((a, b) => a + b, 0) / runs })).sort((a, b) => b.winRate - a.winRate);
}

export default function Home() {
  const [distance, setDistance] = useState(2000);
  const [going, setGoing] = useState("良");
  const [pace, setPace] = useState("平均");
  const [runs, setRuns] = useState(10000);
  const [seed, setSeed] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const results = useMemo(() => runSimulation(distance, going, pace, runs), [distance, going, pace, runs, seed]);
  const favorite = results[0];
  const chartData = results.slice(0, 6).map((horse, index) => ({ name: `${index + 1}着`, value: Math.round(horse.winRate * 10) / 10 }));
  const rerun = () => setSeed((value) => value + 1);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/manus-storage/keiba-track-mark_68c4cb74.png" alt="Keiba Simulator mark" /></div>
          <div><div className="brand-name">KEIBA <span>LAB</span></div><div className="brand-caption">RACE SIMULATION STUDIO</div></div>
        </div>
        <div className="topbar-meta"><span className="status-dot" />LOCAL MODEL <span className="divider" /> AUG 13, 2026 <button className="ghost-icon" aria-label="Information"><Info size={16} /></button></div>
      </header>

      <main className="dashboard-grid">
        <aside className="control-rail">
          <div className="rail-heading"><span className="eyebrow">01 / SETUP</span><SlidersHorizontal size={16} /></div>
          <h1>レースを<br /><em>組み立てる。</em></h1>
          <p className="rail-intro">条件を変えると、展開の読み筋も変わります。ここでは仮想レースを複数回走らせ、結果の分布を観察します。</p>
          <div className="setting-group">
            <label>コース距離 <strong>{distance.toLocaleString()}m</strong></label>
            <input type="range" min="1200" max="3200" step="100" value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
            <div className="range-labels"><span>1,200m</span><span>3,200m</span></div>
          </div>
          <div className="setting-group"><label>馬場状態</label><div className="segmented">{["良", "稍重", "重", "不良"].map((item) => <button key={item} className={going === item ? "selected" : ""} onClick={() => setGoing(item)}>{item}</button>)}</div></div>
          <div className="setting-group"><label>想定ペース</label><div className="select-wrap"><select value={pace} onChange={(e) => setPace(e.target.value)}><option>スロー</option><option>平均</option><option>ハイ</option></select><ChevronDown size={15} /></div></div>
          <div className="setting-group"><label>試行回数 <strong>{runs.toLocaleString()}回</strong></label><input type="range" min="1000" max="50000" step="1000" value={runs} onChange={(e) => setRuns(Number(e.target.value))} /><div className="range-labels"><span>1,000</span><span>50,000</span></div></div>
          <Button className="simulate-button" onClick={rerun}><Play size={15} fill="currentColor" /> シミュレーションを走らせる</Button>
          <p className="model-note"><span className="brass-line" />能力値・脚質・距離適性・馬場補正・ペース補正・乱数を合成したブラウザ内モデルです。</p>
        </aside>

        <section className="main-stage">
          <div className="hero-panel">
            <img src="/manus-storage/velvet-turf-hero_f15cb3f8.jpg" alt="夜の競馬場" />
            <div className="hero-overlay" />
            <div className="hero-copy"><span className="eyebrow light">RACE 07 / VIRTUAL TURF</span><h2>第42回<br /><span>サマー・カップ</span></h2><div className="hero-specs"><span>東京 11R</span><span>芝 {distance.toLocaleString()}m</span><span>{going} / {pace}ペース</span></div></div>
            <div className="hero-badge"><span>RUNS</span><strong>{runs.toLocaleString()}</strong><small>trials completed</small></div>
          </div>

          <div className="stage-tabs"><button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>結果サマリー</button><button className={activeTab === "field" ? "active" : ""} onClick={() => setActiveTab("field")}>出走馬の読み筋</button><span className="tab-rule" /><span className="last-run"><Zap size={14} /> LIVE MODEL · UPDATED JUST NOW</span></div>

          {activeTab === "overview" ? <>
            <div className="headline-row"><div><span className="eyebrow">TOP PROBABILITY</span><h3>{favorite.name}</h3><p>勝率 <strong>{favorite.winRate.toFixed(1)}%</strong> · 連対率 {favorite.placeRate.toFixed(1)}%</p></div><div className="headline-number"><span>WIN PROBABILITY</span><strong>{favorite.winRate.toFixed(1)}<small>%</small></strong></div></div>
            <div className="result-table-wrap"><div className="table-heading"><span>勝率ランキング</span><span>着順確率の分布</span></div>{results.map((horse, index) => <div className={"horse-row " + (index === 0 ? "top-rank" : "")} key={horse.no}><div className="rank">{String(index + 1).padStart(2, "0")}</div><div className="silk-dot" style={{ background: horse.color }} /><div className="horse-name"><strong>{horse.name}</strong><span>馬番 {horse.no} · {horse.style}</span></div><div className="prob-bar"><div style={{ width: `${clamp(horse.winRate * 2.9)}%` }} /></div><div className="win-rate">{horse.winRate.toFixed(1)}<small>%</small></div><div className="trend">{index < 2 ? "↑" : "→"}</div></div>)}</div>
          </> : <div className="field-grid">{horseSeeds.map((horse) => <div className="field-card" key={horse.no}><div className="field-card-top"><span className="silk-dot" style={{ background: horse.color }} /> <span>#{horse.no}</span><span className="style-tag">{horse.style}</span></div><h3>{horse.name}</h3><div className="metric"><span>末脚</span><div><i style={{ width: `${horse.speed}%` }} /></div><b>{horse.speed}</b></div><div className="metric"><span>持久力</span><div><i style={{ width: `${horse.stamina}%` }} /></div><b>{horse.stamina}</b></div><div className="metric"><span>近況</span><div><i style={{ width: `${horse.form}%` }} /></div><b>{horse.form}</b></div></div>)}</div>}
        </section>

        <aside className="insight-rail"><div className="rail-heading"><span className="eyebrow">02 / INSIGHT</span><Gauge size={16} /></div><div className="insight-card accent-card"><div className="card-label"><span>PACE OUTLOOK</span><span className="live-pill">{pace}</span></div><h3>{pace === "ハイ" ? "前崩れの余地。" : pace === "スロー" ? "前残りに注意。" : "隊列は均衡。"}</h3><p>{pace === "ハイ" ? "後方待機組の末脚が、最後の直線で浮上しやすいシナリオです。" : pace === "スロー" ? "先行勢が余力を残して直線へ。位置取りが勝負を分けます。" : "各脚質に均等な余地。能力値と馬場適性の差が効きます。"}</p><div className="pace-track"><span className="pace-marker" style={{ left: pace === "ハイ" ? "79%" : pace === "スロー" ? "22%" : "50%" }} /></div><div className="pace-labels"><span>後方有利</span><span>前方有利</span></div></div><div className="insight-card"><div className="card-label"><span>TOP 3 CONSENSUS</span><Trophy size={15} /></div><div className="podium-list">{results.slice(0, 3).map((horse, i) => <div className="podium-item" key={horse.no}><span className={`medal m${i + 1}`}>{i + 1}</span><strong>{horse.name}</strong><span>{horse.winRate.toFixed(1)}%</span></div>)}</div></div><div className="insight-card chart-card"><div className="card-label"><span>WIN PROBABILITY CURVE</span><Activity size={15} /></div><div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="brassFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8a866" stopOpacity={0.4}/><stop offset="100%" stopColor="#c8a866" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ffffff12" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#788394", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide domain={[0, "auto"]} /><Tooltip contentStyle={{ background: "#1b2431", border: "1px solid #c8a86655", borderRadius: 4, color: "#f3efe5" }} /><Area type="monotone" dataKey="value" stroke="#c8a866" fill="url(#brassFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div><button className="reset-button" onClick={() => { setDistance(2000); setGoing("良"); setPace("平均"); setRuns(10000); rerun(); }}><RotateCcw size={14} /> 条件を初期化</button></aside>
      </main>
      <footer className="footer"><span>KEIBA LAB / PRIVATE RACE MODEL</span><span>結果はシミュレーション上の推計であり、実際のレース結果を保証するものではありません。</span></footer>
    </div>
  );
}
