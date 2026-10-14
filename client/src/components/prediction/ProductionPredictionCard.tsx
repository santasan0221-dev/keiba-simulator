import { Component, type ReactNode } from "react";
import { PredictionCard } from "./PredictionCard";
import { predictionCardUiEnabled, validPredictionCard } from "@/lib/predictionCardUi";
class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
export function ProductionPredictionCard({ card, raceKey, enabled = predictionCardUiEnabled() }: { card?: unknown; raceKey: string | null; enabled?: boolean }) {
  // The existing response is the only input. No requests or placeholders.
  if (!enabled || !validPredictionCard(card, raceKey)) return null;
  return <CardBoundary key={`${raceKey}:${JSON.stringify(card)}`}><section className="prediction-card-production" aria-label="AI候補順位（公開本命とは別）"><details><summary>{card.marks.length === 6 ? "AI候補6頭" : "AI評価上位候補"}<span>公開◎とは別のAI候補順位</span></summary><PredictionCard card={card}/></details></section></CardBoundary>;
}
