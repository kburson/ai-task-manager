# #1516 Author-Owned Finalization Contract Implementation Plan

**Goal:** Pin the extracted peer-review package's author-only terminal
finalization behavior at the AITM host boundary and document the operator
handoff.

**Architecture:** Extend the existing package parity integration fixture. Drive
the installed `peer-review` CLI through a normal committed review, observe its
public status, and assert Git effects. Do not modify or wrap package internals.

## Task 1: Add the failing host contract

**File:**
`scripts/tests/integration/review/peer-review-package-parity.test.mjs`

1. Generalize fixture coordinates so issue #1516 gets its own review
   destination.
2. Add helpers for explicit provider identities and an environment with all
   supported provider session variables removed.
3. Start and join a normal committed review, fill the reviewer response, and
   submit acceptance.
4. Assert `acceptance-pending`, author next-action routing, stable HEAD, and no
   terminal manifest.
5. Assert reviewer, foreign-author, and missing-identity finalization all fail
   before mutation.
6. Assert registered-author finalization creates exactly the expected terminal
   paths and that retry is idempotent.
7. Include a documentation assertion so the first focused run fails until the
   operator contract is written.

Run:

```bash
node --test --test-name-pattern="author-owned peer-review finalization remains package-governed" scripts/tests/integration/review/peer-review-package-parity.test.mjs
```

Expected initially: failure on missing operator guidance.

## Task 2: Document the author handoff

**File:** `docs/guides/github-native-coordination.md`

Add the `acceptance-pending` reviewer stop rule, the author-only finalization
rule, and the exact status command that reveals the next action. Preserve the
separate authenticated human good-enough authority.

Run the focused test again and expect success.

## Task 3: Verify and deliver

Run the focused verifier, lint, format, fast tests, and slow tests through the
governed Test receipt. Stamp each acceptance criterion at the exact
implementation SHA, complete Review and Full-Auto approval, open and merge the
PR only after hosted CI passes for the exact head, record the delivery receipt,
and close #1516 through AITM.
