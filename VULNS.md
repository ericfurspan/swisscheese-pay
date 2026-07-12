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
both vulnerable pieces are live as of tag `vuln/phase-2-mass-assignment` (commit
`2cf30d2`) and both are fixed at tag `fix/phase-2-mass-assignment` (commit `e259c09`).
`main` receives only the fixed state via `git merge --no-ff`; both tags and the branch
are kept locally.

### Exploit
[`security/exploits/phase-2-mass-assignment.sh`](security/exploits/phase-2-mass-assignment.sh)
chains both halves as a single attacker session, logged in only as the seeded customer
alice: (1) `PATCH /api/profile` with an unexpected `role: "admin"` field, silently
accepted; (2) calling the new admin endpoint with alice's *original* session still
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
  ? db.prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?').run(fullName, role, req.user!.uid)
  : db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, req.user!.uid)
```

The bug is the missing *authorization* check on which fields a self-service update may
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
  catches what Rule 1 alone can't — that the escalation was actually *used* — without
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
the vulnerability is introduced at tag `vuln/phase-3-concurrency` (commit `36af5fa`) and
fixed at tag `fix/phase-3-concurrency` (commit `1c5e8fb`). `main` receives only the
fixed state via `git merge --no-ff`; both tags and the branch are kept locally.

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
service, `mockFraudCheck()`), and the vulnerable version puts the checks *before* that
`await` instead of inside the synchronous transaction that follows it:

```ts
// vulnerable state
const balanceRow = db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(fromId)
if (!balanceRow || balanceRow.balance_cents < amountCents) return { ok: false, reason: 'insufficient_funds' }

if (idempotencyKey !== undefined) {
  const existing = db.prepare('SELECT id FROM transfers WHERE idempotency_key = ?').get(idempotencyKey)
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
    const existing = db.prepare('SELECT id FROM transfers WHERE idempotency_key = ?').get(idempotencyKey)
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
  than one *distinct* `transfer_id`. Deliberately not keyed on event count: even in the
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
negative-amount is introduced at tag `vuln/phase-3-negative-amount` (commit `5535d83`)
and fixed at tag `fix/phase-3-negative-amount` (commit `16b4d4d`); tampered-recipient is
introduced at tag `vuln/phase-3-tampered-recipient` (commit `2519c56`) and fixed at tag
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
  *up*, bob's balance goes *down*, despite bob never authorizing anything.
- [`security/exploits/phase-3-tampered-recipient.sh`](security/exploits/phase-3-tampered-recipient.sh):
  bob creates a payment link naming his own checking account as recipient; alice pays
  it but adds a `to_account_id` field in the request body pointing at her *other*
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
