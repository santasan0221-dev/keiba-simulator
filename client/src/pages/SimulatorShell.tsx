import React, { useState } from "react";
import { Link } from "wouter";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
export default function SimulatorShell() {
  const [pace, setPace] = useState("平均");
  return (
    <main className="broadcast simulator-shell">
      <LabServiceNavigation active="simulator" />
      <header className="broadcast-heading">
        <div>
          <span className="eyebrow">KEIBA TRACE / SCENARIO LAB</span>
          <h1>展開を読む、研究室。</h1>
          <p>仮想シミュレーション · サンプルデータ未読込</p>
        </div>
        <span className="broadcast-badge status-research">RESEARCH_ONLY</span>
      </header>
      <p className="shell-notice">
        この画面は研究用の表示枠です。実AI予測は「本日の予想」ページをご覧ください。
      </p>
      <section className="scenario-controls">
        <label>
          仮定ペース
          <select value={pace} onChange={event => setPace(event.target.value)}>
            <option>スロー</option>
            <option>平均</option>
            <option>ハイ</option>
          </select>
        </label>
        <span>
          pace scenario · {pace}{" "}
          <b className="broadcast-badge status-research">RESEARCH_ONLY</b>
        </span>
      </section>
      <div className="simulator-stage">
        <section className="track-shell" aria-label="研究用コース表示枠">
          <div className="track-outline" aria-hidden="true">
            <div />
          </div>
          <div className="track-placeholder">
            <span className="eyebrow">SCENARIO REPLAY</span>
            <h2>展開イメージ</h2>
            <p>入力データを接続後に表示します</p>
          </div>
          <footer>
            <span>再生進捗 —</span>
            <span>未実行 · RESEARCH_ONLY</span>
          </footer>
        </section>
        <section className="order-shell">
          <span className="eyebrow">RUNNING ORDER</span>
          <h2>隊列パネル</h2>
          <p>研究用の順位表示枠</p>
          <div className="broadcast-state">出走馬データ未読込</div>
          <small>公式通過順位ではありません。</small>
        </section>
      </div>
      <section className="probability-panels" aria-label="確率の出典別パネル">
        {(["AI", "MARKET", "SIM"] as const).map(origin => (
          <article
            className={`probability-panel origin-${origin.toLowerCase()}`}
            key={origin}
          >
            <span className="eyebrow">{origin}</span>
            <h2>
              {origin === "AI"
                ? "事前AI推定"
                : origin === "MARKET"
                  ? "市場評価"
                  : "研究SIM"}
            </h2>
            <strong>—</strong>
            <span className="broadcast-badge">
              {origin === "SIM" ? "RESEARCH_ONLY" : "UNAVAILABLE"}
            </span>
            <p>
              {origin === "SIM"
                ? "未計算。研究用シナリオ集計の表示枠。"
                : "同一レースの検証済みデータ未接続。"}
            </p>
          </article>
        ))}
      </section>
      <p className="shell-notice">
        再生進捗・隊列は演出用です。走行中の計測値や勝率更新は提供しません。
      </p>
      <Link href="/">本日の予想へ</Link>
    </main>
  );
}
