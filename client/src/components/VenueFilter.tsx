import React, { useEffect, useRef } from "react";
import type { LabRaceListItem } from "@/lib/singlePickAi";
import { venueOptions } from "@/lib/venueFilter";
import "./venueFilter.css";

export function VenueFilter({ races, selected, onChange }: { races: readonly LabRaceListItem[]; selected: string; onChange: (key: string) => void }) {
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = group.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active || !group.current) return;
    // Scroll only this strip; preserve the page and race-list position.
    const strip = group.current;
    if (active.offsetLeft < strip.scrollLeft) strip.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = active.offsetLeft + active.offsetWidth - strip.clientWidth;
  }, [selected, races]);
  return <div ref={group} className="race-venue-filter" role="group" aria-label="開催場で絞り込み">
    {[{ key: "", label: "すべて", count: races.length }, ...venueOptions(races)].map(option => <button type="button" key={option.key} aria-pressed={selected === option.key} onClick={() => onChange(option.key)}>{option.label}<b>{option.count}</b></button>)}
  </div>;
}
