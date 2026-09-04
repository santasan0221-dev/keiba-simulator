import { CalendarClock, CircleAlert, ExternalLink, LockKeyhole, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchRace, type LabHorse, type LabRace } from "@/lib/singlePickAi";
import { getFreeScopeState, parseFreeScopeManifest, verifyFreeRace, type FreeScopeManifest } from "@/lib/freeScopeRule";

// AI本命 is only ever the horse whose saved final_mark is exactly "◎" --
// never the model's raw ai_rank (a score-rank position, not a mark), never
// v23k_rank, never the highest score. A missing or duplicate ◎ must fail
// closed (null) here, not fall back to rank or arbitrarily pick one match.
// This preview additionally requires a name and a calibrated win
// probability, since its whole point is showing that calibrated number --
// that requirement is independent of, and unrelated to, the mark contract.
export function selectFreeRaceHonmei(horses: LabHorse[]): LabHorse | null {
  const honmeiRows = horses.filter((horse) => horse.display?.final_mark === "◎");
  const honmei = honmeiRows.length === 1 ? honmeiRows[0] : null;
  return honmei && honmei.name && typeof honmei.model.win_prob_calibrated === "number" ? honmei : null;
}

type LoadState =
  | { kind: "LOADING" }
  | { kind: "MANIFEST"; manifest: FreeScopeManifest }
  | { kind: "ERROR"; message: string };

function manifestUrl(): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/free-scope-manifest.json`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

export function FreeRacePreview() {
  const [manifestLoad, setManifestLoad] = useState<LoadState>({ kind: "LOADING" });
  const [race, setRace] = useState<LabRace | null>(null);
  const [raceError, setRaceError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(manifestUrl()).then(async (response) => {
      if (!response.ok) throw new Error("FREE公開設定を取得できません。");
      const parsed = parseFreeScopeManifest(await response.json());
      if (!parsed) throw new Error("FREE公開設定を検証できません。発走前予測は表示しません。");
      if (live) setManifestLoad({ kind: "MANIFEST", manifest: parsed });
    }).catch((error: unknown) => {
      if (live) setManifestLoad({ kind: "ERROR", message: error instanceof Error ? error.message : "FREE公開設定を取得できません。" });
    });
    return () => { live = false; };
  }, []);

  const scope = manifestLoad.kind === "MANIFEST" ? getFreeScopeState(manifestLoad.manifest) : null;

  useEffect(() => {
    if (!scope || scope.kind !== "READY") return;
    let live = true;
    setRace(null);
    setRaceError(null);
    void fetchRace(scope.entry.race_key).then((value) => {
      const verified = verifyFreeRace(scope.entry, value);
      if (!verified.ok) throw new Error(verified.message);
      if (live) setRace(value);
    }).catch((error: unknown) => {
      if (live) setRaceError(error instanceof Error ? error.message : "FREE公開対象を取得できません。" );
    });
    return () => { live = false; };
  }, [scope?.kind === "READY" ? scope.entry.race_key : "", scope?.kind === "READY" ? scope.entry.model_as_of : "", scope?.kind === "READY" ? scope.entry.scheduled_start_at : ""]);

  if (manifestLoad.kind === "LOADING") return <section className="free-race-preview is-pending" aria-busy="true"><span className="eyebrow">FREE PRE-RACE / VERIFYING</span><h2>今週のFREE公開設定を確認しています。</h2><p>固定manifestを検証するまで、発走前予測は表示しません。</p></section>;
  if (manifestLoad.kind === "ERROR") return <section className="free-race-preview is-error" role="alert"><CircleAlert size={18} /><div><span className="eyebrow">FREE PRE-RACE / UNAVAILABLE</span><h2>FREE公開設定を確認できません。</h2><p>{manifestLoad.message}</p></div></section>;
  if (!scope || scope.kind !== "READY") return <section className="free-race-preview is-pending"><span className="eyebrow">FREE PRE-RACE / {scope?.kind ?? "UNAVAILABLE"}</span><h2>{scope?.kind === "NO_ELIGIBLE_RACE" ? "今週のFREE発走前公開はありません。" : "今週のFREE発走前公開は準備中です。"}</h2><p>{scope?.message ?? "固定公開設定を確認できません。"}</p><a href="/ai-history"><CalendarClock size={14} /> 全レースの事後公開を見る</a></section>;
  if (raceError) return <section className="free-race-preview is-error" role="alert"><CircleAlert size={18} /><div><span className="eyebrow">FREE PRE-RACE / UNAVAILABLE</span><h2>固定公開対象を表示できません。</h2><p>{raceError}</p></div></section>;
  if (!race) return <section className="free-race-preview is-pending" aria-busy="true"><span className="eyebrow">FREE PRE-RACE / LOADING</span><h2>固定公開対象を読み込んでいます。</h2><p>正本のrace key、発走時刻、prediction as-of、校正状態を一致確認しています。</p></section>;

  const hasStarted = Date.now() >= Date.parse(scope.entry.scheduled_start_at);
  const top = selectFreeRaceHonmei(race.horses);
  if (hasStarted) return <section className="free-race-preview is-postrace"><LockKeyhole size={18} /><div><span className="eyebrow">FREE PRE-RACE / CLOSED</span><h2>このFREE発走前公開は終了しました。</h2><p>固定されたrace keyは保持しています。公式結果の状態は事後公開で確認してください。</p><a href="/ai-history"><CalendarClock size={14} /> 全レースの事後公開を見る</a></div></section>;
  if (!top) return <section className="free-race-preview is-error" role="alert"><CircleAlert size={18} /><div><span className="eyebrow">FREE PRE-RACE / UNAVAILABLE</span><h2>校正済みのFREE予測を確認できません。</h2><p>本命または校正済み確率が正本から得られないため、予測値は表示しません。</p></div></section>;

  return <section className="free-race-preview is-open" aria-labelledby="free-race-title">
    <div className="free-race-heading"><div><span className="eyebrow">FREE OPEN / {manifestLoad.manifest.rule_id}</span><h2 id="free-race-title">{race.race.venue ?? "会場未取得"} {race.race.race_no ? `${race.race.race_no}R` : "レース番号未取得"}</h2><p>{race.race.surface ?? "馬場種別未取得"} {race.race.distance ? `${race.race.distance.toLocaleString()}m` : "距離未取得"} · 発走 {formatDateTime(scope.entry.scheduled_start_at)}</p></div><span className="free-open-badge">FREE OPEN</span></div>
    <div className="free-race-pick"><Trophy size={18} /><div><span>正本の本命</span><strong>{top.name}</strong><small>校正済み勝率 {top.model.win_prob_calibrated?.toFixed(1)}% · prediction as-of {formatDateTime(scope.entry.model_as_of)}</small></div></div>
    <div className="free-race-foot"><span>候補: JRA土日 9R〜12R / locked {manifestLoad.manifest.locked_at ? formatDateTime(manifestLoad.manifest.locked_at) : "確認不能"}</span><a href="/ai-history">結果確定後の全レース公開 <ExternalLink size={13} /></a></div>
  </section>;
}
