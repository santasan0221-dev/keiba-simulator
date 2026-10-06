/**
 * Simulator playback tracker: a small state machine that turns what the viewer does into the anonymous,
 * fixed-enumeration events of the existing beta analytics contract (lib/betaAnalytics). It builds no new
 * analytics infrastructure: every event goes through the `emit` it is given (the contract's trackBetaEvent),
 * so the allowlist, the property enumerations and the send-time guard all still apply.
 *
 * Nothing identifying is ever passed in: no race key, horse name or number, free text or URL. The only inputs
 * are the scenario progress (0..1), the progress at which the LAST runner crosses the goal line, and fixed
 * enumerations (camera mode, variant, result-tab source).
 *
 * "Complete" is defined as: the last runner has crossed the goal line (`beta_sim_last_runner_crossed`).
 * `beta_sim_complete` is the scenario reaching its end state (the SCENARIO COMPLETE view) just after it.
 *
 * One PLAYBACK is one run of the scenario from start. Pausing and resuming stays in the same playback;
 * a restart or replay starts a new one (and is counted as a replay when an earlier playback of the same
 * scenario has already begun). A milestone is reported at most once per playback, only when playback
 * advances across it; moving the scrubber or the phase rail is not playback and reports nothing.
 */
import { SIM_MILESTONES, type BetaEvent, type SimMilestone } from "@/lib/betaAnalytics";

export type SimEmit = (event: BetaEvent) => unknown;
type CameraMode = "TRACK" | "BROADCAST" | "AUTO";
type Variant = "STANDARD" | "ALT_A" | "ALT_B";

export function createSimulatorTracker(emit: SimEmit) {
  let active = false;
  let playbacks = 0;
  let previous = 0;
  const fired = new Set<string>();

  const begin = (progress: number) => {
    if (playbacks > 0) emit({ name: "beta_sim_replay", properties: {} });
    emit({ name: "beta_sim_playback_start", properties: {} });
    playbacks += 1;
    active = true;
    fired.clear();
    previous = progress;
  };

  return {
    /** Playing started or resumed. A resume inside a running playback reports nothing. */
    onPlay(progress: number) {
      if (active) return;
      begin(progress);
    },
    /** The viewer moved the scrubber / phase rail: not playback, so the position is taken over silently. */
    onSeek(progress: number) {
      previous = progress;
    },
    /** Back to the start without playing: the running playback ends; the next play is a replay. */
    onRestart() {
      active = false;
      fired.clear();
      previous = 0;
    },
    /** A different race or pace: a different scenario, so nothing carries over (and the next play is not a replay). */
    onScenarioChange() {
      active = false;
      playbacks = 0;
      fired.clear();
      previous = 0;
    },
    /** Every (throttled) progress value. Reports the milestones, the last runner's crossing and the end state, once each. */
    onProgress(progress: number, lastCrossProgress: number | null) {
      if (!active) { previous = progress; return; }
      for (const milestone of SIM_MILESTONES) {
        const at = Number(milestone) / 100;
        const key = `m${milestone}`;
        if (previous < at && progress >= at && !fired.has(key)) { fired.add(key); emit({ name: "beta_sim_progress", properties: { milestone: milestone as SimMilestone } }); }
      }
      if (lastCrossProgress !== null && previous < lastCrossProgress && progress >= lastCrossProgress && !fired.has("crossed")) {
        fired.add("crossed");
        emit({ name: "beta_sim_last_runner_crossed", properties: {} });
      }
      previous = progress;
      if (progress >= 1 && !fired.has("complete")) {
        fired.add("complete");
        emit({ name: "beta_sim_complete", properties: {} });
        active = false;
      }
    },
    onCameraChange(mode: CameraMode) {
      emit({ name: "beta_sim_camera_change", properties: { mode } });
    },
    onOfficialResultView(source: "auto" | "tab") {
      emit({ name: "beta_sim_official_result_view", properties: { source } });
    },
    /** A different variant is a different scenario. */
    onVariantChange(variant: Variant) {
      emit({ name: "beta_sim_variant_change", properties: { variant } });
      this.onScenarioChange();
    },
  };
}
export type SimulatorTracker = ReturnType<typeof createSimulatorTracker>;
