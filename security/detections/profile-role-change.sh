#!/usr/bin/env bash
#
# Phase 2 -- Rule 1: illegitimate self-role-change.
#
# Flags any profile.update log line where changed_fields includes "role".
# Unlike Phase 1's rule, this needs no actor/owner mismatch predicate: there
# is no feature in this app where a customer legitimately changes their own
# role, so the field's mere presence in changed_fields is the complete
# signal. Empty output is expected against the fixed state, where role is
# silently dropped and never lands in changed_fields.
#
# Usage:
#   ./security/detections/profile-role-change.sh security/detections/sample-vulnerable-phase2.jsonl
# or pipe app stdout directly:
#   npm run dev | ./security/detections/profile-role-change.sh

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c '
  fromjson? | select(.event == "profile.update" and ((.changed_fields // []) | index("role")) != null)
' "$INPUT"
