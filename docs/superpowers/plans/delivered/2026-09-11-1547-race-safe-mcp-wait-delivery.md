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
`events.jsonl` and the matching immutable receipt. Use exact-pinned official MCP
SDK v1 only at the stdio wire boundary; the dependency gate rejected the v2
server package because its published bundle eagerly loads vulnerable code.

**Tech Stack:** Node.js 22 ESM, `node:test`, `fs.watch`,
`@modelcontextprotocol/sdk@1.30.0`, Zod 4 through the SDK dependency graph.

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
- Do not install `@modelcontextprotocol/server@2.0.0`; its source maps prove the
  stdio path eagerly loads bundled vulnerable `fast-uri@3.1.0`, which npm audit
  and overrides cannot govern.

---

### Task 1: Isolate the Work and Approve the Dependency Gate

**Files:**

- Create: `docs/dependency-audit-mcp.md`
- Modify after approval: `package.json`
- Modify after approval: `package-lock.json`

**Interfaces:**

- Consumes: npm metadata, bundle inventory, and isolated lockfile graphs for
  `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/sdk@1.30.0`.
- Produces: an exact dependency decision and reproducible production audit.

- [x] **Step 1: Create and verify the isolated worktree**

```bash
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review fetch origin
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review worktree add \
  /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait \
  -b codex/1547-mcp-wait \
  f7c535909b6cf5c695459d8537fd61ead0122582
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait ci
```

- [x] **Step 2: Run the Phase 1 baseline**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait test
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:integration
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:packaging
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait run test:smoke
```

Expected: every existing lane exits 0 before Phase 2 changes.

- [x] **Step 3: Write the dependency audit before installation**

The record must include exact version, integrity, license, Node floor, direct and
transitive packages, bundled packages, `npm audit --omit=dev`, production
installed-size and packed-tarball deltas, alternatives, and this conclusion:

```text
Reject @modelcontextprotocol/server@2.0.0 because its eager stdio path bundles
vulnerable fast-uri@3.1.0 outside package-manager audit and override control.
Approve exact-pinned @modelcontextprotocol/sdk@1.30.0 only for MCP stdio while
keeping wait, delivery authority, and filesystem watching SDK-independent.
Reject handwritten MCP framing and re-evaluate server-only v2 after an upstream
patched release.
```

- [x] **Step 4: Obtain independent audit review, then install exactly**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1547-mcp-wait \
  install --save-exact @modelcontextprotocol/sdk@1.30.0
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

- [x] **Step 1: Write the wait contract tests**

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

- [x] **Step 2: Write the MCP tool tests**

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

- [x] **Step 3: Run and capture the expected RED failure**

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

- [x] **Step 1: Implement check-before-subscribe**

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

- [x] **Step 2: Implement event-plus-receipt authority reads**

For each `delivery-written` event after the cursor and addressed to the requested
participant, verify `deliveries/<delivery_id>.json` matches the event's delivery
ID, recipient, and digest byte-for-byte under canonical parsing. Return the first
matching event with its event sequence. A missing receipt remains pending; a
conflicting or malformed receipt fails closed.

- [x] **Step 3: Implement one-shot filesystem waiting**

Watch the delivery directory, re-read immediately after watcher installation,
and re-read after every notification. Coalesce same-cursor callers, tolerate
duplicate/coalesced events, close the watcher/timer on every terminal path, and
never use `setInterval`.

- [x] **Step 4: Register the capability and run GREEN**

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

- Consumes: `waitForHandoff` and `@modelcontextprotocol/sdk` stdio APIs.
- Produces: MCP tool
  `wait_for_handoff(review_id, participant) -> Delivery` and a runnable local
  server connection.

- [x] **Step 1: Register the MCP tool through an injectable server factory**

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

Production wiring imports `McpServer` and `StdioServerTransport` from the
exact-pinned official SDK and connects them directly. The configured repository
root owns `.scratch/peer-review/<review-id>`; an MCP caller never supplies an
arbitrary workspace path. Tests inject a fake server so they verify this
package's tool contract rather than SDK internals.

- [x] **Step 2: Run focused and complete standalone verification**

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

- [x] **Step 3: Commit standalone implementation and governed evidence**

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

## Delivery Evidence

- Standalone repository: `kburson/ai-peer-review`
- Exact base: `f7c535909b6cf5c695459d8537fd61ead0122582`
- Reviewed branch head: `930a6e16db5d77af6a93e2dc4359670693f3f4f0`
- Reviewed tree: `ee5113163188ac5b657b7804900d09fc3f281800`
- Pull request: `https://github.com/kburson/ai-peer-review/pull/2`
- Squash merge: `4624084eb078d4d992dfed19e2eda328b86b3e28`
- SDK: exact `@modelcontextprotocol/sdk@1.30.0`, MIT, integrity
  `sha512-xKd8OIzlqNzcqcNumGAa6g+PW2kjD5vrpcKOnfldAUPP3j7lnqMPwlTXQm8gF+UwH72z0lqaRbjr9hqGz0eITA==`
- Schema dependency: exact `zod@4.6.2`, MIT, integrity
  `sha512-lh5RCAGFa1Cm2hjtNwLQhSs/AsqdWnTQaBER9fEwN/88pSh7KOtJavtBx/0VlkN/uFd61SwYmljLMDAsHlvzBQ==`
- Production audit: zero known vulnerabilities. The known two high findings
  remain confined to the pre-existing development-only Markdown toolchain.
- RED evidence: the first focused run failed on the missing MCP/live-wait
  modules. Later RED regressions reproduced shared-signal cancellation, cached
  workspace replacement, undeclared direct Zod, and Node timer overflow before
  their bounded fixes.
- Final exact-head local verification: MCP 30, unit 137, golden 10, integration
  116, packaging 4, and smoke 1 passed; lint, format, production audit, pack dry
  run, and `git diff --check` exited zero. An official SDK in-memory client also
  negotiated, listed, and invoked `wait_for_handoff` successfully.
- Final package dry run: 152,306 packed bytes, 658,362 unpacked bytes, 63 files,
  SHA-1 `779720ef52c3da0ae2071153628e3f2e4c26f32a`, integrity
  `sha512-8+AMWtOUtmlGe0sdtDrn6BeNXQ/GAnknZ26kngrTxSD5q2bfC7k/IGL013s+GMymWihRDnwPETNDfvBMshXWJA==`.
- Independent review: the initial exact-diff review found two Important and two
  Minor issues; all were fixed with RED coverage. Final exact-head re-review was
  APPROVED with no remaining findings.
- Hosted CI: runs `34577267653` and `34577272880` passed Ubuntu Node 22,
  macOS Node 22, Windows Node 22, Ubuntu LTS/current Node, and the Phase 1
  boundary. The opt-in live-provider jobs were correctly skipped.
