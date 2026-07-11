#!/usr/bin/env bash
#
# Phase 1 -- BOLA detection rule for authz.account_access.
#
# The security logger emits one authz.account_access JSON line per existing-
# account read (server/src/routes/accountAccess.ts), in both the vulnerable
# and fixed states of getAccountForUser. The rule below is the crux of
# telling them apart: flag a line only when outcome=="success" AND
# actor_user_id != owner_user_id. Filtering on outcome=="success"
# alone (or on the event's mere presence) would false-positive on every
# ordinary same-owner dashboard load -- those also emit outcome=="success",
# just with actor_user_id == owner_user_id.
#
# Usage: feed it a file of newline-delimited security-log JSON lines
# (app stdout, or a captured sample):
#   ./security/detections/authz-account-access.sh security/detections/sample-vulnerable.jsonl
# or pipe app stdout directly (index.ts also prints a plain-text startup
# banner before the JSON lines start, so this reads raw lines and skips
# anything that doesn't parse as JSON rather than aborting on it):
#   npm run dev | ./security/detections/authz-account-access.sh
#
# Output: one JSON object per flagged cross-owner grant, or nothing if none
# are found (the expected result against the fixed state).

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c '
  fromjson? | select(.event == "authz.account_access" and .outcome == "success" and .actor_user_id != .owner_user_id)
' "$INPUT"
