# Cloud Test-Stage and Merge-Queue Delivery Design

## Context

The test fleet has outgrown the maintainer's laptop. The full suite is 885 test
files; the unit lane runs a bounded pool of parallel `node` children, and the
Test stage runs the whole fleet in an isolated sandbox worktree. When four to six
parallel story agents each hold local resources, adding a full-suite run puts the
machine under CPU and memory contention severe enough that the maintainer can no
longer run the suite locally at all.

The cost profile is asymmetric in a way that suggests where to cut. Plan and
Develop are agent-hours — potentially many hours per story — and renting cloud
compute for them is expensive. The full suite is CPU-minutes, and this repository
is **public**, so GitHub Actions minutes on standard runners are unlimited at no
cost. The expensive-locally work is exactly the work that is free in CI.

Two further facts about the current CI configuration shape the design.
[`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) declares no
`concurrency:` group, so N pull requests already run their checks fully in
parallel with nothing cancelling anything — Test-stage fan-out needs no new
capacity mechanism. And there is no merge queue and no `merge_group` trigger, so
nothing today validates the tree that actually lands on trunk.

This design moves full-suite execution off the maintainer's machine and onto the
pull-request and merge-queue paths, and makes the local orchestrator a consumer
of CI results rather than a producer of them.

## Goals

- Remove every full-suite execution from the local machine, in every stage.
- Let ten or more stories be in CI simultaneously, bounded only by GitHub.
- Keep Backlog through Develop local, where agent-hours are cheap.
- Make a red CI run cheap to diagnose — targeted re-execution of the known
  failing files, never a full-suite reproduction.
- Validate the merged tree, not the pre-merge tree, before anything lands.
- Keep the local machine busy while stories wait on CI.
- Preserve independent close for blocking-defect chains.

## Non-Goals

- No change to Develop's verification contract. `verify-develop.mjs` continues to
  lint, format, and run only the test files changed versus `HEAD`.
- No change to the lane taxonomy (`unit`, `integration`, `slow`, `fast`, `all`).
- No change to the eight-state kanban chain.
- No change to commit attribution. Deliverable location stays message-based via
  the `[#N]` token.
- The `On Deck` → `Assigned` rename (#1206) and the assignee invariant (#1207)
  are independent work and are unaffected by this design.
- Cyclic blocker-chain detection is out of scope. It is a pre-existing gap and is
  recorded below as a follow-up candidate.

## Division of Labor

Local machines run agent-hours. GitHub runners run test-hours. The boundary sits
at the Test stage, where cost inverts.

| Stage             | Where        | What executes                                      |
| ----------------- | ------------ | -------------------------------------------------- |
| Backlog → Develop | Local        | Agent work; `verify-develop.mjs` targeted tests    |
| Test              | GitHub PR    | `fast` + `slow` on the story's own base            |
| Review            | Local        | Issue-structure and story-record inspection        |
| Merge             | GitHub queue | `fast` + `slow` on the speculative merged tree     |
| Triage on red     | Local        | `node --test` on the manifest's failing files only |
| Escalation        | Cloud        | Only when the failing files pass locally           |

**Local concurrency** is bounded by a configurable ceiling on stories in `plan`
or `develop` — the only stages that consume local resources. **CI concurrency**
is unbounded; each story's suite runs in its own sandboxed runner VM.

## State Walk

1. **Develop** completes as it does today, verified by `verify-develop.mjs`.
2. **Test** pushes the branch, opens a **draft** pull request, applies the
   `ci-slow` label, records the PR pointer on the issue, parks the story, and
   writes a `pause:awaiting-ci` timing row. The Test verb runs no tests.
3. **CI** runs `fast` and `slow` on the draft PR. Green is the Test → Review
   gate. Draft PRs do fire `pull_request` events — the trigger is a bare
   `pull_request:`, which defaults to `opened, synchronize, reopened` — so no
   workflow change is needed to make drafts run checks.
4. **Review** inspects issue structure and story records, then marks the PR
   ready, making it eligible for the merge queue.
5. **Merge queue** builds a speculative merge and runs `fast` + `slow` on that
   tree. Green merges; red evicts the entry.
6. **On red at step 3 or 5**, the orchestrator triages from the published failure
   manifest and demotes to Develop.

The draft state is load-bearing. It gives PR-scoped CI and a stable review
surface from the Test stage onward, while keeping the "not ready to merge" signal
honest — and marking ready is exactly what Review already does, so no new act is
invented.

## The Failure Manifest

The manifest is the shared enabler for every triage path. Without it, any
diagnosis — local or cloud — must reproduce a red run from scratch, which for the
full suite is roughly twenty minutes. With it, diagnosis costs one targeted
`node --test`, the same shape and cost as a Develop cycle.

The data already exists in memory.
[`run-tests.mjs:234`](../../../scripts/run-tests.mjs) accumulates
`failures.push({ file, stdout, stderr, status })` for every failing file, and by
the failure block at line 287 the runner holds the complete failing set with each
file's captured output. It prints that to stderr and discards it.

**Change:** serialize it to `.aitm/test-failures.json` alongside the existing
timing artifact.

- Written **unconditionally**, on green as well as red, following the same
  best-effort discipline as `writeTimingArtifact` — which never fails the run.
  Writing on green matters: it lets a consumer distinguish "ran, nothing failed"
  from "no manifest, the runner died."
- Written **before** the failure block's `process.exit(1)`. The existing timing
  artifact is already ordered this way; match it.
- Schema:

  ```json
  {
    "lane": "slow",
    "generatedAt": "2026-08-10T21:00:00.000Z",
    "totalFiles": 885,
    "failedCount": 2,
    "failures": [
      {
        "path": "scripts/task-tracker/tests/unit/core/state-machine.test.mjs",
        "label": "unit/core/state-machine",
        "status": 1,
        "stdout": "...",
        "stderr": "..."
      }
    ]
  }
  ```

**One correction to make while implementing.** The existing push records
`file: label`, and `label` is a display string, not a path. The manifest needs a
`path` field derived from `entry.full` and made repo-relative, so a triage pass
can feed it directly to `node --test <path>` without re-resolving. Keep `label`
as well for human-readable output.

## CI Workflow Changes

Five changes to [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml):

1. **Add `merge_group:` to the `on:` block.** Without it, queue entries run no
   checks and the queue merges blind.
2. **Extend the `slow` job's `if:` condition** to include
   `github.event_name == 'merge_group'`, so the queue validates both lanes. The
   existing `ci-slow` label path stays — that is how the Test stage gets the full
   suite onto the draft PR.
3. **Extend the trunk-materialization step's condition** to include
   `merge_group`. This step exists because the real-git close-gate tests (#733)
   resolve trunk via a local `refs/heads/trunk` branch, which a detached
   pull-request checkout lacks (#745). A merge-queue checkout is a
   `gh-readonly-queue/...` ref and likewise has no local `trunk`, so without this
   the close-gate tests fail spuriously in every queue entry. Present in both
   jobs; extend both.
4. **Add `actions/upload-artifact@v4` with `if: always()`** to both jobs,
   uploading `.aitm/test-failures.json`. The `if: always()` is load-bearing: the
   default behavior skips a step when the job has failed, which is precisely when
   the artifact matters.
5. **Give the two uploads distinct artifact names** (`test-failures-fast`,
   `test-failures-slow`). `upload-artifact@v4` rejects duplicate names within a
   run. The orchestrator downloads whichever exists.

`permissions: contents: read` is unchanged — artifact upload requires nothing
more. This is why the artifact channel was chosen over having CI post the
manifest as a PR comment, which would have required `pull-requests: write`, and
would have capped the payload at 65,536 characters per comment — a ceiling a
handful of Node failures with full stack traces can genuinely exceed.

## Merge Queue

Enable the merge queue on `trunk` with branch protection, and mark both lane
checks required. This is repository configuration, not code.

The queue solves the stale-base problem that ten-wide fan-out creates. Ten pull
requests each cut from trunk at `T0` all go green. The first merge makes trunk
`T1`, and the other nine greens now prove something about a base that no longer
exists. File-overlap heuristics do not catch the dangerous case, which is
semantic rather than textual: story B renames a helper that story C calls, no
files in common, both green, merged result red.

The queue makes the validated tree and the merged tree the same tree. It also
removes merge ordering from the orchestrator's responsibilities — the orchestrator
enqueues, and GitHub sequences. Declared blocker chains and the queue then solve
cleanly separate problems: blockers handle "B needs A's feature," the queue
handles "B and A happen to be incompatible."

The queue is a serialization point, which is why it runs both lanes rather than
just the fast lane. Validating the tree that actually lands is worth the latency,
and the latency is unattended. If queue throughput later proves to be the real
bottleneck at ten-wide, narrowing the queue to the fast lane is a one-line
condition change that loses nothing already built.

## Orchestrator Changes

### The Test verb stops running tests

Today Test runs the full suite once in an isolated sandbox worktree. That
execution is removed and replaced with dispatch: push the branch, open the draft
PR, apply `ci-slow`, record the PR pointer, park the story, write the
`pause:awaiting-ci` timing row. The verb hands the work to CI and gets out of the
way.

### DoD evidence changes source

The Test-stage DoD `tests` key currently proves itself with a local run. Its new
proof is the CI run's conclusion together with a manifest reporting
`failedCount: 0`, with the run id and URL recorded as the evidence.

This is real proof of a real execution that happened elsewhere. What it must
never become is a tick justified by "CI probably passed." The gate reads the
manifest and the run conclusion, or it refuses. Fabricating this evidence is
prohibited under the same rule that governs every other gate.

### WIP policy

[`OUT_OF_REFINE_ACTIVE`](../../../scripts/task-tracker/lib/epic-children-gate.mjs)
currently counts `plan`, `develop`, `test`, and `review` as advancing, and
[`wipAdvanceDecision`](../../../scripts/task-tracker/lib/epic-children-gate.mjs)
hardcodes a budget of one advancing child.

Narrow the advancing set to `{plan, develop}` — the only stages that consume
local resources — and make the budget a configurable local ceiling, default 4.

Narrowing the set is what makes parked-awaiting-CI work, and it does so without a
new predicate: a story in `test` simply stops counting, so `isParked` and the
existing blocker-park exemption are untouched. Stories in `review` likewise stop
counting, since Review is record inspection and runs no tests.

### The PR pointer must be durable

The orchestrator has to find the run again in a later session, so the pull-request
number is written into the issue body as an `<!-- aitm-ci-pr: N -->` marker
through `mutateIssueBody`, and added to the invariant-marker set in
`lib/body-invariants.mjs` so `MarkerLossError` protects it.

### Verdict checking and the do-si-do

Before starting any new stage on any story, the orchestrator resolves outstanding
`awaiting-ci` parks via `gh pr checks`:

- **Green** — resume the parked story, write the `resume` timing row, promote to
  Review.
- **Red** — enter triage.
- **Pending** — continue whatever secondary story is in flight.

Verdicts are checked at **stage boundaries only**, never mid-stage. Interrupting a
story mid-Develop would leave half-applied edits and an unrun `verify-develop`,
which is a worse failure mode than a few minutes of latency on noticing a
verdict.

The do-si-do follows from this: park the story, `pull-next` an eligible
unrelated story, drive it until it reaches the local ceiling or a verdict lands,
then return. `pull-next` already refuses to select a story whose blockers are not
all Done — [`findNextEligibleChild`](../../../scripts/task-tracker/lib/epic-children-gate.mjs)
filters on `childBlockers(c).every((b) => doneNumbers.has(b))` — so a dependent
story can never be started against a base that is about to move, and no new
dependency logic is required.

### The triage verb

A new verb, spawned only on a red CI run:

1. Resolve the run for the story's PR and `gh run download` the manifest.
2. Run `node --test` on the manifest's `path` entries — only those.
3. Diagnose the root cause.
4. Post the audit comment on the issue recording the failing files, the root
   cause, and the demotion.
5. `demote <N> develop --rework`. The flag is mandatory; demote hard-refuses
   without it.

Note the two senses of "publish" that this separates. CI publishes the **machine
artifact**, because only the machine that ran the suite can. The orchestrator
publishes the **audit record** on the issue, because that is the story's
durable history. Two artifacts, two authors.

## Cloud Escalation

Escalation fires only when the manifest's failing files **pass locally**. That
condition means the failure is environment-dependent and local diagnosis is
impossible by construction, which is the one case worth paying for a container.

The orchestrator provisions a disposable environment via
[`scripts/dev-env/setup-cloud.sh`](../../../scripts/dev-env/setup-cloud.sh) on a
`claude/<task>` branch. The cloud agent reproduces, diagnoses, and reports back by
posting a comment on the issue using the existing Worker Report schema, which
already carries a `root_cause` section — no new protocol is invented. A `gh`
comment rather than agent-to-agent messaging, because it is durable, readable by
the maintainer, and survives the container's death.

Keeping this path narrow is deliberate. Building it for a well-defined trigger is
tractable; putting it on the hot path for every red run is not.

## Blocker Chains

Blocker chains are **discovered, not declared**. An agent working `#1251` hits a
blocker mid-Develop, files `#1252`, annotates `#1251` as blocked, shifts to
`#1252`, hits another blocker, and repeats. A five-deep chain is an observed
shape, not a refinement failure, and no planning discipline prevents it.

[Blocking-defect isolation](../../guides/workflow.md#blocking-defect-isolation-dance)
requires worktree-per-rung rooted at **trunk HEAD** — never branched off the
blocked story's branch — and a deepest-first ascent in which each rung reaches
trunk before the rung above rebases onto it. Under this design, "reach trunk"
now means push → `fast` + `slow` on the PR → mark ready → queue entry runs
`fast` + `slow` on the speculative merge → merge.

**A five-deep discovered chain therefore pays five serialized CI-plus-queue
cycles** — roughly two hours of latency before `#1251` can resume. The ascent is
bottom-up and each rung gates the next, so none of it pipelines.

The mitigation is the do-si-do, and it reframes the cost correctly: **a deep chain
has irreducible latency, but it does not cost system throughput**, because the
orchestrator fills the wait with unrelated stories. This raises the value of the
local ceiling — it must be high enough to keep the machine busy across a
multi-hour chain unwind.

## Rejected Alternatives

**Stacking a blocker chain into a single pull request.** Branching rung N off rung
N+1 and merging the whole chain to trunk once would collapse five CI cycles into
one. It is rejected. It re-entangles exactly the histories that worktree-per-rung
exists to separate: because git history is linear, the lower rung's commits become
ancestors of the upper rung's, and the upper rung cannot reach trunk without
dragging the lower one along. This is the #516/#522 incident, which required a
cherry-pick to unpick, and it costs every rung its independent close. Recorded
here so it is not re-proposed as an optimization.

**CI fixes its own failures.** Rejected because CI is a script, not an agent —
rote execution with no intelligence behind it. The design depends on that
property: the runner needs no intelligence because a test failure is a
self-describing artifact, and the intelligence stays local.

**Cloud triage on every red run.** Rejected once the manifest removes the
twenty-minute reproduction cost. With the manifest, local triage costs a targeted
`node --test`; a container spawn plus `npm ci` plus a handoff protocol per failure
buys nothing.

**Parsing the CI run log instead of publishing a manifest.** `gh run view --log-failed`
works today with no code change, but it means regex-parsing console output whose
format is incidental rather than contractual, and it rots silently the first time
the runner's output changes.

**Merging on stale green and fixing trunk forward.** Cheapest to build and the
worst failure mode: a red trunk blocks every other story's merge, and diagnosis
means bisecting ten simultaneous merges to find the incompatible pair.

## Testing Strategy

Unit tests, with shimmed `gh`, for: the manifest serializer including the
`path`-versus-`label` distinction and the write-on-green case; the narrowed
advancing-state set and the configurable ceiling in `wipAdvanceDecision`; the
`aitm-ci-pr` marker round-trip and its `MarkerLossError` protection; and the
triage verb's download, targeted re-run, audit comment, and `--rework` demotion.

A **meta test** asserts the workflow YAML itself: the `merge_group` trigger, the
`slow` job's extended condition, the extended trunk-materialization condition,
`if: always()` on both uploads, and the distinct artifact names. This follows the
precedent of `ci-workflow-history.test.mjs`, which exists because a silent
workflow regression kept trunk red from `d97151b` onward (#949). Workflow
misconfiguration is invisible locally and deserves the same guard.

## Consequences

- **The full suite runs twice per story** by design — once on the draft PR
  against its own base, once on the speculative merge. Free in runner minutes,
  paid in latency.
- **Offline work now ends at Develop.** Test onward requires network. This is a
  genuine loss relative to today's local-sandbox model.
- **Queue eviction cascades.** A late failure in a ten-wide wave rebuilds every
  entry behind it — expensive in wall time, not money.
- **Deep blocker chains have irreducible latency** of roughly one CI-plus-queue
  cycle per rung, mitigated but not removed by the do-si-do.
- **The `gh pr merge` constraint is unchanged.** Enqueueing still goes through
  it, so Codex sessions can close unattended and Claude sessions still need the
  maintainer at the merge. The merge queue does not fix this; it only guarantees
  that what merges was actually validated.
- **A cyclic blocker chain is still undetectable.** Two issues blocking each other
  make both permanently ineligible, and `pull-next` reports `no-eligible` forever
  without explaining why. Pre-existing; a follow-up candidate, not in scope here.

## Decomposition

This is an epic. Suggested children, in dependency order:

1. **Failure manifest** — `run-tests.mjs` serialization, schema, `path` field.
2. **CI workflow** — `merge_group` trigger, slow-lane and trunk-materialization
   conditions, artifact uploads, meta test. Depends on (1) for the artifact path.
3. **Merge queue enablement** — repository configuration and documentation.
4. **WIP policy and park/do-si-do** — advancing-set narrowing, configurable
   ceiling, `aitm-ci-pr` marker, verdict checking at stage boundaries.
5. **Test verb dispatch and DoD evidence source** — depends on (2) and (4).
6. **Triage verb** — depends on (1) and (5).
7. **Cloud escalation** — depends on (6).
8. **Documentation** — the workflow guide, the test-lane and cloud-environment
   guides, and `CLAUDE.md`.

The final split is a planning decision and is not fixed here.
