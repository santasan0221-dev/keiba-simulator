import { describe, expect, it } from "vitest";
import { clampManagementPage, getManagementPageCount, getManagementPageItems } from "./managementPagination";

describe("Management pagination", () => {
  it("calculates the selectable page windows", () => {
    expect(getManagementPageCount(18, 6)).toBe(3);
    expect(getManagementPageCount(18, 12)).toBe(2);
    expect(getManagementPageCount(18, 18)).toBe(1);
  });

  it("clamps an out-of-range page after a data or page-size change", () => {
    expect(clampManagementPage(3, 8, 6)).toBe(2);
    expect(clampManagementPage(0, 8, 6)).toBe(1);
  });

  it("returns only the horses for the requested page", () => {
    const horses = Array.from({ length: 14 }, (_, index) => index + 1);
    expect(getManagementPageItems(horses, 2, 6)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(getManagementPageItems(horses, 3, 6)).toEqual([13, 14]);
  });
});
