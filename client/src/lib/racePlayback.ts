export type ReplayStyle = "逃げ" | "先行" | "差し" | "追込";

export type ReplayHorse = {
  no: number;
  name: string;
  style: ReplayStyle;
  speed: number;
  stamina: number;
  start: number;
  form: number;
  averageScore?: number;
};

export type RaceFrame = {
  progress: number;
  ranks: number[];
  positions: Record<number, number>;
  segment: string;
};

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const styleBias = (style: ReplayStyle, phase: number) => {
  if (style === "逃げ") return phase < .32 ? .13 : phase < .74 ? .025 : -.065;
  if (style === "先行") return phase < .54 ? .075 : .015;
  if (style === "差し") return phase < .42 ? -.035 : phase < .74 ? .065 : .105;
  return phase < .58 ? -.075 : .13;
};

const segmentFor = (progress: number) => progress < 25 ? "スタート直後" : progress < 50 ? "第1コーナー" : progress < 75 ? "向正面" : progress < 92 ? "最終コーナー" : "ゴール前";

export function generateRaceFrames(horses: ReplayHorse[], seed: number, frameCount = 26): RaceFrame[] {
  const active = horses.slice().sort((a, b) => a.no - b.no);
  if (!active.length) return [];
  const cumulative = Object.fromEntries(active.map((horse) => [horse.no, 0])) as Record<number, number>;
  const frames: RaceFrame[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    const phase = index / Math.max(1, frameCount - 1);
    const scores = active.map((horse) => {
      const inherent = horse.averageScore !== undefined
        ? clamp((horse.averageScore - 45) / 65, .15, 1)
        : clamp((horse.speed * .3 + horse.stamina * .25 + horse.start * .2 + horse.form * .25) / 100, .15, 1);
      const noise = (Math.sin(seed * 17.17 + horse.no * 41.3 + index * 11.7) + 1) * .012;
      const pacePulse = Math.sin((phase * Math.PI * 2) + horse.no * .7) * .014;
      const step = Math.max(.03, .68 + inherent * .29 + styleBias(horse.style, phase) + noise + pacePulse);
      cumulative[horse.no] += step;
      return { horse, value: cumulative[horse.no] };
    });
    const mean = scores.reduce((sum, item) => sum + item.value, 0) / scores.length;
    const positions = Object.fromEntries(scores.map(({ horse, value }) => [horse.no, clamp(phase * .955 + (value - mean) * .038, 0, 1)])) as Record<number, number>;
    const ranks = scores.slice().sort((a, b) => b.value - a.value).map((item) => item.horse.no);
    const progress = Math.round(phase * 100);
    frames.push({ progress, ranks, positions, segment: segmentFor(progress) });
  }
  return frames;
}
