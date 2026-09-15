# Durable workflow exceptions and read-only preflight implementation plan

> Parent: #1624
> Design authority: `docs/superpowers/specs/2026-09-14-1624-workflow-exceptions-design.md`
> Delivery: six serial governed children, no provider review launches

## Goal

Add a reusable, issue-scoped workflow-exception capability to AITM. A finite policy catalog and one evaluator must govern lifecycle transitions, source edits, resident actions, validators, completion, and managed provider launch boundaries. GitHub-native authorization records remain auditable across retries, revision, expiry, supersession, and revocation. An explicit-target preflight explains policy and future evidence without mutating any durable or session state.

The ordinary workflow remains unchanged without a valid record. Tests, evidence, ownership, dependencies, issue binding, state contiguity, commit provenance, CI, safe delivery, and external protection are not waivable through this feature. Planning outputs, plan approval, semantic review, human completion approval, and managed-provider denial remain independent.

## Architecture

New modules under `scripts/task-tracker/lib/workflow-policy/` own the closed requirement catalog, record schema, storage adapter, coherent snapshot, pure evaluator, and boundary revalidation. Callers declare the stable requirement IDs they consume; a coverage test refuses unmapped catalog entries. GitHub record persistence reuses canonical envelopes, exhaustive comment discovery, and exact read-back rather than introducing a second mutation mechanism.

The evaluator first derives baseline requirements, then validates authority and scope, applies only supported waivers, applies restrictive provider constraints, and finally evaluates retained evidence and dependencies. Each requirement has a policy outcome (`satisfied`, `waived`, `missing`, or `not-applicable`) and an orthogonal evaluation phase (`evaluated` or `pending-future-evidence`). Preflight and enforcement consume the same immutable decision shape, but every state mutation, edit, resident action, validator, completion action, and provider boundary obtains a fresh snapshot.

## Test discipline

Every task begins with a focused failing test that demonstrates the missing behavior. Implement only after observing the expected failure. Focused unit/integration tests run during iteration; each child also owns `npm test`, lint, and format evidence in its issue record. The final child adds slow lifecycle and packed-clean-install proof. Tests use deterministic fixtures and mocked GitHub/process/provider boundaries; no paid provider runs.

### Task 1: Add workflow policy catalog and evaluator core

Files:

- Create `scripts/task-tracker/lib/workflow-policy/catalog.mjs`.
- Create `scripts/task-tracker/lib/workflow-policy/scope-identity.mjs`.
- Create `scripts/task-tracker/lib/workflow-policy/evaluator.mjs`.
- Create `scripts/task-tracker/lib/workflow-policy/consumer-coverage.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/workflow-policy/catalog.test.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/workflow-policy/evaluator.test.mjs`.

Steps:

1. Write failing catalog tests for stable versioned requirement IDs, explicit bundle expansion, bundle-version rejection, independent planning/approval/review/completion families, restrictive provider denial, and immutable non-waivable requirements.
2. Write failing evaluator tests for baseline decisions, authorization input validation, explicit waivers, deny precedence, reason codes, authority references, remediation, and future-evidence phase.
3. Implement canonical scope identity over repository, issue, user story, scope, and criteria while excluding timing, checkbox state, and ordinary progress metadata.
4. Implement catalog and pure evaluator APIs without GitHub or filesystem dependencies.
5. Add explicit consumer applicability declarations and a fail-closed coverage assertion.
6. Confirm no-exception fixtures preserve existing baseline behavior.

Run: `node --test scripts/tests/unit/task-tracker/lib/workflow-policy/catalog.test.mjs scripts/tests/unit/task-tracker/lib/workflow-policy/evaluator.test.mjs`
Run: `npm test`

### Task 2: Add durable issue-scoped exception records

Files:

- Create `scripts/task-tracker/lib/workflow-policy/exception-record.mjs`.
- Create `scripts/task-tracker/lib/workflow-policy/exception-store.mjs`.
- Create `scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs`.
- Create `scripts/task-tracker/verbs/workflow-exception.mjs`.
- Update `scripts/task-tracker/task-tracker.mjs` and command-surface/help registries.
- Create `scripts/tests/unit/task-tracker/lib/workflow-policy/exception-record.test.mjs`.
- Create `scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs`.

Steps:

1. Write failing schema fixtures for identity, revision, disposition, provenance, principal, recording actor, origin/verification level, scope identity, timestamps, expiry, supersession, revocation, explicit requirements, deny constraints, and reason.
2. Write failing store tests for identical retry idempotency, revised policy, append-only history, exact read-back, concurrent active forks, partial explicit series, and transport ambiguity.
3. Reuse the repository's canonical record envelope and GitHub comment store; add a purpose-specific record validator and deterministic effective-record resolver.
4. Require an exact authorization source and preserved statement. Never infer authorization from labels, ordinary prose, Full-Auto, token ownership, caller booleans, or agent-authored quotes.
5. Return an authorization-resolution blocker with the supported human-confirmation route when the host cannot verify provenance.
6. Wire supported record, show, revise, and revoke operations with human and JSON output.

Run: `node --test scripts/tests/unit/task-tracker/lib/workflow-policy/exception-record.test.mjs scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs`
Run: `npm test`

### Task 3: Add mutation-free workflow preflight

Files:

- Create `scripts/task-tracker/lib/workflow-policy/snapshot.mjs`.
- Create `scripts/task-tracker/lib/workflow-policy/preflight.mjs`.
- Create `scripts/task-tracker/verbs/workflow-preflight.mjs`.
- Update `scripts/task-tracker/task-tracker.mjs` and command-surface/help registries.
- Create `scripts/tests/integration/task-tracker/verbs/workflow-preflight.test.mjs`.

Steps:

1. Write failing explicit-issue and explicit-target tests covering current Plan blockers, downstream edit/validation/completion conflicts, pending tests and CI, unavailable external protection, and remediation.
2. Build one coherent read-only snapshot from issue body/comments/project fields, repository state, dependencies, session/project policy, runtime capability, and current time.
3. Aggregate all discoverable requirements through the requested target instead of short-circuiting at the first guard.
4. Emit matching human-readable and versioned JSON reports with policy-compatible, blocked, and indeterminate outcomes.
5. Add spies proving no timer/binding mutation, GitHub write, repository write, persistent cache write, child process spawn, or provider request.
6. Document that preflight is advisory and future evidence/state changes remain conditional.

Run: `node --test scripts/tests/integration/task-tracker/verbs/workflow-preflight.test.mjs`
Run: `npm test`

### Task 4: Integrate exceptions into transitions and source edits

Files:

- Create `scripts/task-tracker/lib/workflow-policy/enforcement.mjs`.
- Update `scripts/task-tracker/states/plan.mjs` and affected `plan-exit-*` guards.
- Update `scripts/task-tracker/lib/plan-approved-guard.mjs` and `gate-resolve.mjs` integration.
- Update `scripts/task-tracker/source-edit-gate.mjs`.
- Update `scripts/task-tracker/lib/body-gates-entry-guard.mjs`.
- Update `scripts/task-tracker/lib/agent-review/validators/body-sections.mjs`.
- Extend existing Plan, source-edit, body-gate, and validator test suites.

Steps:

1. Add failing baseline tests reproducing the five planning-output refusals plus the separate approval refusal and complete downstream preflight.
2. Add valid/invalid exception tests at Plan exit and the source-edit boundary, including expiry, revocation, wrong identity, stale scope, ambiguity, and authority change after preflight.
3. Route all exception interpretation through boundary revalidation and the shared evaluator.
4. Keep planning outputs and approval independent; reconcile the resolver/direct-guard inconsistency against documented project/session policy without relaxing current defaults.
5. Make Test/Review body entry and semantic validators recognize only explicitly waived sections without producing plan/deep-dive/approval success markers.
6. Assert retained ownership, dependency, binding, contiguity, evidence, commit, CI, and delivery gates still refuse when unsatisfied.

Run: `node --test scripts/tests/unit/task-tracker/lib/guard-registry-plan-exit.test.mjs scripts/tests/integration/task-tracker/lib/source-edit-gate.test.mjs scripts/tests/unit/task-tracker/lib/body-gates-entry-guard.test.mjs`
Run: `npm test`

### Task 5: Integrate review completion and provider denial

Files:

- Update `scripts/task-tracker/lib/resident-action-runner.mjs` and ledger codecs/readers/writers.
- Update `scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs`.
- Update `scripts/task-tracker/lib/state-cursor.mjs`.
- Update `scripts/task-tracker/states/review.mjs` and completion/approval consumers.
- Update `scripts/task-tracker/lib/peer-review-adapter.mjs` and every managed launch/request caller.
- Extend resident, cursor, Review, approval, completion, and provider-adapter tests.

Steps:

1. Add failing tests showing skipped review is currently indistinguishable from success or blocks resident progression.
2. Introduce a truthful waived disposition and update every ledger, cursor, Review, reporting, and completion consumer to handle it explicitly.
3. Preserve historical failures and real receipts; emit no review-passed or review-complete marker for waived work.
4. Keep human completion approval independent and retain unresolved criteria, verification, protection, provenance, and delivery blockers.
5. Enforce managed-provider denial before process spawn or request submission across resident, retry, adapter, and Full-Auto paths.
6. Add process/request spies proving zero provider activity, while documenting that arbitrary external processes and GitHub delivery transport are outside this deny boundary.

Run: `node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs scripts/tests/integration/task-tracker/lib/peer-review-adapter.test.mjs`
Run: `npm test`

### Task 6: Verify workflow-exception lifecycle and package

Files:

- Create `scripts/tests/slow/task-tracker/workflow-exception-lifecycle.test.mjs`.
- Create or extend the package clean-install smoke fixture.
- Update `scripts/task-tracker/lib/runtime-capabilities.mjs` and evidence-v2 capability projection.
- Update CLI help and command-surface schema.
- Update `skill/shared/router.md`, state-walk/full-auto rules, and pickup directive.
- Update `docs/guides/workflow.md` and completion-report examples.
- Add `docs/superpowers/specs/2026-09-14-1624-workflow-exceptions-design.md`.

Steps:

1. Exercise ordinary and exception workflows from Backlog through Done, including resume from Plan, valid/expired/revoked/stale/concurrent/partial-series/mid-flight records, and independent setting combinations.
2. Supply genuine simulated test, approval, commit, CI, and delivery evidence; prove retained failures and external protection conflicts remain blockers.
3. Expose a versioned workflow-policy capability that adapters and preflight can inspect; updated consumers reject unsupported record versions clearly.
4. Align CLI help, task skill, lifecycle guidance, pickup behavior, and example completion reports with the implemented commands and truthful dispositions.
5. Pack the artifact and run a clean-install offline smoke test covering evaluator, schemas, commands, hooks, and documentation.
6. Run repository verification, report exact results, and keep the ai-peer-review repository and issues #57–#61 untouched.

Run: `node --test scripts/tests/slow/task-tracker/workflow-exception-lifecycle.test.mjs scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs`
Run: `npm pack --dry-run`
Run: `npm test`

## Delivery boundary

Completing #1624 proves the supported AITM artifact, not live consumer readiness. A separately authorized ai-peer-review task must install that artifact, inspect its capability, record the existing incident authorization through the supported provenance route, and run read-only preflight before resuming #57. Any remaining human-approval or GitHub-protection conflict stays visible and blocks delivery.
