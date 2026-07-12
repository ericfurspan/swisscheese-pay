#!/usr/bin/env bash
#
# Phase 4 -- forged JWT detection.
#
# Flags any auth.token_used event whose jti was never actually issued by
# this server. Every real token's jti is a fresh crypto.randomUUID()
# generated only inside signToken() at register/login time and logged
# there (auth.register / auth.login.success). A cracked-secret forgery can
# produce a validly-signed token with ANY jti value the forger chooses
# (vuln/phase-4-jwt.mjs uses crypto.randomUUID() too, to structurally
# resemble a real token) -- but it has no way to make that value match one
# actually issued, since jtis aren't predictable and the forger never
# observed a real one in transit. This rule is agnostic to what the forged
# token claims (uid, role) -- it catches impersonation and escalation
# forgeries identically, with one rule.
#
# Usage:
#   ./security/detections/jwt-forged-token.sh security/detections/sample-vulnerable-phase4-jwt.jsonl

set -euo pipefail

INPUT="${1:-/dev/stdin}"

jq -R -c 'fromjson?' "$INPUT" | jq -s -c '
  ( [.[] | select(.event == "auth.login.success" or .event == "auth.register") | .jti] ) as $issued
  | .[]
  | select(.event == "auth.token_used" and (.jti as $j | $issued | index($j) | not))
'
