#!/usr/bin/env bash
#
# Phase 2 -- Rule 2: freshly-escalated admin action (correlation rule).
#
# Flags an admin.action event only when the same actor_user_id has an
# earlier profile.update event with "role" in changed_fields -- "earlier"
# meaning earlier in the log's own append order, not by comparing the `ts`
# field's value. A `ts1 < ts2` string comparison was considered and
# rejected: two events logged within the same millisecond produce equal
# `ts` strings, and `<` on equal strings is false, which would silently
# drop a true positive purely due to clock resolution. JSONL lines are
# already in chronological append order (the app's logger writes one line
# per event as it happens), so the correct ordering signal is position in
# the file, not the `ts` value.
#
# Implementation: a single stateful `jq reduce` pass over the events in
# file order, tracking which actors have self-escalated so far. An
# admin.action is flagged only if its actor is already in that running
# set -- built exclusively from lines strictly earlier in the file, so an
# admin.action that precedes a later, unrelated role change by the same
# actor is correctly never flagged, even when both events share a
# timestamp.
#
# Usage:
#   ./security/detections/admin-post-escalation.sh security/detections/sample-admin-post-escalation.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c 'fromjson?' "$INPUT" | jq -s -c '
  reduce .[] as $e (
    {escalated: {}, flagged: []};
    if $e.event == "profile.update" and (($e.changed_fields // []) | index("role")) != null then
      .escalated[$e.actor_user_id | tostring] = true
    elif $e.event == "admin.action" and (.escalated[$e.actor_user_id | tostring] // false) then
      .flagged += [$e]
    else
      .
    end
  ) | .flagged[]
'
