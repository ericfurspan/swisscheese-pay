#!/usr/bin/env bash
#
# Phase 2 -- Rule 2: freshly-escalated admin action (correlation rule).
#
# Flags an admin.action event where the same actor_user_id has an earlier
# profile.update event with "role" in changed_fields. This is what Rule 1
# alone can't express (it only sees the escalation moment, not that it was
# later used) and what "an admin endpoint was called" alone can't either
# (that's also true for the legitimate seeded admin and would false-
# positive on it). Simplification vs. the design spec: flags on ANY earlier
# self-role-change by that actor, not strictly the "most recent" one --
# equivalent in this app since role changes are never reverted, and it
# keeps this a single jq pass instead of needing per-actor timestamp
# ordering.
#
# Usage:
#   ./security/detections/admin-post-escalation.sh security/detections/sample-vulnerable-phase2.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c 'fromjson?' "$INPUT" | jq -s -c '
  ([ .[] | select(.event == "profile.update" and ((.changed_fields // []) | index("role")) != null) | .actor_user_id ] | unique) as $escalated
  | .[]
  | select(.event == "admin.action" and (.actor_user_id as $a | $escalated | any(. == $a)))
'
