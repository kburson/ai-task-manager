# Task 6 Implementation Report

## Scope

Implemented the provider capability adapters and shared host delivery rule for
governed issue #939 from base
`2eb7b96af3f61b48a42241f07c58823554d51e8a`.

## TDD evidence

- RED: the provider registry/parity/stamp aggregate failed because
  `externalActions`, `rules/deliver.md`, its sentinel, and provider integration
  wording were absent.
- GREEN: the same focused aggregate passed after the minimal implementation.
- A strengthened Codex integration-surface assertion then failed until the
  adapter named the sanctioned `merge_pull_request` operation explicitly.

## Implementation

- Added the declarative `github.merge-pull-request` skill contract with required
  expected-head support to Codex and Claude.
- Added an explicit `null` unsupported declaration for Grok.
- Kept `deliver.mjs` provider-neutral and locked that boundary with a source
  assertion.
- Added `rules/deliver.md` with sentinel
  `aitm-skill-loaded:rules/deliver:1.0.0`, strict single-line parsing, capability
  lookup, exact action bytes, sanctioned-integration-only invocation, no shell
  fallback, mandatory reconciliation after every outcome, and receipt-before-
  close ordering.
- Routed `/task deliver #N` to the new JIT rule. The table separator and new row
  are intentionally compact and Prettier-ignored so the existing Tier-1 router
  token ceiling remains green.
- Named Claude's GitHub MCP and Codex's GitHub host `merge_pull_request`
  integration surfaces; Grok emits `missing-capability` guidance.
- Exported the existing Codex stub generator solely so parity tests can prove
  the checked-in `.agents` and `.claude` task skills remain byte-identical to
  installer output. Regeneration produced no byte changes to those already-
  synchronized stubs.

## Verification

- Focused provider registry/parity/stamp suite: pass.
- Complete Task 1-5 delivery regression aggregate plus router/provider tests:
  132 tests passed.
- Full fast suite: all 900 test files passed. The first run exposed only the
  router compression ceiling; after compacting the table syntax, the isolated
  regression passed and the full suite rerun was green.
- ESLint on changed JavaScript: pass.
- Prettier check on all changed files: pass.
- CSpell on all changed files: pass.
- `git diff --check`: pass.
- Repository-wide Markdown lint still reports eight pre-existing findings in
  Task 1-6 briefs/reports and an archived #939 design review; none is in a Task 6
  implementation file.

## Concerns

No implementation blocker. Task 7 must still confirm that the live host exposes
the named sanctioned integration before attempting the real provider action;
the shared rule fails closed when it does not.
