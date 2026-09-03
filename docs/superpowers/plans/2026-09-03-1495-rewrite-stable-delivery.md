# Rewrite-stable evidence and cycle-scoped delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Work serially; this project does not authorize subagent dispatch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make content-equivalent Git rewrites reusable without falsifying evidence, and make reopened issue cycles independently deliverable and closable; prove it against disposable copies of #1490/#1488/#1485 before any real migration.

**Architecture:** A versioned evidence journal connects stable issue-cycle identities to content subjects, verification, acceptance, delivery, and close records. One protocol adapter separates the trusted tool runtime from governed source roots, with a generation-aware close service and explicit legacy enrollment. An offline real-Git/provider rehearsal exercises the public command path and denies production writes.

**Tech Stack:** Existing Node.js 22+ ESM package, `node:test`, Git CLI, current GitHub adapters, strict canonical JSON/digest helpers, `mutateIssueBody`, main-anchored local locking. No new runtime dependency or database.

**Tracking:** Epic #1495. Specification: `docs/superpowers/specs/2026-09-03-1495-rewrite-stable-delivery-design.md`.

## Hydrated backlog

All six children remain unassigned in Backlog. Epic #1495 also remains in Backlog; the governed planning bind assigned it to `kburson`. Sequence is serial; these dependencies are internal to #1495 and do not block or alter the existing defect issues.

| Sequence | Issue                                                           | Deliverable                                                               | Predecessor |
| -------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------- |
| 1        | [#1496](https://github.com/kburson/ai-task-manager/issues/1496) | Build an isolated real-Git rehearsal harness for evidence v2              | None        |
| 2        | [#1497](https://github.com/kburson/ai-task-manager/issues/1497) | Add content-addressed verification and immutable acceptance records       | #1496       |
| 3        | [#1498](https://github.com/kburson/ai-task-manager/issues/1498) | Link accepted content explicitly to PR delivery and target provenance     | #1497       |
| 4        | [#1499](https://github.com/kburson/ai-task-manager/issues/1499) | Make reopened close cycles and binding cleanup generation-safe            | #1498       |
| 5        | [#1500](https://github.com/kburson/ai-task-manager/issues/1500) | Integrate pinned-runtime evidence commands and explicit legacy enrollment | #1499       |
| 6        | [#1501](https://github.com/kburson/ai-task-manager/issues/1501) | Rehearse frozen 1490 1488 1485 histories and prepare gated rollout        | #1500       |

## Global Constraints

1. Node.js 22+ and ESM; retain the repository's current package/runtime support policy.
2. No new database, distributed coordination service, mandatory signing service, or runtime dependency in this epic.
3. Existing v1 behavior remains the default until an issue is explicitly enrolled in v2; no silent legacy receipt upgrade or fallback after v2 enrollment.
4. Keep original evidence immutable as historical statements. Append relationships; do not fabricate executions, retroactive approval, or provider observations.
5. No production mutation of #1490/#1488/#1485 during implementation or rehearsal. No push, reset, rebase, merge, checkout, cleanup, or ref update in their source worktrees.
6. The first release supports one explicitly designated authority host per enrolled repository and serialized writers on that host. Other hosts are read-only; unsupported distributed mutation refuses before effects.
7. Execute children serially. Use recorded governed implementation worktrees and the existing one-step lifecycle gates. No automatic review approval, issue closure, or production cutover.
8. Rehearsal uses independent Git object storage and authority roots, a local bare remote, synthetic issue identities, and an offline write-capable provider double. Production network credentials and transport are unavailable to the rehearsal.
9. Hash raw content deterministically; use algorithm-tagged digests. Do not omit files, normalize source whitespace, or infer semantic equivalence to gain a passing match.
10. Acceptance, delivery, workflow completion, and local cleanup are separate facts; failed cleanup must never erase delivery or authorize clearing a later/foreign binding.

---

## A. Execution checkpoints and delivery topology

This is an epic-level implementation plan with six reviewable children. Each child owns the named interfaces, code surface, tests, and docs below; refine its estimates and refresh line-level locations at pickup. The child issue contains scope/AC/VC and references this plan, not a fabricated completed deep dive. Planning completion does not promote these issues or start coding.

The planning worktree is `.worktrees/rewrite-stable-delivery-plan` on `codex/rewrite-stable-delivery-plan`. At execution pickup inspect the epic's recorded binding and reuse its authorized branch/worktree; do not create a substitute if planning has already established that binding. Sequential child changes integrate into the recorded epic branch under existing branch-authority rules; the assembled architecture is delivered through one reviewed epic PR. Do not introduce a custom branch alias for #1220. Confirm the actual recorded topology before executing child delivery commands; never synthesize the target from an issue number.

Before each child: inspect the latest user instructions, refresh trunk and the previous child's accepted delivery, use the child's recorded worktree, run repository seeding and verify `node_modules/ai-task-manager -> ..`, obtain normal planning/development authority, and keep unrelated dirty work intact. No operation runs against the three protected worktrees. Before history rewrite/push/merge show exact refs, merge-base, prospective integration, content delta and current evidence. Settle history before collecting final Test/approval receipts.

During Develop use `node scripts/task-tracker/verify-develop.mjs` plus the child's explicit focused commands. Full fast/slow lanes run in the normal isolated Test stage. Plan snippets are contract examples, not instructions to mutate live issue bodies or fabricate production records. All new APIs listed below are supplied by their owning task before consumers use them.

## B. Module boundaries and public interfaces

New production modules live in `scripts/task-tracker/lib/evidence-v2/`:

| Owner  | Module                   | Exported contract                                                                                                                                                  |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task 2 | `codec.mjs`              | `createRecord(envelopeWithoutId)`, `encodeRecord(record)`, `decodeRecord(comment, context)`, `recordDigest(value)`; strict schema/version/identity validation      |
| Task 2 | `journal.mjs`            | `readJournal({repositoryId,issueNumber,ports})`, `appendRecord({expectedHead,record,authority,ports})`; exhaustive read-back, idempotency, fork refusal, host lock |
| Task 2 | `subject.mjs`            | `buildEvidenceSubject({repositoryId,sourceRoot,requirements,recipe,environment,gitInputs,ports})` -> immutable subject with `subjectId`                            |
| Task 2 | `eligibility.mjs`        | `evaluateReuse({candidate,verification,policy})` -> `{status,reasons,priorVerificationId,candidateId}`                                                             |
| Task 2 | `acceptance.mjs`         | `authorizeAcceptance({cycle,candidate,verificationRecords,reviewAuthority,policy,target})` -> acceptance payload or typed refusal                                  |
| Task 3 | `delivery.mjs`           | `resolveDeliveryIntent({acceptance,pr,policy,operation})`, `verifyDelivery({intent,observations,ports})` -> immutable delivery record payload                      |
| Task 4 | `cycles.mjs`             | `projectCycle(records)`; `planCycleOpen({projection,reason,externalEvent,authority,operation})` -> cycle-open record payload                                       |
| Task 4 | `close-machine.mjs`      | `planCloseEffects({cycle,live,authority})` -> `{status,nextEffect,expected,operationKey}`; no effects                                                              |
| Task 4 | `close-runner.mjs`       | `executeCloseEffect({plan,ports})` -> verified checkpoint; `resumeClose({context,ports})` -> `{status,cycleId,transactionId,cleanup}`                              |
| Task 4 | `binding-generation.mjs` | `inspectBindingGeneration({context,ports})`, `releaseBindingGeneration({expected,ports})`; compare-and-clear under authority lock                                  |
| Task 5 | `execution-context.mjs`  | `resolveExecutionContext({toolRoot,sourceRoot,authorityRoot,providerMode,ports})` -> immutable context or typed refusal                                            |
| Task 5 | `migration.mjs`          | `inspectEnrollment({context,issue,ports})` -> digest-bound read-only plan; `enrollIssue({planDigest,context,operation,ports})` -> verified import/enrollment       |
| Task 5 | `protocol.mjs`           | `selectEvidenceProtocol({body,context})` -> `v1` or `v2`, never fallback from malformed/enrolled v2                                                                |

`ports` is an explicit capability object, not a bag of asserted outcomes. Its required capabilities are `git`, `provider`, `journalTransport`, `authorityLock`, `sourceRetention`, and `clock`; mutation methods are absent from read-only instances. The rehearsal supplies the same interface through offline adapters. No module may reach raw `gh`, another checkout's `node_modules`, global state, or an implicit current working directory behind this boundary. `createRecord` wraps the envelope/payload and calculates `recordId`; `encodeRecord` returns the strict comment body. Candidate records contain `payload.subject` with its `subjectId`; eligibility consumes candidate/verification records, not unwrapped subjects. Domain payload builders are wrapped by `createRecord` before persistence.

Add tests under `scripts/tests/unit/task-tracker/lib/evidence-v2/`, `scripts/tests/integration/task-tracker/evidence-v2/`, and `scripts/tests/slow/task-tracker/evidence-v2/`. Add helper modules under `scripts/tests/helpers/evidence-v2/`. Register files through the repository's current canonical test discovery/impact manifest as needed; do not invent a parallel test runner.

## Task 1: Independent real-Git rehearsal foundation and baseline contracts

**Deliverable:** A production-isolated harness that executes Git history operations and public AITM command plumbing against a stateful offline provider, with captured-v1 failure fixtures. This is test infrastructure, not an alternate workflow implementation.

**Files:**

- Create `scripts/tests/helpers/evidence-v2/sandbox.mjs`, `provider.mjs`, `faults.mjs`, `fixtures.mjs`.
- Create `scripts/tests/integration/task-tracker/evidence-v2/isolation.test.mjs`, `provider-contract.test.mjs`, `legacy-shapes.test.mjs`.
- Create `scripts/tests/fixtures/evidence-v2/README.md` documenting synthetic IDs, provenance redaction and frozen-schema versions.
- Inspect existing `scripts/tests/helpers/close-convergence-wiring-helpers.mjs`, `scripts/task-tracker/lib/scratch-dir.mjs`, `scripts/task-tracker/lib/process-timeouts.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`.

**Interfaces:**

- `createSandbox({runId,sourceSnapshots,toolRoot})` -> `{root,context,provider,git,events,protectedBefore,dispose}`.
- `runCommand({sandbox,argv,operationId,fault})` invokes the real dispatcher with explicit context and captures `{exitCode,stdout,stderr,effects}`.
- `captureProtectedState({sources,readOnlyProvider})` returns digestable actual source/Git/provider/binding observations; `compareProtectedState(before,after)` returns `unchanged|changed|inconclusive`.
- `withFailure({point,attempt}, fn)` is a deterministic one-shot fault injector; `sandbox.restart()` clears process memory but preserves durable sandbox state.

- [ ] Read the production response contracts for issue/PR snapshots, receipt parsing, body mutation, timing, board updates and binding inspection. Build the offline provider from those actual shapes; create contracts that pass the same payload through production decoders.
- [ ] Write the negative isolation tests first. `gh` or HTTP/SSH production requests, a production Git common directory, object alternates, global hooks, a production remote, production issue IDs in a mutation request, or production runtime authority paths must throw before recording a side effect.

```js
const sandbox = await createSandbox({ runId: 'isolation-001', sourceSnapshots: [], toolRoot });
await assert.rejects(
  sandbox.provider.closeIssue({ repositoryId: productionRepositoryId, issueNumber: 1490 }),
  /rehearsal:production-target/
);
assert.deepEqual(
  sandbox.events.filter((e) => e.kind === 'external-write'),
  []
);
```

- [ ] Run `node --test scripts/tests/integration/task-tracker/evidence-v2/isolation.test.mjs`; confirm the intended missing guard fails, not an unrelated module-resolution error.
- [ ] Implement independent sandbox initialization using `git init`, a unique local bare remote, and object imports from pinned source OIDs. Enforce `realpath`/Git-common-directory separation and allowlist process invocations before execution. Do not copy production `.tmp`, credentials, config, or `node_modules`.
- [ ] Implement a provider event store for reads/writes, pagination, exact payload round-trips, lost responses and stale reads. Persist this store inside the sandbox so restart is meaningful. Synthetic fixture construction goes through real record builders.
- [ ] Encode the prior #1490 old-complete/new-claim and zero-step-only retry shapes, plus the same-tree #1488/#1485 pairs. Baseline tests identify expected v1 refusal, not pretend v1 already succeeds.
- [ ] Run the three Task 1 test files together and verify source protection. Commit only this child's harness, fixtures and tests with its actual issue token after the normal Develop verification.

## Task 2: Content-addressed verification, acceptance and durable journal

**Deliverable:** Strict v2 subjects/records, verifiable reuse decisions, and durable same-host serialized storage; v1 remains unchanged.

**Files:**

- Create Task 2 modules in section B.
- Create `scripts/tests/unit/task-tracker/lib/evidence-v2/{codec,subject,eligibility,acceptance}.test.mjs`.
- Create `scripts/tests/integration/task-tracker/evidence-v2/journal.test.mjs`.
- Inspect `scripts/task-tracker/lib/{verification-receipt,resident-action-ledger-codec,resident-action-ledger-write,body-invariants,issue-body-mutate}.mjs`.
- Extend `scripts/task-tracker/lib/body-invariants.mjs` only with dedicated v2 marker protection/advancement and focused tests.

**Interfaces:** Produce the Task 2 exports from section B. Consume Task 1's offline provider and real-Git source material. Record builders accept observed material, not literal `verified` flags.

- [ ] Write golden serialization tests and negative tests for unknown schema versions, wrong issue/repository/cycle, malformed digests, missing references, changed immutable payloads, forked predecessors, and conflicting duplicate operation keys. Assert zero subsequent effects.
- [ ] Implement canonical record hashing by reusing `canonicalJson` and SHA-256 helpers. Freeze returned records. Before remote append, atomically persist the pending operation's generated IDs, fixed timestamp and payload in the authority-host runtime directory. Journal appends must hold the main authority lock, reload expected head, create once, inspect uncertain outcomes by the original operation ID, and read back exact bytes. Record all duplicate physical IDs when identical content represents one logical event.
- [ ] Test both transport ambiguity and concurrency: same-host attempts serialize; a second enrolled host refuses; a competing predecessor/fork or unknown write outcome stops effects. Explicitly test that body version numbers are not treated as remote CAS.
- [ ] Write raw-content subject tests for metadata-only commit changes, whitespace changes, deletes, executable modes, symlinks, submodules/LFS material, dirty/untracked inputs, requirements/VC mutations, recipe/toolchain changes, and history-sensitive commands.

```js
const original = await buildEvidenceSubject(originalInputs);
const rewritten = await buildEvidenceSubject({ ...originalInputs, sourceRoot: rewrittenRoot });
assert.equal(original.subjectId, rewritten.subjectId); // identical declared raw inputs
const rewrittenCandidate = createRecord({ ...candidateEnvelope, payload: { subject: rewritten } });
const decision = evaluateReuse({
  candidate: rewrittenCandidate,
  verification: successfulExecution,
  policy,
});
assert.equal(decision.status, 'reuse');
assert.equal(successfulExecution.payload.testedCommitSha, originalCommitSha); // never rewritten
```

- [ ] Implement the exact spec section 5 fingerprint projection. Keep observations such as tested SHA, absolute path and clock outside content-only identity. Include Git inputs whenever sensitivity is not explicitly reviewed as content-only. Default incomplete v1 environment/recipe evidence to `verify`, not reuse.
- [ ] Implement acceptance validation: exact requirements/target and successful eligible evidence; no copying an approval merely because a PR or patch ID matches. Require explicit equivalence policy for transferring acceptance.
- [ ] Run all Task 2 unit files and `journal.test.mjs`, then the unchanged `scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs` suite; resolve any layout change through `rg --files scripts/tests` rather than assuming a renamed path.
- [ ] Add developer documentation of eligibility reasons and complete-input obligations. Commit the child under normal gates; do not enroll any issue.

## Task 3: Explicit acceptance-to-PR delivery lineage

**Deliverable:** Content-aware delivery proof through explicit records while preserving expected-head concurrency, target authority and configured method policy.

**Files:**

- Create `scripts/task-tracker/lib/evidence-v2/delivery.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/evidence-v2/delivery.test.mjs`.
- Create `scripts/tests/integration/task-tracker/evidence-v2/delivery-flow.test.mjs`.
- Modify `scripts/task-tracker/lib/{delivery-authority,delivery-verification,close-delivery-receipt}.mjs` and `scripts/task-tracker/verbs/deliver.mjs` through an explicit v2 adapter seam only.

**Interfaces:** Consume acceptance/candidate IDs and journal operations from Task 2. Produce v2 intent/delivery payloads from section B. Existing v1 functions retain their signatures and behavior.

- [ ] Write real-Git fixtures for metadata-only amend, multi-source squash, rebase on unchanged tree, rebase on changed base, dropped/reverted content, wrong target/repository/PR, and a provider head race.

```js
const intent = resolveDeliveryIntent({ acceptance, pr, policy, operation });
assert.equal(intent.acceptanceId, acceptance.recordId);
assert.equal(intent.prId, pr.id);
await assert.rejects(
  verifyDelivery({ intent, observations: { ...observations, headSha: advancedHead }, ports }),
  /delivery-v2:head-race/
);
assert.equal(provider.mergeCalls.length, 0);
```

- [ ] Implement explicit PR selection from the intent's provider ID. Verify accepted tree/material, target identity, observed landed object and provider authorization. Use current exact head SHA only for the provider concurrency precondition, not work identity.
- [ ] Separate content verification from merge-method compliance. Preserve squash-only default and retain/refuse missing method evidence accordingly; do not quietly switch this repository to method-agnostic policy.
- [ ] Append intent before provider action and delivery only after verified read-back. Retry lost responses using the original operation/intent, not a second PR or delivery.
- [ ] Test source branch and target advancement after a verified delivery. Ordinary movement does not erase history; explicit contradictory delivery observations still refuse current eligibility. No local HEAD equality gate may replace this policy.
- [ ] Run Task 3 tests plus existing `scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs`, `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`, and delivery recovery suites located through canonical discovery. Add an integration assertion that no v1 record schema or default behavior changes.
- [ ] Commit the bounded adapter and tests; no production enrollment or delivery.

## Task 4: Cycle-scoped close and generation-safe binding cleanup

**Deliverable:** A durable reopen/close state machine that resumes every prefix and distinguishes workflow completion from cleanup.

**Files:**

- Create Task 4 modules in section B.
- Create `scripts/tests/unit/task-tracker/lib/evidence-v2/{cycles,close-machine}.test.mjs`.
- Create `scripts/tests/integration/task-tracker/evidence-v2/{close-flow,binding-generation}.test.mjs`.
- Modify `scripts/task-tracker/verbs/close.mjs` with a v2 service delegation, not another inline recovery branch.
- Modify `scripts/task-tracker/lib/{occupancy,occupancy-lifecycle,worktree-binding-lifecycle}.mjs` and `scripts/task-tracker/session-state.mjs` for opt-in generation identity while retaining legacy readers.
- Inspect timing and lifecycle marker writers reached by close; supply cycle-aware operation keys through their existing APIs or narrow additive adapters.

**Interfaces:** Consume Task 2 journal and Task 3 delivery. Produce cycle projection, close plan/runner and binding APIs in section B. Binding generations are random stable claim IDs, not timestamps.

- [ ] Write projector tests for initial cycle, rebase within a cycle, completed cycle plus successor reopen, external reopen requiring reconciliation, duplicate reopen event, valid close prefixes, and forked successors.
- [ ] Implement cycle identity selection before phase-specific state guards. Old completed records remain historical; partial replacement/current-cycle progress is never interpreted as a request to restart the historical cycle.
- [ ] Write a table-driven public-command integration test for every effect boundary. Include timing, estimation, lifecycle, board, disposition, issue, labels and cleanup, each with failures before effect, after effect before response, and after response before checkpoint.

```js
for (const point of closeFaultPoints) {
  const run = await fixture.freshCycle();
  await run.command(['close', run.issueArg], { operationId: run.operationId, fault: point });
  await run.restart();
  await run.command(['close', run.issueArg], { operationId: run.operationId });
  assert.equal(run.project().completedCycles.length, 1);
  assert.equal(run.logicalEffects('review-to-done').length, 1);
  assert.equal(run.logicalEffects('timing-finalize').length, 1);
}
```

- [ ] Implement pure next-effect planning and effect/read-back/checkpoint execution. Preserve logical effect keys across retries and maintain explicit `unknown` outcomes until reconciled. No blanket replay of all steps and no literal manufactured completion flags.
- [ ] Introduce generation IDs at new claims, preserving them on heartbeat/pause. Under lock, compare full expected ownership before release. Test same-session rebind, foreign-session claim, paused/absent binding, release-before-checkpoint crash, and a legacy tombstone from the old close.
- [ ] Implement `closed; cleanup pending` distinctly from all-clean completion. Before-close foreign ownership refuses remote effects; a race after completion preserves the new claim and records cleanup pending. Retry cannot reopen the issue to clean local state.
- [ ] Run Task 4 tests and the existing `close-delivered-idempotence.test.mjs`, `close-convergence*.test.mjs`, supersession and binding lifecycle suites. The actual current filename is `idempotence`, not `idempotency`.
- [ ] Commit only after full public-command scenarios succeed; do not claim helper-only tests prove the path.

## Task 5: Runtime/source separation, legacy enrollment and complete CLI integration

**Deliverable:** A v2-aware runtime can inspect/enroll legacy state and operate on pinned source worktrees without rewriting them; v1 is still the default.

**Files:**

- Create Task 5 modules in section B and `scripts/task-tracker/verbs/evidence.mjs`, `scripts/task-tracker/verbs/reopen.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/evidence-v2/{migration,execution-context,protocol}.test.mjs`.
- Create `scripts/tests/integration/task-tracker/evidence-v2/{cli-contract,legacy-enrollment}.test.mjs`.
- Modify `scripts/task-tracker/runtime.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, `scripts/task-tracker/verbs/help-data.mjs`, and the actual dispatch mapping located at pickup.
- Modify the verify/Test/approve/deliver/close and resident-action input builders through a common protocol selector; audit all readers of accepted SHA, verification markers, delivered-close and binding authority.
- Modify `skill/shared/router.md`, add `skill/shared/rules/evidence.md`, update `skill/shared/rules/{close,deliver,review}.md` and `docs/guides/workflow.md`.

**Interfaces:** `aitm evidence inspect <N> --json`, `aitm evidence enroll <N> --plan-digest <digest> --operation-id <uuid>`, and `aitm reopen <N> --operation-id <uuid> --reason <text>`; rehearsal-only transport selection is explicit and cannot create production-eligible records.

- [ ] Write a runtime/source test with different tool and source roots. A v2 tool must inspect/test the pinned source, not itself, and no library import may fall back to a parent checkout. Record tool digest in execution provenance and verification recipe when relevant.
- [ ] Implement immutable execution-context resolution and read-only/mutating ports. Add a preflight assertion for source worktree authority, authority host, provider mode and installed runtime capability before any side effect.
- [ ] Write legacy-enrollment tests for #1490 complete-then-reopened, #1490 later-successful close, #1488/#1485 delivered-but-unreceipted, incomplete old verification inputs, missing dropped objects, stale migration plans, and malformed history.

```js
const preview = await inspectEnrollment({ context: readOnlyContext, issue, ports: readOnlyPorts });
assert.equal(provider.writes.length, 0);
await provider.externalChange({ issue, field: 'stateReason', value: 'COMPLETED' });
await assert.rejects(
  enrollIssue({ planDigest: preview.digest, context, operation, ports }),
  /migration-plan-stale/
);
assert.equal(journal.importWrites.length, 0);
```

- [ ] Implement import records that reference original bytes and hashes without claiming retroactive executions. Recoverable history is mapped to cycles; unknown history yields an explicit refusal or fresh-verification requirement. Current worktree/SHA state never overwrites historical evidence.
- [ ] Add a dedicated protected enrollment marker and require all v2 writes to use the common selector. Enrolled v2 corruption never falls back to v1. Install/test a supported command-entry capability guard outside the preserved source trees and verify resident automation compatibility before allowing enrollment. The guard must refuse incompatible runtime mutation; do not claim an unmodified old executable can detect a schema it never knew. Direct old source-script mutation after enrollment is forbidden, and an incomplete entry-point inventory blocks enrollment.
- [ ] Wire help, catalog, argument parsing, dispatcher, runtime ports, rule files and docs in one child. Test missing capability, incompatible flags, foreign host, no mutation from inspect, and every public command through the real dispatcher.
- [ ] Audit every remaining SHA comparison: classify as observation, concurrency precondition, Git-sensitive input, v1-only legacy contract, or prohibited work-identity join. Record the audit in the child handoff, including exact file/symbol and tests covering each v2 consumer.
- [ ] Run Task 5 suites, current help/catalog tests and all existing v1 delivery/close/verification integration suites. Commit the deployable opt-in integration; do not enroll the real issues.

## Task 6: Frozen-worktree rehearsal, disposal and human-gated rollout handoff

**Deliverable:** Repeatable practice against copies of #1490/#1488/#1485 with preserved artifacts and zero production mutation, followed by a reviewed go/no-go proposal.

**Files:**

- Create `scripts/maintenance/rehearse-evidence-v2.mjs` with subcommands `capture`, `run`, `inspect`, and `dispose`.
- Create `scripts/tests/slow/task-tracker/evidence-v2/frozen-worktree-rehearsal.test.mjs` and `scripts/tests/integration/task-tracker/evidence-v2/rehearsal-cli.test.mjs`.
- Create `docs/guides/evidence-v2-rehearsal.md` and `docs/guides/evidence-v2-rollout.md`.
- Reuse Task 1 adapters and Tasks 2–5 public runtime. No duplicate workflow implementation in the maintenance command.

**Interfaces:**

- `capture --sources-file <json> --output-root <owned-path>` produces an immutable source manifest after consistent read-only observation.
- `run --manifest <path> --tool-root <pinned-runtime> --provider recorded` imports source histories into an independent repo and executes the matrix.
- `inspect --run-manifest <path>` verifies hashes, coverage, production protection and report persistence; no mutation.
- `dispose --run-manifest <path> --confirm-run <runId>` refuses targets outside the exact manifest-owned sandbox, changed/unique unreported content, symlink escape, absent report, or remote production branches.

- [ ] Wait for the user to stop Claude or approve a consistent capture window. Read fresh HEAD/status twice around capture for each of the three sources. Do not assume the spec's baseline is still current or recreate an old failure in production.
- [ ] Write capture consistency, target/path isolation, credential/transport denial and disposal refusal tests before implementing the runner.
- [ ] Implement read-only object/snapshot capture, then branch import into the independent sandbox. Preserve original PR/issue receipt bytes in provenance; use synthetic IDs for executable fixtures. Register only a local bare push destination and separate sandbox AITM state.
- [ ] Run the full spec section 10 matrix using actual commit, rebase, squash, local push, public verify/approve/deliver/close/reopen and cold-process retry sequences. Fake human approval is allowed only as synthetic fixture authority, clearly tagged and rejected by production readers. Do not use real approval markers as permission to mutate production.
- [ ] Exercise #1490 then #1488 then #1485 in the rehearsal, as well as the original known-failure #1490 shape if the latest source now closes successfully. Include one changed-base case that must require re-verification and one late-binding race that must retain the newer claim.
- [ ] Preserve redacted report, source manifest, all command outcomes/fault points, runtime digest, raw input/output digest references and protected-state before/after comparisons outside the disposable repo. Every report states `productionEvidenceEligible: false`.
- [ ] Dispose only the manifest-owned sandbox after report verification. Rerun from retained fixture material to prove no hidden runtime state is required. No deletion in the original source worktrees or their Git common directory is allowed.
- [ ] Prepare a production handoff with exact pinned runtime, current source OIDs, read-only enrollment previews, per-issue plan digests, prerequisites, expected effects, retry instructions and rollback-to-paused-v2 procedure. Stop for separate human go approval. Do not merge rehearsal branches or replay rehearsal records into production.
- [ ] Run the new slow rehearsal suite in Test together with `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check` on the final candidate. Normal hosted checks and human review still apply.

## C. Coverage and release checklist

| Spec requirement                                                | Plan owner and decisive evidence                      |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Source/input identity, strict records, history-sensitive checks | Task 2 subject/eligibility/codec tests                |
| Immutable original evidence, host serialization, retry identity | Task 2 journal and Task 5 import tests                |
| Explicit PR/target delivery, no SHA search join                 | Task 3 real-Git delivery integration                  |
| Reopen as new cycle, every close prefix, no old-state reuse     | Task 4 projector and full-command fault matrix        |
| Exact binding generation, cleanup separate from completion      | Task 4 binding-generation/close-flow tests            |
| Runtime separate from source; complete consumer/CLI integration | Task 5 execution-context/CLI and SHA-comparison audit |
| Legacy default and opt-in import; no downgrade after enrollment | Task 5 protocol/migration regression                  |
| Independent sandbox, protected sources, disposable practice     | Tasks 1 and 6 isolation/protection/disposal evidence  |
| Real recovery requires fresh explicit human authorization       | Task 6 report and documented go/no-go gate            |

- [ ] All child AC/VC links point to real commands introduced by their task; no evidence box is prechecked at backlog creation.
- [ ] No original issue has been modified, assigned, blocked, paused, closed or reopened by this project before authorized cutover.
- [ ] No runtime, transport or data schema contains special-case production logic for 1490, 1488 or 1485.
- [ ] Every retry test restarts the process and preserves operation IDs; real effect/read-back boundaries are exercised.
- [ ] All v2 producers/consumers and hosted checks use the intended tool/source context; v1 defaults remain compatible.
- [ ] Planning artifacts and backlog are reviewed; refine estimates and branch topology before execution; no automatic implementation begins from this document.

## D. Operational handoff template

At release, produce a filled handoff containing the actual epic/child issues, spec/plan commit, runtime commit/digest, captured source refs/OIDs, report path/digest, scenario results, protected-state comparison, migration-plan digests, selected authority host, rollback policy and exact next command. If any value is unknown, report a concrete refusal and do not execute the production action. The planning baseline is never a substitute for these release observations.
