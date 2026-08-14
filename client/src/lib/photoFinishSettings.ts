export const PHOTO_LOOP_RANGE_STORAGE_KEY = "keiba-lab-photo-loop-range";
export const DEFAULT_PHOTO_LOOP_RANGE = { start: 80, end: 100 } as const;

export type PhotoLoopRange = {
  start: number;
  end: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function normalizePhotoLoopRange(value: Partial<PhotoLoopRange> | null | undefined): PhotoLoopRange {
  const candidateStart = Number(value?.start);
  const candidateEnd = Number(value?.end);
  if (!Number.isFinite(candidateStart) || !Number.isFinite(candidateEnd)) return { ...DEFAULT_PHOTO_LOOP_RANGE };

  const start = Math.round(clamp(candidateStart, 80, 98));
  const end = Math.round(clamp(candidateEnd, start + 2, 100));
  return { start, end };
}

export function parsePhotoLoopRange(value: string | null | undefined): PhotoLoopRange {
  if (!value) return { ...DEFAULT_PHOTO_LOOP_RANGE };
  try {
    return normalizePhotoLoopRange(JSON.parse(value) as Partial<PhotoLoopRange>);
  } catch {
    return { ...DEFAULT_PHOTO_LOOP_RANGE };
  }
}
