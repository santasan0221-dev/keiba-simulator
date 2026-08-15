import { Activity, AlertTriangle, Database, ShieldCheck } from "lucide-react";
import type { RealRaceSnapshot } from "@/lib/singlePickAi";

function formatProbability(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? String((value * 100).toFixed(1)) + "%" : "未校正";
}

export function TruthPanel({ snapshot }: { snapshot: RealRaceSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="truth-panel truth-panel-empty" aria-labelledby="truth-panel-title">
        <div className="truth-panel-mark"><Database size={18} /></div>
        <div><span className="eyebrow">TRUTH PANEL / REAL MODEL INPUT</span><h2 id="truth-panel-title">実AI予測を読み込むと、what-ifと分けて確認できます。</h2><p>RealRaceLoaderからsingle_pick_aiのレースを選ぶと、AIが返した値・未校正状態・履歴の出所をここに表示します。</p></div>
        <div className="truth-panel-legend"><span><i className="legend-dot truth" />実AI予測</span><span><i className="legend-dot sandbox" />what-if</span></div>
      </section>
    );
  }
  const isCalibrated = snapshot.model.calibration_status === "READY";
  const ranked = [...snapshot.horses].filter((horse) => horse.model.ai_rank !== null).sort((a, b) => (a.model.ai_rank ?? 999) - (b.model.ai_rank ?? 999)).slice(0, 3);
  return (
    <section className="truth-panel" aria-labelledby="truth-panel-title">
      <div className="truth-panel-heading"><div className="truth-panel-mark"><ShieldCheck size={18} /></div><div><span className="eyebrow">TRUTH PANEL / REAL MODEL OUTPUT</span><h2 id="truth-panel-title">実AI予測とwhat-ifを分けて見る。</h2><p>single_pick_aiから取得したレース情報です。画面下のシミュレーションは、このデータを種にしたブラウザ内のwhat-ifです。</p></div><span className={isCalibrated ? "truth-status ready" : "truth-status shadow"}>{isCalibrated ? "CALIBRATED" : "UNCALIBRATED / SHADOW"}</span></div>
      <div className="truth-panel-grid">
        <div className="truth-race-facts"><span className="card-label">RACE FACTS</span><strong>{snapshot.race.venue ?? "開催地未設定"} {snapshot.race.race_no ? String(snapshot.race.race_no) + "R" : ""}</strong><span>{snapshot.race.date ?? "日付未設定"} · {snapshot.race.distance ?? "—"}m · {snapshot.race.surface ?? "—"} · {snapshot.race.going ?? "馬場未設定"}</span><small>{snapshot.race.status} · as-of {snapshot.model.as_of ?? "未設定"}</small></div>
        <div className="truth-rankings"><span className="card-label">AI RANK / PROBABILITY</span>{ranked.length ? ranked.map((horse) => <div className="truth-rank-row" key={horse.no}><b>{String(horse.model.ai_rank).padStart(2, "0")}</b><strong>#{horse.no} {horse.name ?? "馬名未設定"}</strong><span>{formatProbability(horse.model.win_prob_calibrated)}</span></div>) : <div className="truth-empty-line"><AlertTriangle size={14} />AI順位が返されていません</div>}</div>
        <div className="truth-provenance"><span className="card-label">DATA LINEAGE</span><div><span>v23k末脚 <b>実値</b></span><span>馬場適性 <b>as-of履歴</b></span><span>持久力・先行力・近況 <b>暫定</b></span></div><small>{snapshot.model.disclaimer || "確率の校正状態を必ず確認してください。"}</small></div>
      </div>
      <div className="what-if-separator"><Activity size={15} /><span><b>WHAT-IF SANDBOX</b> 下のランキング・グラフは、ユーザーが条件を変更して試すブラウザ内シミュレーションです。実AI予測の確率・的中を保証するものではありません。</span></div>
    </section>
  );
}
