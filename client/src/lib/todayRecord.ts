// "今日の記録" (Today's Record): one pure function that turns the day's race
// list + result list into the counts shown on Home.
//
// Counting rules (decision D6):
//  - ◎ scratched / excluded (CANCELLED / EXCLUDED) = did not start. Left OUT of
//    the rate base; the count is shown separately.
//  - ◎ did not finish (DID_NOT_FINISH) = ran. IN the rate base; counted as
//    neither 1st nor top-3.
//  - Race stopped (RACE_STOPPED, 取止) = no race. Left OUT of the base; the
//    count is shown separately.
//  - Dead heat = the official finishing order as published.
//  - Undecided races (PENDING / REVIEW_REQUIRED / FAILED / unrecognised) are NEVER
//    removed from the base. While any remain, no rate is produced.
//  - Any other special status on the ◎ (e.g. a disqualification) is, until a rule
//    is decided, kept IN the base and not counted as a hit -- the choice that can
//    never inflate the record.
//
// Identities, asserted by `consistent` (and unit-tested):
//   total = confirmed + pending + review + failed + raceStopped
//   base  = total - raceStopped - nonStarter
//   base  = top3 + outside + dnf + otherSpecial + dataGap + undetermined

import type { LabRaceListItem, LabResultListItem } from "@/lib/singlePickAi";
import { listPicks } from "@/lib/raceView";

export type TodayRecord = {
  /** Races with a published ◎ (the denominator before D6 exclusions). */
  total: number;
  /** Races without a published ◎ -- shown separately, not part of `total`. */
  unpublished: number;
  confirmed: number;
  deadHeat: number;
  pending: number;
  /** REVIEW_REQUIRED plus any status this code does not recognise. */
  review: number;
  failed: number;
  raceStopped: number;
  nonStarter: number;
  /** Rate base B. */
  base: number;
  win: number;
  /** 3rd or better (includes `win`). */
  top3: number;
  outside: number;
  dnf: number;
  otherSpecial: number;
  /** Confirmed, ◎ in the base, but its finish is not available. */
  dataGap: number;
  /** pending + review + failed inside the base. */
  undetermined: number;
  rateReady: boolean;
  consistent: boolean;
};

const NON_STARTER = new Set(["CANCELLED", "EXCLUDED"]);
const CONFIRMED = new Set(["CONFIRMED", "DEAD_HEAT"]);

export function emptyTodayRecord(): TodayRecord {
  return {
    total: 0, unpublished: 0, confirmed: 0, deadHeat: 0, pending: 0, review: 0, failed: 0,
    raceStopped: 0, nonStarter: 0, base: 0, win: 0, top3: 0, outside: 0, dnf: 0, otherSpecial: 0,
    dataGap: 0, undetermined: 0, rateReady: false, consistent: true,
  };
}

export function todayRecord(races: LabRaceListItem[], results: LabResultListItem[]): TodayRecord {
  const record = emptyTodayRecord();
  const byKey = new Map(results.map(row => [row.race_key, row]));

  for (const race of races) {
    const honmei = listPicks(race).honmei;
    if (!honmei.available || honmei.horseNo === null) {
      record.unpublished += 1;
      continue;
    }
    record.total += 1;
    const row = byKey.get(race.race_key);
    const status = String(row?.result_status ?? "PENDING").toUpperCase();

    if (status === "RACE_STOPPED") {
      record.raceStopped += 1;
      continue;
    }
    if (CONFIRMED.has(status) && row) {
      record.confirmed += 1;
      if (status === "DEAD_HEAT") record.deadHeat += 1;
      const mine = (row.special_statuses ?? []).find(entry => entry.horse_no === honmei.horseNo)?.status?.toUpperCase();
      if (mine && NON_STARTER.has(mine)) {
        record.nonStarter += 1;
        continue;
      }
      record.base += 1;
      if (mine === "DID_NOT_FINISH") record.dnf += 1;
      else if (mine) record.otherSpecial += 1;
      else if (typeof row.ai_pick_finish === "number" && Number.isFinite(row.ai_pick_finish)) {
        if (row.ai_pick_finish === 1) { record.win += 1; record.top3 += 1; }
        else if (row.ai_pick_finish <= 3) record.top3 += 1;
        else record.outside += 1;
      } else record.dataGap += 1;
      continue;
    }

    // Undecided: stays in the base.
    record.base += 1;
    record.undetermined += 1;
    if (status === "PENDING") record.pending += 1;
    else if (status === "FAILED") record.failed += 1;
    else record.review += 1; // REVIEW_REQUIRED and anything unrecognised: needs a human look
  }

  record.rateReady = record.base > 0 && record.undetermined === 0;
  record.consistent =
    record.total === record.confirmed + record.pending + record.review + record.failed + record.raceStopped &&
    record.base === record.total - record.raceStopped - record.nonStarter &&
    record.base === record.top3 + record.outside + record.dnf + record.otherSpecial + record.dataGap + record.undetermined;
  return record;
}
