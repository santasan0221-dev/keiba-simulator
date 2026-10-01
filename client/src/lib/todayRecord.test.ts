import { describe, expect, it } from "vitest";
import type { LabRaceListItem, LabResultListItem } from "@/lib/singlePickAi";
import { todayRecord } from "./todayRecord";

const race = (no: number, honmeiNo: number | null = no): LabRaceListItem => ({
  race_key: `JRA|2026-10-03|東京|${no}`, organization: "JRA", venue: "東京", race_no: no, scheduled_start_at: null, status: "PREDICTED", distance: 1600, surface: "芝",
  top_pick: null,
  honmei: honmeiNo === null ? { status: "UNAVAILABLE", reason: "NO_PUBLICATION_HONMEI", mark: null, horse_no: null, horse_name: null, win_probability: null }
    : { status: "AVAILABLE", mark: "◎", horse_no: honmeiNo, horse_name: `馬${honmeiNo}`, win_probability: 0.2 },
});

const result = (no: number, over: Partial<LabResultListItem> = {}): LabResultListItem => ({
  race_key: `JRA|2026-10-03|東京|${no}`, race_date: "2026-10-03", organization: "JRA", venue: "東京", race_no: no, scheduled_start_at: null,
  prediction_id: null, prediction_created_at: null, predicted_top3: [], official_top3: [], ai_pick_finish: null, top3_coverage: null,
  result_status: "CONFIRMED", special_statuses: [], result_fetched_at: null, ...over,
});

describe("todayRecord (D6 counting rules)", () => {
  it("counts wins / top-3 / outside and offers a rate only when nothing is undecided", () => {
    const rec = todayRecord([race(1), race(2), race(3), race(4)], [
      result(1, { ai_pick_finish: 1 }), result(2, { ai_pick_finish: 3 }), result(3, { ai_pick_finish: 5 }), result(4, { ai_pick_finish: 2 }),
    ]);
    expect(rec).toMatchObject({ total: 4, confirmed: 4, base: 4, win: 1, top3: 3, outside: 1, undetermined: 0, rateReady: true, consistent: true });
  });

  it("never offers a rate while pending / review / failed races remain, and keeps them in the base", () => {
    const rec = todayRecord([race(1), race(2), race(3), race(4)], [
      result(1, { ai_pick_finish: 1 }),
      result(2, { result_status: "PENDING" }),
      result(3, { result_status: "REVIEW_REQUIRED" }),
      // race 4 has no result row at all -> pending
    ]);
    expect(rec).toMatchObject({ total: 4, confirmed: 1, pending: 2, review: 1, base: 4, undetermined: 3, rateReady: false, consistent: true });
  });

  it("treats a result-less race as pending, not as excluded", () => {
    const rec = todayRecord([race(1)], []);
    expect(rec).toMatchObject({ total: 1, pending: 1, base: 1, undetermined: 1, rateReady: false });
  });

  it("scratched / excluded ◎ is a non-starter: out of the base, counted separately", () => {
    for (const status of ["CANCELLED", "EXCLUDED"]) {
      const rec = todayRecord([race(1, 7)], [result(1, { special_statuses: [{ horse_no: 7, status }] })]);
      expect(rec).toMatchObject({ total: 1, confirmed: 1, nonStarter: 1, base: 0, win: 0, top3: 0, rateReady: false, consistent: true });
    }
  });

  it("did-not-finish ◎ ran: stays in the base and is not a win or top-3", () => {
    const rec = todayRecord([race(1, 7), race(2)], [
      result(1, { special_statuses: [{ horse_no: 7, status: "DID_NOT_FINISH" }] }),
      result(2, { ai_pick_finish: 1 }),
    ]);
    expect(rec).toMatchObject({ base: 2, dnf: 1, win: 1, top3: 1, outside: 0, rateReady: true, consistent: true });
  });

  it("a stopped race (取止) is out of the base and counted separately", () => {
    const rec = todayRecord([race(1), race(2)], [result(1, { result_status: "RACE_STOPPED" }), result(2, { ai_pick_finish: 4 })]);
    expect(rec).toMatchObject({ total: 2, raceStopped: 1, base: 1, outside: 1, consistent: true });
  });

  it("a special status on a different horse does not exclude the ◎", () => {
    const rec = todayRecord([race(1, 7)], [result(1, { ai_pick_finish: 2, special_statuses: [{ horse_no: 3, status: "CANCELLED" }] })]);
    expect(rec).toMatchObject({ nonStarter: 0, base: 1, top3: 1, win: 0 });
  });

  it("dead heat uses the published finish; unknown statuses need review; other special statuses never count as hits", () => {
    const rec = todayRecord([race(1), race(2), race(3), race(4)], [
      result(1, { result_status: "DEAD_HEAT", ai_pick_finish: 1 }),
      result(2, { result_status: "SOMETHING_NEW" }),
      result(3, { special_statuses: [{ horse_no: 3, status: "DISQUALIFIED" }] }),
      result(4, { ai_pick_finish: null }),
    ]);
    expect(rec).toMatchObject({ deadHeat: 1, win: 1, review: 1, otherSpecial: 1, dataGap: 1, base: 4, rateReady: false, consistent: true });
  });

  it("keeps races without a published ◎ out of the total and reports them separately", () => {
    const rec = todayRecord([race(1), race(2, null)], [result(1, { ai_pick_finish: 1 })]);
    expect(rec).toMatchObject({ total: 1, unpublished: 1, base: 1, win: 1 });
  });

  it("holds its identities on a mixed day", () => {
    const races = Array.from({ length: 12 }, (_, i) => race(i + 1, i + 1));
    const rec = todayRecord(races, [
      result(1, { ai_pick_finish: 1 }), result(2, { ai_pick_finish: 2 }), result(3, { ai_pick_finish: 9 }),
      result(4, { special_statuses: [{ horse_no: 4, status: "CANCELLED" }] }),
      result(5, { special_statuses: [{ horse_no: 5, status: "DID_NOT_FINISH" }] }),
      result(6, { result_status: "RACE_STOPPED" }),
      result(7, { result_status: "PENDING" }), result(8, { result_status: "REVIEW_REQUIRED" }), result(9, { result_status: "FAILED" }),
    ]);
    expect(rec.consistent).toBe(true);
    expect(rec.total).toBe(rec.confirmed + rec.pending + rec.review + rec.failed + rec.raceStopped);
    expect(rec.base).toBe(rec.total - rec.raceStopped - rec.nonStarter);
    expect(rec.rateReady).toBe(false);
  });
});

import { honmeiResultLabel } from "./raceView";

describe("honmeiResultLabel (LATEST RESULTS)", () => {
  const row = (over: Partial<LabResultListItem>) => result(1, { predicted_top3: [{ mark: "◎", horse_no: 7, horse_name: "馬7" }], ...over });
  it("shows the finish when there is one", () => {
    expect(honmeiResultLabel(row({ ai_pick_finish: 4 }))).toEqual({ text: "4着", kind: "finish" });
  });
  it("names scratched / excluded / did-not-finish instead of a blanket 取得不能", () => {
    expect(honmeiResultLabel(row({ special_statuses: [{ horse_no: 7, status: "CANCELLED" }] })).text).toBe("取消");
    expect(honmeiResultLabel(row({ special_statuses: [{ horse_no: 7, status: "EXCLUDED" }] })).text).toBe("除外");
    expect(honmeiResultLabel(row({ special_statuses: [{ horse_no: 7, status: "DID_NOT_FINISH" }] })).text).toBe("競走中止");
  });
  it("keeps 取得不能 only for a missing finish with no recorded status, and ignores other horses' statuses", () => {
    expect(honmeiResultLabel(row({}))).toEqual({ text: "取得不能", kind: "missing" });
    expect(honmeiResultLabel(row({ special_statuses: [{ horse_no: 3, status: "CANCELLED" }] })).kind).toBe("missing");
  });
});
