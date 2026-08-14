import { describe, expect, it } from "vitest";
import { buildOfficialRaceHorses, getOfficialRaceStorage, resolveOfficialRaceCondition, weekendOfficialRaces } from "./officialRaceData";

describe("official weekend race data", () => {
  it("includes the Chukyo Kinen and NST Sho with verified course settings", () => {
    const chukyo = weekendOfficialRaces.find((race) => race.id === "chukyo-kinen-2026");
    const nst = weekendOfficialRaces.find((race) => race.id === "nst-sho-2026");
    expect(chukyo).toMatchObject({ venue: "中京", raceNumber: "7R", surface: "芝", distance: 1600, pace: "平均" });
    expect(nst).toMatchObject({ venue: "新潟", raceNumber: "7R", surface: "ダート", distance: 1200, pace: "ハイ" });
    expect(chukyo?.horses).toHaveLength(16);
    expect(nst?.horses).toHaveLength(15);
  });

  it("converts reference data into unique numbered simulation horses", () => {
    const nst = weekendOfficialRaces.find((race) => race.id === "nst-sho-2026");
    if (!nst) throw new Error("NST賞のレースカードがありません");
    const horses = buildOfficialRaceHorses(nst);
    expect(new Set(horses.map((horse) => horse.no)).size).toBe(15);
    expect(horses[0]).toMatchObject({ name: "アッチャゴーラ", jockey: "小崎" });
    expect(horses.every((horse) => horse.speed >= 0 && horse.speed <= 100)).toBe(true);
  });

  it("stores the race condition bundle together with independently restored fields", () => {
    const chukyo = weekendOfficialRaces.find((race) => race.id === "chukyo-kinen-2026");
    if (!chukyo) throw new Error("中京記念のレースカードがありません");
    const storage = getOfficialRaceStorage(chukyo);
    expect(JSON.parse(storage["keiba-lab-distance"])).toBe(1600);
    expect(JSON.parse(storage["keiba-lab-official-race-condition"])).toMatchObject({ venue: "中京", surface: "芝", pace: "平均" });
  });

  it("resolves official display values from the saved race condition before applying fallbacks", () => {
    const nst = weekendOfficialRaces.find((race) => race.id === "nst-sho-2026");
    if (!nst) throw new Error("NST賞のレースカードがありません");
    const resolved = resolveOfficialRaceCondition(nst.label, { venue: "東京", raceNumber: "11R", surface: "芝", distance: 1200, weather: "晴", going: "良", pace: "ハイ", courseNote: "" });
    expect(resolved).toMatchObject({ venue: "新潟", raceNumber: "7R", surface: "ダート", distance: 1200 });
  });

  it("also keeps the pre-existing Sapporo Kinen aligned with the official condition resolver", () => {
    const resolved = resolveOfficialRaceCondition("第62回 札幌記念", { venue: "東京", raceNumber: "11R", surface: "芝", distance: 1600, weather: "晴", going: "良", pace: "平均", courseNote: "" });
    expect(resolved).toMatchObject({ venue: "札幌", raceNumber: "11R", surface: "芝", distance: 2000 });
  });
});
