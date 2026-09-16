# Reviewer Markdownlint Ownership Policy Implementation Plan

Issue: #1581

Governing design:
`docs/superpowers/specs/2026-09-11-1581-reviewer-markdownlint-policy-design.md`

## Goal

Replace the incident-specific reviewer Markdownlint exclusions with one durable,
narrow ownership rule while proving that reviewer bytes remain immutable and
author-controlled collateral remains linted.

## Task 1: Pin the structural policy with failing tests

Files:

- Modify: `scripts/tests/unit/task-tracker/core/quality-config.test.mjs`

Steps:

1. Define the canonical reviewer ignore glob.
2. Assert it appears exactly once in `.markdownlint-cli2.jsonc`.
3. Assert no ignore entry is an exact generated reviewer artifact path.
4. Retain the existing prohibition on the broad review-directory ignore.
5. Run the focused test and confirm it fails against the current five-entry list.

Verifier:

```bash
node --test scripts/tests/unit/task-tracker/core/quality-config.test.mjs
```

## Task 2: Pin live reviewer-versus-owner behavior

Files:

- Modify:
  `scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs`

Steps:

1. Replace the #1580-only inventory with all five exact reviewer exclusions being
   displaced.
2. Resolve their expected hashes from
   `scripts/tests/fixtures/legacy-review-archive-sha256.json` and verify every file.
3. Create an isolated project scratch directory containing the live Markdownlint
   configuration, a canonical reviewer artifact, and a canonical owner response.
4. Give both synthetic files the same MD038-invalid quoted-code content.
5. Prove the reviewer artifact is ignored and the owner response is reported.
6. Run the focused integration test and confirm it fails until the config changes.

Verifier:

```bash
node --test scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs
```

## Task 3: Replace the denylist and document ownership

Files:

- Modify: `.markdownlint-cli2.jsonc`
- Modify: `docs/superpowers/reviews/README.md`

Steps:

1. Remove the five exact reviewer artifact entries.
2. Add `docs/superpowers/reviews/**/*-reviewer-*-review.md` once.
3. Document that Markdownlint uses the canonical generated role grammar as the
   immutable reviewer boundary.
4. State explicitly that owner responses, manifests, copied artifacts, specs, and
   plans remain linted.
5. Rerun both focused tests and inspect their output.

## Task 4: Verify and deliver

1. Run the repository-owned Develop verifier.
2. Commit all implementation changes with #1581 attribution and record the commit
   trace.
3. Stamp each acceptance criterion from its declared verifier evidence.
4. Run `npx aitm test 1581` and require an exact-head isolated Test receipt.
5. Run `npx aitm review 1581`, record Full-Auto approval, push the reviewed head,
   and open the PR against `trunk`.
6. Require all hosted checks for the exact PR head to pass.
7. Use `npx aitm deliver 1581`; perform only the sanctioned provider action emitted
   by a valid envelope; rerun delivery to obtain the live receipt.
8. Close with `npx aitm close 1581` and verify GitHub Closed/Done state.

Root verification commands are authoritative in the issue body:

```bash
node --test scripts/tests/unit/task-tracker/core/quality-config.test.mjs
npm test
npm run lint
npm run format:check
npm run test:slow
git log --oneline -1
```

## Rollback

If the glob proves broader than the canonical reviewer grammar, revert the
configuration, README, and test changes together. Do not edit or regenerate reviewer
artifacts during rollback.
