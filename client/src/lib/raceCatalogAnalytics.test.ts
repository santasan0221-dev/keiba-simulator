import { describe, expect, it } from "vitest";
import { aggregateCourseTrends, parseCourseTrendCsv, parseOddsCsv, parsePreviousRunsCsv } from "./raceCatalogAnalytics";

describe("race catalog analytics", () => {
  it("maps a previous-day odds CSV to registered horses and rejects invalid rows", () => {
    const parsed = parseOddsCsv("馬名,単勝オッズ,人気\nアルファ,3.2,1\n不明馬,5.0,2\nブラボー,0,3", ["アルファ", "ブラボー"]);
    expect(parsed.rows).toEqual([{ horseName: "アルファ", odds: 3.2, popularity: 1 }]);
    expect(parsed.errors).toHaveLength(2);
  });

  it("parses previous runs with Japanese column headers", () => {
    const parsed = parsePreviousRunsCsv("馬名,前走レース,日付,競馬場,コース種別,距離,馬場,着順,頭数,脚質,着差,間隔日数\nアルファ,春カップ,2026-07-01,中京,芝,1600,良,2,16,差し,0.2,42");
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows[0]).toMatchObject({ horseName: "アルファ", finish: 2, fieldSize: 16, style: "差し", daysAgo: 42 });
  });

  it("aggregates course trends by venue, surface, distance and running style", () => {
    const parsed = parseCourseTrendCsv("競馬場,コース種別,距離,ペース,脚質,着順\n中京,芝,1600,平均,差し,1\n中京,芝,1600,平均,先行,2\n中京,芝,1600,ハイ,差し,3");
    const trend = aggregateCourseTrends(parsed.rows)[0];
    expect(trend).toMatchObject({ label: "中京・芝1,600m", samples: 3, paceCounts: { 平均: 2, ハイ: 1 } });
    expect(trend.byStyle.find((row) => row.style === "差し")).toMatchObject({ samples: 2, wins: 1, top3: 2, winRate: 50, top3Rate: 100 });
  });
});
