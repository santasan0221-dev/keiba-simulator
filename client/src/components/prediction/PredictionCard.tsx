import { useId } from "react";
import type { PredictionCard as Card } from "@/lib/predictionCardContract";
import "./prediction-card.css";

export function PredictionCard({card}:{card:Card}) {
  const id=useId();
  const pairwise = card.pairwise ?? [];
  if(card.status!=="OK") return <p role="status">候補カードを利用できません。</p>;
  return <article className="prediction-card" aria-labelledby={id}>
    <header><p className="pc-kicker">AI候補順位 · {card.race.title} · {card.race.organization}</p><h2 id={id}>{card.marks.length === 6 ? card.title : "AI評価上位候補"}</h2><p>◎はAI候補順位1位です。公開本命ではありません。</p></header>
    <ol className="prediction-card-marks" aria-label={`AI評価上位${card.marks.length}頭`}>
      {card.marks.map(mark=><li key={mark.horse_no} className={mark.rank===1?"prediction-card-focus":""}>
        <h3 aria-label={`${mark.rank === 1 ? "AI評価1位" : `AI候補${mark.rank}位`} ${mark.horse_no} ${mark.horse_name}`}><span aria-hidden="true">{mark.symbol} </span><span className="pc-rank">候補{mark.rank}位 </span>{mark.horse_no} {mark.horse_name}</h3>
        {mark.short && <p>{mark.short}</p>}
        {mark.rank===1 && mark.evidence && <p className="pc-evidence">説明根拠: {mark.evidence}</p>}
        {mark.rank===1 && pairwise.find(p=>p.upper===mark.horse_no) && <p>{pairwise.find(p=>p.upper===mark.horse_no)!.text}</p>}
      </li>)}
    </ol>
    {card.race.organization === "JRA" && card.selectivity && <section aria-label="候補収束度"><h3>候補収束度: {card.selectivity.label}</h3><p>◎の的中確率を示すものではありません。</p></section>}
    {card.explanation?.available && <details><summary>説明の詳細</summary><ul>{card.marks.filter(m=>m.medium).map(m=><li key={m.horse_no}><h3>{m.symbol} {m.horse_no} {m.horse_name}</h3><p>{m.medium}</p>{m.evidence && <p>説明根拠: {m.evidence}</p>}{m.unknown?.length>0 && <p>未評価: {m.unknown.join("、")}</p>}</li>)}</ul></details>}
    <footer>{card.disclaimer}<p>発走前データから評価した上位候補です。印は購入を推奨するものではなく、公開本命ではありません。収束度と説明根拠は◎の的中確率ではありません。</p></footer>
  </article>;
}
