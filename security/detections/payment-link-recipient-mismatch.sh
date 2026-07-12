#!/usr/bin/env bash
#
# Phase 3 -- input-validation Rule 2: tampered payment-link recipient.
#
# Flags any payment_link.paid event where actual_to_account_id differs from
# link_account_id -- the link's own DB-sourced account_id (independent
# ground truth, same pattern as Phase 1's owner_user_id check) versus what
# was actually credited. vuln/phase-3-tampered-recipient lets a payer's
# request override the destination; these should always be equal.
#
# Usage:
#   ./security/detections/payment-link-recipient-mismatch.sh security/detections/sample-vulnerable-phase3-input-validation.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c '
  fromjson? | select(.event == "payment_link.paid" and .actual_to_account_id != .link_account_id)
' "$INPUT"
