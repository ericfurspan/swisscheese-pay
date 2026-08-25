# Swiss Cheese Pay Publication-Safety Audit

Date: 2026-07-15

Status: **Passed. Approved for publication by the owner on 2026-07-15.**

At audit time, no remote was created and the audit made no changes to Swiss Cheese Pay
files, commits, branches, or tags. The repository was subsequently connected to GitHub
and received the CI hardening summarized below.

## Scope

This scope records the repository state on the audit date. Later CI-hardening commits
were not part of the original scan.

- 100 reachable commits across all refs
- 19 tags, including nine `vuln/*` and nine paired `fix/*` tags
- Eight local branch refs
- Current working tree and all seven merge-commit tree snapshots
- Credential-shaped content, sensitive filenames, publication-sensitive metadata, private infrastructure references, and large tracked artifacts

## Secret-scan evidence

- Tool: Gitleaks 8.30.1 with its default rules
- Git-history mode: `--log-opts=--all`, fully redacted report
- Result: 93 content-bearing non-merge commits scanned; two findings
- Supplemental coverage: all seven merge-commit trees extracted and scanned directly
- Reachable-commit accounting: 93 non-merge commits + 7 merge snapshots = 100 reachable commits

The two findings are the same false-positive class:

- Rule: `generic-api-key`
- File: `security/detections/sample-vulnerable-phase3-concurrency.jsonl`
- Field: synthetic `idempotency_key` values
- Classification: not credentials and not accepted by any external service

A raw report was not retained in the repository because even redacted scanner reports are unnecessary publication artifacts. Future Gitleaks policy should suppress only these exact reviewed fixture findings, not the rule globally.

## Manual review

- The intentionally weak JWT value in `vuln/phase-4-jwt` is a synthetic wordlist entry used only by the local exploit demonstration.
- Fixed `main` does not hardcode that JWT value. Container startup generates a random secret when none is supplied, and application code enforces a minimum length.
- No `.env` files, private keys, certificates, credential files, databases, dumps, logs, packet captures, archives, or backups were found in reachable history.
- No tracked blobs larger than 1 MB were found.
- No developer home-directory paths or RFC1918 private-network addresses were found in reachable history.
- URLs in security fixtures are limited to loopback or reserved test/example domains.
- Fixture email domains are reserved test domains.
- Git commit metadata contains one personal Gmail author address. The address is not reproduced in this audit, but publishing the repository would disclose it permanently through commit metadata.

## Decision

From a credentials and infrastructure standpoint, the repository is suitable for public publication as an intentionally vulnerable, loopback-only educational project. No history rewrite is needed for secrets.

The owner confirmed that the existing author email may remain in published Git history. No history rewrite is required. This preserves the validated commit and tag graph.

Future commits should use the owner's exact GitHub-provided `noreply` address, configured at repository scope unless a global change is explicitly desired.

## Repository follow-up

Status as of 2026-08-25:

- GitHub Actions uses read-only repository permissions, SHA-pinned actions, and
  credential persistence disabled at checkout.
- Main-branch CI runs the full project check, exploit and detection script syntax
  checks, detection-fixture replay, and a Docker build and boot smoke test.
- A pinned Semgrep scan protects fixed application source and Docker configuration
  against regression to demonstrated vulnerability patterns.

Remaining follow-up:

- Keep vulnerable-tag scanning non-blocking and separate from clean-main protection.
- Preserve the loopback-only runtime and ephemeral-CI guardrails.

Completed on 2026-08-25:

- Added a narrow Gitleaks exception limited to the reviewed synthetic
  idempotency-key fixture value and its exact file.
- Added the MIT License and updated the README for public portfolio use.
