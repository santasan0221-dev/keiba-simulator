import { ExternalLink, MapPinned, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getOfficialRaceStorage, weekendOfficialRaces, type OfficialRaceCard } from "@/lib/officialRaceData";

export function OfficialRaceCatalog() {
  const loadRace = (race: OfficialRaceCard) => {
    const entries = getOfficialRaceStorage(race);
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    localStorage.removeItem("keiba-lab-manual-adjustments");
    toast.success(`${race.label}を読み込みます`, { description: `${race.venue} ${race.raceNumber}・${race.surface}${race.distance.toLocaleString()}mの推奨初期条件を保存しました。` });
    window.setTimeout(() => window.location.reload(), 260);
  };

  return <section className="official-race-catalog" aria-label="今週末の公式レースデータ">
    <div className="official-race-catalog-heading"><span className="eyebrow">WEEKEND RACE CATALOG</span><strong>札幌以外の実レースを読み込む</strong><small>天候・馬場は標準初期設定です。当日の確定情報は「直前情報を反映」で上書きできます。</small></div>
    <div className="official-race-card-grid">{weekendOfficialRaces.map((race) => <article className="official-race-card" key={race.id}><div><span className="eyebrow">{race.surface === "芝" ? "TURF / LEFT" : "DIRT / LEFT"}</span><strong>{race.label}</strong><small><MapPinned size={12} /> {race.venue} {race.raceNumber} · {race.surface}{race.distance.toLocaleString()}m · {race.horses.length}頭</small><p>{race.courseNote}</p><a href={race.sourceUrl} target="_blank" rel="noreferrer">出馬表を確認 <ExternalLink size={11} /></a></div><button onClick={() => loadRace(race)}><RefreshCw size={13} /> 推奨条件で読み込む</button></article>)}</div>
  </section>;
}
