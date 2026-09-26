<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b9cd498c93d682cc35e5a079769beb15"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
artifact_commit: "688c1d950931fbb150e386d8a046194fbc7bf15f"
artifact_blob: "2a6eac1c0578fe5c9dcb76749e1f0815f2c88a9c"
artifact_digest: "sha256:01c442b920faf09a8d2344b51bdbaf2ec2670e3ddd20e6ac3cea5ca22b5486e7"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3a1cd530e39a6373b7da2e38bb82b90fbdaecb8ad3128115642a08d9088cc3a3"
  identity_source: "declared"
started_at: "2026-09-26T17:46:39.896Z"
submitted_at: "2026-09-26T18:07:49.261Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revisions requested, narrowly. All five round 1 findings are genuinely fixed,
not paraphrased: I re-read the revised plan at 688c1d95 and confirmed each
change lands where the finding said it had to land, with no regression to the
parts that were already sound. The four optional suggestions were also taken.

Two defects remain, and I want to be precise about their provenance because
they are not the same kind of thing. R2-F001 is a gap the revision itself
opened: Task 4 now owes an `x-ratelimit-*` budget-context report, but no task
captures those headers, so the new acceptance criterion is satisfiable only by
an always-empty section — and the obvious shortcut an implementer reaches for
is the one the spec explicitly forbids. R2-F002 is mine: three spec
requirements in storage and reporting have no owning task, and they had no
owning task in round 1 either. I missed them. Raising them now is late, and the
author is entitled to weigh that; I am raising them because an unowned spec
requirement in a plan whose entire job is to hydrate five children is work that
silently disappears, and the cost of naming it now is one round.

Verified by reading the revised plan in full, the ratified spec's Instrumentation,
Storage, and Reporting-and-baseline sections, and
`scripts/reports/generate-value-report.mjs`. Read-only: no tests run, no Git
command run, artifact not edited. Protocol mode is `normal`; authority assurance
is `unavailable`.

### Round 1 dispositions verified

- **R1-F001 fixed.** Task 3's modify list now names
  `scripts/gh/lib/github-projects.mjs` (line 280) and scopes
  `scripts/gh/lib/gh-client.mjs` to context propagation only. Task 3's Interface
  (lines 286-290) assigns `gql()` cost augmentation and the private-observation-
  context handoff explicitly, with the shim owning the single durable record and
  `gql()` stripping its private alias. The stdin `gh api graphql --input -`
  payload shape is a named fixture (line 299), and line 300 adds the duplicate-
  record test I asked for. This is the resolution I wanted.
- **R1-F002 fixed.** Parent AC5 (lines 76-78) now carries point-cost and latency
  distributions, account-budget context, and aggregation file-open/read costs.
  Task 4 lines 360-367 own all four outputs, including the HTTP-observation
  versus whole-CLI latency separation and known-cost-only percentiles with
  sample counts. Matches spec lines 345 and 354 and the storage paragraph at
  line 324.
- **R1-F003 fixed.** Parent AC4 line 74 carries the no-extra-GitHub-call clause.
  Task 3 line 306 owns the collection-side enforcing test, Task 4 line 368 the
  reporting side, and Task 3 lines 308-310 own local-only resolution,
  dispatch-time capture, `unknown` fallback, multi-issue marking, and the
  no-cost-division rule.
- **R1-F004 fixed** via the second option I offered. `action-capture.mjs` is out
  of Task 1's boundary (line 171), Task 1 line 193 states the prohibition
  outright, and Task 3 lines 302-304 hold sole write access. The shared-file
  hazard is gone.
- **R1-F005 fixed.** Task 5 lines 432-437 require preflight identification of
  the independently scheduled workflow, a record of why it was scheduled
  independently, and preliminary-baseline-plus-deferred-parent when none lands
  in the window. The prohibition on synthesized traffic is now backed by a
  written alternative.
- **Optional 1-4 all taken:** schema fields completed (lines 184-188), the
  #1818 self-reference corrected (line 101), Task 4's Task 1 dependency added
  (line 337), and the inert `git log --oneline -1` removed from Task 5.

## Findings

1. **R2-F001 [P2] - Nothing captures the response headers Task 4 now reports.**

   The revision added Task 4 line 363: report account-budget context from
   `x-ratelimit-*` headers, separated by endpoint host and known
   `budgetScopeId`. Task 1 line 186 defines `rateLimit` and endpoint host as
   schema fields. No task populates them. Grepping the plan for `header` returns
   exactly one hit — Task 4's report bullet. Task 3's collection bullets cover
   augmentation, dispatch, duplicates, classification, no-extra-calls, and
   context resolution, and say nothing about reading response headers.

   So the new AC5 clause is dischargeable by a Task 4 implementer who emits an
   empty budget section, because the records genuinely contain no header data.
   That is the same defect shape as R1-F002, inverted: there, an output had no
   owner; here, an owned output has no input.

   The hazard is specific, not theoretical. Spec lines 183-188 draw a sharp
   line: direct HTTP adapters can read headers without changing payloads, but
   the shim does not normally expose response headers, so header context must be
   left absent **with an explicit transport-unavailable reason**, and `--include`
   must not be added where it would change stdout contracts. An implementer
   holding a report bullet and no collection bullet has one obvious way to make
   the section non-empty, and it is `gh --include` — a stdout-contract change in
   an epic whose first global constraint is preserving original behavior.

   The asymmetry is real and worth encoding rather than leaving to discovery.
   `scripts/reports/generate-value-report.mjs:156` already holds a `fetch`
   Response whose `.headers` are available and currently discarded; that adapter
   and any other direct-HTTP site can supply true budget context. The shim path
   cannot, and its records should carry the transport-unavailable reason so Task
   4 can distinguish "no budget data exists for this transport" from "budget
   data was lost."

   Add a Task 3 bullet: capture `x-ratelimit-limit`, `remaining`, `used`,
   `reset`, and `resource` on direct HTTP adapters only; record an explicit
   transport-unavailable reason on shim-observed records; do not add `--include`
   or any other flag that alters stdout. Add a Task 4 fixture proving the report
   renders shim-only data as transport-unavailable rather than as a zero or a
   blank.

2. **R2-F002 [P2] - Three spec requirements still have no owning task (round 1 miss).**

   These were absent in the sealed plan I reviewed in round 1 and I did not
   raise them. Flagging that plainly: this is not a goalpost move prompted by
   the revision, it is a coverage miss on my side, and if the author judges any
   of them better handled at child deep-dive than here, an explicit deferral
   recorded in the plan closes them as cleanly as an owning bullet would — the
   same escape hatch R1-F002 had.

   - **Owner-only permissions.** Spec: "Use owner-only directory/file
     permissions where supported." Task 2 owns the writer files and has
     permission-context *enrollment* tests (line 235), but no bullet sets or
     asserts filesystem modes on `<git-common-dir>/aitm/graphql-usage/`. This is
     a shared directory under a Git common dir on multi-user hosts, and the
     records are metadata about a maintainer's work. Cheap to add to Task 2,
     awkward to retrofit once the writer ships.
   - **Retention and cleanup.** Spec: keep data until explicit local cleanup
     after export; cleanup must exclude active writers and disclose removed
     observation intervals; any operator-directed pause or cleanup is a
     disclosed coverage gap. Task 2 owns soft-cap diagnostics and retained
     byte/file counts (line 247) but not cleanup; Task 4 reports storage gaps
     but not removed-interval disclosure. The plan's Out of scope list does not
     exclude cleanup, so it is in scope and unowned. The active-writer exclusion
     rule matters precisely because the storage model is one file per process
     incarnation across concurrent worktrees — naive cleanup during a baseline
     run truncates the run it is measuring.
   - **Snapshot of readable extent.** Spec: "Snapshot each file's readable
     extent so active appends do not make a report unbounded." Task 4 handles
     partial final lines (line 357) but not extent snapshotting; these are
     different mechanisms — one tolerates a torn trailing record, the other
     bounds the read against a concurrently growing file. Task 5's baseline runs
     reports against live collectors in two worktrees, which is exactly the
     condition that makes the unbounded read reachable.

## Required changes

1. R2-F001: give Task 3 a header-capture bullet scoped to direct HTTP adapters,
   require the explicit transport-unavailable reason on shim records, state the
   no-`--include` constraint, and add the Task 4 fixture distinguishing
   transport-unavailable from zero.
2. R2-F002: give owner-only permissions and cleanup semantics an owning bullet
   in Task 2, and extent snapshotting an owning bullet in Task 4 — or record any
   of the three as explicitly deferred with the reason.

Keep the ratified spec unchanged; both are plan-alignment changes, and neither
expands implementation beyond the spec. The author should make the artifact
edits and record dispositions in the generated author response.

## Optional suggestions

1. Task 1 line 187 covers "instrumented-request cost labeling" but not the
   augmentation *version* the spec asks be recorded so later comparisons can use
   the same method. One schema field.
2. The Traceability Map row for Task 4 still reads "report fixtures for foreign
   roots, gaps, denied participants, known-cost rows" — accurate before the
   revision, now incomplete against Task 4's latency, budget, and read-cost
   bullets. Summary table, low stakes, but it is the surface a hydrating agent
   skims first.
3. Estimates are unchanged at 46 hours parent total while Task 3 and Task 4 each
   absorbed real new bullets. Defensible on the grounds that these were always
   implicit spec obligations, but if the child estimates are load-bearing for
   scheduling, Task 3 at 10 hours now carries `gql()` instrumentation, stdin
   compatibility fixtures, no-extra-call tests, and context-resolution rules
   that were not in its 10-hour form.

## Decision

revisions-requested
