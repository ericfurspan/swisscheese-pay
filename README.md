# SwissCheese Pay

An intentionally vulnerable personal banking / payments dashboard, built as a target for
hands-on application security practice with OWASP ZAP and Burp Suite.

## Security posture

`lab/all-vulnerabilities` is the cumulative training target. All nine documented
vulnerabilities are active together in one running app. `main` retains the fixed
implementations, while the paired `vuln/*` and `fix/*` tags preserve each focused
before-and-after comparison. None of these states guarantees the absence of unknown
vulnerabilities.

## What this is

SwissCheese Pay is a minimal neobank-style account portal: register, log in, view
account balances and transaction history, transfer money between your own accounts,
generate payment request links, and edit your profile. The domain — accounts, balances,
money movement, PII — is chosen deliberately. It's the sharpest vehicle for demonstrating
real-world impact: business-logic flaws around money movement, and access-control bugs
that leak another user's balance, transaction history, or SSN, carry stakes that a
task-board or CRM clone can't.

## Status

| Phase | Vulnerability class                                                                | Status |
| ----- | ---------------------------------------------------------------------------------- | ------ |
| 0     | Secure scaffold                                                                    | Done   |
| 1     | Broken object-level access control (BOLA/IDOR)                                     | Done   |
| 2     | Mass assignment / excessive data exposure                                          | Done   |
| 3     | Money-movement business logic (races, replay, negative-amount, tampered recipient) | Done   |
| 4     | JWT attacks (weak secret, forged tokens)                                           | Done   |
| 5     | Standard web-vuln breadth (stored XSS, CSRF, CORS misconfiguration)                | Done   |

Every phase is taken through the four-part loop below and documented in
[`VULNS.md`](./VULNS.md).

## The four-part loop

Every headline vulnerability this project ships is taken through four stages,
documented per-vuln in [`VULNS.md`](./VULNS.md):

1. **Exploit** — reproduce the attack, attacker's-eye view.
2. **Root cause** — the specific code and design decision that allows it.
3. **Fix** — the secure implementation, toggleable side by side with the vulnerable one.
4. **Detection** — a detection rule written against structured security logs, validated
   as an artifact.

This ties offense, secure coding, and detection engineering into one narrative instead
of three disconnected exercises. Depth over breadth: a small number of vulnerabilities
documented all the way through beats a broad, shallow checklist that falls apart the
moment someone probes past the happy path.

## Differentiators

Headlined first because they're what prove hands-on offensive/exploit-side skill —
generic OWASP-Top-10 web vulns are kept for breadth but aren't the point:

- **Broken access control (BOLA / IDOR + function-level authz).** Reading another
  user's account, transactions, or SSN; a customer invoking admin-only actions.
- **Money-movement business logic.** Race conditions on concurrent transfers, replay of
  a transfer request, negative-amount and tampered-recipient transfers — the class of
  bug most absent from generic vuln-bank clones.
- **JWT attacks from the attacker's side.** Weak signing secrets cracked via offline
  dictionary attack, forging a token to impersonate another user or escalate to admin.
- **Excessive data exposure / mass assignment.** Over-returned sensitive fields;
  `role`/`balance` writable via unexpected request fields.

Standard web-vuln coverage, including stored XSS, CSRF, and CORS misconfiguration, is
also covered (Phase 5) for breadth alongside the four differentiators above. Open
redirect, clickjacking, and client-side-only authz were scoped out as weaker fits for
this app's specific surface.

## Architecture

Single container, single origin: Express serves both the built React SPA and the
`/api` routes from one host/port, bound to `127.0.0.1` only — this app must never be
reachable beyond localhost. SQLite (`better-sqlite3`) is reseeded on every boot, so
every scan starts from the same known state.

```
Browser ──HTTP──> 127.0.0.1:8082 ──> Express
                                        ├── serves built React SPA (static)
                                        ├── /api/*  (JSON API)
                                        └── SQLite (reseeded on boot)
```

**Stack:** React + Vite + TypeScript (client), Express + TypeScript (server),
`better-sqlite3`, JWT auth in an httpOnly cookie.

## Run the cumulative lab

```
git switch lab/all-vulnerabilities
make lab
```

Then visit `http://127.0.0.1:8082`. The SQLite database is reseeded whenever the
container starts. To reproduce all nine vulnerabilities automatically, with a clean
container for each stateful exploit:

```
make verify-lab
```

Useful lifecycle commands:

```
make logs
make down
```

Seeded logins, all using password `Password123!`:

- `alice@scpay.test`
- `bob@scpay.test`
- `admin@scpay.test`

Without Docker: `npm install && npm run build && npm run dev` (server serves the built
client at the same URL above).

## Compare an individual vulnerability with its fix

The cumulative branch is the simplest way to use the project. For focused engineering
evidence, each vulnerability also has paired `vuln/*` and `fix/*` tags. Check out a tag,
rebuild, run its exploit, then repeat against its fixed counterpart:

```
git checkout vuln/phase-4-jwt
make up                                   # rebuilds the container from this checkout
node security/exploits/phase-4-jwt.mjs    # succeeds: secret cracked, tokens forged
make down

git checkout fix/phase-4-jwt              # or: git checkout main
make up
node security/exploits/phase-4-jwt.mjs    # fails: crack step exhausts the wordlist
make down

git checkout main
```

The other eight vulnerabilities follow the same checkout / `make up` / run / `make down`
pattern:

| Vulnerability                            | Vulnerable tag                    | Fixed tag                        | Exploit script                                    |
| ---------------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------- |
| BOLA / IDOR                              | `vuln/phase-1-bola`               | `fix/phase-1-bola`               | `security/exploits/phase-1-bola.sh`               |
| Mass assignment                          | `vuln/phase-2-mass-assignment`    | `fix/phase-2-mass-assignment`    | `security/exploits/phase-2-mass-assignment.sh`    |
| Money-movement race + idempotency replay | `vuln/phase-3-concurrency`        | `fix/phase-3-concurrency`        | `security/exploits/phase-3-concurrency.mjs`       |
| Negative-amount transfer                 | `vuln/phase-3-negative-amount`    | `fix/phase-3-negative-amount`    | `security/exploits/phase-3-negative-amount.sh`    |
| Tampered payment-link recipient          | `vuln/phase-3-tampered-recipient` | `fix/phase-3-tampered-recipient` | `security/exploits/phase-3-tampered-recipient.sh` |
| JWT weak-secret cracking                 | `vuln/phase-4-jwt`                | `fix/phase-4-jwt`                | `security/exploits/phase-4-jwt.mjs`               |
| Stored XSS via payment-link notes        | `vuln/phase-5-xss`                | `fix/phase-5-xss`                | `security/exploits/phase-5-xss.mjs`               |
| CSRF via body-parser leniency            | `vuln/phase-5-csrf`               | `fix/phase-5-csrf`               | `security/exploits/phase-5-csrf.mjs`              |
| CORS misconfiguration                    | `vuln/phase-5-cors`               | `fix/phase-5-cors`               | `security/exploits/phase-5-cors.mjs`              |

Each script's expected output and the matching detection rule are documented per-vuln
in [`VULNS.md`](./VULNS.md).

## Safety

- Loopback-only reachability. Outside Docker the app itself binds `127.0.0.1`;
  inside Docker it binds `0.0.0.0` in the container's own network namespace
  (standard practice — otherwise the container would be unreachable through
  Docker's port publishing at all) and the loopback-only guarantee instead
  comes from docker-compose's `127.0.0.1:8082:8082` host-side bind. Either
  way: never expose this beyond localhost.
- No real credentials, money, or PII. All seed data is fabricated.
- Private repo until deliberately made otherwise.
