<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e9e2aa0015cbae662dfb0e828179b031"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "f617955dea4f6a1ecaf32abef1713cf4a9ab270e"
artifact_blob: "54e3924606d0d73eda0437dfff723d261b535a7d"
artifact_digest: "sha256:e10efe146cb3a2b8b718716d2338a7e505dfaaeee40f39a55ca90c3ac3b9b045"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:ee5a665a5fa33ba576c25696f7f811a12dfb91eceaf00e3c1944a8104a19d54e"
  identity_source: "declared"
started_at: "2026-09-25T21:17:30.939Z"
submitted_at: "2026-09-25T21:47:41.051Z"
finding_ids: ["R2-F001","R2-F002","R2-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The revision is substantive and the dispositions are honest. All five turn-1
findings were engaged on their merits rather than deflected, and in two places the
author went further than I asked: the observation that action-capture's leading
`mutation` regex must not default unsupported documents to a confidently classified
query is a real defect I did not catch, and the transport-specific reason for absent
header context is a cleaner answer than my suggestion. The four-mode compatibility
requirement, the actual-runtime reachability probe with distinct denial classes, the
participant manifest with lower-bound labeling, and the explicit refusal to promise
an async flush from a synchronous parent are all correct.

On R1-F002 I accept the decline without reservation. The author states a direct user
requirement for Git common-directory storage; that instruction governs, and it is not
mine to re-litigate. The finding's residue — acknowledging that the main-worktree
`.tmp` root is genuinely shared, and carrying a narrow written `CLAUDE.md` exception
as an implementation deliverable — is exactly the right resolution, and Goal 2 now
states it plainly. I also accept the author's correction on R1-F003: my scoped-host
denial is evidence of possible population bias, not proof that every runtime is
denied, and the spec's per-runtime probe is the better instrument.

My verification of the author's citations: `bin/aitm.mjs:97` does call
`prepareActionCaptureEnv`, confirming the existing bootstrap; `bin/cli.mjs` does not,
which is why the spec's requirement to wire the shell route is a genuine new change
rather than an existing behavior; and the shim's write path is synchronous
(`atomicWrite` uses `writeFileSync`/`renameSync`, and `finishCapture` runs inside
`child.on('close')` before `run()` resolves), so the synchronous-caller claim in
R1-F005 holds as stated.

What remains are three consequences of the new shim-first architecture that the
revision has not yet reconciled with sections written under the old adapter-first
design. They are not repeats of turn-1 findings; they exist only because the design
changed. Two of them (R2-F001, R2-F003) bear on whether the acceptance criteria can
be met and whether the baseline can answer the question the spike was commissioned
to answer. All three are cheap to fix in the specification and expensive to discover
after implementation.

Evidence method: read-only inspection at artifact commit
`f617955dea4f6a1ecaf32abef1713cf4a9ab270e`. No mutating command, no GitHub call, no
edit to the artifact, index, or any ref.

## Findings

### R2-F001 — The shim path carries no session identity, but the storage layout and AC3 both require per-session attribution

The storage layout is
`<git-common-dir>/aitm/graphql-usage/v1/<worktree-id>/<session-id-or-unknown>/`, the
raw event schema lists `sessionId` alongside `worktreeId` and `processId`, the
reporting section breaks down usage "by hour ..., worktree, session, issue,
lifecycle state, and operation," and acceptance criterion 3 requires that two
worktrees emitting concurrently "each retain independent session attribution."

The revision now routes the dominant share of collection through the action-capture
shim. That boundary has no session identity to give it. `prepareActionCaptureEnv`
emits exactly `PATH`, `AITM_CAPTURE_REAL_GH`, `AITM_CAPTURE_PROJECT_DIR`,
`AITM_CAPTURE_REPOSITORY`, `AITM_CAPTURE_ISSUE`, `AITM_CAPTURE_INVOCATION_ID`, and
`AITM_CAPTURE_COMMAND` (`action-capture.mjs:216-225`), and its caller supplies only
`{env, cwd, command}` (`bin/aitm.mjs:91-104`). No session identifier is constructed
or propagated. `AITM_CAPTURE_INVOCATION_ID` is per-invocation, not per-session, so it
cannot stand in.

The repository does have a session concept — `sessionDir(sid, projDir)` and
`activeTaskPath(sid, projDir)` in `scripts/task-tracker/paths.mjs` are keyed by a
session id — so this is a propagation gap, not a missing capability.

As written, every shim-collected observation lands in the `unknown` session
directory. The schema tolerates that ("unavailable IDs are explicit"), but the
consequences are not benign:

- AC3 cannot be satisfied on the shim path, which is now the primary path. It can
  still be satisfied by a Node HTTP adapter test, which would demonstrate the
  criterion on the minority surface while the majority surface is unattributed.
- Concurrent sessions in the same worktree collapse into one `unknown` directory,
  so the per-session breakdown the reporting section promises degrades to a
  per-worktree breakdown for most traffic.
- The participant manifest in the baseline section enumerates "every intended
  worktree/session and its enrollment result." If sessions are not identifiable in
  the records, the manifest's session rows cannot be reconciled against observed
  data, which weakens the denial accounting added for R1-F003.

Resolve it one of two ways, explicitly: propagate a session identifier through the
usage bootstrap into the shim environment and say where it comes from; or state that
shim-collected observations are attributed at worktree and process granularity only,
and amend AC3, the storage path, and the reporting breakdown to match. Either is
acceptable. Leaving `session-id-or-unknown` in the path while most writers are
`unknown` is the option that reads as coverage without being coverage.

### R2-F002 — The per-invocation process model collides with the one-writer-file-per-process storage rule and with session-granular enrollment

The Shared storage section still says: "Each process incarnation uses a random unique
writer ID in its append-only JSONL filename," and "Serialize writes within that
process, including overlapping async calls." That text was written for a long-lived
Node process making many GraphQL calls. Under the shim, one process incarnation is
one `gh` invocation, which is typically one observation.

Two concrete consequences:

- **File count.** A single run of `init-project-config.sh` produces at least 25
  invocations, hence at least 25 single-line JSONL files. A multi-worktree baseline
  over a working day produces thousands of small files under the Git common
  directory. The soft cap added in this revision is expressed only in retained bytes
  ("Check and report total retained bytes"), which is precisely the metric that stays
  small while file and inode counts grow. The reader must also open every one of them
  per report. Extend the preflight and periodic reporting to cover file count, not
  only bytes, and say whether writers may append to a per-session or per-worktree
  file rather than one file per process.
- **Enrollment cost and caching.** The reachability probe is specified "before
  enrolling a worktree/session" and consists of create, append, flush, read, and
  remove. The shim has no session-scoped state and no memory across invocations, so a
  literal reading runs five filesystem operations against the common directory on
  every single `gh` call. The specification needs to say where the enrollment result
  is cached, how long it is valid, and what happens when a cached enrollment goes
  stale mid-run — and, if the cache lives in the shared root, how a probe failure is
  distinguished from a cache-read failure.

Neither is hard to specify. Both are hard to retrofit once the collector is written
against the current wording.

### R2-F003 — After the shim-first change, most traffic has unknown cost by design, and the specification sets no threshold at which the baseline is declared unable to rank

This is the finding I would most want answered before implementation starts.

The specification now says cost augmentation "supports known Node request builders
with compatibility fixtures; the shim alone does not rewrite arbitrary shell query
text or buffered stdout," and that "Other shim calls retain explicit unavailable cost
until safe augmentation is demonstrated." Mutations already record
`mutation-cost-unavailable` by design and correctly so.

Take that together with the reporting rules, which I continue to regard as the best
part of this document: "Rank known-point contributions as lower bounds; do not rank
two operations' total point costs when missing costs prevent the comparison," and "No
known-cost percentage may imply all HTTP traffic was observed when opaque
invocations, uncovered sites, or collection gaps exist."

The composition is now: the 25 shell sites are opaque with unknown cost; every
mutation is unknown cost; high-level `gh issue` and `gh project` invocations are
opaque; only Node request builders with fixtures yield exact costs. Goal 1 is point
attribution, and the whole purpose of the baseline is to rank operations so the
backlog epic can be prioritized. It is entirely possible for this spike to execute
exactly as specified, honor every honesty rule, and produce a report that correctly
declines to rank anything.

That would not be a bug. It would be an expensive way to discover a scoping problem.

The specification should state, before implementation, a minimum known-cost coverage
threshold — as a share of observed GraphQL calls, or of the operations intended for
ranking — below which the baseline is declared insufficient for prioritization, plus
what happens when the run lands below it. The honest options are all acceptable: pay
for wider Node-builder augmentation coverage, accept call-volume rather than point
cost as the ranking signal and say so in the goals, or accept a preliminary result.
What is not acceptable is leaving the threshold implicit, because the reporting rules
will then produce a correct non-answer at the end of a real measurement window.

A related smaller point in the same area: the specification says mutation call volume
"remains useful evidence," but the Goals section still leads with point attribution
and the baseline's stated purpose is ranking by points. If volume is expected to
carry most of the prioritization weight in practice, Goal 1 and the baseline section
should say so directly.

## Required changes

1. **Resolve session attribution on the shim path.** Either propagate a session
   identifier into the usage bootstrap environment and state its source, or declare
   shim observations worktree-and-process attributed and amend AC3, the
   `<session-id-or-unknown>` path element, and the reporting breakdown accordingly.
   State how the participant manifest's session rows reconcile against records under
   whichever choice is made. (R2-F001)

2. **Reconcile the storage rules with the per-invocation process model.** Say whether
   writers may share a per-session or per-worktree file instead of one file per
   process; add file count to the preflight and periodic retained-size reporting
   alongside bytes; and specify where the reachability-probe enrollment result is
   cached, its validity window, and the handling of a stale or unreadable cache.
   (R2-F002)

3. **Set a known-cost coverage threshold and a stated fallback.** Define the minimum
   known-cost share required for the baseline to support ranking, and state what
   happens below it — widen augmentation, fall back to call volume as the declared
   ranking signal, or declare the result preliminary. If call volume is expected to
   carry the prioritization, align Goal 1 and the baseline section with that.
   (R2-F003)

## Optional suggestions

1. AC3's "healthy-storage, normal-exit concurrency tests" now sits alongside AC9's
   real-runtime reachability check. Consider stating that AC3's healthy-storage
   condition is itself established by the AC9 probe, so the two criteria cannot be
   satisfied by test environments with different permission contexts.

2. The Collection design still opens with "a shared observation interface with
   adapters for existing transport boundaries," which reads as the pre-revision
   adapter-first framing. A sentence placing the shim as the primary boundary and the
   HTTP/builder adapters as the augmentation-capable minority would keep an
   implementer from reconstructing the superseded architecture from this paragraph.

3. Consider recording, per observation, which launch route installed the collector
   (`bin/aitm.mjs`, `bin/cli.mjs` shell route, measurement launcher, inherited
   environment). Given that uncovered traffic is defined by the absence of a launcher,
   route provenance would make the uncovered-site accounting checkable from the data
   rather than only from the inventory.

## Decision

revisions-requested
