# Durable Co-Review Wakeups Design

**Issue:** #9

**Status:** Proposed for Full-Auto approval

## Context

`ai-peer-review` already makes a role handoff durable before any transport runs. A submitted turn appends a mutex-protected event, updates the validated projection, writes a delivery receipt, and may then invoke a configured transport. The package also ships resident participant leases, one-shot Codex native push, and MCP `wait_for_handoff`, whose blocking wait consumes no model turns.

Those pieces do not yet form a durable wake system. A participant must already be inside a live MCP call or an operator must relay the next command. If both participant sessions are dormant, no process outside their transcripts watches the durable protocol state, remembers wake attempts, or reconciles a missed filesystem notification after restart. Issue #9 adds that missing host-owned layer without changing the event ledger's authority.

The prior sequencing condition is satisfied: the AITM #1219 co-review reached an accepted terminal attempt, AITM #1516 and #1406 are Done, and issue #21 delivered stable recovery-attempt and review-of-record semantics. Issue #10 remains downstream because phased review sessions will consume the wake boundary defined here.

## Goals

- Keep dormant participant sessions out of model context until durable authority assigns work or the review becomes terminal/actionable.
- Make one wake operation idempotent across duplicate filesystem hints, process restarts, missed notifications, and a crash between role handoff and provider delivery.
- Deliver a pointer-only capsule bound to the exact protocol revision, target role, and registered provider/session identity.
- Use one validated decision function for prompt filesystem delivery and low-frequency external reconciliation.
- Fail visibly when a configured host cannot durably wake its exact participant session.
- Preserve every existing claim, handoff, acceptance, intervention, finalization, archive, snapshot, reviewer-integrity, and non-stealing mutex rule.

## Non-goals

- Running provider model turns, parsing model output, or implementing headless review agents.
- Generic cross-window UI automation or session discovery by title, focus, recency, or coordinates.
- Making wake delivery or acknowledgement part of protocol authority.
- Treating a missing lock file, PID, process observation, or provider acknowledgement as proof of turn ownership or protocol progress.
- Replacing the current MCP waiter, native-push adapter, manual fallback, or participant leases.
- Installing a system daemon or scheduler. Hosts may run the foreground coordinator and invoke the one-shot reconcile command from their own timer.

## Invariants

1. `events.jsonl` and its validated projection remain the sole review-state authority.
2. A handoff event and delivery receipt exist before a wake operation can be reserved.
3. Every wake key is the tuple `(review_id, protocol_revision, target_role, session_fingerprint)`.
4. One key has one immutable capsule digest and at most one active provider-delivery attempt.
5. A provider timeout or ambiguous acknowledgement becomes `outcome-unknown`; it never authorizes blind reinjection.
6. Filesystem events are hints. Every decision rereads and validates the complete event chain, delivery receipt, workspace identity, participant identity, and current lifecycle.
7. Coordinator records contain no raw session handle, artifact prose, review prose, response body, full protocol snapshot, or secret.
8. The participant revalidates the expected revision and follows the exact next command after wake.
9. Coordinator ownership is independent of the short-lived protocol mutation mutex. Missing mutex state grants nothing; surviving foreign ownership is never stolen.
10. Terminal, integrity, capability, and intervention outcomes are durable and visible even when no participant can be activated.

## Architecture

The implementation has four narrow modules under `src/coordinator/`.

### Decision and capsule

`decideWake(input)` is pure. It consumes a validated authority snapshot plus a current participant transport observation and returns one of:

- `idle`: no delivery newer than the acknowledged coordinator cursor or the current role is not actionable;
- `wake`: an immutable operation key and pointer capsule;
- `terminal`: the author receives a finalization/status pointer when terminal protocol authority requires it;
- `intervention`: the authorized participant receives a bounded recovery pointer; or
- `refused`: identity, lifecycle, receipt, lease, lock, integrity, or capability preconditions failed.

Callers cannot select the target role or expected revision. The function derives both from `current_actor`, `next_action`, lifecycle, `turn_state`, the newest matching `delivery-written` event, and its byte-verified receipt. It requires the chosen participant's registered session fingerprint and a current validated resident observation.

The capsule schema is closed:

```json
{
  "schema": "ai-peer-review.wake-capsule/v1",
  "review_id": "review-...",
  "expected_revision": 4,
  "target_role": "reviewer",
  "reason": "role-actionable",
  "next_command": "peer-review resume /absolute/review/workspace"
}
```

`next_command` is rendered by the existing platform-aware command renderer. The canonical JSON capsule must remain at or below 2,048 UTF-8 bytes, a conservative proxy for the issue's 512-token ceiling. The size gate applies before any ledger or provider action.

### Wake ledger

The ledger lives under `<workspace>/wake/`, which remains ignored operational state. `operations/<sha256-key>.json` is created exclusively and contains:

- schema and composite key fields;
- capsule bytes and SHA-256 digest;
- registered session fingerprint and adapter identity;
- `reserved_at` and immutable review/delivery cursor fields; and
- a closed outcome: `reserved`, `acknowledged`, `outcome-unknown`, `refused`, or `superseded`.

Outcome changes are additive records under `outcomes/<operation-id>/<sequence>.json`; the immutable operation is never rewritten. A deterministic projection chooses the newest contiguous outcome. Exact retry of an existing operation returns its current projection. A different capsule, recipient, adapter, or cursor for the same key is `APR_WAKE_CONFLICT`.

All paths are resolved inside the physical review workspace, symlinks are refused, files use exclusive create and fsync, and records are canonical JSON with closed schemas. A crash after reservation leaves `reserved`; reconciliation must consult the adapter's operation reconciler before any delivery. An adapter without reconciliation converts a stale reservation to `outcome-unknown` and requires manual recovery.

### Coordinator lease

`acquireCoordinatorLease` holds an exclusive lock resource and writes a diagnostic lease containing the review ID, random instance ID, owner kind, nonce digest, heartbeat sequence/timestamps, and state. The lease does not prove liveness by itself. `stop` accepts a workspace, reads the current lease, and signals only the locally verified matching instance; it never accepts a caller-supplied PID and never deletes a foreign lock.

The foreground process exits on terminal review state, explicit matching stop, watcher error, workspace identity change, foreign lease replacement, integrity failure, or fatal internal error. It removes only its own matching lease artifacts.

### Coordinator service

`reconcileWake(workspace, dependencies)` performs one complete cycle:

1. Resolve and pin the physical workspace identity.
2. Read and validate protocol authority and matching delivery receipts.
3. Validate the coordinator lease and participant observation.
4. Call `decideWake`.
5. Return immediately for `idle`.
6. Create or load the immutable ledger operation.
7. Reconcile any existing nonterminal operation before delivery.
8. Invoke exactly one configured wake adapter with the exact capsule and operation ID.
9. Append a bounded outcome record and return a structured result.

`runCoordinator` does an initial reconcile before subscribing, subscribes to the workspace event/delivery directories, immediately reconciles again after subscription, and coalesces duplicate hints while a cycle is active. It never calls a model or emits periodic transcript messages. A host timer calls the same `coordinator reconcile` command at low frequency; there is no second decision path.

## Wake adapter contract

The coordinator uses an injected closed adapter:

```js
{
  name: 'mcp-live-wait' | 'codex-app-native-push',
  host: 'any' | 'codex',
  adapter_version: '2.0.0',
  async inspect({ participant, operation }): WakeObservation,
  async deliver({ operation_id, capsule, opaque_handle }): WakeDelivery,
  async reconcile({ operation_id, capsule_digest, opaque_handle }): WakeReconciliation,
  async close(): void
}
```

`mcp-live-wait` resolves an already registered resident wait through the existing delivery source and does not invoke a model. `codex-app-native-push` requires the official host adapter, a current lease, and the exact opaque handle held only in ignored runtime memory/scratch. Unsupported/manual/resume-only transports return `APR_WAKE_CAPABILITY_UNAVAILABLE` plus `peer-review status <workspace> --next`.

An adapter acknowledgement proves only transport acceptance. Protocol consumption remains proven by a later participant claim/submission event. Duplicate adapter acknowledgement is harmless because the operation ID and capsule digest are stable.

## CLI contract

The closed command family is:

```text
peer-review coordinator run <workspace>
peer-review coordinator reconcile <workspace> [--json]
peer-review coordinator status <workspace> [--json]
peer-review coordinator stop <workspace> [--json]
```

`run` is foreground-only. It does not detach or install a timer. `reconcile` is the scheduler-safe one-shot recovery entry point. `status` returns only bounded lease, cursor, and last-operation metadata. `stop` validates ownership and refuses foreign or stale instances.

Automatic startup and generated handoffs state whether durable wake is active, the adapter/capability that makes it possible, the foreground run command, and the universal manual fallback. When durable wake is active, guidance never tells participants to repeat `status`, `wait_for_handoff`, or progress messages. Manual mode retains one bounded `status --next` instruction.

## Failure behavior

- `APR_WAKE_CAPABILITY_UNAVAILABLE`: no exact-session wake adapter; no operation is created.
- `APR_WAKE_CONFLICT`: an existing key has different immutable bytes; preserve evidence and inspect.
- `APR_WAKE_OUTCOME_UNKNOWN`: a side-effecting delivery cannot be reconciled; do not retry automatically.
- `APR_COORDINATOR_OWNED`: a live/indeterminate coordinator lock already exists; never steal it.
- `APR_COORDINATOR_STALE`: the lease and lock evidence need explicit recovery; no PID inference.
- Existing `APR_EVENT_*`, `APR_DELIVERY_CONFLICT`, identity, claim, participant-loss, and reviewer-integrity errors pass through without being weakened.

Provider failures are sanitized before durable recording. Raw handles and provider exception text are not copied into ledger files or CLI JSON.

## Compatibility

Existing reviews, event schemas, delivery events, participant leases, MCP tools, transports, and CLI commands remain readable and unchanged. Coordinator data is derivative ignored state and therefore needs no protocol migration. Manual and resume-only reviews remain manual; they gain explicit capability reporting but are not silently upgraded.

The coordinator consumes the stable `record_id`/attempt behavior from #21 without using record identity as protocol or wake authority. Each operation remains keyed to one immutable `review_id` attempt.

## Testing strategy

Pure unit tests mutation-check role/revision derivation, lifecycle and turn-state gates, session fingerprint binding, receipt selection, command rendering, canonical capsule size, ledger path containment, schema closure, exclusive creation, additive outcomes, and lease non-stealing.

The integration test creates a real two-participant review with an injected wake adapter and proves:

- an unchanged 20-minute simulated window produces zero adapter/model calls and no transcript output;
- the handoff event and receipt exist before delivery is invoked;
- duplicate watcher hints produce one visible capsule;
- missed notification, restart, compaction-equivalent process replacement, and crash after handoff are recovered by the same reconcile path;
- terminal/intervention and integrity failures select the correct bounded result;
- unsupported hosts refuse before dormant automatic mode begins; and
- all existing protocol and transport suites remain green.

## Delivery and dependency

This issue ships as one PR because decision, ledger, and reconciliation must be mutually present to avoid either lost or duplicate wakeups. #10 begins only after #9 is delivered and closed, and it consumes this public coordinator boundary without duplicating wake logic.
