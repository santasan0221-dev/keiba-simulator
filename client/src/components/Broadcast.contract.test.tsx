import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultRow } from "./OperationsDashboard";
import { ApiState } from "./ApiState";
import SimulatorShell from "@/pages/SimulatorShell";
import type { LabResultListItem } from "@/lib/singlePickAi";
vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));
const row = {
  race_key: "NAR|2026-09-28|水沢|03",
  organization: "NAR",
  venue: "水沢",
  race_no: 3,
  result_status: "CONFIRMED",
  predicted_top3: [{ mark: "◎", horse_no: 4, horse_name: "本命馬" }],
  official_top3: [4, 10, 9],
  ai_pick_finish: 1,
  top3_coverage: 0.333333,
  special_statuses: [
    { horse_no: 7, status: "EXCLUDED" },
    { horse_no: 4, status: "CANCELLED" },
    { horse_no: 6, status: "DID_NOT_FINISH" },
  ],
} as LabResultListItem;
describe("broadcast display contract", () => {
  it("formats objects and coverage in the actual result card", () => {
    const html = renderToStaticMarkup(<ResultRow item={row} />);
    expect(html).not.toContain("[object Object]");
    for (const label of ["#7 除外", "#4 取消", "#6 競走中止", "33.3%"])
      expect(html).toContain(label);
    expect(html).not.toContain(" / 3");
  });
  it("shows one publication honmei and refuses duplicate honmei", () => {
    expect(
      renderToStaticMarkup(<ResultRow item={row} />).match(/◎#4/g)
    ).toHaveLength(1);
    const bad = {
      ...row,
      predicted_top3: [
        ...row.predicted_top3!,
        { mark: "◎" as const, horse_no: 8, horse_name: "他馬" },
      ],
    };
    const html = renderToStaticMarkup(<ResultRow item={bad} />);
    expect(html).toContain("公開本命を確認中");
    expect(html).not.toContain("◎#8");
    expect(html).not.toContain("◎#4");
  });
  it("distinguishes unavailable from empty and shows safe diagnostics", () => {
    const error = renderToStaticMarkup(
      <ApiState
        kind="unavailable"
        status={503}
        origin="https://api.keibalab.net"
      />
    );
    expect(error).toContain("HTTP 503");
    expect(error).toContain("api.keibalab.net");
    expect(error).not.toContain("0件");
    expect(renderToStaticMarkup(<ApiState kind="empty" />)).toContain("0件");
    expect(renderToStaticMarkup(<ApiState kind="loading" />)).toContain(
      "読み込み中"
    );
  });
  it("never presents research shell as measured telemetry", () => {
    const html = renderToStaticMarkup(<SimulatorShell />);
    expect(html).toContain("RESEARCH_ONLY");
    expect(html).toContain("UNAVAILABLE");
    for (const label of [
      "km/h",
      "m/s",
      "残存体力",
      "LIVE MODEL",
      "OFFICIAL RESULT",
    ])
      expect(html).not.toContain(label);
    expect(html).toContain("AI");
    expect(html).toContain("MARKET");
    expect(html).toContain("SIM");
  });
});
