# Issue 2061 implementation and native admission

## Authority and bounded scope

Task 15 of the active epic plan at
`0ad57329a5eb4e3aec395adb06a6216178e45c87`, implementing the timing candidate
and confirmation slice of original technical Task 5 at
`f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Governing specification:
`docs/superpowers/specs/2026-10-19-2039-local-estimation-guarded-publication-design.md`
at `dafb1d276036ddc17490f76329f6aa2c09732a15`.

Dependencies #2059 and #2060 are native Done. Completed wave 10 brought the
epic to 20 of 32 direct children Done. This child is wave 11 and is
not yet accepted. Standalone prerequisites #2084 through #2087 remain separate
from that count and await their delivery boundary.

The original worker branches and worktrees remain preserved. Native execution
continues serially in the actual owner app checkout, b187, branch
`codex/2039-draft`, without a foreign-worktree override, session impersonation
or hook change. Initial implementation is inline with TDD; independent
GPT-6.1 Sol / medium review remains mandatory for this leaf. Source base:
`ee8cae306052af36d7f4b830da4b549e1193ec45`.

Native Start 92467 completed with role agent and confirmed relocation. Binding
`d4e7ab85-358c-4121-998e-ac0e0a81b798` agrees with the actual checkout and
branch. Initial Explain could not establish state; an unsupported explicit
Plan explanation also failed validation. No lifecycle move followed those
results. Live body, board and binding read-back agreed on Ready for Planning;
a fresh diagnostic Explain returned Ready. The original initial-read failure
cause remains unproven. Native Plan 49987 completed successfully.

Native supplied-hours compatibility estimate 17005 completed successfully.
Its whole-hour appendix projection is 4h; the accepted local engineering
allocation remains S / 3.5h (1.5 implementation, 1 focused verification,
1 review and repair), with rubric 0 and no historical cloud estimation inputs.
Publication operation `c7e07c07-e2ba-45ce-acd9-5fa633cc444f` was complete with
all three effects confirmed. An accidentally concurrent first deep-dive
comment command was guarded-refused while that publication was pending and
posted nothing. Subsequent native mutations were serialized.

The deep dive was posted and mirrored through native commands from
[comment 6351639714](https://github.com/kburson/ai-task-manager/issues/2061#issuecomment-6351639714).
Native Full-Auto Plan approval 83202 completed with its audit at
`2026-10-22T21:26:56Z`. Native promoter 84132 completed Plan to Develop with
all eight tail checks verified. Binding and actor state agree on Develop,
entry `2026-10-22T21:28:20.971Z`. Fresh Develop Explain reported the expected
missing AC/code/commit evidence; no Test move was attempted.

## Source-grounded rulings and contracts

The active plan names the timing internals bridge, but that bridge explicitly
forbids production imports. Original technical Task 5 already owns the real
timing-comment module. A narrow production render-only batch helper therefore
reuses the existing private row and initial-comment codecs. The live buildRow
entrypoint retains its unconditional timestamp check and single parameter
snapshot. No production code imports the test bridge or its internals.
Retained rendering samples no clock, dispatches nothing and grants no timing,
work or lifecycle authority. The existing native table grammar is reused.

`freezeTimingCandidate({generation,transition})` consumes the complete verified
store record: manifest, generation and payload map. References alone cannot
supply baseline bytes. It returns one immutable, deterministic timing effect
with an exact body/digest, target identity and local creation intent when
absence is established. It requires the actual native phase-exit/entry events
already ingested for that transition, matching actor and timestamp, rather than
manufacturing a pair from state names. A recognizable heading cannot authorize
adopting a read-only comment; duplicate canonical resources refuse.

The candidate's timing sourceEvents fence the full frozen ingestion input.
Its events, eventIds and eventsDigest describe only the unpublished subset.
The ingested and prior published cursors remain opaque delivery boundaries;
chronological slicing would lose a later backdated delivery. Exact normalized
event records are retained inside the same timing comment, preserving IDs,
actors, fractional seconds, actual timestamps and Unknown. This creates no
additional cloud metadata resource. Existing human table display retains native
integer seconds; the exact records retain fractional inputs for the coordinated
reader migration. No reader activation or competing timer is introduced here.

`confirmTimingPublication({store,batchId,observation})` resolves the persistent
writer registry and current session/worktree, holds the native issue lock,
validates the stored frozen batch, and compares exact native content and
revision metadata before acknowledging its cursor. A newly created resource
also requires a complete, unique current comment inventory. Confirmation
updates only that resource baseline, working reference, publication cursor and
confirmed effect outcome. The original batch baseline and independent batch
completion status remain intact. An identical confirmed replay is a no-op;
failed persistence or inconsistent evidence cannot return confirmed success.
There is no remote dispatch or automatic retry port.

One production runtime module is intentionally added; the exact package
inventory rises from 971 to 972 and asserts the module is shipped. Extracting
the codec moved three existing source census locations. Only those measured
line entries changed in the GraphQL inventory and timing-emitter baseline;
counts, classifications, expressions and strict comparison remain unchanged.

These are bounded implementation rulings within the accepted capability and
allocation. Their risk is incompatibility with the later coordinator or reader
contracts, which must be caught by independent leaf and whole-branch review.
The code is not permission to weaken a native guard or publish staged authority.

## Initial candidate verification record

Local runtime is Node 26.8.1 on Darwin. Raw outputs, including unsuccessful
trials, are retained in compressed form with raw and archive byte counts,
SHA-256 digests and actual exit codes in the evidence manifest.

- Initial RED: 11 tests, 1 pass and 10 failures for the missing candidate
  implementation; the existing live retroactive-timestamp refusal passed.
- Initial implementation trial: 10 of 11 passed. Exact local read-back exposed
  the store's canonical payload path rewrite. The new reference was corrected
  to the existing content-addressed path; exact comparison was retained.
  The next run passed all 11.
- First adversarial expansion: 15 of 17 passed; two new fixtures used the
  nonexistent test:completed slug. Their literal input was corrected to native
  test:passed; no production admission was weakened. All 17 then passed.
- A genuine timestamp-getter regression failed because the extraction read
  the getter twice. Restoring the original single-destructure contract made
  the test pass, preserving live timestamp admission.
- A genuine second-transition regression failed because old published event
  IDs appeared in the next effect's event subset. Separate sourceEvents and
  pending event fields made it pass while retaining the full timing history.
- The 1-event and 1000-event cases use refusing gh and throwing fetch transports
  through ingestion, freeze and confirmation. Both observe zero remote calls.
  They establish offline coalescing and cursor behavior, not live provider
  acceptance of an arbitrarily large comment.
- Final focused run: 99 tests passed across the candidate, ingestion, event,
  canonical timing, Unknown projection and package-boundary suites.
- First full fast run: 997 of 999 files passed. Only the two exact source
  inventories failed because their line locations moved. The measured three
  locations were updated; all 13 tests in those inventory suites then passed.
- Final full fast rerun: all 999 files passed, actual exit zero (76055),
  98.2 seconds: 959 pure unit files in 55.7 seconds and 40 direct-subprocess
  files in 42.5 seconds, each section below its unchanged 600-second limit.
- Final full lint and format reruns returned actual exit zero (49827, 43638).
  These verified the initial candidate only; review repair below changes source.
  Report formatting and scoped documentation checks are recorded separately.

The new roughly 600-line candidate test file triggers the existing soft
400-line feature-review advisory. It remains below the hard code-line limit
and is submitted for independent review rather than hidden as an old baseline.
Other retained baseline advisories also remain visible.

## Acceptance boundary and review focus

Independent review, final exact-head CI, native AC evidence, Test, Review,
approval and Close remain pending. No acceptance checkbox was preemptively
checked. The required CI provider must execute the complete disjoint current
unit/integration/slow inventories with valid artifacts, pass security and
budget checks, and validate the exact source SHA. Earlier ee8 CI does not
validate this new source.

Review frozen versus pending event identity, legitimate pair ordering,
historical row preservation, Unknown and fractional evidence, ownership and
creation inventory, local commit uncertainty and replay, candidate size growth,
and the future batch/publisher/reader integration boundary. Final publication-size enforcement is now local as described below. Later
integration must still prove provider dispatch, current ownership and complete
resource vectors; offline coalescing is not production-activation proof.

## First independent review and repair

Initial candidate `980ebe032d9be4ebc75ff23116049d3337a9d905` was not pushed
or accepted. The full independent Sol / medium review and every author
disposition are retained in the adjacent round-1 record. Its four Important
findings were accepted; ambient timezone dependence was raised from Minor to
Important because it can block recovery after a real publication.

The repair preserves one comment and all exact native records. Only legitimate
phase pairs are projected as new human rows. Ordinary intervals remain exact in
compressed metadata, including backdated delivery and fractional seconds. All
existing human history stays in place. The record binds the exact table digest
and separately validates the native projected pair rows, rejecting alterations,
missing rows or duplicate rows even if a table digest is recomputed. This is an
explicit revision of the initial per-event human projection, recorded before
implementation; the later reader and coordinator migrations must consume it
before coordinated activation.

New rows use UTC through the existing codec; native input timestamp strings and
historical displayed offsets remain unchanged. Same-instant ordinary events
cannot split an exit/entry pair. Creation confirmation refuses a provider ID
already in the original baseline, preventing adoption of a read-only resource.

Canonical event JSON uses bounded gzip inside the same comment. A conservative
65,536-byte final UTF-8 budget is stricter than the documented comment character
limit. The representative one-event case plus its native pair is 1,216 bytes;
the 1,000-event case plus its pair is 13,208 bytes. Both retain all exact records
and prove zero remote calls through ingestion, freeze and confirmation. Larger
or incompressible history refuses without loss or cursor advancement; unlimited
capacity is not promised. Decoded records are bounded to 4 MiB. Recovery validates
and reuses the original frozen encoding rather than depending on identical
compression bytes across runtime versions. No live provider-size acceptance
probe was made. Sources: [GitHub safe output limits](https://github.github.com/gh-aw/specs/safe-outputs-specification/)
and [reported IssueComment validation](https://github.com/actions/dependency-review-action/issues/730).

Eight targeted review cases first failed, then passed. Two failed edit attempts
left source unchanged and are retained as unapplied trials. The first full
repair runs failed 24/25 and 26/27 solely because an original backdated fixture
still expected the superseded ordinary paused row projection; that expectation
was corrected, preserving the case, decoded 0.125 value and pending event IDs.
The final named verifier passed all 27, including two additional adversarial
checks for recomputed metadata and bounded decompression. A spell-check failure
on an error word was corrected without changing refusal semantics.

The named test keeps all assertions. Existing fixture/store/context setup moved
to a test-only helper after necessary review regressions approached the hard
size limit. This supersedes the earlier optional extraction deferral; no
production test interface was added. The soft 400-line advisory remains new.
Measured source census entries now point to GraphQL line 902 and native phase
emitter lines 385/394; strict counts and classifications remain unchanged.

Final repair suite results and fresh second review follow. Exact-head complete
CI and all native acceptance gates remain pending.

Final repair verification completed with actual exit zero: 107 focused tests,
13 strict inventory tests, all 999 fast files (99.9 seconds; pooled 53.0/600 and
subprocess 46.9/600), full lint, full formatting, and scoped spelling. The
named verifier passed 27/27. All 22 additional completed outputs were archived
and verified against raw bytes, including all six failed trials. Source has
not changed since these final runs. Documentation additions are verified
separately. Fresh independent round 2 and exact-head CI remain pending.
