# Verify accept-live before publishing reconciliation success

Use the executing-plans and test-driven-development skills for this leaf. The owning issue is #2147 and the companion draft consumer is #2149. The specification is `docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md`.

## Story Intent

- **Beneficiary:** Task operator reconciling an issue with its project board.
- **Capability:** Determine whether accepting the live state actually recorded the intended repair.
- **Need:** A rejected or dropped body write currently leaves the issue stale while reporting success.
- **Value or failure prevented:** The operator can investigate an incomplete write before relying on the cache or creating a branch.

## Global constraints

Use the existing issue lock, canonical body writer and failure-comment path. Preserve other reconcile modes and the soft-failure contract used by callers whose board move already committed. Keep the original frozen actor, branch, timing records and location history outside this change. Keep provider traffic in physical fixtures local and fail closed on unexpected requests.

## Review focus

Inspect repeated write attempts after a provider exception, the writer's three-way rebase, mixed modern and legacy representations, demotion of previously verified criteria and disagreement between a successful inner verification and the subsequent independent read. Compare changes in local state and audit evidence separately from the process exit.

## Implementation Tasks

### Task 1: Verify normalization before publishing success

#### Story Intent

- **Beneficiary:** Task operator using accept-live.
- **Capability:** See a truthful confirmed, failed or partial result before trusting the session cache.
- **Need:** An acknowledged write or a soft retry failure can otherwise hide missing issue state.
- **Value or failure prevented:** The operator retains evidence and avoids continuing with a stale binding.

#### Files

- Modify `scripts/task-tracker/verbs/reconcile.mjs`. Replace the accept-live snapshot write with a fresh-body transform and honor its returned status. Use narrow marker inspection alongside the existing state reader. Keep the no-drift cache recovery path behind unambiguous state validation.
- Add `scripts/tests/integration/task-tracker/reconcile-accept-live.test.mjs`. Use `createRuntimeRootFixture` and invoke the public CLI. Exercise real writer and readback paths. Permit only the expected fake-provider requests for the fixture repository and capture independent observations.
- Update existing stateful reconcile unit fixtures to persist writes and answer subsequent authoritative reads so the existing history, cache and demotion assertions still exercise their original behaviors.

#### Steps

1. Write the rejected-write, dropped-write and post-confirmation stale-readback tests. Execute them on the unchanged production source. Retain failing assertions showing exit or success-side effects.
2. Write fresh-base conflict and preservation cases for visits, ambiguous marker families and unrelated edits. Keep legacy behavior and successful write counts observable.
3. Implement B1 using the retry helper's closure form and named outcomes. Recheck the initial marker and history preconditions on the writer's fresh bases. Verify board, marker and expected visit before persisting cache and success audit. Report a confirmed remote effect with failed readback as partial.
4. Run the physical public-entry tests and existing related suites, then the repository checks. Commit scoped work with the issue number. Review the exact diff and record each disposition.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/reconcile-accept-live.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/reconcile-verb.test.mjs scripts/tests/unit/task-tracker/lib/reconcile-sentinel-drift.test.mjs scripts/tests/unit/task-tracker/lib/reconcile-no-drift-seed.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```
