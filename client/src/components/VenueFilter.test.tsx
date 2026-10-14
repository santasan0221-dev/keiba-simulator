import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VenueFilter } from "./VenueFilter";
import { venueKey } from "@/lib/venueFilter";
import type { LabRaceListItem } from "@/lib/singlePickAi";

it("renders a named button group with active state and native keyboard controls", () => {
  const race = {organization:"JRA",venue:"東京"} as LabRaceListItem;
  const markup=renderToStaticMarkup(<VenueFilter races={[race]} selected={venueKey(race)} onChange={()=>{}}/>);
  expect(markup).toContain('role="group"');
  expect(markup).toContain('aria-label="開催場で絞り込み"');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('type="button"');
  expect(markup).toContain('東京<b>1</b>');
});
it("defines the minimum touch target and keyboard focus appearance", () => {
  const css=readFileSync('client/src/components/venueFilter.css','utf8');
  expect(css).toContain('min-height: 44px');
  expect(css).toContain(':focus-visible');
});
