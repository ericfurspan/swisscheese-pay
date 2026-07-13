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
in app code. Within branch `phase-1-bola`, `vuln/phase-1-bola` (commit `dd21fec`) is the
runnable vulnerable demonstration state — vulnerable code plus the exploit script and
detection rule that exercise it — and `fix/phase-1-bola` (commit `8ae2737f`) is the
matching fixed demonstration state. The vulnerability itself was originally introduced
at commit `127c28d1`; `vuln/phase-1-bola` points a few commits past that, at the point
the full exploit → detect loop became runnable from a single checkout. `main` receives
only the fixed state via `git merge --no-ff`; both tags and the branch are kept locally
so either state stays `git checkout`-able.

### Exploit

[`security/exploits/phase-1-bola.sh`](security/exploits/phase-1-bola.sh) logs in as a
single seeded user (alice) and, using only her session cookie, enumerates a small range of
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

[`security/detections/authz-account-access.sh`](security/detections/authz-account-access.sh)
flags any `authz.account_access` log line where `outcome == "success"` **and**
`actor_user_id != owner_user_id`. The `authz.account_access` event
(`server/src/log/security.ts`, emitted from a shared `loadAccountForRead` helper in
`server/src/routes/accountAccess.ts`) fires once per existing-account read in both the
vulnerable and fixed states, with `owner_user_id` sourced from a dedicated
owner lookup that's independent of the (possibly broken) ownership predicate, so the
true owner is always known even while the gate itself is compromised. Filtering on the
actor/owner mismatch, not merely the event's presence, matters: every ordinary
same-owner read also logs `outcome == "success"`, and would false-positive on a naive
"event exists" rule.

Validated against
[`security/detections/sample-vulnerable.jsonl`](security/detections/sample-vulnerable.jsonl),
a log sample captured by running the exploit script against the vulnerable branch state
(post-logging, pre-fix): the rule isolates exactly the two cross-owner grants and
nothing else. Re-verified live against the fixed state: the same exploit run now 404s
on the cross-owner IDs, and the rule finds an empty set.

## Mass assignment → privilege escalation → admin data over-exposure

**OWASP / CWE:** A01 Broken Access Control / A04 Insecure Design · CWE-915 (Improperly
Controlled Modification of Dynamically-Determined Object Attributes) for the
mass-assignment half; A01 / CWE-213 (Exposure of Sensitive Information Due to
Incompatible Policies) for the data-exposure half.
**Phase introduced:** Phase 2.
**Toggle:** git structure, not a runtime flag. Within branch `phase-2-mass-assignment`,
`vuln/phase-2-mass-assignment` (commit `d34f37f`) is the runnable vulnerable
demonstration state for both vulnerable pieces — vulnerable code plus the exploit
script and detection rule — and `fix/phase-2-mass-assignment` (commit `e259c09`) is the
matching fixed state. The two pieces were originally introduced at commits `2cf30d2`
(excessive data exposure) and `c4d0ae7` (mass-assignment role write); `vuln/phase-2-mass-assignment`
points past both, at the point the demonstration became runnable. `main` receives only
the fixed state via `git merge --no-ff`; both tags and the branch are kept locally.

### Exploit

[`security/exploits/phase-2-mass-assignment.sh`](security/exploits/phase-2-mass-assignment.sh)
chains both halves as a single attacker session, logged in only as the seeded customer
alice: (1) `PATCH /api/profile` with an unexpected `role: "admin"` field, silently
accepted; (2) calling the new admin endpoint with alice's _original_ session still
403s, because `role` is baked into the session JWT at login and never re-checked
against the DB; (3) logging out and back in refreshes the token with the now-escalated
role; (4) `GET /api/admin/users` now returns `200` with every seeded user's raw row,
including `password_hash` and unmasked `ssn` — an unprivileged customer, with no
special access beyond her own login, dumps the full user table's sensitive fields.

### Root cause

Two independent bugs chained together:

**Part 1 — mass assignment (`server/src/routes/profile.ts`, commit `c4d0ae7`).** The
`PATCH /api/profile` handler was widened to destructure and write a `role` field from
the request body, with no check that the caller is already an admin:

```ts
// vulnerable state
const { full_name: fullName, role } = req.body ?? {}
// ...
role !== undefined
  ? db
      .prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?')
      .run(fullName, role, req.user!.uid)
  : db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, req.user!.uid)
```

The bug is the missing _authorization_ check on which fields a self-service update may
touch, not a missing input-validation check — `role` still only accepts DB-enforced
values.

**Part 2 — excessive data exposure (`server/src/routes/admin.ts`, commit
`2cf30d2`).** The new `GET /api/admin/users` endpoint's authorization gate
(`requireAdmin`) is correct and was never the bug; its first implementation instead
returned unfiltered raw rows:

```ts
// vulnerable state
const rows = db.prepare('SELECT * FROM users ORDER BY id').all()
res.status(200).json(rows)
```

— in contrast to every other endpoint in the codebase, which selects an explicit
column list and never returns `password_hash` or an unmasked `ssn`.

### Fix

Commit `e259c09` reverts both halves. `PATCH /api/profile` (`server/src/routes/profile.ts`)
drops `role` from the accepted fields entirely — the handler only ever destructures and
writes `full_name` again. `GET /api/admin/users` (`server/src/routes/admin.ts`) switches
to a curated column list (`id, email, full_name, ssn, role, created_at`) and masks `ssn`
through a new shared `maskSsn` helper
([`server/src/services/users.ts`](server/src/services/users.ts)), the same masking
`profile.ts`'s own `GET` handler uses, so the two endpoints can't drift out of sync on
how PII is redacted. `password_hash` is never selected at all.

### Detection

Two rules, both validated against
[`security/detections/sample-vulnerable-phase2.jsonl`](security/detections/sample-vulnerable-phase2.jsonl),
a log sample captured by running the exploit script against the vulnerable branch state
plus one additional, unescalated call from the legitimate seeded admin (a negative
check):

- [`security/detections/profile-role-change.sh`](security/detections/profile-role-change.sh)
  (Rule 1) flags any `profile.update` log line whose `changed_fields` includes `"role"`.
  No feature in this app legitimately lets a customer change their own role, so the
  field's mere presence is the complete signal. Against the sample it isolates exactly
  alice's self-escalation line.
- [`security/detections/admin-post-escalation.sh`](security/detections/admin-post-escalation.sh)
  (Rule 2) is a correlation rule: it flags an `admin.action` event where the same
  `actor_user_id` has an earlier `profile.update` with `role` in `changed_fields`. This
  catches what Rule 1 alone can't — that the escalation was actually _used_ — without
  false-positiving on the legitimate seeded admin's routine listing call, which the
  sample also includes and the rule correctly excludes.

Re-verified live against the fixed state: the same exploit run's escalation `PATCH` no
longer changes alice's role, the post-refresh admin call still `403`s, and both rules
return an empty set against a fresh capture.

## Money-movement race condition (TOCTOU) and idempotency-key replay

**OWASP / CWE:** A04 Insecure Design / A01 Broken Access Control · CWE-362 (Concurrent
Execution using Shared Resource with Improper Synchronization).
**Phase introduced:** Phase 3.
**Toggle:** git structure, not a runtime flag. Within branch `phase-3-money-movement`,
`vuln/phase-3-concurrency` (commit `e1d6d6f`) is the runnable vulnerable demonstration
state — vulnerable code plus the exploit script and detection rule — and
`fix/phase-3-concurrency` (commit `1c5e8fb`) is the matching fixed state. The
vulnerability was originally introduced at commit `36af5fa`; `vuln/phase-3-concurrency`
points a few commits past that, at the point the demonstration became runnable. `main`
receives only the fixed state via `git merge --no-ff`; both tags and the branch are
kept locally.

### Exploit

[`security/exploits/phase-3-concurrency.mjs`](security/exploits/phase-3-concurrency.mjs)
is a Node script (not bash) firing concurrent `fetch` calls via `Promise.all`, logged in
as the seeded customer alice. Real HTTP concurrency requires genuinely overlapping
requests; bash-backgrounded `curl` processes are too unreliable against the vuln's
~50ms interleaving window. Two independent races, both exploiting the same underlying
gap:

- **Replay:** two concurrent `POST /api/transfers` requests carrying the identical
  `Idempotency-Key` header both complete, producing two distinct transfer IDs (and
  debiting the source account twice) instead of the one execution a client retrying a
  failed request should get.
- **Balance-guard bypass:** three concurrent transfers, each individually affordable
  against the account's starting balance, all succeed — collectively overdrawing the
  account into a negative balance, something the balance guard exists specifically to
  prevent.

### Root cause

One shared cause (`server/src/services/transfers.ts`, commit `36af5fa`), exploited two
ways. `better-sqlite3` is synchronous and Node is single-threaded, so the pre-Phase-3
`transfer()` — a single guarded `UPDATE ... WHERE balance_cents >= ?` inside one
`db.transaction()` — had no interleaving window. Phase 3 makes `transfer()` `async` to
model a realistic feature (a fraud/velocity check against a hypothetical external
service, `mockFraudCheck()`), and the vulnerable version puts the checks _before_ that
`await` instead of inside the synchronous transaction that follows it:

```ts
// vulnerable state
const balanceRow = db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(fromId)
if (!balanceRow || balanceRow.balance_cents < amountCents)
  return { ok: false, reason: 'insufficient_funds' }

if (idempotencyKey !== undefined) {
  const existing = db
    .prepare('SELECT id FROM transfers WHERE idempotency_key = ?')
    .get(idempotencyKey)
  if (existing) return { ok: true, transferId: existing.id, balanceAfterCents /* ... */ }
}

await mockFraudCheck() // the real await gap

// unconditional -- no WHERE balance_cents >= ? guard, because the check
// above already (incorrectly) decided this
debitStmt.run(amountCents, fromId)
```

Both checks are plain reads, not guard clauses on a write. Two concurrent requests can
both pass the balance/idempotency-key check (neither has committed anything yet) before
either reaches `mockFraudCheck()`'s `await`, and Node's event loop happily services one
request's early steps while another is suspended there. By the time either resumes, the
decision has already been made on stale data — and the debit that follows is
unconditional, with no `WHERE balance_cents >= ?` guard, because the pre-await read
already (incorrectly) decided sufficiency.

### Fix

Commit `1c5e8fb` moves both checks so they're decided **only** by statements inside a
single synchronous `db.transaction()` call, evaluated after the `await` rather than
before it:

```ts
// fixed state
await mockFraudCheck() // still runs -- a realistic feature, just no longer load-bearing

const run = db.transaction(() => {
  if (idempotencyKey !== undefined) {
    const existing = db
      .prepare('SELECT id FROM transfers WHERE idempotency_key = ?')
      .get(idempotencyKey)
    if (existing) return { transferId: existing.id, balanceAfterCents /* ... */ }
  }

  const debited = debitStmt.run(amountCents, fromId, amountCents) // WHERE balance_cents >= ? restored
  if (debited.changes === 0) throw new InsufficientFundsError()
  // ...
})
```

`better-sqlite3`'s `db.transaction()` callback is fully synchronous — no `await` can
appear inside it, so nothing can interleave between the idempotency check and the debit,
or between the debit's own guard and its write. That synchronous boundary is what
actually makes this correct, not the schema change: `idempotency_key` also gets a
`UNIQUE` constraint as a defense-in-depth backstop, but it's not the fix mechanism.

### Detection

Two rules, both purely log-based (no correlation needed), validated against
[`security/detections/sample-vulnerable-phase3-concurrency.jsonl`](security/detections/sample-vulnerable-phase3-concurrency.jsonl),
a log sample captured by running the exploit script against the vulnerable branch state:

- [`security/detections/transfer-balance-race.sh`](security/detections/transfer-balance-race.sh)
  (Rule 1) flags any `transfer.completed` event with `balance_after_cents < 0` — the
  guarded `UPDATE`'s entire job is preventing exactly this, so a negative balance in the
  log is direct evidence the guard was bypassed. No false-positive surface: a
  correctly-guarded debit can never produce this.
- [`security/detections/transfer-replay.sh`](security/detections/transfer-replay.sh)
  (Rule 2) flags any `idempotency_key` whose `transfer.completed` events resolve to more
  than one _distinct_ `transfer_id`. Deliberately not keyed on event count: even in the
  fixed state, a retried request with the same key logs its own `transfer.completed`
  line (returning the original transfer's ID) — that's correct dedupe behavior, not
  evidence of replay. Distinct-ID count is the actual discriminator.

Re-verified live against the fixed state: the exploit script now shows exactly one
success out of three concurrent overdrawing transfers and exactly one distinct transfer
ID for the replayed key; both rules return an empty set against a fresh capture.

## Negative-amount transfers and tampered payment-link recipients

**OWASP / CWE:** A04 Insecure Design · CWE-20 (Improper Input Validation) for the
negative-amount bug; CWE-841 (Improper Enforcement of Behavioral Workflow) for the
tampered-recipient bug.
**Phase introduced:** Phase 3.
**Toggle:** git structure, not a runtime flag. Within branch `phase-3-money-movement`,
`vuln/phase-3-negative-amount` (commit `86a5f25`) is the runnable vulnerable
demonstration state for negative-amount — vulnerable code plus the exploit script and
detection rule — originally introduced at commit `5535d83`, and fixed at tag
`fix/phase-3-negative-amount` (commit `16b4d4d`); `vuln/phase-3-tampered-recipient`
(commit `f39cadb`) is the runnable demonstration state for tampered-recipient,
originally introduced at commit `2519c56`, and fixed at tag
`fix/phase-3-tampered-recipient` (commit `61261ba`). These are two independent bugs on
the money-movement surface, not chained into each other (unlike Phase 2's
mass-assignment/data-exposure pair) — each has its own vuln→fix cycle, sequential on the
branch. `main` receives only the fixed state via `git merge --no-ff`; all tags and the
branch are kept locally.

### Exploit

Two independent scripts, both attacker's-eye view from the seeded customer accounts:

- [`security/exploits/phase-3-negative-amount.sh`](security/exploits/phase-3-negative-amount.sh):
  alice sends `POST /api/transfers` with a negative `amount_cents` targeting bob's
  account. Against the vulnerable state it succeeds (`201`) — alice's balance goes
  _up_, bob's balance goes _down_, despite bob never authorizing anything.
- [`security/exploits/phase-3-tampered-recipient.sh`](security/exploits/phase-3-tampered-recipient.sh):
  bob creates a payment link naming his own checking account as recipient; alice pays
  it but adds a `to_account_id` field in the request body pointing at her _other_
  account. Against the vulnerable state the payment still succeeds (`201`), but bob is
  never credited — the money lands in alice's other account instead.

### Root cause (two independent bugs)

**Negative-amount (`server/src/services/transfers.ts`, commit `5535d83`).** The amount
guard was loosened from rejecting `amountCents <= 0` to only rejecting non-integers:

```ts
// vulnerable state
if (!Number.isInteger(amountCents)) {
  return { ok: false, reason: 'invalid_amount' }
}
```

This is exploitable, not just "a weird input got accepted," because the debit and
credit statements share the same signed parameter — `balance_cents = balance_cents - ?`
on the source, `balance_cents = balance_cents + ?` on the destination. A negative
`amountCents` flips both: the "debit" on the caller's own (ownership-checked) account
becomes an increase, and the "credit" on the destination — which has no floor check,
since a credit is normally only ever an increase — becomes an unguarded decrease. No
ownership check is needed on the victim's account, since the victim is merely the
transfer's destination.

**Tampered-recipient (`server/src/routes/paymentLinks.ts`, commit `2519c56`).** Payment
links previously only supported create/list; this phase adds a `POST
/api/payment-links/:token/pay` flow whose vulnerable version reads an optional
`to_account_id` from the request body and uses it in place of the link's own,
DB-sourced `account_id` when present:

```ts
// vulnerable state
const toId = typeof toIdOverride === 'number' ? toIdOverride : link.account_id
```

The link's `account_id` is meant to be immutable and server-derived from the token — a
payer authenticating to pay a specific link has no legitimate reason to name a
different destination.

### Fix

Two independent reverts, matching the two independent bugs:

- Commit `16b4d4d` restores the `amountCents <= 0` rejection — identical to the
  pre-Phase-3 guard.
- Commit `61261ba` removes the `to_account_id` destructure entirely; `toId` is always
  `link.account_id`, read from the DB row keyed by the token, with nothing in the
  request body able to override it.

### Detection

Two rules, both purely log-based, validated against the shared
[`security/detections/sample-vulnerable-phase3-input-validation.jsonl`](security/detections/sample-vulnerable-phase3-input-validation.jsonl)
(one capture per bug, appended to the same file since both were captured while live on
the branch at different points but neither interacts with the other):

- [`security/detections/negative-amount-transfer.sh`](security/detections/negative-amount-transfer.sh)
  (Rule 1) flags any `transfer.completed` event with `amount_cents <= 0`. The DB column
  has no `CHECK` constraint enforcing positivity (comment only), so a negative value
  that actually reached `completed` is unambiguous evidence.
- [`security/detections/payment-link-recipient-mismatch.sh`](security/detections/payment-link-recipient-mismatch.sh)
  (Rule 2) flags any `payment_link.paid` event where `actual_to_account_id` differs from
  `link_account_id` — the link's own DB-sourced value (independent ground truth, same
  pattern as Phase 1's `owner_user_id` check) versus what was actually credited.

Re-verified live against each fix: the negative-amount exploit is now rejected (`400`,
no balances change) and Rule 1 is empty against a fresh capture; the tampered-recipient
exploit now correctly credits bob and Rule 2 is empty against a fresh capture.

## JWT weak-secret cracking → impersonation and privilege escalation

**OWASP / CWE:** A02 Cryptographic Failures / A07 Identification and Authentication
Failures · CWE-321 (Use of Hard-coded Cryptographic Key, applied to a config-set weak
value rather than a literal in code) / CWE-330 (Use of Insufficiently Random Values).
**Phase introduced:** Phase 4.
**Toggle:** git structure, not a runtime flag. Within branch `phase-4-jwt`,
`vuln/phase-4-jwt` (commit `533a42b`) is the runnable vulnerable demonstration state —
vulnerable code plus the exploit script and detection rule — and `fix/phase-4-jwt`
(commit `3722e11`) is the matching fixed state. The vulnerability itself was originally
introduced at commit `de4d8f7`; `vuln/phase-4-jwt` points a few commits past that, at
the point the demonstration became runnable. `main` receives only the fixed state via
`git merge --no-ff`; both tags and the branch are kept locally. This is a config-drift
vuln, not a code regression: neither `docker-entrypoint.sh`'s strong-random-secret auto-generation
nor `token.ts`'s fail-closed `requireSecret()` check was weakened — the vuln commit only
sets an explicit weak value in `docker-compose.yml`, overriding the safe default exactly
the way the file's own comment already invited ("set it explicitly... for session
continuity across restarts"). `alg:none` is already structurally prevented in this
codebase (`verifyToken` pins `algorithms: ['HS256']`) and was out of scope for this
phase — one well-developed weak-secret example, not the full three-technique JWT list.

### Exploit

[`security/exploits/phase-4-jwt.mjs`](security/exploits/phase-4-jwt.mjs) (Node, using
the `jsonwebtoken` library directly for local signing/verification, not just HTTP calls)
runs as a real, unprivileged seeded customer (alice) with no special access:

1. Logs in normally and captures her own session cookie's JWT.
2. Cracks the signing secret via an **offline dictionary attack** against
   [`security/exploits/phase-4-jwt-wordlist.txt`](security/exploits/phase-4-jwt-wordlist.txt)
   (~39 realistic weak/default candidates, not a scraped breach corpus) — no network
   calls in this step, pure local `jwt.verify()` attempts, the same technique real tools
   like `jwt_tool` or `hashcat` mode 16500 use against a captured token.
3. Once cracked, forges two tokens with the recovered secret: one for another user's
   uid (enumerated in a small range, same technique Phase 1's BOLA exploit used) to read
   that user's real private account data via `GET /api/accounts`; one claiming
   `role: 'admin'` for alice's own uid (decoded from her own real token, no cracking
   needed to read your own claims) to hit `GET /api/admin/users`, despite her real DB
   role being `customer`.

### Root cause

One cause (`docker-compose.yml`'s explicit weak `JWT_SECRET`, introduced at commit
`de4d8f7`), two forgeries. The HMAC-SHA256 signature over `{uid, role, jti}` is crackable
via offline dictionary attack in seconds once a low-entropy secret is in play. Once the
secret is known, `jwt.sign` with that secret produces a token indistinguishable from a
legitimately-issued one to `verifyToken` — `token.ts`'s validation logic isn't buggy in
isolation (it correctly checks signature and algorithm), but a weak secret makes the
signature guarantee worthless. Anyone holding the cracked secret controls both fields in
`TokenPayload` independently: `uid` (→ impersonation of any user) and `role` (→
escalation to admin).

### Fix

Commit `3722e11`, two parts:

1. `docker-compose.yml`'s `JWT_SECRET` reverts to unset, so `docker-entrypoint.sh`'s
   strong random 32-byte auto-generation applies again.
2. `token.ts`'s `requireSecret()` gains a minimum-length guard (rejects anything under
   32 characters) as defense-in-depth, so an explicit weak value gets rejected outright
   even if the same config mistake recurs later. This doesn't make HMAC-SHA256 secure by
   itself — a 32-character low-entropy string is still weak — but it closes off the
   specific "someone typed a short memorable string" mistake this phase demonstrated.

No change to `verifyToken`'s validation logic itself; it was already correct. The secret
it validated against was the actual bug.

### Detection

New instrumentation was required here, unlike Phase 1-3: JWTs are stateless, so there
was no existing independent ground truth for "was this specific token legitimately
issued." `signToken` (`server/src/auth/token.ts`) now generates a `jti`
(`crypto.randomUUID()`) per token. `auth.ts`'s `/register` and `/login` handlers log the
new token's `jti` in their existing `auth.register`/`auth.login.success` events (the
"issued" ledger). `requireAuth` — the single existing choke point for every
authenticated request — logs a new `auth.token_used` event with the token's `jti` on
every successful check (the "used" ledger).

Both ledgers also record the token's `uid` (via the existing `actor_user_id` field) and
`role` (added to `detail`), not just its `jti`.
[`security/detections/jwt-forged-token.sh`](security/detections/jwt-forged-token.sh)
binds all three: it flags any `auth.token_used` event whose `(jti, uid, role)` claim set
doesn't match an issuance record for that `jti`. Existence-only `jti` correlation isn't
enough by itself — the exploit's own attacker already holds a legitimately-issued `jti`
of their own (no network position or token sniffing required, since it's their own
captured session), so a forgery that reuses that real `jti` while changing `uid` or
`role` would pass an existence check while still being exactly the impersonation/
escalation forgery this phase targets. Binding the full claim set catches it: the
forged token's `jti` is real, but not real _for that uid/role_, and the rule reports
those independently, so one rule still catches both the impersonation (`uid` mismatch)
and escalation (`role` mismatch) forgeries. Validated against
[`security/detections/sample-vulnerable-phase4-jwt.jsonl`](security/detections/sample-vulnerable-phase4-jwt.jsonl):
the rule isolates the two unseen-`jti` lines, the reused-`jti` role-escalation line, the
reused-`jti` impersonation line, and a second reused-`jti` impersonation line against a
legacy pre-role-logging issuance record — five flags total — and none of alice's
legitimate activity, nor the one same-`jti`/same-`uid` line on that same legacy record
(issuance predates `role` being logged, so `role` alone is treated as unverifiable there,
not a forced mismatch — it doesn't false-positive on tokens issued just before this
schema change deployed — though the `uid` mismatch on that other line against the same
legacy record is still caught, which is the fifth flag above). Re-verified live against the
fixed state: the exploit's crack step fails outright (wordlist exhausted, no forgery
possible), and the rule is empty against a fresh capture.

## Stored XSS via payment-link notes

**OWASP / CWE:** A03 Injection (Cross-Site Scripting) · CWE-79.
**Phase introduced:** Phase 5.
**Toggle:** git structure, not a runtime flag. Within branch `phase-5-owasp-breadth`,
`vuln/phase-5-xss` is the runnable vulnerable demonstration state and `fix/phase-5-xss`
is the matching fixed state. `main` receives only the fixed state via `git merge --no-ff`;
branch and tags are kept locally. Config/render drift, not a new feature: `payment_links.note`
already existed (Phase 3) as free text rendered to a second party (the payer) on `Pay.tsx`;
the vuln commit only changes how that existing field is rendered.

### Exploit

[`security/exploits/phase-5-xss.mjs`](security/exploits/phase-5-xss.mjs) (Node): an attacker
(a real, unprivileged seeded customer) creates a payment link whose `note` contains an
`<img src=x onerror="...">` payload — an event-handler vector, since `<script>` tags inserted
via `innerHTML`/`dangerouslySetInnerHTML` do not execute (standard DOM behavior). The script
confirms the note is stored verbatim, unsanitized. Payload execution itself — a second seeded
user opening the link and the injected script firing, exfiltrating their own `GET /api/accounts`
data to an attacker-controlled collector — is a manual browser verification step (documented in
the script's header comment); this repo has no Playwright/Puppeteer-class dependency to automate
it. The payload cannot read the session cookie itself — `sc_session` is `httpOnly` — its
demonstrated impact is acting with the victim's authenticated session, not cookie theft.

### Root cause

`Pay.tsx` rendered `note` via plain JSX interpolation (React's default escaping) until the vuln
commit changed it to `dangerouslySetInnerHTML`, framed as "support basic formatting (bold/line
breaks) in payment notes." No server-side change — the note was already stored verbatim before
and after this phase; only client-side rendering regressed.

### Fix

Revert `Pay.tsx` to plain JSX interpolation. No sanitization library added — the "basic
formatting" feature that motivated the drift is dropped, not replicated safely, since it was
never a real requirement.

### Detection

New instrumentation: `paymentLinks.ts`'s creation handler didn't log anything before this phase.
It now logs a `payment_link.created` event with `detail: { note_flagged: boolean }` — `true` when
`note` matches a case-insensitive regex for `<script`, `on\w+\s*=`, `<iframe`, or `javascript:`.
[`security/detections/xss-suspicious-note.sh`](security/detections/xss-suspicious-note.sh) flags
any such event. This is a write-time heuristic on authored content, not confirmation that a
victim ever executed the payload — XSS execution is client-side and invisible to server logs by
construction. Validated against
[`security/detections/sample-vulnerable-phase5-xss.jsonl`](security/detections/sample-vulnerable-phase5-xss.jsonl):
the rule isolates exactly the one suspicious-note line, not the benign one — true regardless of
whether `vuln/phase-5-xss` or `fix/phase-5-xss` is checked out, since the fix only changes
rendering, not this creation-time check.

## CSRF via a body-parser leniency drift

**OWASP / CWE:** A01 Broken Access Control (CSRF) · CWE-352.
**Phase introduced:** Phase 5.
**Toggle:** git structure, not a runtime flag. Within branch `phase-5-owasp-breadth`,
`vuln/phase-5-csrf` is the runnable vulnerable demonstration state and `fix/phase-5-csrf` is
the matching fixed state. `main` receives only the fixed state via `git merge --no-ff`.

**Threat model, stated precisely:** NOT classic internet-wide cross-site CSRF. This app is
loopback-only by design (see README's architecture section), so there is no internet-facing
deployment to model that against realistically. The demonstrated attacker is another local
process on a sibling hostname of the same registrable domain — `app.scpay.test` (the real app)
and `evil.scpay.test` (the attacker's page), both mapped to `127.0.0.1` locally. Per the
browser's SameSite "site" definition (registrable domain, not full origin), these are
**same-site but cross-origin** — a real, if narrower and commonly-misunderstood, limitation:
SameSite protects against cross-_site_ requests, not cross-_origin_-same-site ones. The session
cookie's existing `sameSite: 'lax'` (unchanged from Phase 4) therefore still accompanies a
same-site-cross-origin request, including a top-level POST navigation (SameSite lifts its normal
method/navigation restrictions entirely for same-site requests). The clean way to demonstrate
genuine cross-site CSRF against this app's cookie-authenticated-POST design would require serving
it over HTTPS (so `Secure` cookies are viable) — a real architecture change that fights the
README's plain-HTTP-loopback design and isn't undertaken here.

### Exploit

[`security/exploits/phase-5-csrf.mjs`](security/exploits/phase-5-csrf.mjs) (Node, HTTP-level
reproduction) plus [`security/exploits/phase-5-csrf.html`](security/exploits/phase-5-csrf.html)
(the real browser PoC, since a Node cookie jar doesn't populate a real browser's cookie store).
An HTML `<form enctype="text/plain">` with a single field whose name+value are crafted so the
submitted body is valid JSON once concatenated is a CORS-simple request (no preflight) — combined
with the same-site-cross-origin topology above, an auto-submitting version of this form on
`evil.scpay.test` forges a transfer from the victim's account while they're merely viewing the
attacker's page, with no JS/fetch trickery needed.

### Root cause

`server/src/app.ts`'s `express.json()` was widened to `{ type: ['application/json', 'text/plain'] }`,
framed as leniency for a partner-integration client. This defeats what was otherwise a real, if
incidental, mitigation: a plain HTML form cannot set `Content-Type: application/json`, so a
JSON-only body parser blocks the classic form-based CSRF bypass by construction. Widening it to
also accept `text/plain` reopens exactly that bypass.

### Fix

Two parts: (1) revert `express.json()` to its default (`application/json` only), which alone kills
this specific bypass technique; (2) add a new global `requireTrustedOrigin` middleware
(`server/src/middleware/requireTrustedOrigin.ts`), mounted before all routers, rejecting any
non-`GET` request whose `Origin` header is present and doesn't match a shared trusted-origin list
(`server/src/security/trustedOrigins.ts`) — principled defense-in-depth independent of
content-type specifics, not just "we only accept JSON" as the sole defense. Requests with no
`Origin` header at all are allowed through, so Phase 1-4's existing exploit/test tooling (which
doesn't set one) isn't broken. A full double-submit CSRF token is the standard production-grade
defense and isn't built here, since the exact-origin check already closes this phase's
demonstrated exploit without any client-side changes.

### Detection

`transfer.initiated` (already logged) gained an `origin` field (the request's `Origin` header,
verbatim, `null` if absent).
[`security/detections/csrf-cross-origin-transfer.sh`](security/detections/csrf-cross-origin-transfer.sh)
flags any such event whose `origin` doesn't exactly match the trusted-origin list (exact
scheme+host+port, not site-level — the attacker here is same-site, so a site-level comparison
would incorrectly pass the attack). Stated as an anomaly-detection heuristic on request
provenance, not confirmed-forgery ground truth. Unlike the XSS/CORS rules, this one genuinely is
vuln-state-vs-fixed-state: the fixed state's `requireTrustedOrigin` middleware rejects the forged
request outright, so no `transfer.initiated` event is ever logged for it at all. Validated against
[`security/detections/sample-vulnerable-phase5-csrf.jsonl`](security/detections/sample-vulnerable-phase5-csrf.jsonl):
the rule isolates exactly the one mismatched-origin line, not the legitimate same-origin or
no-origin lines.
