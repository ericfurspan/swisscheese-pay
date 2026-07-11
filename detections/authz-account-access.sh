#!/usr/bin/env bash
#
# Phase 1 -- BOLA detection rule for authz.account_access (Task 3).
#
# The security logger emits one authz.account_access JSON line per existing-
# account read (server/src/routes/accountAccess.ts), in both the vulnerable
# and fixed states of getAccountForUser. The rule below is the crux of
# telling them apart: flag a line only when outcome=="success" AND
# actor_user_id != detail.owner_user_id. Filtering on outcome=="success"
# alone (or on the event's mere presence) would false-positive on every
# ordinary same-owner dashboard load -- those also emit outcome=="success",
# just with actor_user_id == owner_user_id.
#
# Usage: feed it a file of newline-delimited security-log JSON lines
# (app stdout, or a captured sample):
#   ./detections/authz-account-access.sh detections/sample-vulnerable.jsonl
# or pipe app stdout directly:
#   npm run dev | ./detections/authz-account-access.sh
#
# Output: one JSON object per flagged cross-owner grant, or nothing if none
# are found (the expected result against the fixed state).

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -c '
  select(.event == "authz.account_access")
  | select(.outcome == "success")
  | select(.actor_user_id != .owner_user_id)
' "$INPUT"
