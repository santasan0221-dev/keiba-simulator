import { useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, Copy, LoaderCircle, Share2, TriangleAlert } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { TruthPanel } from "@/components/TruthPanel";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
import { fetchRace, LabApiError, type LabRace } from "@/lib/singlePickAi";
import { absoluteRaceUrl, paramsToRaceKey, type RaceUrlParams } from "@/lib/raceShareUrl";

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid_url" }
  | { kind: "not_found"; raceKey: string }
  | { kind: "unavailable"; raceKey: string; message: string }
  | { kind: "ready"; race: LabRace };

export async function shareRace(raceKey: string) {
  const url = absoluteRaceUrl(raceKey);
  if (!url) return;
  const shareData = { title: "KEIBA LAB", text: "AI視点でこのレースを確認する", url };
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share(shareData);
      return;
    } catch {
      // User cancelled the native share sheet, or the platform rejected it --
      // fall through to clipboard copy rather than leaving the button inert.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("URLをコピーしました。");
  } catch {
    toast.error("URLのコピーに失敗しました。手動でコピーしてください。", { description: url });
  }
}

export default function RacePage() {
  const params = useParams<RaceUrlParams>();
  const raceKey = paramsToRaceKey(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!raceKey) {
      setState({ kind: "invalid_url" });
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    fetchRace(raceKey)
      .then((race) => { if (active) setState({ kind: "ready", race }); })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof LabApiError && reason.status === 404) {
          setState({ kind: "not_found", raceKey });
        } else {
          const message = reason instanceof Error ? reason.message : String(reason);
          setState({ kind: "unavailable", raceKey, message });
        }
      });
    return () => { active = false; };
  }, [raceKey]);

  return <main className="race-page">
    <header className="race-page-topbar">
      <Link href="/" className="race-page-back"><ArrowLeft size={16} /> 今日のレース一覧へ</Link>
    </header>
    <LabServiceNavigation active="today" />
    <div className="race-page-body">
      {state.kind === "loading" && <section className="race-page-status" aria-busy="true"><LoaderCircle className="spin" size={18} /><p>レースを読み込んでいます…</p></section>}
      {state.kind === "invalid_url" && <section className="race-page-status race-page-status--error" role="alert"><CircleAlert size={18} /><div><h2>このレースURLは正しくありません。</h2><p>共有されたURLが正しいか確認するか、レース一覧から選び直してください。</p></div></section>}
      {state.kind === "not_found" && <section className="race-page-status race-page-status--error" role="alert"><CircleAlert size={18} /><div><h2>このレースは見つかりませんでした。</h2><p>race_key: <code>{state.raceKey}</code></p><p>開催がない、または予測がまだ生成されていない可能性があります。0件として扱わず、取得不能として表示しています。</p></div></section>}
      {state.kind === "unavailable" && <section className="race-page-status race-page-status--error" role="alert"><TriangleAlert size={18} /><div><h2>現在データを取得できません。</h2><p>{state.message}</p><p>正本APIへ接続できないため、0件や取得成功として表示していません。時間をおいて再度お試しください。</p></div></section>}
      {state.kind === "ready" && <>
        <TruthPanel race={state.race} />
        <button type="button" className="race-page-share" onClick={() => void shareRace(state.race.race.race_key ?? raceKey ?? "")}>
          <Share2 size={14} /> このレースを共有 <Copy size={12} />
        </button>
      </>}
    </div>
  </main>;
}
