#!/usr/bin/env bash
#
# Phase 4 -- forged JWT detection.
#
# Flags any auth.token_used event whose (jti, uid, role) claim set doesn't
# match what this server actually issued for that jti. Every real token's
# jti is a fresh crypto.randomUUID() generated only inside signToken() at
# register/login time and logged there (auth.register / auth.login.success)
# along with the uid and role it was issued for.
#
# An attacker with a cracked secret already has a legitimately-issued jti of
# their own (they don't need to observe anyone else's token in transit --
# see security/exploits/phase-4-jwt.mjs, which forges from the attacker's
# own captured token). Existence-only jti correlation would miss this: the
# jti matches the ledger, since it's a real jti, just issued for a different
# uid/role. So this rule binds the *whole* claim set -- a token_used event is
# only legitimate if its jti, uid, AND role all match one issuance record.
# This catches impersonation (uid mismatch) and escalation (role mismatch)
# forgeries identically, with one rule, whether or not the jti itself is
# reused or invented.
#
# An issuance record from before `role` was added to the log schema won't
# have it -- that's treated as unverifiable rather than a forced mismatch,
# so it doesn't false-positive on every legitimate token issued just before
# this schema change deployed. This does mean a role-escalation forgery
# that reuses one of those pre-change jtis wouldn't be caught by the role
# check alone during that window -- an inherent tradeoff of any additive
# log-schema migration, not something engineered around further here.
#
# Usage:
#   ./security/detections/jwt-forged-token.sh security/detections/sample-vulnerable-phase4-jwt.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c 'fromjson?' "$INPUT" | jq -s -c '
  ( [.[] | select(.event == "auth.login.success" or .event == "auth.register")]
    | map({(.jti): {uid: .actor_user_id, role: .role}})
    | add // {}
  ) as $issued
  | .[]
  | select(.event == "auth.token_used")
  | . as $used
  | ($issued[$used.jti]) as $claim
  | select(
      $claim == null
      or $claim.uid != $used.actor_user_id
      or ($claim.role != null and $claim.role != $used.role)
    )
'
