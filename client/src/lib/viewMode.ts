/**
 * Presentation-only view mode for the track stage. It never feeds the simulation: runner progress,
 * order, camera targets and analytics are identical in every mode.
 *   MAP     the existing flat 2D view (default)
 *   TOP_3D  pseudo-3D overhead view (CSS perspective tilt + depth cues)
 */
export const VIEW_MODES = ["MAP", "TOP_3D"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VIEW_LABEL: Record<ViewMode, string> = { MAP: "2D", TOP_3D: "3D俯瞰" };
export const VIEW_HINT: Record<ViewMode, string> = {
  MAP: "従来の平面コース表示。",
  TOP_3D: "斜め上から見下ろす疑似3D表示。表示だけの変更で、位置・順位・カメラの動きは同じです。",
};

/** Depth level actually drawn: LITE is the static tilt only (reduced motion), FULL adds depth cues. */
export type ViewDepth = "FLAT" | "LITE" | "FULL";

/** reduced motion degrades TOP_3D to the simple static tilt: no extrusion, gloss or transitions. */
export function viewDepth(mode: ViewMode, reducedMotion: boolean): ViewDepth {
  if (mode !== "TOP_3D") return "FLAT";
  return reducedMotion ? "LITE" : "FULL";
}
