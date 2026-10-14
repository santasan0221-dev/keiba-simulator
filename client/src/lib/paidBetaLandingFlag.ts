// The only new release flag. Strict build-time opt-in, default OFF.
export function paidBetaLandingEnabled(value: unknown = import.meta.env.VITE_PAID_BETA_LANDING_ENABLED) { return value === "1"; }
