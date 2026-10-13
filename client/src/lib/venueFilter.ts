import type { LabRaceListItem } from "./singlePickAi";

export function venueKey(race: Pick<LabRaceListItem, "organization" | "venue">): string {
  return JSON.stringify([race.organization, race.venue]);
}
export function venueOptions(races: readonly LabRaceListItem[]) {
  const options = new Map<string, { key: string; label: string; count: number }>();
  for (const race of races) {
    const key = venueKey(race);
    const option = options.get(key);
    if (option) option.count++;
    else options.set(key, { key, label: race.venue || "会場未取得", count: 1 });
  }
  return Array.from(options.values());
}
export function validVenue(races: readonly LabRaceListItem[], selected: string) {
  return selected && races.some(race => venueKey(race) === selected) ? selected : "";
}
export function filterVenue(races: readonly LabRaceListItem[], selected: string) {
  const key = validVenue(races, selected);
  return key ? races.filter(race => venueKey(race) === key) : races;
}
