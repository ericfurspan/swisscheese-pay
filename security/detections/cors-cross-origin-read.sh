#!/usr/bin/env bash
#
# Phase 5 -- CORS misconfiguration: cross-origin account/profile read
# detection.
#
# Flags any authz.account_access or profile.read event whose origin
# doesn't match this server's trusted-origin list (kept in sync by hand
# with server/src/security/trustedOrigins.ts, same as
# csrf-cross-origin-transfer.sh). Exact-origin comparison, not site-level --
# same reasoning as the CSRF rule.
#
# This flags the same way whether or not the reflected-origin CORS
# middleware (vuln/phase-5-cors) is present: removing it (fix/phase-5-cors)
# stops the attacker's fetch from *reading* the response, but the request
# itself still reaches the route and still gets logged with a mismatched
# origin -- so, like the XSS rule, this fixture pairing is
# attack-attempt-vs-legitimate-traffic, not vuln-state-vs-fixed-state.
#
# Usage:
#   ./security/detections/cors-cross-origin-read.sh security/detections/sample-vulnerable-phase5-cors.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"
TRUSTED_ORIGINS=("http://app.scpay.test:8082" "http://localhost:5173")

jq -R -c 'fromjson?' "$INPUT" | jq -c --argjson trusted "$(printf '%s\n' "${TRUSTED_ORIGINS[@]}" | jq -R . | jq -s .)" '
  select((.event == "authz.account_access" or .event == "profile.read") and .origin != null and ([.origin] - $trusted | length) > 0)
'
