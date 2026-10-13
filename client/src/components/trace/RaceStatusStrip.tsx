import React from "react";
import { runnerPresentation } from "./runnerPresentation";
import { type LeaderChip, type RaceStatus } from "@/lib/raceStatusView";

export type StatusVariant = "A" | "B" | "C";

type Props = {
  variant: StatusVariant;
  status: RaceStatus;
  /** Section name (e.g. 3コーナー / 直線); null when the course cannot support one honestly. */
  section: string | null;
  /** Rounded remaining distance text; null when unknown. */
  remaining: string | null;
  leaders: LeaderChip[];
  selectedNo: number | null;
  /** Rank of the selected horse in the current scenario order (variant C). */
  selectedRank: number | null;
  onSelect: (no: number | null) => void;
};

const STATUS_JA: Record<RaceStatus, string> = { READY: "READY · 再生前", PLAYING: "PLAYING · 再生中", PAUSED: "PAUSED · 一時停止", COMPLETE: "COMPLETE · 完了" };

/**
 * Race status under the track: where the pack is (section + rounded remaining distance), the playback
 * state, and the current top five of the existing SCENARIO ORDER. Everything arrives as props from the
 * shell's throttled state (~8 Hz), so this renders at most five chips and never reads layout.
 * The order is the virtual scenario order, not a predicted or official finish.
 */
export const RaceStatusStrip = React.memo(function RaceStatusStrip({ variant, status, section, remaining, leaders, selectedNo, selectedRank, onSelect }: Props) {
  return <div className="kt-status" data-variant={variant} data-status={status}>
    <div className="kt-status-main">
      <span className="kt-status-state" data-race-status={status} role="status">{STATUS_JA[status]}</span>
      {section ? <strong className="kt-status-phase" data-phase-callout>{section}</strong> : null}
      {remaining ? <span className="kt-status-remaining" data-remaining-callout>{remaining}</span> : null}
    </div>
    {variant !== "A" ? <div className="kt-leaders" data-leader-strip role="group" aria-label="現在の先頭5頭（シナリオ上の仮想順）">
      <span className="kt-leaders-title">先頭<small>仮想順</small></span>
      <ol>
        {leaders.map(leader => {
          const selected = leader.no === selectedNo;
          return <li key={leader.rank}>
            <button type="button" data-leader-chip data-rank={leader.rank} data-selected={selected} aria-pressed={selected} style={runnerPresentation(leader.no).style}
              aria-label={`${leader.rank}位 ${leader.no}番 ${leader.name ?? ""}${selected ? " 選択中" : ""}`} onClick={() => onSelect(selected ? null : leader.no)}>
              <i className="kt-leader-rank" aria-hidden="true">{leader.rank}</i>
              <b className="kt-leader-no" data-color-basis="VISUAL_ONLY">{leader.no}</b>
            </button>
          </li>;
        })}
      </ol>
    </div> : null}
    {variant === "C" ? <p className="kt-status-selected" data-selected-status>{selectedNo === null ? "馬番をタップすると走行位置を強調します" : `選択中 #${selectedNo} · ${selectedRank === null ? "—" : `現在 ${selectedRank}位（仮想順）`}`}</p> : null}
  </div>;
});
