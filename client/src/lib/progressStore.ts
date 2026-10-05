/**
 * Tiny external store for the scenario progress. The animation loop writes it every frame and
 * the track stage reads it directly (DOM updates, no React render); React state only follows
 * at a throttled rate for the panels, so nothing re-renders per frame.
 */
export type ProgressStore = {
  get: () => number;
  set: (value: number) => void;
  subscribe: (listener: (value: number) => void) => () => void;
};

export function createProgressStore(initial = 0): ProgressStore {
  let value = initial;
  const listeners = new Set<(value: number) => void>();
  return {
    get: () => value,
    set: next => {
      const clamped = Math.max(0, Math.min(1, Number.isFinite(next) ? next : 0));
      if (clamped === value) return;
      value = clamped;
      listeners.forEach(listener => listener(value));
    },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
