# Phased Multi-Artifact Review Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This issue executes serially in the main session; do not dispatch subagents.

**Goal:** Extend one peer-review identity across an ordered sequence of specification and plan artifacts, with author-owned per-phase finalization, exact next-artifact re-engagement, durable wake delivery, and unchanged legacy single-artifact behavior.

**Architecture:** Optional phase authority is added to the existing event log without changing legacy event bytes or projections. Non-final acceptance commits a phase-scoped manifest and advances to an author-owned `awaiting-phase-artifact` state; a new `advance` command binds the authority-derived next kind and hands the same reviewer a globally numbered response. Final acceptance continues through the existing terminal events and archive contract.

**Tech Stack:** Node.js 24+ ESM, built-in `node:fs`, `node:crypto`, `node:test`, JSON Schema, existing `AprError`, reducer/service/store, Git transaction journal, delivery receipts, coordinator, CLI parser/help/golden infrastructure.

**Spec:** `docs/design/2026-09-13-10-phased-multi-artifact-review-sessions-design.md`

## Global Constraints

- `events.jsonl` is the sole phase and lifecycle authority; provider transcripts are never inputs.
- Valid phase kinds are exactly `spec` and `plan`; lists are non-empty, ordered, unique, and initial-kind-bound.
- Omitting `--phases` must preserve existing event and projection bytes.
- Global turn numbers never reset; only `phase_turns_used` resets at phase entry.
- The existing `max_turns` limit applies independently to each phase.
- Only the registered author with a current claim can finalize a phase or bind its successor artifact.
- Non-final phase evidence is append-only and cannot be promoted to terminal review authority.
- Final-phase acceptance keeps the current terminal events, manifest, consolidation, and archive behavior.
- Every actionable phase transition writes a verified delivery before the #9 coordinator may wake a participant.
- Manual fallback remains one bounded `status --next`; participant polling and liveness beacons remain forbidden.
- All exact-path Git commits and retries remain recorded in transaction journals and interruption-safe.

---

### Task 1: Closed phase declaration and event-derived projection

**Files:**

- Create: `src/protocol/phases.mjs`
- Modify: `src/protocol/events.mjs`
- Modify: `src/protocol/reducer.mjs`
- Modify: `schemas/event-v1.json`
- Modify: `schemas/protocol-v1.json`
- Modify: `test/unit/events.test.mjs`
- Modify: `test/unit/reducer.test.mjs`
- Create: `test/unit/phases.test.mjs`

**Interfaces:**

- Produces: `parsePhaseKinds(value, initialKind)` returning a frozen ordered array; `isPhased(protocol)`; `currentPhase(protocol)`; `isFinalPhase(protocol)`.
- Adds optional `review-created.payload.phases = { kinds }`.
- Adds lifecycle events `phase-acceptance-committed`, `phase-acceptance-sealed-no-commit`, `phase-artifact-committed`, and `phase-artifact-sealed-no-commit`.
- Adds optional `protocol.phases = { kinds, cursor, current_kind, phase_turns_used, completed }` only for phased histories.

- [ ] **Step 1: Write failing phase parser tests**

```js
test('parses one closed ordered phase list', () => {
  assert.deepEqual(parsePhaseKinds('spec,plan', 'spec'), ['spec', 'plan']);
  assert.throws(() => parsePhaseKinds('spec,spec', 'spec'), { code: 'APR_PHASE_INVALID' });
  assert.throws(() => parsePhaseKinds('plan,spec', 'spec'), { code: 'APR_PHASE_INVALID' });
});
```

Also reject empty members, surrounding whitespace, unknown kinds, non-strings, and a first-kind mismatch.

- [ ] **Step 2: Run the parser test and witness the missing-module failure**

Run: `node --test test/unit/phases.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/protocol/phases.mjs`.

- [ ] **Step 3: Implement canonical phase parsing and frozen helpers**

```js
export function parsePhaseKinds(value, initialKind) {
  const kinds = value.split(',');
  if (!kinds.length || kinds.some((kind) => !PHASE_KINDS.has(kind))) phaseInvalid(value);
  if (new Set(kinds).size !== kinds.length || kinds[0] !== initialKind) phaseInvalid(value);
  return Object.freeze(kinds);
}
```

Return no phase object from the caller when the flag is omitted; do not normalize invalid input.

- [ ] **Step 4: Write failing event and reducer tests**

Add phased `review-created` fixtures and prove:

```js
assert.equal(phased.protocol.phases.cursor, 0);
assert.equal(phased.protocol.phases.current_kind, 'spec');
assert.equal(phased.protocol.phases.phase_turns_used, 0);
assert.equal(Object.hasOwn(legacy.protocol, 'phases'), false);
```

Exercise all four new event payloads, exact-key rejection, non-final/final cursor guards, immutable completion evidence, global/phase turn accounting, and the two new transitions.

- [ ] **Step 5: Run event/reducer tests and witness schema/transition failures**

Run: `node --test test/unit/events.test.mjs test/unit/reducer.test.mjs test/unit/phases.test.mjs`

Expected: FAIL on unknown events and absent phase projection.

- [ ] **Step 6: Implement closed event variants and reducer transitions**

```js
['author-finalization|phase-acceptance-committed', 'awaiting-phase-artifact'],
['author-finalization|phase-acceptance-sealed-no-commit', 'awaiting-phase-artifact'],
['awaiting-phase-artifact|phase-artifact-committed', 'reviewer-turn'],
['awaiting-phase-artifact|phase-artifact-sealed-no-commit', 'reviewer-turn'],
```

Validate cursor/kind/commit-mode consistency against the current projection before applying a lifecycle event. Increment total and phase turns on reviewer decisions; reset only the phase counter on artifact binding.

- [ ] **Step 7: Update JSON schemas with optional legacy-safe phase properties**

Use `oneOf` or closed optional properties so legacy event/protocol instances remain valid and new phase instances reject extra keys.

- [ ] **Step 8: Run focused tests**

Run: `node --test test/unit/events.test.mjs test/unit/reducer.test.mjs test/unit/phases.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit phase authority**

```bash
git add src/protocol/phases.mjs src/protocol/events.mjs src/protocol/reducer.mjs schemas/event-v1.json schemas/protocol-v1.json test/unit/events.test.mjs test/unit/reducer.test.mjs test/unit/phases.test.mjs
git commit -m "feat(protocol): add event-derived review phases [#10]"
```

### Task 2: Phase-scoped manifests and nonterminal finalization

**Files:**

- Modify: `src/collateral/paths.mjs`
- Modify: `src/manifest/render.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/protocol/service.mjs`
- Modify: `test/unit/paths.test.mjs`
- Modify: `test/unit/manifest.test.mjs`
- Modify: `test/integration/finalization.test.mjs`

**Interfaces:**

- Produces: `paths.phaseManifest(cursor, kind)` with a collision-free canonical filename.
- Produces: `buildPhaseManifest({ state, events, phase, final_commit })` and `sealPhaseManifest(model, path)`.
- Changes `finalizeReview(input, deps)` to choose nonterminal phase evidence only when `isPhased(protocol) && !isFinalPhase(protocol)`.

- [ ] **Step 1: Write failing path and phase-manifest tests**

```js
assert.equal(
  paths.phaseManifest(0, 'spec').relative.endsWith('phase-01-spec-review-manifest.md'),
  true
);
assert.equal(buildPhaseManifest(review).phase_status, 'accepted');
```

Prove current-phase turn/history filtering, closed keys, commit/no-commit residual risk, and rejection when the accepted event does not belong to the cursor.

- [ ] **Step 2: Run focused tests and witness missing interfaces**

Run: `node --test test/unit/paths.test.mjs test/unit/manifest.test.mjs`

Expected: FAIL because phase manifest APIs do not exist.

- [ ] **Step 3: Implement phase paths and manifest schema**

```js
phaseManifest: (cursor, kind) =>
  output(`phase-${String(cursor + 1).padStart(2, '0')}-${safePhaseKind(kind)}-review-manifest.md`),
```

Build a closed `ai-peer-review.phase-manifest/v1` model from the current phase's event slice and reuse participant, claim, recovery, supplement, artifact, assurance, and seal helpers where their semantics match.

- [ ] **Step 4: Write failing non-final finalization tests**

Cover normal and no-commit reviewer acceptance. Assert that finalization writes one phase manifest, appends one nonterminal phase-acceptance event, advances the cursor once, selects the author, and leaves the legacy terminal manifest absent.

- [ ] **Step 5: Run the finalization tests and witness terminal-state failures**

Run: `node --test test/integration/finalization.test.mjs`

Expected: FAIL because `finalizeReview` still emits a terminal acceptance event.

- [ ] **Step 6: Extend finalization with the existing transaction boundary**

```js
const nonFinal = isPhased(state.protocol) && !isFinalPhase(state.protocol);
const manifestPath = nonFinal ? paths.phaseManifest(current.cursor, current.kind) : paths.manifest;
```

For non-final normal mode, commit the accepted seal and phase manifest through `commitExactPaths`; for no-commit mode, seal both. Append the matching phase-acceptance event with current cursor/kind and exact evidence. Preserve final-phase code paths byte-for-byte.

- [ ] **Step 7: Add interruption and exact-retry tests**

Checkpoint after phase finalization commit and before event append. Retry must verify the commit recorded in the transaction journal and its manifest, then append only the missing event. A retry after the event returns existing evidence without a second commit.

- [ ] **Step 8: Run focused finalization suites**

Run: `node --test test/unit/paths.test.mjs test/unit/manifest.test.mjs test/integration/finalization.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit phase finalization**

```bash
git add src/collateral/paths.mjs src/manifest/render.mjs src/cli/run.mjs src/protocol/service.mjs test/unit/paths.test.mjs test/unit/manifest.test.mjs test/integration/finalization.test.mjs
git commit -m "feat(finalize): preserve nonterminal phase evidence [#10]"
```

### Task 3: Author re-engagement and durable reviewer handoff

**Files:**

- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/help-data.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/coordinator/decision.mjs`
- Modify: `test/unit/cli-parse.test.mjs`
- Modify: `test/unit/coordinator-decision.test.mjs`
- Create: `test/integration/phased-review.test.mjs`

**Interfaces:**

- Adds `peer-review advance <workspace> <artifact>` with exactly two positionals and no flags.
- Produces: `advanceReview(input, deps)` returning the normal structured result plus phased projection.
- Reuses the existing reviewer draft, delivery event/receipt, transport invocation, and delivery-pending recovery helpers.

- [ ] **Step 1: Write failing closed-parser tests**

```js
assert.deepEqual(parseCli(['advance', '/review', 'docs/plan.md']), {
  command: 'advance',
  args: ['/review', 'docs/plan.md'],
  options: {},
});
```

Reject missing/extra positionals, unknown flags, and any caller-supplied kind/cursor.

- [ ] **Step 2: Run parser tests and witness unknown-command failure**

Run: `node --test test/unit/cli-parse.test.mjs`

Expected: FAIL because `advance` is outside the command catalog.

- [ ] **Step 3: Add the command grammar and next-action rendering**

Add `advance` to command/flag/role/state/result catalogs. `status --next` renders an artifact placeholder only for `awaiting-phase-artifact`; all other command arrays stay exact.

- [ ] **Step 4: Write failing normal and no-commit advance tests**

Exercise the registered author, current claim, derived next kind, artifact containment, clean commit/no-commit seal, monotonic next response number, phase reset, exact retry, conflicting retry, and missing/ambiguous transport outcomes.

- [ ] **Step 5: Run the integration test and witness missing advance behavior**

Run: `node --test test/integration/phased-review.test.mjs`

Expected: FAIL because `advanceReview` is absent.

- [ ] **Step 6: Implement the phase-artifact transaction**

```js
export async function advanceReview(input, deps = {}) {
  const authority = inspectReviewAuthority(path.resolve(input.workspace));
  assertAuthorPhaseAdvance(authority.state, input.identity, input.now);
  const artifact = observeNextArtifact(authority.state, input.artifact, deps.repository);
  const advanced = await appendIdempotentPhaseArtifact(authority, artifact, deps);
  return completeAuthorToReviewerDelivery(advanced, deps);
}
```

Derive kind and cursor from authority. Use commit-mode-specific events and the existing exact delivery receipt before invoking transport.

- [ ] **Step 7: Extend coordinator coverage**

Prove `awaiting-phase-artifact` selects author only with a verified phase-completion delivery and the post-advance `reviewer-turn` selects reviewer only with the exact new delivery. Capsule content remains pointer-only and under 2,048 bytes.

- [ ] **Step 8: Run focused parser, phased, coordinator, submit, and transport tests**

Run: `node --test test/unit/cli-parse.test.mjs test/unit/coordinator-decision.test.mjs test/integration/phased-review.test.mjs test/integration/submit.test.mjs test/unit/transport.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit re-engagement delivery**

```bash
git add src/cli/parse.mjs src/cli/help-data.mjs src/cli/run.mjs src/coordinator/decision.mjs test/unit/cli-parse.test.mjs test/unit/coordinator-decision.test.mjs test/integration/phased-review.test.mjs
git commit -m "feat(cli): advance phased review artifacts [#10]"
```

### Task 4: Operator contract, schemas, and compatibility golden fixtures

**Files:**

- Modify: `src/public-api.mjs`
- Modify: `skills/peer-review/SKILL.md`
- Modify: `templates/author-startup.md`
- Modify: `templates/reviewer-invitation.md`
- Modify: `README.md`
- Modify: `docs/manual-cross-provider-peer-review.md`
- Modify: `test/golden/help.test.mjs`
- Modify: `test/golden/skill.test.mjs`
- Modify: `test/golden/templates.test.mjs`
- Modify: `test/golden/help/all.sha256.txt`
- Modify: `test/golden/templates/author-startup.md`
- Modify: `test/golden/templates/reviewer-invitation.md`
- Modify: `test/packaging/package.test.mjs`
- Modify: `test/smoke/cli.test.mjs`

**Interfaces:**

- Exports phase helpers and phase-manifest construction through the package root.
- Documents `--phases` and `advance` as event-authoritative, coordinator-compatible operations.

- [ ] **Step 1: Write failing golden, packaging, and smoke assertions**

Assert that help includes exact command grammar, generated handoffs explain non-final acceptance and re-engagement, packaged exports resolve, and no active guidance instructs participants to loop/poll.

- [ ] **Step 2: Run the contract suites and witness stale golden fixtures**

Run: `node --test test/golden/help.test.mjs test/golden/skill.test.mjs test/golden/templates.test.mjs test/packaging/package.test.mjs test/smoke/cli.test.mjs`

Expected: FAIL on new command/help/export expectations.

- [ ] **Step 3: Update help, templates, skill, docs, and exports**

Explain the complete flow:

```text
start --phases spec,plan -> review/finalize spec -> advance <workspace> <plan> -> review/finalize plan
```

State that phase authority comes from events, the same reviewer resumes, durable coordinator mode suppresses polling, and unsupported hosts use one bounded `status --next` fallback.

- [ ] **Step 4: Regenerate deterministic golden fixtures from repository helpers**

Update only fixtures whose source contract changed; inspect every diff and reject unrelated churn.

- [ ] **Step 5: Run contract suites**

Run: `node --test test/golden/help.test.mjs test/golden/skill.test.mjs test/golden/templates.test.mjs test/packaging/package.test.mjs test/smoke/cli.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the operator contract**

```bash
git add src/public-api.mjs skills/peer-review/SKILL.md templates/author-startup.md templates/reviewer-invitation.md README.md docs/manual-cross-provider-peer-review.md test/golden test/packaging/package.test.mjs test/smoke/cli.test.mjs
git commit -m "docs: expose phased review workflow [#10]"
```

### Task 5: Exact-head verification and governed delivery

**Files:**

- Modify if required by focused findings: only #10-scoped files listed above
- Verify: `test/integration/phased-review.test.mjs`

**Interfaces:**

- Consumes: all prior task commits.
- Produces: one clean exact-SHA AITM Test receipt and review/delivery authority.

- [ ] **Step 1: Run focused phased verification**

Run: `node --test test/integration/phased-review.test.mjs`

Expected: PASS with normal, no-commit, compatibility, refusal, recovery, and wake cases.

- [ ] **Step 2: Run lint and formatting before the full matrix**

Run: `npm run lint && npm run format:check`

Expected: PASS with no file changes.

- [ ] **Step 3: Run the complete local matrix**

Run: `npm test && npm run test:slow && npm run test:packaging && npm pack --dry-run && git diff --check`

Expected: PASS with no failures and no unexpected packaged files.

- [ ] **Step 4: Inspect the complete branch delta**

Run: `git status --short && git diff --stat origin/trunk...HEAD && git log --oneline origin/trunk..HEAD`

Expected: clean worktree and only #10 design, implementation, tests, schemas, and documentation.

- [ ] **Step 5: Run the AITM exact-SHA sandbox gate**

Run: `npx aitm test 10`

Expected: all root verification commands pass and #10 moves to Test with an exact-head receipt.

- [ ] **Step 6: Stamp each AC from the exact receipt and enter Review**

Run `npx aitm ac-stamp "<exact label>"` and `npx aitm ensureChecked "<exact label>"` separately for each of the ten criteria, then run `npx aitm review 10`.

Expected: #10 moves to Review with all evidence citations intact.

- [ ] **Step 7: Complete Full-Auto review, PR, CI, delivery, and close**

Run `npx aitm approve 10`, push the exact branch, open a PR without auto-closing keywords, wait for required exact-head checks, run `npx aitm deliver 10`, invoke only its authorized provider action, reconcile the receipt, and run `npx aitm close 10`.

Expected: PR squash-merged by exact head, live delivery receipt recorded, issue closed, board Done, timing flushed.
