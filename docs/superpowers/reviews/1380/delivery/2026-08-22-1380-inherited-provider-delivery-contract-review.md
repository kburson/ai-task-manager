# #1380 Inherited Provider Delivery Contract Review

<!-- cspell:ignore reattribute -->

## Review boundary

- Base: `2eb7b96af3f61b48a42241f07c58823554d51e8a`
- Candidate head: `d3568a77460bc1465728ecb4b224d7b82b47fc85`
- Candidate commits: `daacb3de`, `b794b5ff`, `d3568a77`
- Controlling requirements: #1380 Scope and Acceptance Criteria; accepted #939 plan Task 6 at `54b0fcaa7e33cd2f2f03855c1d8969464b0d35fc`
- Excluded: live provider invocation, real pull-request acceptance, and changes to #939 Tasks 1–5 delivery or close semantics

This review treats the inherited commits as unaccepted implementation evidence. It does not rewrite, reattribute, or otherwise change #939 history.

## Contract trace

The shared host rule declares exactly two valid envelopes. Exit `20` with exactly one `AITM_PROVIDER_ACTION_REQUIRED:` line authorizes at most one provider call. A non-`20` exit with zero action lines never invokes a provider and obeys the command result, including the exit-zero verified-receipt path. Crossed or malformed envelopes invoke no provider, reconcile live state once, and then fail closed if the mismatch remains.

The rule's action object matches `scripts/task-tracker/lib/delivery-provider-action.mjs`: exactly 12 keys; schema `1`; positive safe issue and pull-request numbers; string action fields; the exact ULID, repository, lowercase SHA, ref, and merge-method predicates; and exact issue, PR, and expected-head attribution requirements for the commit bytes. The rule forbids trimming, normalization, refreshing, or substitution after parsing.

Codex and Claude declare the same `github.merge-pull-request` capability with `adapterContract: 'skill'` and `expectedHeadSha: true`. Grok explicitly maps the action to `null`. `scripts/task-tracker/verbs/deliver.mjs` remains provider-neutral: provider identity is recorded as data, but the call site contains no provider-name conditional. The host rule permits only the adapter's sanctioned integration and has no shell, wrapper, subprocess, or `gh pr merge` fallback.

The router discovers `rules/deliver.md`, whose load sentinel is exactly `aitm-skill-loaded:rules/deliver:1.0.0`. Canonical Codex, Claude, and Grok adapters name their host-specific integration or refusal. Checked-in `.agents` and `.claude` task stubs remain byte-identical to installer-generated output. The `bin/cli.mjs` change only exports the existing Codex stub generator so parity can be tested.

## Findings

No Critical or Important findings.

The live host may lack the declared sanctioned integration. This is expected and fail-closed: capability unavailability returns `missing-capability` and leaves the delivery intent pending. #1381 owns the live integration proof and real pull-request acceptance.

The shared rule is executable policy prose, so source-regex tests alone would be insufficient evidence. The review therefore checked transaction ordering and producer parity directly in addition to running the tests.

## Focused evidence

The focused aggregate passed 120 tests:

```text
node --test scripts/tests/unit/providers/registry.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs
```

Coverage includes provider registry and declarations, provider-neutral wiring, router and installed-stub parity, version stamping, envelope classification, exact action validation, no-shell behavior, reconciliation, and receipt-before-close ordering.

`git diff --check 2eb7b96a..d3568a77` also passed.

## Decision

The inherited candidate range satisfies #1380's frozen contract without source correction. Repository-wide verification and governed evidence stamping remain required before Test and Review.
