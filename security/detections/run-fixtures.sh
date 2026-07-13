#!/usr/bin/env bash
# Runs each detection script against its paired sample fixture and checks
# the expected number of matching lines. Fails loudly (exit 1) on mismatch.
set -euo pipefail
cd "$(dirname "$0")"

fail=0

check() {
  local script="$1" fixture="$2" expected_lines="$3"
  local actual
  actual=$(./"$script" "$fixture" | wc -l | tr -d ' ')
  if [ "$actual" != "$expected_lines" ]; then
    echo "FAIL: $script against $fixture -- expected $expected_lines line(s), got $actual"
    fail=1
  else
    echo "OK:   $script against $fixture ($actual line(s))"
  fi
}

# Script/fixture pairings and counts below are verified, not guessed: pairings
# come from each script's own "# Usage:" header comment, and counts were each
# produced by actually running `./<script> <fixture> | wc -l` against the
# current fixture files.
check admin-post-escalation.sh sample-admin-post-escalation.jsonl 1
check profile-role-change.sh sample-vulnerable-phase2.jsonl 1
check transfer-balance-race.sh sample-vulnerable-phase3-concurrency.jsonl 2
check transfer-replay.sh sample-vulnerable-phase3-concurrency.jsonl 2
check negative-amount-transfer.sh sample-vulnerable-phase3-input-validation.jsonl 1
check payment-link-recipient-mismatch.sh sample-vulnerable-phase3-input-validation.jsonl 1
check jwt-forged-token.sh sample-vulnerable-phase4-jwt.jsonl 5
check authz-account-access.sh sample-vulnerable.jsonl 2
check xss-suspicious-note.sh sample-vulnerable-phase5-xss.jsonl 1

exit $fail
