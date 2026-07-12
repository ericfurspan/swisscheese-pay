#!/usr/bin/env bash
#
# Phase 3 -- concurrency/timing Rule 1: balance-guard bypass (TOCTOU).
#
# Flags any transfer.completed log line where balance_after_cents < 0. The
# atomic guarded UPDATE's entire job (WHERE balance_cents >= ?) is preventing
# exactly this outcome -- a negative balance appearing in the log is direct
# evidence the guard was bypassed via the await-gap race
# (vuln/phase-3-concurrency). A correctly-guarded debit can never produce a
# negative balance_after_cents, so this rule has no false-positive surface.
#
# Usage:
#   ./security/detections/transfer-balance-race.sh security/detections/sample-vulnerable-phase3-concurrency.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c '
  fromjson? | select(.event == "transfer.completed" and .balance_after_cents < 0)
' "$INPUT"
