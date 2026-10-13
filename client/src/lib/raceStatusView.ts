/**
 * Presentation helpers for the race-status strip under the track (phase, remaining distance, leaders).
 * Pure functions of values the shell already holds (course, pack lap, existing scenario order rows):
 * nothing here ranks, simulates or reads market / probability / result data.
 */
import type { CourseLayout } from "@/lib/courseAtlas";
import type { OrderRow } from "@/lib/scenarioOrder";
import { SECTION_LABEL_JA, type SectionId } from "@/lib/courseSections";

export const LEADER_COUNT = 5;
export type RaceStatus = "READY" | "PLAYING" | "PAUSED" | "COMPLETE";

export function raceStatus(progress: number, playing: boolean): RaceStatus {
  if (progress >= 1) return "COMPLETE";
  if (playing) return "PLAYING";
  return progress <= 0 ? "READY" : "PAUSED";
}

/**
 * Remaining distance of the scenario pack, rounded (never false precision): "残り 約1200m" in 100 m steps,
 * "ゴール前" inside the last 100 m. Null only when the race distance is unknown (the caller hides it once the scenario is complete).
 * `packLap` is the mean scenario lap (share of the race run) the shell already computes for the section.
 */
export function remainingLabel(distance: CourseLayout["distance"], packLap: number): string | null {
  if (typeof distance !== "number" || !(distance > 0)) return null;
  const left = distance * (1 - Math.max(0, packLap));
  if (left < 100) return "ゴール前";
  return `残り 約${Math.round(left / 100) * 100}m`;
}

/**
 * The user-facing section name. Only when the Atlas carries real section shares for a closed course
 * (or a straight course): the stylized fallback is not shown as if it were measured.
 */
export function sectionCallout(course: Pick<CourseLayout, "pathClosed" | "sectionShares">, section: SectionId, complete: boolean): string | null {
  if (complete) return null;
  if (course.pathClosed && course.sectionShares === "UNKNOWN") return null;
  return SECTION_LABEL_JA[section];
}

export type LeaderChip = { rank: number; no: number; name: string | null };

/** The first LEADER_COUNT rows of the existing scenario order (read only, no new ranking). */
export function leaderChips(rows: readonly OrderRow[], count = LEADER_COUNT): LeaderChip[] {
  return rows.slice(0, count).map(row => ({ rank: row.rank, no: row.no, name: row.name ?? null }));
}
