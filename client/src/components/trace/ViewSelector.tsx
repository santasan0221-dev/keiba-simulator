import React from "react";
import { VIEW_HINT, VIEW_LABEL, VIEW_MODES, type ViewDepth, type ViewMode } from "@/lib/viewMode";

/** View mode picker (flat map / pseudo-3D overhead): a two-option radio group. */
export function ViewSelector({ mode, onChange, depth }: { mode: ViewMode; onChange: (mode: ViewMode) => void; depth: ViewDepth }) {
  return <div className="kt-camera kt-view" role="group" aria-label="表示モード">
    <span className="kt-camera-title" id="kt-view-title">VIEW</span>
    <div role="radiogroup" aria-labelledby="kt-view-title" className="kt-camera-options kt-view-options">
      {VIEW_MODES.map(value => <button
        type="button" key={value} role="radio" aria-checked={mode === value} tabIndex={mode === value ? 0 : -1}
        className={mode === value ? "is-current" : ""} title={VIEW_HINT[value]}
        onClick={() => onChange(value)}
        onKeyDown={event => {
          if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            const next = VIEW_MODES[(VIEW_MODES.indexOf(value) + 1) % VIEW_MODES.length];
            onChange(next);
            (event.currentTarget.parentElement?.querySelector(`[data-view-option="${next}"]`) as HTMLElement | null)?.focus();
          }
        }}
        data-view-option={value}
      >{VIEW_LABEL[value]}</button>)}
    </div>
    <small>{depth === "LITE" ? "モーション軽減設定のため、3D俯瞰は静止した簡易表示です" : VIEW_HINT[mode]}</small>
  </div>;
}
