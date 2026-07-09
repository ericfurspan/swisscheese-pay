# Vulnerability catalog

Each vulnerability shipped in this project is documented here using the four-slot
template below, once it's implemented, exploited, fixed, and given a detection rule —
see the four-part loop in [`README.md`](./README.md). **This file is currently a stub:
Phase 0 is a secure baseline with no deliberate vulnerabilities, so there are no
entries yet.**

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

No entries yet.
