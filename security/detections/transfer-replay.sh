#!/usr/bin/env bash
#
# Phase 3 -- concurrency/timing Rule 2: idempotency-key replay.
#
# Flags any idempotency_key value whose transfer.completed events resolve to
# MORE THAN ONE DISTINCT transfer_id. A key exists specifically to dedupe to
# a single execution -- vuln/phase-3-concurrency's await-gap lets two
# concurrent requests both pass the "not yet used" check before either
# records it, producing two distinct transfer rows for one key.
#
# Deliberately NOT keyed on event count: even in the FIXED state, two
# concurrent requests sharing a key both log a transfer.completed line (the
# second request hits the in-transaction idempotency check and returns the
# first request's transferId) -- that's correct, intended behavior, not a
# replay. Grouping on event count alone would false-positive on exactly this
# fixed-state case. Distinct transfer_id count is the actual discriminator:
# 1 unique id under the fix, >1 unique id under the vuln.
#
# Requests sent without a key (idempotency_key == null) are excluded --
# omitting the header is a legitimate, unrelated choice, not evidence of
# replay.
#
# Usage:
#   ./security/detections/transfer-replay.sh security/detections/sample-vulnerable-phase3-concurrency.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c 'fromjson?' "$INPUT" | jq -s -c '
  [.[] | select(.event == "transfer.completed" and .idempotency_key != null)]
  | group_by(.idempotency_key)
  | map(select((map(.transfer_id) | unique | length) > 1))
  | flatten
  | .[]
'
