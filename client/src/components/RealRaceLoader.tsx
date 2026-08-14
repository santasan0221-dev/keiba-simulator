import { useEffect, useState } from "react";
import { Database, X } from "lucide-react";
import type { Horse } from "@/pages/Home";
import {
  fetchRace,
  fetchRaces,
  getApiBase,
  setApiBase,
  toHorses,
  type LabRaceListItem,
} from "@/lib/singlePickAi";

// Floating loader that pulls a real race from single_pick_ai (/api/lab) and
// seeds the simulator's horses with it. Kept self-contained so Home only needs
// to mount <RealRaceLoader onLoad={setHorses} />.

const ORGS = ["NAR", "JRA"] as const;

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return jst.toISOString().slice(0, 10);
}

const brass = "#c8a866";
const panelStyle: React.CSSProperties = {
  position: "fixed", right: 20, bottom: 20, zIndex: 60, width: "min(360px, 92vw)",
  background: "#101b27f5", border: `1px solid ${brass}77`, borderRadius: 6,
  boxShadow: "0 24px 70px #000a", padding: 16, color: "#e7ece8", fontSize: 12,
};

export function RealRaceLoader({ onLoad }: { onLoad: (horses: Horse[]) => void }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(getApiBase());
  const [date, setDate] = useState(todayJst());
  const [org, setOrg] = useState<(typeof ORGS)[number]>("NAR");
  const [races, setRaces] = useState<LabRaceListItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setMessage("読み込み中…");
    fetchRaces(date, org)
      .then((data) => {
        if (!live) return;
        setRaces(data.races);
        setMessage(data.races.length ? "" : "対象レースなし。日付/主催を変えてください。");
      })
      .catch((e) => live && setMessage(`接続エラー: ${e}. single_pick_ai を起動してください。`));
    return () => {
      live = false;
    };
  }, [open, date, org, base]);

  const load = async (raceKey: string) => {
    setLoading(true);
    setMessage("レース読み込み中…");
    try {
      const race = await fetchRace(raceKey);
      onLoad(toHorses(race));
      const cal = race.model.calibration_status;
      setMessage(
        cal === "READY"
          ? "実データを反映(校正済み確率あり)。以下は what-if 感度分析です。"
          : `実データを反映(校正 ${cal}: 確率は未確定・参考)。以下は what-if 感度分析です。`,
      );
    } catch (e) {
      setMessage(`取得失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 60,
          display: "inline-flex", alignItems: "center", gap: 7,
          border: `1px solid ${brass}`, background: "#101b27", color: brass,
          padding: "10px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer",
        }}
      >
        <Database size={14} /> 本物のレースを読み込む
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ color: brass, letterSpacing: ".08em" }}>SINGLE_PICK_AI 実レース</strong>
        <button type="button" onClick={() => setOpen(false)} style={{ border: 0, background: "transparent", color: "#8290a1", cursor: "pointer" }}>
          <X size={16} />
        </button>
      </div>
      <label style={{ display: "block", fontSize: 10, color: "#8290a1", marginBottom: 8 }}>
        接続先 single_pick_ai(自分のPCで開くなら既定のままでOK)
        <input
          value={base}
          onChange={(e) => {
            setBase(e.target.value);
            setApiBase(e.target.value);
          }}
          placeholder="http://localhost:8000"
          style={{ width: "100%", marginTop: 4, background: "#0d1722", color: "#e7ece8", border: "1px solid #354553", borderRadius: 3, padding: 6, fontSize: 11 }}
        />
      </label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ flex: 1, minWidth: 0, background: "#0d1722", color: "#e7ece8", border: "1px solid #354553", borderRadius: 3, padding: 6 }}
        />
        <div style={{ display: "flex" }}>
          {ORGS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrg(value)}
              style={{
                border: "1px solid #2a3543", background: org === value ? brass : "transparent",
                color: org === value ? "#101822" : "#8290a2", padding: "6px 10px", fontSize: 11, cursor: "pointer",
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {message && <p style={{ color: "#96c8a8", margin: "6px 0", lineHeight: 1.5 }}>{message}</p>}
      <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 5 }}>
        {races.map((race) => (
          <button
            key={race.race_key}
            type="button"
            disabled={loading}
            onClick={() => load(race.race_key)}
            style={{
              display: "grid", gridTemplateColumns: "28px 1fr auto", alignItems: "center", gap: 8,
              border: "1px solid #2b3745", background: "#121b27", color: "#cfd7d7",
              padding: "8px 10px", borderRadius: 3, textAlign: "left", cursor: "pointer",
            }}
          >
            <b style={{ color: brass }}>{race.race_no ?? "—"}</b>
            <span>
              <strong style={{ display: "block", fontSize: 12 }}>{race.venue ?? race.race_key}</strong>
              <small style={{ color: "#758497" }}>
                {race.distance ?? "—"}m · {race.surface ?? "—"} · {race.status}
              </small>
            </span>
            <span style={{ color: "#758497", fontSize: 10 }}>{race.top_pick?.name ?? ""}</span>
          </button>
        ))}
      </div>
      <p style={{ color: "#68778a", fontSize: 10, marginTop: 10, lineHeight: 1.6 }}>
        末脚は v23k 実値、馬場適性・出走成績は as-of 履歴実値。持久力等は暫定。読み込んだ数値はブラウザ内 what-if
        シミュレーションのシードで、実際の予測・的中を保証しません。
      </p>
    </div>
  );
}
