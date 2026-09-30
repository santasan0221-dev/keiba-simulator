// Local fixture server for UI evidence screenshots only.
//
// Mirrors the read-only single_pick_ai KEIBA LAB contract (/api/lab/*) with
// deterministic FIXTURE data so before/after screenshots can be taken when the
// real API is not reachable from the capture environment. Nothing here is
// shipped in the client bundle and none of it is real race data.
//
//   node scripts/ui-evidence/mockLabApi.mjs [port]
import http from "node:http";

const PORT = Number(process.argv[2] ?? 4100);
const DATE = "2026-09-30";
const NOW = Date.parse(process.env.MOCK_NOW ?? "2026-09-30T13:05:00+09:00");

const NAMES = ["サンダーリーフ", "アオイノキセキ", "ミッドナイトラン", "ステラヴェール", "ハヤテノツバサ", "コスモブライト", "シルバーアロー", "ベルモントスカイ", "ロードクレスト", "グランシャリオ", "カゼノマイ", "トウカイノゾミ", "ゴールドリング", "ホクトセイバー", "ユメノカケハシ", "ナイトフォール"];
const STYLES = ["逃げ", "先行", "先行", "差し", "差し", "追込"];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const PLAN = [
  // org, venue, race_no, start (JST HH:MM), field size, decision raw/gate, surface, distance
  ["JRA", "中山", 9, "13:50", 14, "SENBATSU", "selected", "芝", 1800],
  ["JRA", "中山", 10, "14:25", 16, "NORMAL", "rejected", "ダ", 1200],
  ["JRA", "中山", 11, "15:05", 16, "SENBATSU", "selected", "芝", 2000],
  ["JRA", "阪神", 8, "13:10", 12, "SKIP", "original_skip", "ダ", 1400],
  ["JRA", "阪神", 11, "15:40", 15, "SKIP", "original_skip", "芝", 1600],
  ["JRA", "中山", 5, "12:05", 13, "SENBATSU", "selected", "芝", 1600],
  ["JRA", "阪神", 6, "12:40", 11, "SKIP", "original_skip", "ダ", 1800],
  ["JRA", "中山", 7, "11:15", 10, "UNKNOWN", null, "ダ", 1800],
  ["NAR", "大井", 3, "15:20", 12, "NORMAL", "selected", "ダ", 1200],
  ["NAR", "大井", 4, "15:55", 11, "SKIP", "original_skip", "ダ", 1600],
  ["NAR", "園田", 2, "11:35", 10, "SKIP", "original_skip", "ダ", 1400],
  ["NAR", "園田", 5, "13:15", 12, "NORMAL", "rejected", "ダ", 1230],
];

function buildRace([org, venue, no, hhmm, size, raw, gate, surface, distance], index) {
  const r = rng(index * 97 + 13);
  const start = `${DATE}T${hhmm}:00+09:00`;
  const raceKey = `${org}|${DATE}|${venue}|${String(no).padStart(2, "0")}`;
  const weights = Array.from({ length: size }, (_, i) => Math.exp(2.4 * r() - i * 0.12));
  const total = weights.reduce((a, b) => a + b, 0);
  const winP = weights.map((w) => w / total);
  const marketRaw = winP.map((p) => Math.max(0.01, p * (0.55 + r() * 0.9)));
  const marketTotal = marketRaw.reduce((a, b) => a + b, 0);
  const marketP = marketRaw.map((p) => p / marketTotal);
  const odds = marketP.map((p) => Math.max(1.2, Math.round((0.8 / p) * 10) / 10));
  const popularityOrder = [...odds.keys()].sort((a, b) => odds[a] - odds[b]);
  const aiOrder = [...winP.keys()].sort((a, b) => winP[b] - winP[a]);
  // The publication ◎ is a saved mark; in some races it differs from AI評価1位.
  const honmeiIndex = index % 4 === 1 ? aiOrder[1] : aiOrder[0];
  const markFor = (i) => i === honmeiIndex ? "◎" : i === aiOrder.find((x) => x !== honmeiIndex) ? "○" : i === aiOrder.filter((x) => x !== honmeiIndex)[1] ? "▲" : i === aiOrder[5] ? "△" : "無印";
  const horses = Array.from({ length: size }, (_, i) => ({
    no: i + 1,
    name: NAMES[(i + index * 3) % NAMES.length],
    style: STYLES[Math.floor(r() * STYLES.length)],
    withdrawn: false,
    abilities: { speed: Math.round((55 + winP[i] * 160) * 10) / 10, stamina: null, start: null, form: null, going_rates: { 良: null, 稍重: null, 重: null, 不良: null }, mapping_status: "P2_UNVERIFIED_SINGLE_SPEED_REDUCTION" },
    model: {
      v23k_score: Math.round((55 + winP[i] * 160) * 10) / 10,
      ai_rank: aiOrder.indexOf(i) + 1,
      win_prob_calibrated: null, top3_prob: null, prob_status: "UNCALIBRATED_SHADOW_SCORE",
      win_probability: org === "JRA" ? Math.round(winP[i] * 1e6) / 1e6 : (index % 2 ? null : Math.round(winP[i] * 1e6) / 1e6),
      top3_probability: Math.min(0.95, Math.round(winP[i] * 2.6 * 1000) / 1000),
      probability_semantics_status: "OK", probability_refusals: [],
      market_win_probability: org === "JRA" || index % 3 === 0 ? Math.round(marketP[i] * 1e6) / 1e6 : null,
    },
    display: { base_mark: markFor(i), final_mark: markFor(i), v23k_rank: aiOrder.indexOf(i) + 1, mark_adjustment_reason: i === honmeiIndex ? "据え置き" : null, anxiety_tags: i === popularityOrder[0] && i !== honmeiIndex ? ["大幅馬体変動"] : [], plus_tags: i === honmeiIndex ? ["AI上位評価", "先行力"] : [], dismiss_reason_tags: [], danger_score: null },
    market: { popularity: popularityOrder.indexOf(i) + 1, win_odds: odds[i], slot: "t10", captured_at: `${DATE}T${hhmm}:00+09:00` },
    record: {},
  }));
  // Normalize JRA AI probabilities to exactly sum to 1 after rounding.
  const decisionStatus = gate === "selected" && ["SENBATSU", "NORMAL", "BET"].includes(raw) ? "BET" : ["SKIP", "NO_BET"].includes(raw) ? "NO_BET" : "UNKNOWN";
  const betStatus = decisionStatus === "BET" ? "BUY" : decisionStatus === "NO_BET" ? "PASS" : ["SENBATSU", "NORMAL", "BET"].includes(raw) ? "WATCH" : "UNKNOWN";
  const honmei = horses[honmeiIndex];
  const aiTop = horses[aiOrder[0]];
  const aiAvailable = org === "JRA";
  const marketAvailable = horses.every((h) => h.model.market_win_probability !== null);
  const marketTop = marketAvailable ? horses[[...marketP.keys()].sort((a, b) => marketP[b] - marketP[a])[0]] : null;
  const agreementState = !aiAvailable || !marketAvailable ? "INSUFFICIENT_SOURCES" : aiTop.no === marketTop.no ? "ALL_AGREE" : "ALL_DISAGREE";
  const finished = Date.parse(start) + 8 * 60_000 < NOW;
  const noise = Object.fromEntries(horses.map((h) => [h.no, r() * 0.9]));
  const officialOrder = finished ? [...horses].sort((a, b) => (b.model.top3_probability + noise[b.no]) - (a.model.top3_probability + noise[a.no])) : null;
  const detail = {
    race: { race_key: raceKey, date: DATE, organization: org, venue, race_no: no, distance, surface, going: index % 5 === 3 ? "稍重" : "良", going_status: "AVAILABLE", weather: null, pace_hint: null, scheduled_start_at: start, status: finished ? "RESULTED" : Date.parse(start) <= NOW ? "CLOSED" : "PREDICTED" },
    model: { champion_id: `${org.toLowerCase()}-champion-fixture`, calibration_status: org === "JRA" ? "READY" : "COLLECTING", disclaimer: "本アプリは予測支援であり的中を保証しない。投資は自己責任。", as_of: `${DATE} 08:30:00+09:00` },
    horses,
    branches: [],
    market_ev: { note: "", status: "AVAILABLE", rows: horses.map((h) => ({ no: h.no, expected_return: h.model.win_probability === null ? null : Math.round(h.model.win_probability * h.market.win_odds * 1000) / 1000, simple_corrected_market_prob: Math.min(1, 0.8 / h.market.win_odds) })) },
    provenance: {},
    decision: { status: decisionStatus, raw_status: raw, reason: decisionStatus === "NO_BET" ? "期待値条件未達" : null, gate_status: gate, gate_reason: gate === "rejected" ? "最終ゲートで対象外" : null, bet: decisionStatus === "BET" ? { bet_type: "単勝", picks: [honmei.no], pick_names: [honmei.name], stake: 100, odds: honmei.market.win_odds, odds_source: "t10", multi_bets: null } : null },
    honmei: { status: "AVAILABLE", source: "PUBLICATION_MARK", mark: "◎", horse_no: honmei.no, horse_name: honmei.name, win_probability: honmei.model.win_probability, caution: index % 4 === 1 ? { status: "ANXIETY_DEMOTION", label: "不安要素あり", reasons: ["調教△"], note: null } : null },
    ai_top: aiAvailable ? { status: "AVAILABLE", source: "WIN_PROBABILITY_RANK1", label: "AI評価1位", horse_no: aiTop.no, horse_name: aiTop.name, win_probability: aiTop.model.win_probability, rank2_gap: 0.04 } : { status: "UNAVAILABLE", reason: "ORGANIZATION_NOT_ENABLED:NAR", source: "WIN_PROBABILITY_RANK1", label: "AI評価1位", horse_no: null, horse_name: null, win_probability: null },
    bet_decision: { status: betStatus, reasons: [decisionStatus === "NO_BET" ? "期待値条件未達" : null, gate ? `GATE_STATUS:${gate}` : null].filter(Boolean), classifier_status: decisionStatus, race_decision: raw, gate_status: gate },
    honmei_view: {
      contract_version: "canonical-honmei-option-a-v1", ui_notice: "◎＝購入推奨ではありません",
      ranking: aiAvailable ? { status: "OK", basis: "AI_WIN_PROBABILITY_ARGMAX", reason_codes: [], ranked: aiOrder.map((i, k) => ({ rank: k + 1, horse_no: i + 1, horse_name: horses[i].name, win_probability: horses[i].model.win_probability })), ties: [] } : { status: "ORGANIZATION_NOT_ENABLED", basis: "AI_WIN_PROBABILITY_ARGMAX", reason_codes: ["ORGANIZATION_NOT_ENABLED:NAR"], ranked: [], ties: [] },
      sources: {
        ai: aiAvailable ? { source: "AI", status: "OK", horse_no: aiTop.no, win_probability: aiTop.model.win_probability } : { source: "AI", status: "ORGANIZATION_NOT_ENABLED", horse_no: null, win_probability: null },
        market: marketTop ? { source: "MARKET", status: "AVAILABLE", horse_no: marketTop.no, win_probability: marketTop.model.market_win_probability } : { source: "MARKET", status: "NOT_PUBLISHED", horse_no: null, win_probability: null },
        simulation: { source: "SIMULATION", status: "SHADOW_NOT_PUBLISHED", horse_no: null, win_probability: null },
      },
      agreement: { state: agreementState, ai_market: aiAvailable && marketTop ? aiTop.no === marketTop.no : null, ai_simulation: null, market_simulation: null, publication_ai: aiAvailable ? honmei.no === aiTop.no : null, publication_market: marketTop ? honmei.no === marketTop.no : null },
    },
    probability_display: { market: { status: marketAvailable ? "AVAILABLE" : "NOT_PUBLISHED" } },
    result: finished ? { status: "CONFIRMED", official_order: officialOrder.slice(0, 5).map((h, k) => ({ finish: k + 1, horse_no: h.no, horse_name: h.name, popularity: h.market.popularity })), ai_pick: { horse_no: honmei.no, horse_name: honmei.name, ai_rank: honmei.model.ai_rank, final_mark: "◎", finish: officialOrder.indexOf(honmei) + 1, won: officialOrder[0] === honmei, placed: officialOrder.indexOf(honmei) < 3 }, payouts: {} } : null,
  };
  const listRow = { race_key: raceKey, organization: org, venue, race_no: no, scheduled_start_at: start, status: detail.race.status, distance, surface, top_pick: { no: honmei.no, name: honmei.name, ai_rank: honmei.model.ai_rank, final_mark: "◎", win_prob_calibrated: null, top3_prob: null, prob_status: "UNCALIBRATED_SHADOW_SCORE" }, decision: detail.decision, honmei: detail.honmei, ai_top: detail.ai_top };
  const marked = horses.filter((h) => ["◎", "○", "▲"].includes(h.display.final_mark)).sort((a, b) => "◎○▲".indexOf(a.display.final_mark) - "◎○▲".indexOf(b.display.final_mark));
  const top3 = officialOrder ? officialOrder.slice(0, 3).map((h) => h.no) : [];
  const resultRow = {
    race_key: raceKey, race_date: DATE, organization: org, venue, race_no: no, scheduled_start_at: start,
    prediction_id: `pred_fixture_${index}`, prediction_created_at: `${DATE}T08:30:00+09:00`,
    predicted_top3: marked.map((h) => ({ mark: h.display.final_mark, horse_no: h.no, horse_name: h.name })),
    official_top3: top3, ai_pick_finish: officialOrder ? officialOrder.indexOf(honmei) + 1 : null,
    top3_coverage: officialOrder ? Math.round(marked.filter((h) => top3.includes(h.no)).length / 3 * 1e6) / 1e6 : null,
    result_status: officialOrder ? "CONFIRMED" : Date.parse(start) <= NOW ? "REVIEW_REQUIRED" : "PENDING",
    special_statuses: index === 5 ? [{ horse_no: 7, status: "EXCLUDED" }] : [],
    result_fetched_at: officialOrder ? new Date(Date.parse(start) + 15 * 60_000).toISOString() : null,
  };
  return { detail, listRow, resultRow };
}

const RACES = PLAN.map(buildRace);

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }); return res.end(); }
  if (path === "/api/lab/health") return send(res, 200, { origin: "fixture", reachable: true, schema_version: "lab-api-v2", auth_state: "NOT_REQUIRED_READ_ONLY", last_updated_at: new Date(NOW).toISOString(), features: [] });
  if (path === "/api/lab/available-dates") return send(res, 200, { latest_prediction_date: DATE, available_dates: [DATE, "2026-09-29", "2026-09-28"] });
  if (path === "/api/lab/operations/daily") return send(res, 200, { race_date: url.searchParams.get("date"), prediction_counts: { JRA: RACES.filter((r) => r.listRow.organization === "JRA").length, NAR: RACES.filter((r) => r.listRow.organization === "NAR").length }, official_result_count: RACES.filter((r) => r.resultRow.result_status === "CONFIRMED").length, pending_count: RACES.filter((r) => r.resultRow.result_status === "PENDING").length, review_required_count: RACES.filter((r) => r.resultRow.result_status === "REVIEW_REQUIRED").length, last_prediction_at: `${DATE}T08:30:00+09:00`, last_result_at: new Date(NOW - 20 * 60_000).toISOString(), last_pdca_at: null, automation_status: "NORMAL", next_scheduled_at: new Date(NOW + 25 * 60_000).toISOString() });
  if (path === "/api/lab/races") {
    const org = url.searchParams.get("organization");
    const races = RACES.map((r) => r.listRow).filter((r) => !org || r.organization === org).sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at));
    return send(res, 200, { date: url.searchParams.get("date"), races });
  }
  if (path.startsWith("/api/lab/race/")) {
    const key = decodeURIComponent(path.slice("/api/lab/race/".length));
    const race = RACES.find((r) => r.detail.race.race_key === key);
    return race ? send(res, 200, race.detail) : send(res, 404, { error: "not found" });
  }
  if (path === "/api/lab/results") {
    const org = url.searchParams.get("organization");
    const venue = url.searchParams.get("venue");
    const results = RACES.map((r) => r.resultRow).filter((r) => (!org || r.organization === org) && (!venue || r.venue === venue)).sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at));
    return send(res, 200, { race_date: url.searchParams.get("date"), results });
  }
  if (path === "/api/betting-candidates") return send(res, 200, { status: "EMPTY", race_date: DATE, decisions: [], counts: {} });
  if (path === "/api/analysis/model-comparison") return send(res, 200, { models: [] });
  if (path === "/api/lab/free-race") return send(res, 200, { status: "EMPTY", race: null });
  send(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock lab api on http://127.0.0.1:${PORT}`));
