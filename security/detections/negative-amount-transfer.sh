#!/usr/bin/env bash
#
# Phase 3 -- input-validation Rule 1: negative-amount transfer.
#
# Flags any transfer.completed event with amount_cents <= 0. The DB column
# has no CHECK constraint enforcing positivity (schema.ts comment only), and
# vuln/phase-3-negative-amount drops the application-level sign check --
# amount_cents is logged verbatim from whatever the caller sent, so a
# negative value that actually completed is unambiguous. Only matches
# transfer.completed (not transfer.initiated) -- initiation logs fire before
# validation in both states, so filtering on completed is what keeps this
# rule empty against the fixed state, where a negative amount always fails
# before completion.
#
# Usage:
#   ./security/detections/negative-amount-transfer.sh security/detections/sample-vulnerable-phase3-input-validation.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c '
  fromjson? | select(.event == "transfer.completed" and .amount_cents <= 0)
' "$INPUT"
