# Vulnerability catalog

Each vulnerability shipped in this project is documented here using the four-slot
template below, once it's implemented, exploited, fixed, and given a detection rule —
see the four-part loop in [`README.md`](./README.md).

## Template

Each entry follows this structure:

```
## [Vuln name]

**OWASP / CWE:** ...
**Phase introduced:** ...
**Toggle:** how to switch between the vulnerable and secure implementation.

### Exploit
Steps or script to reproduce the attack, attacker's-eye view.

### Root cause
The specific code and design decision that allows it.

### Fix
The secure implementation.

### Detection
A detection rule written against the structured security logs, validated as an
artifact (no live SIEM in this build).
```

## Phase structure

- **Phase 0 — Scaffold (done).** Working, non-vulnerable app. Real auth, ownership
  checks, React's default escaping intact. No deliberate holes.
- **Phase 1+ — Vuln phases.** Each introduces a slice of the vulnerability set behind a
  per-vuln toggle, taken through the full exploit → root cause → fix → detection loop.
  Planned differentiators: broken object/function-level access control (BOLA/IDOR),
  money-movement business logic (race conditions, replay, tampered transfers), JWT
  attacks, and excessive data exposure / mass assignment — plus a thinner pass of
  standard web vulnerabilities (stored XSS, CSRF, open redirect, clickjacking, CORS
  misconfiguration) for OWASP breadth.

## BOLA / IDOR on account reads

**OWASP / CWE:** A01 Broken Access Control · CWE-639 (Authorization Bypass Through
User-Controlled Key) / CWE-284.
**Phase introduced:** Phase 1.
**Toggle:** git structure, not a runtime flag; no `if (vulnMode)` or env var ever lands
in app code. Within branch `phase-1-bola`, the vulnerability is introduced at tag
`vuln/phase-1-bola` (commit `127c28d1`) and fixed at tag `fix/phase-1-bola` (commit
`8ae2737f`). `main` receives only the fixed state via `git merge --no-ff`; both tags
and the branch are kept locally so either state stays `git checkout`-able.

### Exploit
[`exploits/phase-1-bola.sh`](exploits/phase-1-bola.sh) logs in as a single seeded
user (alice) and, using only her session cookie, enumerates a small range of
sequential account IDs against `GET /api/accounts/:id` and
`/api/accounts/:id/transactions`. Against the vulnerable state it recovers another
user's (bob's) account number, balance, and transaction history without ever
authenticating as bob: a real BOLA/IDOR, cross-user data disclosure through
attacker-controlled object IDs, not a hardcoded single-target guess.

### Root cause
`getAccountForUser` (`server/src/services/accounts.ts`) is the single choke point
behind both `GET /api/accounts/:id` and the nested `GET /api/accounts/:id/transactions`
route, so one line change exposes both endpoints. Commit `127c28d` dropped the ownership
predicate, fetching the row by primary key alone:

```ts
// vulnerable state
.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`).get(accountId)
```

The route-level validation (integer-ID guard, 404-on-miss) never changed; the lookup
itself simply started succeeding for accounts the caller doesn't own, so the same code
returns `200` with foreign data instead of `404`.

### Fix
Commit `8ae2737` restores the ownership predicate:

```ts
// fixed state
.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ? AND user_id = ?`).get(accountId, uid)
```

A cross-owner request now 404s with no existence leak, matching the original secure
baseline. (Along the way, `transfers.ts`'s source-account ownership check was split
into its own dedicated `isAccountOwnedByUser`, independent of `getAccountForUser`;
otherwise this vuln would have incidentally also let a caller initiate transfers from
accounts they don't own, which is out of this phase's scope; money-movement bugs are a
separate, later vuln phase.)

### Detection
[`detections/authz-account-access.sh`](detections/authz-account-access.sh) flags any
`authz.account_access` log line where `outcome == "success"` **and**
`actor_user_id != detail.owner_user_id`. The `authz.account_access` event
(`server/src/log/security.ts`, emitted from a shared `loadAccountForRead` helper in
`server/src/routes/accountAccess.ts`) fires once per existing-account read in both the
vulnerable and fixed states, with `detail.owner_user_id` sourced from a dedicated
owner lookup that's independent of the (possibly broken) ownership predicate, so the
true owner is always known even while the gate itself is compromised. Filtering on the
actor/owner mismatch, not merely the event's presence, matters: every ordinary
same-owner read also logs `outcome == "success"`, and would false-positive on a naive
"event exists" rule.

Validated against
[`detections/sample-vulnerable.jsonl`](detections/sample-vulnerable.jsonl), a log
sample captured by running the exploit script against the vulnerable branch state
(post-logging, pre-fix): the rule isolates exactly the three cross-owner grants and
nothing else. Re-verified live against the fixed state: the same exploit run now 404s
on the cross-owner IDs, and the rule finds an empty set.
