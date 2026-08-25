#!/usr/bin/env bash
#
# Phase 5 -- CSRF: cross-origin transfer detection.
#
# Flags any transfer.initiated event whose origin doesn't match this
# server's trusted-origin list (server/src/security/trustedOrigins.ts --
# keep this script's TRUSTED_ORIGINS array in sync with that file by hand;
# this is a small demo app with no shared build step between bash and TS).
# Exact-origin comparison (scheme+host+port), not site-level -- the
# attacker in this phase's threat model is same-site (see spec §1), so a
# site-level comparison would incorrectly pass the attack.
#
# This is an anomaly-detection heuristic on request provenance, not
# confirmed-forgery ground truth: a legitimate request with a spoofable or
# absent Origin wouldn't be caught by this alone.
#
# Unlike the XSS/CORS detection rules, this one IS legitimately
# vuln-state-vs-fixed-state: fix/phase-5-csrf's requireTrustedOrigin
# middleware rejects a forged request outright, so no transfer.initiated
# event is ever logged for it in the fixed state at all.
#
# Usage:
#   ./security/detections/csrf-cross-origin-transfer.sh security/detections/sample-vulnerable-phase5-csrf.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"
TRUSTED_ORIGINS=("http://127.0.0.1:8082" "http://app.scpay.test:8082" "http://localhost:5173")

jq -R -c 'fromjson?' "$INPUT" | jq -c --argjson trusted "$(printf '%s\n' "${TRUSTED_ORIGINS[@]}" | jq -R . | jq -s .)" '
  select(.event == "transfer.initiated" and .origin != null and ([.origin] - $trusted | length) > 0)
'
