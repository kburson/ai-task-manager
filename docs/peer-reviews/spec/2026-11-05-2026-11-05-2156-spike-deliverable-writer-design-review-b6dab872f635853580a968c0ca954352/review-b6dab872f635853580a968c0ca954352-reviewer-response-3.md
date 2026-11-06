<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b6dab872f635853580a968c0ca954352"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-05-2156-spike-deliverable-writer.md"
artifact_commit: "c726c9051022150f6363c5c7c84e9f46dc0370f5"
artifact_blob: "58f4d264336ac54f2adb9fa3e2293dc5f24ee92a"
artifact_digest: "sha256:36a81198b90ecb2b050bce1d1f16e8e8ccb2a9e8ccd707eb6b4332bb93b2c1db"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:9289af6373656e819643b5ba41787b2c686a71de5fbeed4455e1330583534b19"
  identity_source: "runtime"
started_at: "2026-11-05T10:36:53.054Z"
submitted_at: "2026-11-05T10:59:47.799Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent plan-phase review of `docs/superpowers/plans/2026-11-05-2156-spike-deliverable-writer.md`
at blob `58f4d264` (digest `sha256:36a81198…`, commit `c726c905`), against the
accepted spec (blob `7296e37f`, phase-01 manifest `phase_status: accepted`).

Method: full read of the plan and re-read of the accepted spec, then checks of the
paths and commands the plan names:

- `scripts/task-tracker/lib/command-surface/catalog.mjs`,
  `scripts/task-tracker/verbs/help-data.mjs` exist.
- Regression targets `scripts/tests/unit/task-tracker/verbs/epic-reconcile.test.mjs`
  and `.../close-no-commit-delivery.test.mjs` exist.
- `scripts/tests/integration/task-tracker/` exists; both `*.test.mjs` and
  `*.integration.test.mjs` naming are in use, so the declared name is plausible.
- `docs/workflows/` exists (`current-plan-approval.md`).
- `package.json` scripts and `scripts/run-tests.mjs:15-22` lane definitions.
- `scripts/task-tracker/verify-develop.mjs` exists.

The plan is well shaped. Two tasks with a clean split (guarded transaction first,
public registration second), explicit interfaces, honest RED→GREEN steps, review
focus tied to the real risks, and an unambiguous "does not activate #2146" limit.
The interfaces map to the spec's file split.

Two findings need revision. One is a concrete verification gap: the plan's command
list never runs the lane its own integration test lives in. The other is that the
plan dropped the specific marker-scan regressions that the spec added to resolve
R1-F002, and one Task 1 interface conflates two outcomes the spec treats
differently.

## Findings

### R3-F001 — Task 2 verification omits the integration lane and conflicts with the Develop verification contract

Task 2 Step 5 says "full CI including unit/integration/slow". Its Verification
Commands list `npm test`, `npm run test:slow`, `npm run lint`,
`npm run format:check`. Per `scripts/run-tests.mjs:15-22` and `package.json:21-24`:

- `npm test` is `--lane fast`, which is **unit only**.
- `npm run test:slow` is the slow lane.
- The integration lane (`npm run test:integration`) appears nowhere in the list.

The new `scripts/tests/integration/task-tracker/spike-deliverable.test.mjs` is
the file carrying the real Git/native binding/governed-body checks, which are the
core of AC1 and AC2. The repository-wide integration lane is also where any
collateral regression from new dispatch/preflight registration would show up. As
written, an implementer who runs exactly the listed commands gets a green result
without ever running the integration population (only the targeted file, via the
first two lines).

Separately, the project's Develop-Phase Verification Contract (CLAUDE.md) says
Develop runs `node scripts/task-tracker/verify-develop.mjs` before each commit, and
full-suite regression belongs to the Test stage (isolated worktree) and CI. The
plan's Task 2 Step 5 places "full CI ... at the final exact head" in a Develop
task and never names `verify-develop.mjs`. If "full CI" means the remote PR
pipeline, the plan should say so. If it means local runs during Develop, it
contradicts the contract.

**Required:**

1. Add `npm run test:integration` to the Task 2 Verification Commands, or state
   explicitly which command covers the integration lane.
2. Name `node scripts/task-tracker/verify-develop.mjs` as the per-commit Develop
   check in both tasks.
3. Attribute the full unit/integration/slow, CodeQL and package-compatibility runs
   to CI and the Test stage, not to local Develop execution.

### R3-F002 — Plan drops the spec's R1-F002 marker-scan regressions, and `readSpikeDeliverableMarker` conflates absent-section with no-marker

The accepted spec's "Verification and acceptance" requires, specifically:

- a same-URL marker with a noncanonical timestamp;
- ignored out-of-section examples;
- duplicate progress headings;
- malformed/unterminated in-section claims.

These were added to resolve R1-F002. Task 1 Step 4 lists only "marker
bare/malformed/duplicate/conflicting URL" and "malformed timestamps". The latter
sits among comment-validation cases and reads as comment `created_at`/`updated_at`
validation, not the marker `ts`. Review Focus item 1 says "malformed/duplicate
marker" but likewise does not name the same-URL/noncanonical-`ts` case.

That case is the one that matters most. Without it, an implementation that
delegates the no-op decision to `setDeliverablePosted` (first-match, URL-only)
passes every listed test and reintroduces the exact gap the spec closed.

Related interface ambiguity: `readSpikeDeliverableMarker(body) -> null | {url,ts}`.
The spec requires that an absent `## AITM Progress Markers` section, duplicate
section headings, or ambiguous boundaries **refuse**. A `null` return is the
natural signal for "section present, no marker yet → publish". If `null` also
covers "section absent", the verb proceeds to `setDeliverablePosted`, which
creates the section (`issue-kind.mjs:95`) instead of refusing. The interface should
make the distinction structural, e.g. throw a categorized refusal for
section-level defects and reserve `null` for "valid section, zero claims".

**Required:**

1. In Task 1 Step 4, enumerate the spec's marker-scan cases explicitly:
   - same-URL marker with noncanonical/invalid `ts` refuses (not no-op);
   - out-of-section marker-looking prose and fenced examples are ignored;
   - absent and duplicate `## AITM Progress Markers` headings refuse;
   - unterminated and fenced in-section claims count and refuse;
   - two in-section claims refuse as duplicate even when one is malformed.
2. Add the same-URL/noncanonical-`ts` case to Review Focus item 1.
3. Specify that `readSpikeDeliverableMarker` throws a categorized refusal for
   section-level defects and returns `null` only for a valid section with zero
   claims.

## Required changes

1. Add the integration lane (`npm run test:integration`) to Task 2 verification.
   Name `verify-develop.mjs` as the per-commit Develop check. Attribute full-suite,
   CodeQL and package-compatibility runs to CI/Test rather than local Develop.
   (R3-F001)
2. Enumerate the spec's marker-scan regressions in Task 1 Step 4 and Review Focus,
   especially same-URL/noncanonical-`ts` refusal. Make `readSpikeDeliverableMarker`
   distinguish section-level refusal from "no marker". (R3-F002)

## Optional suggestions

1. **Exit-code wording.** Task 1's `verbSpikeDeliverable` says runtime/authority
   refusals exit "nonzero". The accepted spec fixes exit 1 with a
   `spike-deliverable:<category>` diagnostic. Use the spec's exact contract so the
   public tests in Task 2 Step 1 can assert it.
2. **Case-variant marker name.** Carry forward the turn-2 optional suggestion: one
   case where an in-section claim differs from `aitm-deliverable-posted` only by
   letter case, alongside a valid one, must refuse as duplicate. This pins that the
   inventory uses the existing case-insensitive grammar.
3. **Estimate.** Task 1 bundles the pure validators, the native guarded transaction,
   real-Git integration fixtures and roughly 20 refusal categories into 2 hours.
   Given the repository's integration-fixture cost, consider whether the 4-hour/M
   estimate is realistic, or split Task 1 into pure-validator and native-transaction
   tasks with separate commits.
4. **Operator guide packaging.** "Route shipped rule guidance to its repository URL
   if workflow docs are not packaged" leaves a decision to implementation time.
   Checking the `files` field/package-boundary expectations now and stating the
   outcome would remove a conditional from the plan.

## Decision

revisions-requested
