import type { CSSProperties } from "react";

// Presentation only. The fallback is deliberately NOT the eight gate colours.
const VISUAL = ["#bfe8f5", "#e4cef5", "#f8d4ab", "#b9e4d4", "#f4c5d8", "#d9dfac"];
const FRAMES = ["#ffffff", "#202733", "#be2639", "#155fa8", "#f8df4e", "#167148", "#ef9235", "#efb5d0"];
export function runnerPresentation(no: number, frame?: unknown) {
  const known = typeof frame === "number" && Number.isInteger(frame) && frame >= 1 && frame <= 8;
  const index = Number.isSafeInteger(no) && no > 0 ? (no * 7 + 3) % VISUAL.length : 0;
  const fill = known ? FRAMES[frame - 1] : VISUAL[index];
  const ink = known && [2, 3, 4, 6].includes(frame) ? "#ffffff" : "#10212c";
  return { fill, ink, basis: known ? "FRAME" : "VISUAL_ONLY", style: { "--runner-fill": fill, "--runner-ink": ink } as CSSProperties };
}
