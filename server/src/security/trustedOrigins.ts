// Single source of truth for "which Origin values this server trusts on
// state-changing/sensitive requests" -- shared between fix/phase-5-csrf's
// requireTrustedOrigin middleware and the CSRF/CORS detection scripts
// (security/detections/csrf-cross-origin-transfer.sh,
// cors-cross-origin-read.sh). Those scripts are bash+jq and can't import
// this file directly, so their own TRUSTED_ORIGINS arrays must be kept in
// sync with this one by hand -- each script's header comment cross-
// references this file as a reminder.
//
// Includes both the deployed app origin AND the Vite dev-mode origin: the
// dev proxy (client/vite.config.ts) rewrites Host, not Origin, so a
// legitimate browser request made through it still carries the frontend's
// real origin (Vite's own dev server origin) all the way to the backend.
// A check that only accepted the deployed origin would reject ordinary
// dev-mode transfers/profile-edits/payment-link creation.
const DEFAULT_APP_ORIGIN = 'http://app.scpay.test:8082'
const DEFAULT_DEV_ORIGIN = 'http://localhost:5173'

export const TRUSTED_ORIGINS: readonly string[] = [
  process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN,
  process.env.DEV_ORIGIN ?? DEFAULT_DEV_ORIGIN,
]

export function isTrustedOrigin(origin: string): boolean {
  return TRUSTED_ORIGINS.includes(origin)
}
