# Race-Safe MCP Wait Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local MCP `wait_for_handoff` tool that blocks without model
turns and returns each event-authorized peer-review delivery once per participant
cursor.

**Architecture:** Keep race handling in an SDK-independent `waitForHandoff`
function over a delivery-reader interface. Implement the reader with
check-before-subscribe filesystem notifications that always re-read
`events.jsonl` and the matching immutable receipt. Use the official MCP v2
server package only at the stdio wire boundary.

**Tech Stack:** Node.js 22 ESM, `node:test`, `fs.watch`,
`@modelcontextprotocol/server@2.0.0`, Zod 4 through the SDK dependency graph.

## Global Constraints

- Implement in the standalone `ai-peer-review` worktree at
  `/Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait`.
- Base the worktree on exact `origin/trunk`
  `f7c535909b6cf5c695459d8537fd61ead0122582`.
- Treat `events.jsonl` as authority and delivery receipts as verified immutable
  projections; filesystem notifications are wake hints only.
- Use no polling interval and no model/session callback during an idle wait.
- Preserve manual recovery and never edit provider session logs.
- Store raw resume handles only in ignored scratch state.
- Do not enable `automatic-required`, resident liveness, native push, host timeout
  setup, or the Phase 2 release; those are owned by #1548.
- Do not add the MCP runtime dependency until the dependency audit is independently
  reviewed.

---

### Task 1: Isolate the Work and Approve the Dependency Gate

**Files:**

- Create: `docs/dependency-audit-mcp.md`
- Modify after approval: `package.json`
- Modify after approval: `package-lock.json`

**Interfaces:**

- Consumes: npm metadata and lock-only graph for
  `@modelcontextprotocol/server@2.0.0`.
- Produces: an exact dependency decision and reproducible production audit.

- [ ] **Step 1: Create and verify the isolated worktree**

```bash
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review fetch origin
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review worktree add \
  /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait \
  -b codex/1547-mcp-wait \
  f7c535909b6cf5c695459d8537fd61ead0122582
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait ci
```

- [ ] **Step 2: Run the Phase 1 baseline**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait test
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:integration
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:packaging
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:smoke
```

Expected: every existing lane exits 0 before Phase 2 changes.

- [ ] **Step 3: Write the dependency audit before installation**

The record must include exact version, integrity, license, Node floor, direct and
transitive packages, `npm audit --omit=dev`, production installed-size and packed
tarball deltas, alternatives, and this conclusion:

```text
Approve @modelcontextprotocol/server@2.0.0 only for the MCP stdio boundary.
Keep wait, delivery authority, and filesystem watching independent of the SDK.
Reject the legacy @modelcontextprotocol/sdk monolith and handwritten MCP framing.
```

- [ ] **Step 4: Obtain independent audit review, then install exactly**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait \
  install --save-exact @modelcontextprotocol/server@2.0.0
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait \
  audit --omit=dev
```

Expected: the dependency version is exact and the production audit reports zero
known vulnerabilities.

### Task 2: Specify the Wait Races with RED Tests

**Files:**

- Create: `test/mcp/wait.test.mjs`
- Create: `test/mcp/server.test.mjs`

**Interfaces:**

- Consumes: desired `waitForHandoff(input)` and MCP server factory interfaces.
- Produces: executable race, cursor, cancellation, restart, and tool-contract
  requirements.

- [ ] **Step 1: Write the wait contract tests**

Use an injected delivery source with this contract:

```js
const deliveries = {
  readAfter({ reviewId, participant, afterSequence }) {},
  subscribe({ reviewId, participant, onChange, onError }) {
    return { close() {} };
  },
  manualRecovery({ workspace }) {},
};
```

Cover delivery before subscribe, delivery between the first read and subscribe,
simultaneous participants, duplicate notifications, duplicate requests,
timeout/abort, reconnect, server restart, manual fallback, and one delivery per
participant cursor. Count reads, subscriptions, timer callbacks, and
model/session callbacks so an idle wait proves no polling and zero model turns.

- [ ] **Step 2: Write the MCP tool tests**

The desired tool input and result are:

```js
{
  review_id: 'review-123',
  participant: 'author',
  after_sequence: 8
}

{
  schema: 'ai-peer-review.delivery/v1',
  status: 'delivered',
  review_id: 'review-123',
  participant: 'author',
  sequence: 9,
  delivery_id: 'reviewer-turn-1-to-author',
  digest: 'sha256:<64 lowercase hex characters>'
}
```

The server must map abort, timeout, unavailable transport, and authority conflict
to compact structured tool errors without acknowledging a delivery.

- [ ] **Step 3: Run and capture the expected RED failure**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:mcp
```

Expected: fail because `src/mcp/wait.mjs` and `src/mcp/server.mjs` do not exist.

### Task 3: Implement the SDK-Independent Wait and Live Reader

**Files:**

- Create: `src/mcp/wait.mjs`
- Create: `src/transport/live-wait.mjs`
- Modify: `src/transport/registry.mjs`
- Test: `test/mcp/wait.test.mjs`

**Interfaces:**

- Consumes: review workspace event authority and delivery receipt projections.
- Produces: `waitForHandoff(input) -> Promise<Delivery>` and a registered
  `live-wait` adapter.

- [ ] **Step 1: Implement check-before-subscribe**

```js
export async function waitForHandoff({
  reviewId,
  participant,
  afterSequence = 0,
  deliveries,
  signal,
  timeoutMs,
}) {
  const ready = deliveries.readAfter({ reviewId, participant, afterSequence });
  if (ready) return ready;
  return deliveries.subscribeOnce({
    reviewId,
    participant,
    afterSequence,
    signal,
    timeoutMs,
    recheck: true,
  });
}
```

Validate identifiers, participant, cursor, signal, and timeout before allocating
watchers. Freeze successful delivery values.

- [ ] **Step 2: Implement event-plus-receipt authority reads**

For each `delivery-written` event after the cursor and addressed to the requested
participant, verify `deliveries/<delivery_id>.json` matches the event's delivery
ID, recipient, and digest byte-for-byte under canonical parsing. Return the first
matching event with its event sequence. A missing receipt remains pending; a
conflicting or malformed receipt fails closed.

- [ ] **Step 3: Implement one-shot filesystem waiting**

Watch the delivery directory, re-read immediately after watcher installation,
and re-read after every notification. Coalesce same-cursor callers, tolerate
duplicate/coalesced events, close the watcher/timer on every terminal path, and
never use `setInterval`.

- [ ] **Step 4: Register the capability and run GREEN**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:mcp
```

Expected: all wait tests pass with no leaked watcher or timer handles.

### Task 4: Expose the Official MCP Server and Pin Delivery Evidence

**Files:**

- Create: `src/mcp/server.mjs`
- Modify: `src/cli/run.mjs`
- Test: `test/mcp/server.test.mjs`
- Modify: this delivery plan with final evidence.

**Interfaces:**

- Consumes: `waitForHandoff` and `@modelcontextprotocol/server` stdio APIs.
- Produces: MCP tool
  `wait_for_handoff(review_id, participant) -> Delivery` and a runnable local
  server connection.

- [ ] **Step 1: Register the MCP tool through an injectable server factory**

```js
export function createHandoffMcpServer({
  createServer,
  repositoryRoot,
  version,
  wait = waitForHandoff,
  createDeliveries,
}) {
  const server = createServer({ name: 'ai-peer-review', version });
  server.registerTool('wait_for_handoff', toolDefinition, async (input, context) => {
    const delivery = await wait({
      reviewId: input.review_id,
      participant: input.participant,
      afterSequence: input.after_sequence ?? 0,
      deliveries: createDeliveries({ repositoryRoot, reviewId: input.review_id }),
      signal: context.signal,
    });
    return toToolResult(delivery);
  });
  return server;
}
```

Production wiring imports `McpServer` and dual-era `serveStdio` from the official
server-only package. The configured repository root owns
`.scratch/peer-review/<review-id>`; an MCP caller never supplies an arbitrary
workspace path. Tests inject a fake server so they verify this package's tool
contract rather than SDK internals.

- [ ] **Step 2: Run focused and complete standalone verification**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:mcp
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait test
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:integration
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:packaging
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:smoke
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run lint
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run format:check
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait audit --omit=dev
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait pack --dry-run
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait diff --check
```

- [ ] **Step 3: Commit standalone implementation and governed evidence**

```bash
git add docs/dependency-audit-mcp.md package.json package-lock.json \
  src/mcp/server.mjs src/mcp/wait.mjs src/transport/live-wait.mjs \
  src/transport/registry.mjs src/cli/run.mjs \
  test/mcp/wait.test.mjs test/mcp/server.test.mjs
git commit -m "feat: add token-free MCP handoff waits"
```

Append the exact standalone base, implementation commit/tree, dependency
integrity, RED/GREEN commands, and verification results to this governed plan,
then commit the AITM evidence as `[#1547] docs: record MCP wait delivery`.
