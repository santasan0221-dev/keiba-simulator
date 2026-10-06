import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeEvent, trackBetaEvent, type BetaEvent } from "./betaAnalytics";
import { createSimulatorTracker } from "./simulatorAnalytics";

const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const names = (events: BetaEvent[]) => events.map(e => (e.name === "beta_sim_progress" ? `progress:${e.properties.milestone}` : e.name.replace("beta_sim_", "")));
const harness = () => { const events: BetaEvent[] = []; return { events, tracker: createSimulatorTracker(event => { events.push(event); }) }; };

const CROSS = 0.955; // the last runner crosses the goal line here (a real scenario: about 0.93 - 0.99)
/** One uninterrupted playback from `from` to the end, ticking like the throttled progress state does (~8 Hz). */
const playThrough = (tracker: ReturnType<typeof createSimulatorTracker>, from = 0, step = 0.004) => {
  for (let p = from + step; p < 1; p += step) tracker.onProgress(p, CROSS);
  tracker.onProgress(1, CROSS);
};

const FULL = ["playback_start", "progress:25", "progress:50", "progress:75", "last_runner_crossed", "complete"];

describe("one playback reports its events once, in order", () => {
  it("start -> 25 -> 50 -> 75 -> last runner crossed -> complete, exactly once each", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    playThrough(tracker);
    expect(names(events)).toEqual(FULL);
  });

  it("the last runner's crossing is reported before the scenario complete, and the end state only once", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    playThrough(tracker);
    tracker.onProgress(1, CROSS); tracker.onProgress(1, CROSS); // repeated renders at the end
    expect(names(events).filter(n => n === "complete")).toHaveLength(1);
    expect(names(events).indexOf("last_runner_crossed")).toBeLessThan(names(events).indexOf("complete"));
  });

  it("is not fooled by repeated progress values (React re-renders, StrictMode double effects)", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    for (const p of [0.1, 0.1, 0.26, 0.26, 0.26, 0.5, 0.5, 0.76, 0.76, 0.96, 0.96, 1, 1]) tracker.onProgress(p, CROSS);
    expect(names(events)).toEqual(FULL);
    const { events: e2, tracker: t2 } = harness();
    t2.onPlay(0); t2.onPlay(0); // a duplicated "playing" effect
    expect(names(e2)).toEqual(["playback_start"]);
  });

  it("coarse steps (a slow frame, reduced-motion keyframes 0.2 / 0.425 / 0.65 / 0.85 / 1) still report each milestone once, in order", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    for (const p of [0.2, 0.425, 0.65, 0.85, 1]) tracker.onProgress(p, CROSS);
    expect(names(events)).toEqual(FULL);
  });

  it("a single huge jump reports every milestone passed, each once, then the end", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    tracker.onProgress(1, CROSS);
    expect(names(events)).toEqual(FULL);
  });
});

describe("pause, resume, scrub", () => {
  it("pausing and resuming stays in the same playback: no new start, no repeated milestone", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    for (let p = 0.004; p < 0.4; p += 0.004) tracker.onProgress(p, CROSS);
    tracker.onPlay(0.4); // resume
    for (let p = 0.404; p < 1; p += 0.004) tracker.onProgress(p, CROSS);
    tracker.onProgress(1, CROSS);
    expect(names(events)).toEqual(FULL);
  });

  it("moving the scrubber is not playback: a jump over milestones reports none of them", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    tracker.onProgress(0.1, CROSS);
    tracker.onSeek(0.8); tracker.onProgress(0.8, CROSS); // dragged from 10% to 80%
    tracker.onProgress(0.81, CROSS);
    expect(names(events)).toEqual(["playback_start"]);
    tracker.onProgress(1, CROSS);
    expect(names(events)).toEqual(["playback_start", "last_runner_crossed", "complete"]);
  });

  it("scrubbing back and playing across a milestone again does not report it a second time", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    for (let p = 0.004; p < 0.3; p += 0.004) tracker.onProgress(p, CROSS);
    tracker.onSeek(0.1); tracker.onProgress(0.1, CROSS);
    for (let p = 0.104; p < 0.3; p += 0.004) tracker.onProgress(p, CROSS);
    expect(names(events).filter(n => n === "progress:25")).toHaveLength(1);
  });

  it("playing for the first time from the middle (after a scrub) reports only what playback actually crosses", () => {
    const { events, tracker } = harness();
    tracker.onSeek(0.6); tracker.onProgress(0.6, CROSS);
    tracker.onPlay(0.6);
    for (let p = 0.604; p < 1; p += 0.004) tracker.onProgress(p, CROSS);
    tracker.onProgress(1, CROSS);
    expect(names(events)).toEqual(["playback_start", "progress:75", "last_runner_crossed", "complete"]);
  });
});

describe("replay is a new playback", () => {
  it("replay after the end: replay + start, then the whole sequence again", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0); playThrough(tracker);
    tracker.onRestart(); tracker.onSeek(0); tracker.onProgress(0, CROSS); tracker.onPlay(0); playThrough(tracker);
    expect(names(events)).toEqual([...FULL, "replay", ...FULL]);
  });

  it("restarting from the middle ends that playback and the next play is a replay with fresh milestones", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0);
    for (let p = 0.004; p < 0.6; p += 0.004) tracker.onProgress(p, CROSS);
    tracker.onRestart(); tracker.onProgress(0, CROSS);
    tracker.onPlay(0); playThrough(tracker);
    expect(names(events).filter(n => n === "progress:25")).toHaveLength(2);
    expect(names(events).filter(n => n === "replay")).toHaveLength(1);
    expect(names(events).filter(n => n === "complete")).toHaveLength(1);
  });

  it("three replays give three replay events, and every playback still has each event exactly once", () => {
    const { events, tracker } = harness();
    for (let i = 0; i < 4; i++) { if (i) { tracker.onRestart(); tracker.onProgress(0, CROSS); } tracker.onPlay(0); playThrough(tracker); }
    const n = names(events);
    expect(n.filter(x => x === "replay")).toHaveLength(3);
    for (const key of ["playback_start", "progress:25", "progress:50", "progress:75", "last_runner_crossed", "complete"]) expect(n.filter(x => x === key)).toHaveLength(4);
  });

  it("a different race / pace is a different scenario: the next play is not a replay", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0); playThrough(tracker);
    tracker.onScenarioChange(); tracker.onProgress(0, CROSS);
    tracker.onPlay(0); playThrough(tracker);
    expect(names(events)).toEqual([...FULL, ...FULL]);
  });
});

describe("camera, result view, variant", () => {
  it("reports the camera mode as a fixed enumeration", () => {
    const { events, tracker } = harness();
    tracker.onCameraChange("BROADCAST"); tracker.onCameraChange("TRACK");
    expect(events.map(e => e.properties)).toEqual([{ mode: "BROADCAST" }, { mode: "TRACK" }]);
  });

  it("reports the official-result view with how it was reached", () => {
    const { events, tracker } = harness();
    tracker.onOfficialResultView("auto"); tracker.onOfficialResultView("tab");
    expect(events.map(e => e.properties)).toEqual([{ source: "auto" }, { source: "tab" }]);
  });

  it("a variant change reports the variant and starts a new scenario (the next play is not a replay)", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0); playThrough(tracker);
    tracker.onVariantChange("ALT_A");
    tracker.onPlay(0); playThrough(tracker);
    expect(names(events)).toEqual([...FULL, "variant_change", ...FULL]);
    expect(events.find(e => e.name === "beta_sim_variant_change")!.properties).toEqual({ variant: "ALT_A" });
  });
});

describe("the events go through the existing anonymous contract", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("every simulator event survives sanitizeEvent unchanged, and nothing outside the fixed lists does", () => {
    const { events, tracker } = harness();
    tracker.onPlay(0); playThrough(tracker); tracker.onCameraChange("AUTO"); tracker.onOfficialResultView("auto"); tracker.onVariantChange("ALT_B");
    for (const event of events) expect(sanitizeEvent(event)).toEqual(event);
    expect(sanitizeEvent({ name: "beta_sim_progress", properties: { milestone: "30" } })).toBeNull();
    expect(sanitizeEvent({ name: "beta_sim_camera_change", properties: { mode: "FOLLOW" } })).toBeNull();
    expect(sanitizeEvent({ name: "beta_sim_official_result_view", properties: { source: "url" } })).toBeNull();
    expect(sanitizeEvent({ name: "beta_sim_variant_change", properties: { variant: "JRA|2026-10-04|東京|05" } })).toBeNull();
  });

  it("identifiers, race keys, horse names and numbers, free text and URLs cannot ride along", () => {
    const pii = { race_key: "JRA|2026-10-04|東京|05", horse_name: "x", horse_no: "7", email: "a@b.c", url: "https://x.test/?a=1", text: "free", session_id: "s", visitor_id: "v" };
    for (const [name, base] of [["beta_sim_playback_start", {}], ["beta_sim_progress", { milestone: "50" }], ["beta_sim_last_runner_crossed", {}], ["beta_sim_complete", {}], ["beta_sim_replay", {}], ["beta_sim_official_result_view", { source: "tab" }], ["beta_sim_camera_change", { mode: "TRACK" }], ["beta_sim_variant_change", { variant: "STANDARD" }]] as const) {
      const sanitized = sanitizeEvent({ name, properties: { ...base, ...pii } });
      expect(sanitized, name).not.toBeNull();
      expect(sanitized!.properties, name).toEqual(base);
    }
  });

  it("a full session through trackBetaEvent reaches the analytics stub as the expected sequence with no duplicates", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { umami: { track } });
    const tracker = createSimulatorTracker(trackBetaEvent);
    tracker.onPlay(0); playThrough(tracker);
    tracker.onCameraChange("BROADCAST"); tracker.onCameraChange("TRACK");
    tracker.onOfficialResultView("auto");
    tracker.onRestart(); tracker.onProgress(0, CROSS); tracker.onPlay(0); playThrough(tracker);
    const sent = track.mock.calls.map(([name, props]) => (props && "milestone" in props ? `${name}:${props.milestone}` : name));
    expect(sent).toEqual([
      "beta_sim_playback_start", "beta_sim_progress:25", "beta_sim_progress:50", "beta_sim_progress:75", "beta_sim_last_runner_crossed", "beta_sim_complete",
      "beta_sim_camera_change", "beta_sim_camera_change", "beta_sim_official_result_view",
      "beta_sim_replay", "beta_sim_playback_start", "beta_sim_progress:25", "beta_sim_progress:50", "beta_sim_progress:75", "beta_sim_last_runner_crossed", "beta_sim_complete",
    ]);
    for (const [, props] of track.mock.calls) expect(Object.keys(props ?? {}).every(k => ["milestone", "mode", "source", "variant"].includes(k))).toBe(true);
  });

  it("with analytics disabled (no tracker loaded) nothing throws, whatever happens", () => {
    vi.stubGlobal("window", {});
    const tracker = createSimulatorTracker(trackBetaEvent);
    expect(() => { tracker.onPlay(0); playThrough(tracker); tracker.onCameraChange("AUTO"); tracker.onOfficialResultView("tab"); tracker.onRestart(); tracker.onPlay(0); }).not.toThrow();
  });

  it("the tracker module takes no identifying input and builds no new analytics infrastructure", () => {
    const code = strip("simulatorAnalytics.ts");
    for (const forbidden of ["race_key", "raceKey", "horse", "runnerName", "localStorage", "sessionStorage", "document.cookie", "fetch(", "XMLHttpRequest", "sendBeacon", "Math.random", "Date.now", "navigator", "location"]) {
      expect(code, `simulatorAnalytics must not use ${forbidden}`).not.toContain(forbidden);
    }
    expect((code.match(/from "[^"]+"/g) ?? []).sort()).toEqual(['from "@/lib/betaAnalytics"']);
  });
});
