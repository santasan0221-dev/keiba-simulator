import React, { useRef } from "react";
import { CAMERA_HINT, CAMERA_LABEL, CAMERA_MODES, type CameraMode } from "@/lib/camera";

/** Camera mode picker: a radio group with a roving tab stop and arrow-key navigation. */
export function CameraSelector({ mode, onChange, reducedMotion }: { mode: CameraMode; onChange: (mode: CameraMode) => void; reducedMotion: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, step: number) => {
    const next = (from + step + CAMERA_MODES.length) % CAMERA_MODES.length;
    onChange(CAMERA_MODES[next]);
    refs.current[next]?.focus();
  };
  return <div className="kt-camera" role="group" aria-label="カメラ">
    <span className="kt-camera-title" id="kt-camera-title">CAMERA</span>
    <div role="radiogroup" aria-labelledby="kt-camera-title" className="kt-camera-options">
      {CAMERA_MODES.map((value, index) => <button
        type="button" key={value} role="radio" aria-checked={mode === value} tabIndex={mode === value ? 0 : -1}
        ref={el => { refs.current[index] = el; }} className={mode === value ? "is-current" : ""} title={CAMERA_HINT[value]}
        onClick={() => onChange(value)}
        onKeyDown={event => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
        }}
      >{CAMERA_LABEL[value]}</button>)}
    </div>
    <small>{reducedMotion && mode === "AUTO" ? "モーション軽減設定のため、自動の画角変更は停止中（TRACK表示）" : CAMERA_HINT[mode]}</small>
  </div>;
}
