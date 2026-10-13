import { PredictionCard } from "./PredictionCard";
import type { PredictionCard as Card } from "@/lib/predictionCardContract";

export function ProductionPredictionCard({card,raceKey,enabled=import.meta.env.VITE_PREDICTION_CARD_PUBLIC_ENABLED === "1"}:{card?:Card|null;raceKey:string|null;enabled?:boolean}) {
  // No second adapter/builder, request or fallback. API already returns the normalized model.
  if(!enabled || !card || card.version!=="prediction_card_v1" || card.status!=="OK" || card.race?.race_key!==raceKey || !Array.isArray(card.marks) || card.marks.length!==6)return null;
  return <section className="prediction-card-production" aria-label="AI候補順位（公開本命とは別）"><PredictionCard card={card}/></section>;
}
