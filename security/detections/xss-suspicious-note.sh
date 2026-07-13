#!/usr/bin/env bash
#
# Phase 5 -- stored XSS: suspicious payment-link note heuristic.
#
# Flags any payment_link.created event with note_flagged: true, logged by
# the server itself at creation time (server/src/routes/paymentLinks.ts)
# against a case-insensitive regex for <script, on\w+=, <iframe, and
# javascript: substrings.
#
# This is a write-time heuristic on authored content, not confirmation
# that a victim ever executed the payload -- stored-XSS execution is
# client-side and invisible to server logs by construction. It flags the
# same way regardless of whether Pay.tsx is currently vulnerable or fixed
# -- see sample-vulnerable-phase5-xss.jsonl's own comment for why this
# fixture pairing is "attack-attempt vs benign," not "vuln-state vs
# fixed-state."
#
# Usage:
#   ./security/detections/xss-suspicious-note.sh security/detections/sample-vulnerable-phase5-xss.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c 'fromjson?' "$INPUT" | jq -c '
  select(.event == "payment_link.created" and .note_flagged == true)
'
