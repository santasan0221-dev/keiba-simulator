"""Generate lab-api-v2 race-detail fixtures with single_pick_ai's own production code.

The frontend integration test (client/src/lib/labRaceIntegration.test.ts) must not
rely on hand-written mock JSON: this script calls single_pick_ai's real
prediction-snapshot pipeline (compute_v23k_horse_diagnostics ->
create_run_snapshots) and the real public API builder (build_lab_race_payload),
so the fixtures carry exactly the shape and values production serves.

Run from a single_pick_ai checkout:
    python <this file> <output_dir>
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from types import SimpleNamespace

from scripts.keiba_lab_api import build_lab_race_payload
from scripts.predict_jra import compute_v23k_horse_diagnostics
from scripts.prediction_persistence import create_run_snapshots
from scripts.probability_semantics import PROBABILITY_SCHEMA_VERSION  # noqa: F401  (import proves v2 module exists)

RACE_DATE = "2026-09-20"
NOW = dt.datetime(2026, 9, 20, 1, 0, tzinfo=dt.timezone.utc)
START = dt.datetime(2026, 9, 20, 6, 0, tzinfo=dt.timezone.utc)

# (horse_no, name, calibrated P(top3), race-normalized top3 score, P(win), win odds or None)
FIELD = [
    (1, "サンダーリーフ", 0.62, 0.21, 0.241, 6.8),
    (2, "ミラクルボルト", 0.48, 0.16, 0.112, 2.1),
    (3, "アオイノキセキ", 0.41, 0.13, 0.098, 9.4),
    (4, "ゴールドフェザー", 0.33, 0.11, 0.071, 24.5),
    (5, "シルバーストリーム", 0.30, 0.09, 0.060, 3.9),
    (6, "ベルウッドプリンセス", 0.24, 0.08, 0.052, None),  # odds not captured
    (7, "ハヤブサノツバサ", 0.20, 0.07, None, 12.0),      # win model gap -> no p_win
    (8, "エンドレスサマーナイト", 0.15, 0.05, 0.031, 45.2),
]


def _semantics() -> dict:
    return {
        "win_probability": {"target": "finish_position == 1", "model": "jra_win_model",
                            "normalization": "race_sum_1", "calibration": "none"},
        "top3_probability": {"target": "finish_position <= 3", "model": "v23k_main",
                             "normalization": "none", "calibration": "isotonic"},
    }


def _rows() -> list[dict]:
    rows = []
    for no, name, top3_cal, top3_norm, p_win, odds in FIELD:
        rows.append({
            "horse_no": no, "horse_name": name, "odds": odds if odds is not None else 0,
            "has_real_odds": odds is not None,
            "p_top3": top3_norm, "p_top3_raw": top3_norm, "p_win": p_win,
            "pop_rank": None, "ai_rank": no, "win_rank": no,
            "place2_rank": no, "place2_prob": top3_norm,
            "top3_probability": top3_cal, "win_probability": p_win,
            "prob": top3_norm, "raw_prob": top3_norm, "win_prob": p_win,
        })
    # Market popularity from odds (1 = shortest price); uncaptured odds stay None.
    priced = sorted((r for r in rows if r["has_real_odds"]), key=lambda r: r["odds"])
    for rank, row in enumerate(priced, start=1):
        row["pop_rank"] = rank
    for row in rows:  # production always carries a popularity rank; an unpriced horse ranks last
        if row["pop_rank"] is None:
            row["pop_rank"] = len(rows)
    horses = [SimpleNamespace(horse_no=r["horse_no"], sire="不明", bms="不明", weight_change=0,
                              jockey=f"jockey-{r['horse_no']}", run_style="先行", gate_no=r["horse_no"])
              for r in rows]
    return compute_v23k_horse_diagnostics(rows, horses, len(rows), race_distance=1600,
                                          race_venue="東京", race_surface="芝")


def _snapshot(rows: list[dict], *, v2: bool) -> dict:
    diagnostic = {"race_id": "202605040911", "venue": "東京", "race_no": 11, "distance": 1600,
                  "surface": "芝", "track_condition": "良", "all_horses": rows,
                  "odds_evidence": {"status": "AVAILABLE"}, "scheduled_start_at": START.isoformat()}
    if v2:
        diagnostic["probability_semantics"] = _semantics()
    snapshots = create_run_snapshots(
        organization="JRA", race_date=RACE_DATE, candidates=rows,
        diagnostics={"JRA-1": diagnostic}, data_as_of=NOW,
        prediction_generated_at=NOW + dt.timedelta(seconds=1))
    return snapshots[0]


def _market_rows() -> list[dict]:
    return [{"selection": no, "odds": odds, "captured_at": (START - dt.timedelta(minutes=10)).isoformat(),
             "capture_slot": "t10"} for no, _n, _a, _b, _c, odds in FIELD if odds is not None]


def build(v2: bool) -> dict:
    rows = _rows()
    if not v2:  # a pre-2026-09-17 archive row: only the legacy columns exist
        for row in rows:
            row.pop("win_probability", None)
            row.pop("top3_probability", None)
    # Same call shape as get_lab_race() in production: no calibrated_probability_rows,
    # so the legacy win_prob_calibrated/top3_prob columns are null there.
    return build_lab_race_payload(_snapshot(rows, v2=v2), market_rows=_market_rows(),
                                  calibration_status="READY", result=None, now=NOW.isoformat())


def main(out_dir: str) -> None:
    out = Path(out_dir)
    for name, v2 in (("lab-race-v2.json", True), ("lab-race-legacy.json", False)):
        (out / name).write_text(json.dumps(build(v2), ensure_ascii=False, indent=2, default=str) + "\n",
                                encoding="utf-8")
        print("wrote", out / name)


if __name__ == "__main__":
    main(sys.argv[1])
