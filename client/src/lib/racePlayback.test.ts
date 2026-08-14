import { describe, expect, it } from "vitest";
import { deriveFinishMargins, formatFinishMargin, generateRaceFrames } from "./racePlayback";

const horses = [
  { no: 1, name: "逃げ馬", style: "逃げ" as const, speed: 84, stamina: 78, start: 94, form: 80, averageScore: 82 },
  { no: 2, name: "差し馬", style: "差し" as const, speed: 91, stamina: 88, start: 76, form: 90, averageScore: 91 },
  { no: 3, name: "追込馬", style: "追込" as const, speed: 89, stamina: 93, start: 70, form: 87, averageScore: 88 },
];

describe("generateRaceFrames", () => {
  it("同一シードで再現可能な位置・順位フレームを生成する", () => {
    expect(generateRaceFrames(horses, 42)).toEqual(generateRaceFrames(horses, 42));
  });

  it("進捗と各馬のコース位置を0から100まで生成する", () => {
    const frames = generateRaceFrames(horses, 42);
    expect(frames).toHaveLength(26);
    expect(frames[0].progress).toBe(0);
    expect(frames.at(-1)?.progress).toBe(100);
    expect(frames.at(-1)?.positions[1]).toBeGreaterThan(.8);
    expect(frames.at(-1)?.ranks).toHaveLength(3);
  });
});

describe("finish margins", () => {
  it("接戦を日本の競馬で用いる着差表記へ変換する", () => {
    expect(formatFinishMargin(0, true)).toBe("—");
    expect(formatFinishMargin(.04)).toBe("ハナ");
    expect(formatFinishMargin(.12)).toBe("アタマ");
    expect(formatFinishMargin(.25)).toBe("クビ");
    expect(formatFinishMargin(.5)).toBe("½馬身");
    expect(formatFinishMargin(1.3)).toBe("1.5馬身");
  });

  it("最終フレームの位置から順位順の着差を導出する", () => {
    const margins = deriveFinishMargins({ progress: 100, segment: "ゴール前", ranks: [1, 2, 3], positions: { 1: 1, 2: .998, 3: .99 } });
    expect(margins.map((item) => item.label)).toEqual(["—", "アタマ", "1馬身"]);
    expect(margins[1]?.lengths).toBeLessThan(margins[2]?.lengths ?? 0);
  });
});
