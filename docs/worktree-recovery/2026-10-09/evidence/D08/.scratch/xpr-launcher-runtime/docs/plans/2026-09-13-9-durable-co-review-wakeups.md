# Durable Co-Review Wakeups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This issue executes serially in the main session; do not dispatch subagents.

**Goal:** Add a host-owned, restart-safe coordinator that wakes the exact dormant co-review participant once per actionable durable protocol revision without consuming model context while idle.

**Architecture:** A pure decision module derives a bounded pointer capsule only from validated protocol authority. An immutable ledger and exclusive coordinator lease make provider delivery idempotent and non-stealing. A foreground service and one-shot reconcile command share the same read/validate/decide/reserve/deliver path and adapt the existing live-wait and official native-push transports.

**Tech Stack:** Node.js 24+ ESM, built-in `node:fs`, `node:crypto`, `node:test`, existing `AprError`, protocol service, path containment, canonical JSON, transport registry, CLI parser/help/golden infrastructure.

**Spec:** `docs/design/2026-09-13-9-durable-co-review-wakeups-design.md`

## Global Constraints

- `events.jsonl` remains the sole review-state authority; coordinator code never appends role or lifecycle events.
- The composite wake key is exactly `(review_id, protocol_revision, target_role, session_fingerprint)`.
- Canonical capsule bytes must be no larger than 2,048 UTF-8 bytes.
- Raw provider handles, artifact/review prose, response bodies, full projections, and secrets never enter ledger or CLI output.
- Ambiguous provider delivery becomes `outcome-unknown` and is never automatically retried.
- All filesystem paths remain physically contained in the review workspace and reject symlinks.
- The protocol mutation mutex and coordinator lease remain separate; absence of either grants no turn authority.
- Existing manual, resume-only, live-wait, native-push, event, claim, handoff, finalization, and archive behavior stays compatible.

---

### Task 1: Pure wake decision and pointer capsule

**Files:**

- Create: `src/coordinator/decision.mjs`
- Create: `test/unit/coordinator-decision.test.mjs`
- Modify: `src/errors.mjs`

**Interfaces:**

- Consumes: `{ state, events }` returned by `inspectReviewAuthority(workspace)`, a byte-verified delivery descriptor, and one validated participant observation.
- Produces: `decideWake({ authority, delivery, observation, workspace, platform })` returning a frozen `idle|wake|terminal|intervention|refused` decision; `canonicalWakeCapsule(decision)` returning exact canonical bytes; `wakeOperationKey(decision)` returning `sha256:<hex>`.

- [ ] **Step 1: Write the failing authority-selection tests**

```js
test('derives the exact actionable role and revision from authority', () => {
  const decision = decideWake({
    authority: reviewerTurnAuthority(),
    delivery: reviewerDelivery(),
    observation: currentReviewerObservation(),
    workspace: '/repo/.scratch/peer-review/review-01',
    platform: 'linux',
  });
  assert.equal(decision.kind, 'wake');
  assert.equal(decision.capsule.target_role, 'reviewer');
  assert.equal(decision.capsule.expected_revision, decision.authority_revision);
});
```

Cover unchanged revision, wrong delivery recipient, missing receipt, stale lease, session-fingerprint mismatch, non-actionable turn state, terminal author notification, intervention recovery, surviving lock evidence, and propagated integrity errors.

- [ ] **Step 2: Run the decision test and witness the missing-module failure**

Run: `node --test test/unit/coordinator-decision.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/coordinator/decision.mjs`.

- [ ] **Step 3: Implement the closed decision and capsule schemas**

```js
export function decideWake({ authority, delivery, observation, workspace, platform }) {
  const role = authority.state.protocol.current_actor;
  if (role === null) return terminalDecision(authority, workspace, platform);
  assertMatchingDelivery(authority, delivery, role);
  const participant = authority.state.participants[role];
  const resident = validateWakeObservation(observation, participant);
  const capsule = Object.freeze({
    schema: 'ai-peer-review.wake-capsule/v1',
    review_id: authority.state.protocol.review_id,
    expected_revision: authority.state.protocol.revision,
    target_role: role,
    reason: 'role-actionable',
    next_command: renderCommand(['peer-review', 'resume', workspace], { platform }),
  });
  assertCapsuleSize(capsule, 2048);
  return freezeWakeDecision(authority, delivery, resident, capsule);
}
```

Use exact-key validation and existing `AprError` conventions for `APR_WAKE_CAPABILITY_UNAVAILABLE`, `APR_WAKE_CONFLICT`, and `APR_WAKE_OUTCOME_UNKNOWN`.

- [ ] **Step 4: Run focused tests and mutation controls**

Run: `node --test test/unit/coordinator-decision.test.mjs`

Expected: PASS, including tests that alter role, revision, fingerprint, receipt digest, and capsule size one at a time.

- [ ] **Step 5: Commit the decision layer**

```bash
git add src/coordinator/decision.mjs src/errors.mjs test/unit/coordinator-decision.test.mjs
git commit -m "feat(coordinator): derive bounded wake capsules [#9]"
```

### Task 2: Immutable wake ledger and owned coordinator lease

**Files:**

- Create: `src/coordinator/ledger.mjs`
- Create: `src/coordinator/lease.mjs`
- Create: `test/unit/coordinator-ledger.test.mjs`
- Create: `test/unit/coordinator-lease.test.mjs`
- Reuse: `src/protocol/store.mjs`
- Reuse: `src/collateral/paths.mjs`

**Interfaces:**

- Consumes: Task 1 `wakeOperationKey(decision)` and `canonicalWakeCapsule(decision)`.
- Produces: `reserveWakeOperation(workspace, decision, now)`, `appendWakeOutcome(workspace, operationId, outcome, now)`, `readWakeOperation(workspace, operationId)`, `acquireCoordinatorLease(workspace, owner, now)`, and `inspectCoordinatorLease(workspace, now)`.

- [ ] **Step 1: Write failing ledger and lease tests**

```js
test('exact retry returns one immutable operation', () => {
  const first = reserveWakeOperation(workspace, decision, NOW);
  const retry = reserveWakeOperation(workspace, decision, LATER);
  assert.deepEqual(retry, first);
  assert.equal(files('wake/operations').length, 1);
});

test('a foreign coordinator lock is never removed', async () => {
  const first = await acquireCoordinatorLease(workspace, ownerA, NOW);
  await assert.rejects(acquireCoordinatorLease(workspace, ownerB, NOW), {
    code: 'APR_COORDINATOR_OWNED',
  });
  assert.equal(readLease(workspace).instance_id, first.instance_id);
});
```

Cover composite-key changes, conflicting capsule bytes, exclusive create races, unknown fields, torn JSON, symlinked wake directories, physical path escape, additive outcome sequence, nonterminal operation recovery, stale diagnostic PID, and exact-owner cleanup.

- [ ] **Step 2: Run both focused files and witness missing-module failures**

Run: `node --test test/unit/coordinator-ledger.test.mjs test/unit/coordinator-lease.test.mjs`

Expected: FAIL with missing coordinator modules.

- [ ] **Step 3: Implement contained canonical ledger records**

```js
export function reserveWakeOperation(workspace, decision, now = new Date()) {
  const operationId = wakeOperationKey(decision);
  const operation = operationRecord(operationId, decision, now);
  const file = containedWakePath(workspace, 'operations', `${digestName(operationId)}.json`);
  return createOrVerifyCanonical(file, operation, 'APR_WAKE_CONFLICT');
}

export function appendWakeOutcome(workspace, operationId, outcome, now = new Date()) {
  const projection = readWakeOperation(workspace, operationId);
  const sequence = projection.outcomes.length + 1;
  const record = validateOutcome(operationId, sequence, outcome, now);
  atomicCreate(containedOutcomePath(workspace, operationId, sequence), canonicalBytes(record));
  return readWakeOperation(workspace, operationId);
}
```

Use the package's exclusive-create/fsync primitives. Never rewrite the operation or an outcome record.

- [ ] **Step 4: Implement exact-instance coordinator ownership**

```js
export async function acquireCoordinatorLease(workspace, owner, now, operation) {
  return withExclusiveCoordinatorLock(workspace, async ({ lockFile, token }) => {
    const lease = createLease(workspace, owner, token, now);
    writeLeaseAtomically(workspace, lease);
    try {
      return await operation(createLeaseController(lease));
    } finally {
      removeOnlyMatchingLease(workspace, lease);
    }
  });
}
```

Lease inspection reports evidence; it never infers liveness from a PID or deletes a foreign lock.

- [ ] **Step 5: Run ledger, lease, and store regression tests**

Run: `node --test test/unit/coordinator-ledger.test.mjs test/unit/coordinator-lease.test.mjs test/unit/store.test.mjs`

Expected: PASS with zero temporary files left behind.

- [ ] **Step 6: Commit durable operation storage**

```bash
git add src/coordinator/ledger.mjs src/coordinator/lease.mjs test/unit/coordinator-ledger.test.mjs test/unit/coordinator-lease.test.mjs
git commit -m "feat(coordinator): persist idempotent wake operations [#9]"
```

### Task 3: Shared reconciliation loop and wake adapters

**Files:**

- Create: `src/coordinator/service.mjs`
- Create: `test/integration/coordinator-wake.test.mjs`
- Modify: `src/transport/registry.mjs`
- Modify: `src/transport/live-wait.mjs`
- Modify: `src/transport/native-push.mjs`
- Modify: `test/unit/transport.test.mjs`
- Modify: `test/mcp/wait.test.mjs`
- Modify: `test/mcp/server.test.mjs`

**Interfaces:**

- Consumes: Task 1 decisions, Task 2 operation/lease APIs, `inspectReviewAuthority`, delivery receipt verification, and injected `WakeAdapter` methods `inspect`, `deliver`, `reconcile`, `close`.
- Produces: `reconcileWake({ workspace, observation, adapter, now, platform })` and `runCoordinator({ workspace, observation, adapter, watch, scheduler, signal, now })`.

- [ ] **Step 1: Write the failing end-to-end coordinator fixture**

```js
test('durable handoff precedes one wake and restart reconciles missed hints', async (t) => {
  const review = await twoParticipantReview(t);
  await submitAuthorHandoff(review);
  assert.equal(readAuthority(review).state.protocol.current_actor, 'reviewer');
  assert.equal(readDeliveryReceipt(review).recipient, 'reviewer');

  const first = await reconcileWake(injected(review, crashAfterReservation));
  assert.equal(first.status, 'reserved');
  const recovered = await reconcileWake(injected(review, acknowledgedAdapter));
  assert.equal(recovered.status, 'acknowledged');
  assert.equal(acknowledgedAdapter.calls.length, 1);
});
```

The file must also simulate an unchanged 20-minute clock advance and assert zero adapter/model invocations and zero transcript/progress output; duplicate watcher hints; read-before-subscribe and post-subscribe rereads; missed notification; process replacement representing compaction; crash after protocol handoff before reservation; ambiguous delivery; terminal/intervention wake; integrity error; mutex presence/absence; and unsupported provider refusal.

- [ ] **Step 2: Run the integration file and witness the missing service**

Run: `node --test test/integration/coordinator-wake.test.mjs`

Expected: FAIL with missing `src/coordinator/service.mjs`.

- [ ] **Step 3: Implement the single-cycle reconciler**

```js
export async function reconcileWake(input) {
  const authority = inspectReviewAuthority(input.workspace);
  const delivery = newestVerifiedDelivery(input.workspace, authority);
  const decision = decideWake({ ...input, authority, delivery });
  if (decision.kind !== 'wake') return decision;

  const operation = reserveWakeOperation(input.workspace, decision, input.now);
  const reconciled = await reconcileExisting(operation, input.adapter);
  if (reconciled.terminal) return reconciled.projection;
  const deliveryResult = await input.adapter.deliver(exactDeliveryInput(operation));
  return appendWakeOutcome(input.workspace, operation.operation_id, deliveryResult, input.now);
}
```

Never call `deliver` for an existing `reserved` or `outcome-unknown` operation until adapter reconciliation proves `not-submitted`.

- [ ] **Step 4: Implement read-before-subscribe foreground observation**

```js
export async function runCoordinator(input) {
  return acquireCoordinatorLease(input.workspace, input.owner, input.now, async (lease) => {
    await reconcileWake(input);
    const queue = createCoalescedQueue(() => reconcileWake(input));
    const watcher = subscribeWorkspace(input.workspace, queue.hint, queue.fail, input.watch);
    try {
      await reconcileWake(input);
      return await queue.untilStopped(input.signal, lease);
    } finally {
      watcher.close();
      await input.adapter.close();
    }
  });
}
```

The scheduler invokes `reconcileWake`; it does not add a second timer-specific implementation.

- [ ] **Step 5: Adapt live-wait and native-push to exact operation delivery**

Require operation ID, capsule digest, expected revision, participant fingerprint, current resident lease, and official adapter identity. Sanitize thrown provider errors to a stable reason. Add `reconcile` behavior where the host supports it; otherwise return `outcome-unknown`.

- [ ] **Step 6: Run coordinator, transport, and MCP suites**

Run: `node --test test/integration/coordinator-wake.test.mjs test/unit/transport.test.mjs test/mcp/wait.test.mjs test/mcp/server.test.mjs`

Expected: PASS, including the unchanged-idle zero-callback assertion.

- [ ] **Step 7: Commit the coordinator service**

```bash
git add src/coordinator/service.mjs src/transport/registry.mjs src/transport/live-wait.mjs src/transport/native-push.mjs test/integration/coordinator-wake.test.mjs test/unit/transport.test.mjs test/mcp/wait.test.mjs test/mcp/server.test.mjs
git commit -m "feat(coordinator): reconcile durable participant wakes [#9]"
```

### Task 4: Closed CLI, public API, handoffs, and documentation

**Files:**

- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/cli/help-data.mjs`
- Modify: `src/public-api.mjs`
- Modify: `src/templates/index.mjs`
- Modify: `templates/author-startup.md`
- Modify: `templates/reviewer-invitation.md`
- Modify: `skills/peer-review/SKILL.md`
- Modify: `README.md`
- Modify: `docs/manual-cross-provider-peer-review.md`
- Modify: `test/unit/cli-parse.test.mjs`
- Modify: `test/golden/help.test.mjs`
- Modify: `test/golden/skill.test.mjs`
- Modify: `test/golden/templates.test.mjs`
- Modify: `test/packaging/package.test.mjs`
- Modify: `test/smoke/cli.test.mjs`

**Interfaces:**

- Consumes: Task 2 lease inspection and Task 3 service functions.
- Produces: the four `coordinator` subcommands, deterministic structured output, public host-integration exports, and polling-free automatic guidance.

- [ ] **Step 1: Write failing parser/help/public-API tests**

```js
assert.deepEqual(parse(['coordinator', 'reconcile', 'workspace', '--json']), {
  command: 'coordinator',
  args: ['reconcile', 'workspace'],
  options: { json: true },
});
assert.throws(() => parse(['coordinator', 'detach', 'workspace']), {
  code: 'APR_USAGE',
});
```

Assert exact grammar for `run|reconcile|status|stop`, refusal of extra positionals/unknown flags, JSON-safe errors, and the public export allowlist.

- [ ] **Step 2: Run parser, help, packaging, and smoke tests to witness failures**

Run: `node --test test/unit/cli-parse.test.mjs test/golden/help.test.mjs test/packaging/package.test.mjs test/smoke/cli.test.mjs`

Expected: FAIL because `coordinator` is absent from the closed catalog and public API.

- [ ] **Step 3: Add the closed command family and runner wiring**

```js
if (parsed.command === 'coordinator') {
  const [verb, workspaceArg] = parsed.args;
  const workspace = path.resolve(io.cwd, workspaceArg);
  response = await coordinatorCommand({ verb, workspace, io });
}
```

`run` remains foreground. `reconcile` is one-shot. `status` exposes bounded lease/cursor/outcome fields. `stop` verifies and signals only the exact local instance. JSON output never includes opaque handles or provider exception text.

- [ ] **Step 4: Update generated artifacts and human guidance**

Automatic guidance states that the host coordinator sleeps outside participant context and wakes only on an actionable revision. Remove repeated participant polling instructions while durable wake is active. Retain one labeled manual command: `peer-review status <workspace> --next`.

- [ ] **Step 5: Regenerate and verify deterministic golden fixtures**

Run the repository's existing golden update mechanism identified in `test/golden/help.test.mjs`, inspect every changed digest/fixture, then run:

`node --test test/golden/help.test.mjs test/golden/skill.test.mjs test/golden/templates.test.mjs`

Expected: PASS with no unresolved template placeholder and no participant-side polling loop.

- [ ] **Step 6: Run packaging and smoke boundaries**

Run: `npm run test:packaging && npm run test:smoke && npm pack --dry-run`

Expected: PASS; the package includes required coordinator modules and documentation but no scratch ledger files.

- [ ] **Step 7: Commit CLI and documentation**

```bash
git add src/cli src/public-api.mjs src/templates templates skills/peer-review/SKILL.md README.md docs/manual-cross-provider-peer-review.md test/unit/cli-parse.test.mjs test/golden test/packaging/package.test.mjs test/smoke/cli.test.mjs
git commit -m "feat(cli): expose durable wake coordination [#9]"
```

### Task 5: Full verification, evidence, and delivery readiness

**Files:**

- Modify only files required by verified failures found in this task.

**Interfaces:**

- Consumes: all prior task outputs.
- Produces: one clean committed exact head satisfying issue #9's root verification matrix.

- [ ] **Step 1: Run focused issue verification**

Run: `node --test test/integration/coordinator-wake.test.mjs`

Expected: PASS with explicit assertions for the 20-minute idle window, authoritative-before-wake ordering, one capsule, restart/missed-event recovery, fail-closed integrity, 2,048-byte bound, shared hint/timer decision, capability refusal, and unchanged protocol behavior.

- [ ] **Step 2: Run formatting and lint before heavy suites**

Run: `npm run lint && npm run format:check`

Expected: PASS with no source or documentation changes produced by verification.

- [ ] **Step 3: Run the complete test matrix**

Run: `npm test && npm run test:slow && npm run test:integration && npm run test:mcp && npm run test:packaging && npm run test:smoke`

Expected: every suite exits zero with no failed or cancelled required test.

- [ ] **Step 4: Verify the publish and Git boundaries**

Run: `npm pack --dry-run && git diff --check && git status --short && git log --oneline -1`

Expected: pack succeeds, diff check is clean, only deliberate final edits are present, and the head commit is attributed to `[#9]`.

- [ ] **Step 5: Commit any verification-driven corrections**

```bash
git diff --name-only
# Stage each listed, issue-owned path explicitly after inspecting its diff.
git commit -m "fix(coordinator): close verified wake edge cases [#9]"
```

Skip this commit when Step 4 proves the tree is already clean.

- [ ] **Step 6: Run AITM exact-head Test and protected Review**

Use the issue's declared root commands through `npx aitm test 9`, stamp each acceptance criterion from its cited exact-SHA receipt, run protected Review, push the exact branch head, require all hosted checks, and use AITM provider delivery/receipt reconciliation before the authorized Full-Auto close.
