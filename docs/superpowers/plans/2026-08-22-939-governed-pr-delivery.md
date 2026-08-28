# Governed PR Delivery Implementation Plan

<!-- cspell:ignore NDEKTSV RRFFQ -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a re-entrant `/task deliver` transaction that authorizes and verifies exact-head provider-mediated PR delivery before `/task close` may perform terminal mutations.

**Architecture:** Keep delivery inside Review and split it into pure record/preflight modules, a script-backed orchestration verb, and a host-owned provider adapter action. GitHub issue comments retain append-only intents and receipts, GitHub plus `origin/trunk` remain live authorities, and `close` consumes a valid receipt without performing any PR mutation.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub GraphQL/CLI read boundaries, Git, AITM command-surface catalog, provider registry, Markdown task skills.

## Global Constraints

- Preserve the existing eight-state lifecycle; delivery is a re-entrant operation within Review, not a new state.
- Never invoke, wrap, disguise, or fall back to `gh pr merge`; the external merge must remain visible as a host provider action.
- The expected 40-hex PR head, accepted Test/review evidence, local `HEAD`, remote PR head, and emitted provider action must agree exactly.
- GitHub PR state and `origin/trunk` are authoritative; provider output and local cache are diagnostic only.
- Intent and receipt comments are append-only, versioned, canonical, bounded, and recoverable after ambiguous transport results.
- Compare GitHub server timestamps only with other GitHub server timestamps; local timestamps are diagnostic and never authorize delivery.
- Preserve every required `[#N]` attribution token and exact deterministic commit title/message bytes.
- Child-to-epic `merge-back` and explicitly authorized `local-trunk-lane` behavior remain unchanged.
- Fail closed before terminal timing, Done, Delivered, issue closure, or binding release on every unknown, stale, ambiguous, or mismatched input.
- Use test-driven development and commit each task independently with `[#939]` attribution.

---

### Task 1: Append-only delivery records and deterministic attribution

**Files:**

- Create: `scripts/task-tracker/lib/delivery-records.mjs`
- Create: `scripts/task-tracker/lib/delivery-attribution.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs`

**Interfaces:**

- Consumes: `canonicalRecordJson(value)` and `createRecordId()` from `scripts/task-tracker/lib/github-records/`.
- Produces: `buildDeliveryIntent(input)`, `buildDeliveryReceipt(input)`, `renderDeliveryIntentComment(intent)`, `renderDeliveryReceiptComment(receipt)`, `parseDeliveryComment(comment, context)`, and `projectDeliveryRecords(records)`.
- Produces: `buildDeliveryCommitText({ issueNumber, prNumber, expectedHeadSha, commitSubjects })` returning frozen `{ attributionTokens, commitTitle, commitMessage, commitTitleSha256, commitMessageSha256 }`.

- [ ] **Step 1: Write failing record parser and projection tests**

Cover exact schemas `aitm.delivery-intent/v1` and `aitm.delivery-receipt/v1`, exact-key rejection, canonical JSON, bounded strings, 40-hex SHAs, repository/issue/PR correlation, comment `createdAt`, duplicate IDs, missing/cyclic/forked supersession, more than one live tip, same-key divergent bytes, receipt conflicts, and deep-frozen return values. The fixture shape must be:

```js
const intent = buildDeliveryIntent({
  intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  supersedesIntentId: null,
  issueNumber: 939,
  repository: 'kburson/ai-task-manager',
  prNumber: 1400,
  baseRef: 'trunk',
  headRef: 'codex/939-full-auto-merge',
  expectedHeadSha: 'a'.repeat(40),
  mergeMethod: 'squash',
  attributionTokens: ['#939'],
  commitTitle: '[#939] Deliver governed PR workflow',
  commitMessage: 'PR #1400 source aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\n[#939]',
  provider: 'codex',
  sessionId: 'session-1',
  clientCreatedAt: '2026-08-22T00:00:00.000Z',
});
```

- [ ] **Step 2: Run the record test and verify the expected red failure**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs
```

Expected: FAIL because `delivery-records.mjs` does not exist.

- [ ] **Step 3: Implement strict comment schemas and projection**

Use one hidden marker per comment and retain the visible explanation after it:

```text
<!-- aitm-delivery-intent {canonical-json} -->
Delivery pending for PR #1400 at `<expectedHeadSha>`.
```

```text
<!-- aitm-delivery-receipt {canonical-json} -->
Delivery verified for PR #1400 as `<mergeCommitSha>` on `origin/trunk`.
```

`parseDeliveryComment` must accept `{ id, body, createdAt }`, preserve the server `createdAt`, reject marker-like malformed comments, and never substitute `clientCreatedAt`. `projectDeliveryRecords` must return `{ intents, receipts, liveIntent, matchingReceipt }`; referenced intents project to effective state `superseded`, and the only unreferenced valid intent is the live pending tip.

- [ ] **Step 4: Write failing attribution tests**

Assert sorted/deduplicated `#N` tokens from all `[#N]` commit subjects, a title beginning with the top-level token, bounded message bytes, PR/source provenance, stable SHA-256 hashes, and rejection when the top-level issue or any child token is absent.

- [ ] **Step 5: Implement deterministic commit bytes**

Use the exact result contract:

```js
{
  attributionTokens: ['#1274', '#1275', '#939'],
  commitTitle: '[#939] Governed PR delivery',
  commitMessage:
    'PR #1400\nSource: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\nAttribution: [#939] [#1274] [#1275]',
  commitTitleSha256: '<64-hex>',
  commitMessageSha256: '<64-hex>'
}
```

Normalize neither provider-facing string after hashing. Reject control characters, duplicate semantic tokens, missing source subjects, and messages above the module constant.

- [ ] **Step 6: Run Task 1 tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add scripts/task-tracker/lib/delivery-records.mjs scripts/task-tracker/lib/delivery-attribution.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs
git commit -m "[#939] Model governed delivery records"
```

### Task 2: Exact-head preflight, provider action, and configuration migration

**Files:**

- Create: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Create: `scripts/task-tracker/lib/delivery-provider-action.mjs`
- Modify: `scripts/task-tracker/lib/full-auto-merge.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `.ai-task-manager/task-tracker.json`
- Create: `scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/full-auto-merge-config.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/config-full-auto-merge.test.mjs`

**Interfaces:**

- Consumes: Task 1 intent and attribution objects.
- Produces: `validateDeliveryPreflight(input)` returning frozen `{ issue, pr, expectedHeadSha, mergeMethod, commitText }` or throwing `DeliveryPreflightError` with a stable category.
- Produces: `buildProviderAction(intent)` and `serializeProviderActionRequired(action)`.
- Changes `resolveMergeMechanism(cfg)` to accept `provider-action`, reject `gh-auto-merge` with migration guidance, and preserve `local-trunk-lane` authorization.

- [ ] **Step 1: Write the failing preflight/action tests**

Construct table-driven fixtures for: active issue mismatch, paused timer, non-Review state, closed/unassigned issue, missing review approval, child lineage, zero/multiple PRs, draft/wrong base/wrong head, local/remote/Test/review SHA mismatch, dirty issue overlap, unknown mergeability, non-green or unreadable required checks, disallowed merge method, and missing attribution. Include one exact success fixture and assert that the action is:

```js
{
  schema: 1,
  intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  action: 'github.merge-pull-request',
  repository: 'kburson/ai-task-manager',
  issueNumber: 939,
  prNumber: 1400,
  baseRef: 'trunk',
  headRef: 'codex/939-full-auto-merge',
  expectedHeadSha: 'a'.repeat(40),
  mergeMethod: 'squash',
  commitTitle: '[#939] Governed PR delivery',
  commitMessage: '<exact-authorized-bytes>'
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs
```

Expected: FAIL because the two new modules do not exist.

- [ ] **Step 3: Implement the pure fail-closed preflight**

Keep all I/O outside the module. Require an input snapshot with explicit `issue`, `binding`, `lineage`, `pullRequests`, `localHeadSha`, `testReceiptSha`, `acceptedReviewSha`, `checks`, `dirtyPaths`, `config`, and `commitSubjects`. Treat absent/unknown values as refusals. Exact SHA comparisons must use full 40-hex equality.

`acceptedReviewSha` is not a new self-asserted marker: resolve it from the unique current-contract exact-SHA Test receipt that `/task review` already revalidates against unchanged `HEAD` before entering Review. Delivery must also require the persisted Agent Review Passed evidence and human/Full-Auto approval evidence; later branch drift makes the Test receipt SHA disagree and fails closed.

- [ ] **Step 4: Implement byte-stable action serialization**

`serializeProviderActionRequired(action)` must emit exactly one line beginning:

```text
AITM_PROVIDER_ACTION_REQUIRED: {canonical-json}
```

It must re-hash the recovered intent strings before emission and reject any drift. No function in either module may import `child_process` or contain the token sequence `gh pr merge` outside a refusal/test fixture.

- [ ] **Step 5: Migrate configuration policy**

Set the tracked project configuration to:

```json
"fullAutoMerge": {
  "mechanism": "provider-action",
  "mergeMethod": "squash"
}
```

`provider-action` permits only `merge|squash|rebase`. `gh-auto-merge` must return an actionable `full-auto-merge-retired-mechanism` refusal pointing to `docs/guides/settings-guide.md`; no silent migration is allowed. Leave the authorized `local-trunk-lane` branch unchanged.

- [ ] **Step 6: Run Task 2 tests**

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/lib/full-auto-merge-config.test.mjs scripts/tests/unit/task-tracker/core/config-full-auto-merge.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/task-tracker/lib/delivery-preflight.mjs scripts/task-tracker/lib/delivery-provider-action.mjs scripts/task-tracker/lib/full-auto-merge.mjs scripts/task-tracker/config.mjs .ai-task-manager/task-tracker.json scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/lib/full-auto-merge-config.test.mjs scripts/tests/unit/task-tracker/core/config-full-auto-merge.test.mjs
git commit -m "[#939] Define exact-head provider delivery"
```

### Task 3: Re-entrant `/task deliver` intent orchestration

**Files:**

- Create: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/verbs/help.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs`

**Interfaces:**

- Consumes: Tasks 1–2 record, attribution, preflight, and action functions.
- Produces: `runDeliver({ issueNumber, cfg, state, deps })` returning `{ status: 'action-required'|'delivered'|'already-delivered', intent, receipt?, action? }`.
- Adds `deliver` as a target-required verb and documents dedicated exit code `20` as provider action required.

- [ ] **Step 1: Write failing verb tests for the open-PR path**

Inject every boundary: binding/timer state, issue/body/comments, branch, local HEAD, Test receipt, accepted review SHA, lineage, PR discovery/details/checks, repository settings, commit history, comment creation/readback, and clock/ID. Assert:

- first call posts one exact intent before emitting one action and exits 20;
- retry after a lost POST response discovers the same server-visible dedupe key and does not post again;
- same key plus divergent authorized bytes fails closed;
- same-head pending intent reruns live preflight and re-emits byte-identical JSON;
- changed head requires fresh Test/review evidence and then appends a replacement naming the prior intent;
- child lineage returns an explicit non-provider result;
- no terminal timing, board, disposition, closure, or binding dependency is available to the verb.

- [ ] **Step 2: Run the verb test and verify it fails**

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: FAIL because `deliver.mjs` and routing do not exist.

- [ ] **Step 3: Implement live snapshot collection and lost-response reconciliation**

Read all issue comments with server `createdAt`, identify exactly one current-branch PR, fetch its full state/check rollup, resolve exact Test/review SHA evidence, read repository merge settings, and build attribution from `origin/trunk..HEAD`. Reconcile an existing matching intent before any create. After create, read back the exact comment and rerun projection before returning the action.

- [ ] **Step 4: Add command routing and help**

Route `deliver` directly to `verbDeliver`; do not alias it to `close`, `review`, or a state move. Help must state: Review-only, re-entrant, no lifecycle transition, action-required exit 20, exact-head protection, and the recovery command `npx aitm deliver #N`.

- [ ] **Step 5: Run Task 3 tests**

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/integration/task-tracker/verbs/help.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/task-tracker/verbs/deliver.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/lib/command-surface/catalog.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/integration/task-tracker/verbs/help.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs
git commit -m "[#939] Add governed delivery intent verb"
```

### Task 4: Live merge verification and durable receipt finalization

**Files:**

- Create: `scripts/task-tracker/lib/delivery-verification.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs`

**Interfaces:**

- Consumes: Task 1 live intent, Task 3 live PR/comment snapshot, injected `fetchOriginTrunk`, `isAncestor`, and `attributingCommits` boundaries.
- Produces: `verifyDeliveredPullRequest(input)` returning frozen receipt input plus `{ recovery: boolean, branchDisposition: 'retained'|'deleted' }`.
- Extends `runDeliver` with merged/recovery/idempotent receipt paths.

- [ ] **Step 1: Add failing merged/recovery verb tests**

Cover: merged exact head, missing merge SHA, wrong recorded pre-merge head, merge-method mismatch, fetch failure, merge unreachable from `origin/trunk`, missing top-level/child attribution, `merged_at` earlier than intent comment `createdAt`, ambiguous provider result reconciled as open or merged, repeated exact receipt, conflicting receipts, and already-merged external recovery with no prior intent.

- [ ] **Step 2: Add the failing evidence-schema test**

Define a versioned evidence object requiring exact repository, issue, PR, source SHA, merge SHA, provider action, receipt comment ID, CI run URL, branch disposition, and close result. Reject partial evidence and unknown keys.

- [ ] **Step 3: Run the focused tests and verify failure**

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
```

Expected: FAIL on missing finalization/evidence behavior.

- [ ] **Step 4: Implement independent live verification**

Always fetch `origin <trunk>` without updating local `trunk`. Require the merge commit or resulting history to be reachable from `origin/trunk`; run message attribution against that ref. For ordinary intents require `merged_at >= intent.createdAt`. For already-merged recovery, classify `provider: 'external'`, create a recovery intent/receipt pair without pretending a provider action occurred, and retain the observed GitHub timestamps.

- [ ] **Step 5: Append and read back one receipt**

Create a receipt only after live verification passes. Rerun projection after the POST. A repeat must verify the matching receipt against live PR/trunk and return `already-delivered`; it must not create or edit another comment.

- [ ] **Step 6: Run Task 4 tests**

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/task-tracker/lib/delivery-verification.mjs scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
git commit -m "[#939] Verify and receipt delivered pull requests"
```

### Task 5: Close receipt gate and retirement of PR mutation from `close`

**Files:**

- Create: `scripts/task-tracker/lib/close-delivery-receipt.mjs`
- Modify: `scripts/task-tracker/lib/gate-resolve.mjs`
- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/full-auto-merge-execute.mjs`
- Create: `scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/full-auto-merge-execute.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs`

**Interfaces:**

- Consumes: Task 1 projected records, accepted exact SHA, live PR, and existing `origin/trunk` attribution guard.
- Produces: `requireDeliveryReceipt({ issueNumber, lineage, branch, acceptedSha, pullRequests, records })` returning `{ skipped, receipt }` or a stable fail-closed refusal.
- Produces: `resolveReviewAuthorization({ session, projectConfig, humanApprovalEvidence, fullAutoApprovalEvidence })` from `gate-resolve.mjs`, returning a frozen `{ mode: 'human'|'full-auto'|'missing', standing, source }` decision shared by `deliver` and `close`.
- Removes every PR merge/enable call from `verbClose`; `close` retains only receipt verification, trunk attribution, and terminal workflow mutation.

- [ ] **Step 1: Write failing close-gate and Full-Auto doctrine tests**

Assert missing/malformed/duplicate/conflicting/mismatched receipts block; a valid exact-head receipt passes; child-to-epic and authorized no-PR local lane skip the PR receipt gate; and live PR ambiguity fails closed. Add a source-wiring assertion that `close.mjs` contains neither `enableFullAutoMergeForClose(` nor a provider-action wait/retry.

Create `full-auto-close-doctrine.test.mjs` as the AC8 contract. Drive the real `applyChoice`, `resolveGate`, `runApprove`, `validateDeliveryPreflight`, and injected `verbClose` boundaries and assert:

- `auto both` and `auto review` establish standing authorization for autonomous review approval, `deliver`, and `close` without emitting a human approval prompt;
- the same authorization remains valid across repeated delivery/close retries while the session override remains enabled;
- `auto off` revokes it, and `auto reset` removes the session authority so project policy is resolved afresh rather than reusing stale Full-Auto evidence;
- a genuine current-head human approval remains independently valid;
- Full-Auto suppresses only the redundant rubber-stamp prompt: Agent Review/Test evidence, exact-head equality, CI, clean-worktree, audit, provider capability, delivery receipt, live-trunk attribution, and every terminal-ordering guard still refuse independently when invalid.

- [ ] **Step 2: Run the close and doctrine tests and verify they fail**

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
```

Expected: FAIL because the receipt gate and shared standing-authorization decision are absent and the doctrine test file does not yet exist.

- [ ] **Step 3: Insert the receipt gate before terminal effects**

After ordinary Review approval/body gates but before `emitReviewToDoneClosePair`, time rollup, queue flush, estimation outcome, Done, disposition, issue close, or binding release, load/project delivery comments and require a receipt whose `expectedHeadSha` equals the exact accepted SHA. Then retain the existing `origin/trunk` attribution guard as independent proof.

- [ ] **Step 4: Implement and consume standing review authorization**

Add `resolveReviewAuthorization` beside `resolveGate` as the single pure decision boundary. It must resolve the live session override before project defaults, require current-head approval evidence, treat a disabled Review gate as standing Full-Auto authorization, and never convert missing/unknown state into authorization. `auto off` must require human evidence; `auto reset` must clear the session source and re-evaluate project policy. Thread the decision into `validateDeliveryPreflight` and `verbClose`. The callers must return a stable refusal when the decision is `missing`; they must not emit `PROMPT_REQUIRED: review-approval` when it is `full-auto`. `runApprove` remains the audited producer of current-head Full-Auto approval evidence.

- [ ] **Step 5: Retire the legacy PR executor path**

Remove the `enableFullAutoMergeForClose` import and call from `close.mjs`. Keep only the linked-worktree trunk-ref helper needed by attribution. Make direct use of `full-auto-merge-execute.mjs` return a retired-mechanism refusal for PR mutation while preserving the non-PR `local-trunk-lane` decision surface required by legacy callers.

- [ ] **Step 6: Prove terminal ordering and preserved safety gates**

Extend injected close tests so every receipt refusal leaves terminal timing, queue flush, estimation outcome, Done, Delivered, issue closure, and binding release call counts at zero. A valid receipt must reach those effects in existing order.

Run the doctrine test against refusal fixtures for dirty worktree, stale/missing Test or Agent Review evidence, head mismatch, non-green checks, unavailable provider capability, missing receipt, failed audit persistence, and failed trunk attribution. Each must remain a refusal in Full-Auto, with zero terminal mutations.

- [ ] **Step 7: Run Task 5 tests**

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/lib/full-auto-merge-execute.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add scripts/task-tracker/lib/close-delivery-receipt.mjs scripts/task-tracker/lib/gate-resolve.mjs scripts/task-tracker/lib/delivery-preflight.mjs scripts/task-tracker/verbs/deliver.mjs scripts/task-tracker/verbs/close.mjs scripts/task-tracker/lib/full-auto-merge-execute.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/lib/full-auto-merge-execute.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
git commit -m "[#939] Gate close on delivery and standing authorization"
```

### Task 6: Provider capability adapters and shared delivery rule

**Files:**

- Modify: `scripts/providers/provider-adapter.mjs`
- Modify: `scripts/providers/codex.mjs`
- Modify: `scripts/providers/claude.mjs`
- Modify: `scripts/providers/grok.mjs`
- Modify: `scripts/tests/unit/providers/registry.test.mjs`
- Modify: `skill/shared/router.md`
- Create: `skill/shared/rules/deliver.md`
- Modify: `skill/adapters/codex/SKILL.md`
- Modify: `skill/adapters/claude/SKILL.md`
- Modify: `skill/adapters/grok/SKILL.md`
- Modify: `.agents/skills/task/SKILL.md`
- Modify: `.claude/skills/task/SKILL.md`
- Modify: `scripts/tests/unit/providers/parity.test.mjs`
- Modify: `scripts/tests/unit/providers/skill-version-stamp.test.mjs`

**Interfaces:**

- Adds `externalActions['github.merge-pull-request'] = { adapterContract: 'skill', expectedHeadSha: true }` to capable adapters and an explicit absent/unsupported declaration to incapable adapters.
- Adds the `deliver` JIT rule with load sentinel `aitm-skill-loaded:rules/deliver:1.0.0`.

- [ ] **Step 1: Write failing registry and skill-parity assertions**

Assert declarative capability lookup, no provider-name conditional at the deliver call site, exact expected-head requirement, generated installed-skill parity, and router discovery of `rules/deliver.md`.

- [ ] **Step 2: Run focused provider tests and verify failure**

```bash
node --test scripts/tests/unit/providers/registry.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
```

Expected: FAIL because the capability and rule do not exist.

- [ ] **Step 3: Implement the shared host contract**

The shared rule must require the host to:

1. run `npx aitm deliver #N`;
2. parse only the single `AITM_PROVIDER_ACTION_REQUIRED:` JSON line;
3. match the declared adapter capability;
4. call the sanctioned GitHub merge integration with exact repository, PR, expected head, method, title, and message;
5. never fall back to shell merge;
6. rerun `npx aitm deliver #N` after success, refusal, timeout, or ambiguity;
7. continue to `npx aitm close #N` only after a live-verified receipt.

The Codex and Claude adapters must name their sanctioned GitHub integration surface. Grok must emit an exact missing-capability refusal unless its adapter declares an equivalent tool.

- [ ] **Step 4: Regenerate or synchronize installed task skills**

Use the repository installer/parity mechanism so `.agents/skills/task/SKILL.md` and `.claude/skills/task/SKILL.md` match their canonical adapters; do not hand-normalize unrelated bytes.

- [ ] **Step 5: Run Task 6 tests**

```bash
node --test scripts/tests/unit/providers/registry.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add scripts/providers/provider-adapter.mjs scripts/providers/codex.mjs scripts/providers/claude.mjs scripts/providers/grok.mjs scripts/tests/unit/providers/registry.test.mjs skill/shared/router.md skill/shared/rules/deliver.md skill/adapters/codex/SKILL.md skill/adapters/claude/SKILL.md skill/adapters/grok/SKILL.md .agents/skills/task/SKILL.md .claude/skills/task/SKILL.md scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
git commit -m "[#939] Route provider-mediated delivery actions"
```

### Task 7: Cross-component workflow, documentation, and real-PR acceptance

**Files:**

- Create: `scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs`
- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/settings-guide.md`
- Modify: `docs/guides/architecture-overview.md`
- Modify: `scripts/maintenance/lint-doc-anchors.mjs`
- Create during acceptance: `.superpowers/sdd/task-7-real-pr-evidence.md` (ignored working evidence; publish the final evidence to #939 through the governed workflow)

**Interfaces:**

- Consumes: Tasks 1–6 complete public command and adapter contracts.
- Produces: one deterministic integration harness and the exact real-PR evidence required by AC7.

- [ ] **Step 1: Write the failing integration harness**

Drive injected state through:

```text
Review/off-trunk
  -> deliver intent
  -> provider action required
  -> live PR becomes merged
  -> deliver receipt
  -> close
  -> Done/closed
```

Assert zero terminal mutations before the receipt, one receipt after verified merge, then one terminal close. Also assert delivery records remote branch disposition and local worktree cleanup is absent from both `deliver` and `close`.

- [ ] **Step 2: Run the integration harness and verify failure**

```bash
node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs
```

Expected: FAIL until all cross-component boundaries are wired.

- [ ] **Step 3: Complete minimal cross-component wiring**

Connect injected boundaries without adding a second authority or general workflow engine. Preserve the Task 3 exit-20 action pause and Task 4 live verification on retry.

- [ ] **Step 4: Update operator and architecture documentation**

Document `Review -> deliver -> provider action -> deliver -> close`, `provider-action`, immediate exact-head merge, retired `gh-auto-merge`, local-lane exception, recovery after ambiguous results, receipt/trunk dual proof, and provider capability failure. Update doc-anchor expectations to require the new terms.

- [ ] **Step 5: Run focused and repository verification**

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs
npm run format:check
npm run lint
npm test
npm run test:slow
```

Expected: all commands PASS.

- [ ] **Step 6: Commit Task 7 implementation and documentation**

```bash
git add scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs docs/guides/workflow.md docs/guides/settings-guide.md docs/guides/architecture-overview.md scripts/maintenance/lint-doc-anchors.mjs
git commit -m "[#939] Verify governed PR delivery end to end"
```

- [ ] **Step 7: Execute the real-PR acceptance on #939 itself**

After all branch review and Test gates pass, publish the exact reviewed branch, open the issue-owned PR, wait for required CI on its exact head, and run:

```bash
npx aitm deliver 939
```

The PR body must not contain `Closes #939`, `Fixes #939`, or another auto-closing keyword; `/task close` remains the only issue-closure authority. The host adapter must invoke the sanctioned GitHub integration using the emitted expected head and exact commit bytes. Rerun `npx aitm deliver 939` to obtain the verified receipt, then run `npx aitm close 939`. Record repository, PR, source SHA, merge SHA, provider action, CI URL, receipt comment, branch disposition, and close result in #939 evidence. No `gh pr merge` command may appear in the execution trace.

## Final self-review checklist

- [ ] Every accepted-design requirement maps to Tasks 1–7.
- [ ] No step contains a placeholder or asks an implementer to infer an interface.
- [ ] Intent, action, receipt, and evidence field names are consistent across tasks.
- [ ] Every implementation task starts red, ends green, and has an independent commit/review boundary.
- [ ] The real-PR acceptance uses #939's exact reviewed head and the sanctioned provider integration.
