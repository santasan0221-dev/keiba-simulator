import { describe, expect, it } from "vitest";
import type { LabRace } from "./singlePickAi";
import { shouldApplySyncedRace, syncedRaceNotice } from "./singlePickSyncUpdate";

const pending = {
  race: { race_key: "NAR|2026-08-15|帯広ば|01" },
  model: { as_of: "2026-08-15T08:00:00+09:00" },
  result: null,
} as unknown as LabRace;

const confirmed = {
  ...pending,
  model: { as_of: "2026-08-15T09:10:00+09:00" },
  result: { status: "CONFIRMED", official_order: [], ai_pick: null, payouts: null },
} as unknown as LabRace;

describe("singlePickSyncUpdate", () => {
  it("同一race_keyのCONFIRMED結果・払戻更新をTRUTH PANEL反映対象にする", () => {
    expect(shouldApplySyncedRace(pending, confirmed)).toBe(true);
    expect(syncedRaceNotice(confirmed)).toBe("公式結果・払戻の同期を反映しました。");
  });

  it("同一内容または別レースの更新は現在のTRUTH PANELを置換しない", () => {
    expect(shouldApplySyncedRace(pending, pending)).toBe(false);
    expect(shouldApplySyncedRace(pending, { ...confirmed, race: { race_key: "NAR|2026-08-15|帯広ば|02" } } as LabRace)).toBe(false);
  });
});
