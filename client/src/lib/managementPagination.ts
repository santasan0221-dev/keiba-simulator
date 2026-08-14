export const MANAGEMENT_PAGE_SIZES = [6, 12, 18] as const;

export type ManagementPageSize = (typeof MANAGEMENT_PAGE_SIZES)[number];

export function getManagementPageCount(totalItems: number, pageSize: ManagementPageSize): number {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
}

export function clampManagementPage(page: number, totalItems: number, pageSize: ManagementPageSize): number {
  return Math.min(Math.max(1, page), getManagementPageCount(totalItems, pageSize));
}

export function getManagementPageItems<T>(items: T[], page: number, pageSize: ManagementPageSize): T[] {
  const safePage = clampManagementPage(page, items.length, pageSize);
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}
