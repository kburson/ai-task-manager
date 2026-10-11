<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-0b4f795d5c595c5b55da425a257660f9"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
artifact_commit: "79c0baea37a7a2406bf34aa1cc482c8639e988f0"
artifact_blob: "ee5874eed7cf04b524ac4399c3b8932bc81ca9ce"
artifact_digest: "sha256:4d0a9d91aed5bb62a8c6d2de28fa8f111700f1dc7f14dfb01ee0a9b0c225111b"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7f709c3acc0a5562493b71731ee6551460300f0ea6ca3ac56fa6825532a2c6f4"
  identity_source: "runtime"
started_at: "2026-10-11T19:23:05.405Z"
submitted_at: "2026-10-11T19:29:34.060Z"
finding_ids: ["R2-F001"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised artifact (digest
`sha256:4d0a9d91aed5bb62a8c6d2de28fa8f111700f1dc7f14dfb01ee0a9b0c225111b`, commit
`79c0baea37a7a2406bf34aa1cc482c8639e988f0`) against the author's round 1 response.
This was read-only inspection of the source and test fixture. I ran no tests, made no
Git or GitHub call, and did not touch the artifact.

All four round 1 findings are resolved:

- **R1-F001 — resolved.** The new "Observable completed16 resume result" section pins
  `exit`, `code`, `phase`, `preparationReason` and `tail` for all four terminal
  categories, and gives the partial-field rules for each. It chooses the snapshot-only
  option for showing 17/18 progress, and requires qualification to assert the full
  snapshot and operation trace in every category. That closes the "identical record
  hides replay" gap. The fixed conservative reason, with no inspection of accessors on
  untrusted thrown objects, is a defensible choice.
- **R1-F002 — resolved.** The frame keeps `header.original.actor.identity` only as the
  expected value. It cross-checks that value against fresh `currentSessionId()` and
  `aiAppName()` captures and against `context.executor.sessionId`, at frame creation
  and at every cache18 operation boundary. Cache18's intent `sid` and active-task path
  may come only from that cross-checked identity. The design also clarifies that
  "historical actor maps" means the first-entry custody maps. A matching qualification
  case was added.
- **R1-F003 — resolved.** Frame admission, the existing read and the resume tail must
  stay inside the same `stage-write` `runMemoryContext` and
  `withMemoryStageEffectQuarantine`. Each must positively require
  `isMemoryStageEffectScope()` and recheck it with custody. Each must also refuse
  before any `DEFAULT_TAIL_STEPS` function or `gh` transport runs, instead of falling
  through to the host branch of `runPostCommitTail`. An outside-scope qualification
  case was added.
- **R1-F004 — resolved.** Step 4 of the existing read now requires, before custody
  registration, equality with the whole step16 `readback.read.response`, meaning raw
  `stdout`, empty `stderr` and zero `exitCode`. This matches what
  `readMemoryNativeStageTransition` records at `store.mjs:3739-3742`. It also requires
  equality with `readback.census` and with the reconstructed `afterResources`, body and
  stage. Envelope-only drift must refuse at the read, and a qualification case covers
  it.

All four optional suggestions were also taken. The dropped spaces are restored. The
stuck interrupted-transaction consequence is stated, with #1923 and #1925 named as
the follow-up owners. The `target: 'test'` and empty `STATES.test.onEnter`
restriction is explicit and refuses before the read. `tryNativeStageOriginalEntry` is
named in the token contract and in the overlapping-call case.

One new issue came out of the revision, and it is a required change. The revised
contract deliberately changes the observable behavior of a completed16 restart. An
existing fixture case asserts the old behavior for exactly that snapshot. The design
still instructs, in two places, that this case and "all original cases/assertions" be
preserved, and it forbids test removal. As written, the plan author cannot satisfy
both instructions. The design needs to say how that existing assertion is
transitioned. Details are in R2-F001.

## Findings

### R2-F001 — The revised completed16 contract contradicts an existing known-prefix assertion that the design says to preserve unchanged

In `scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs`,
the `knownPrefixCapture` case asserts that `knownSnapshots` holds every ordinal
`1..16` (lines 3178-3182). It then runs a real `moveState` restart for every captured
snapshot, ordinal 16 included (lines 3339-3360), and asserts all of the following:

- `result.phase === 'native-stage-resume'`;
- `result.preparationReason === 'known-prefix-continuation-unavailable'` (line 3343);
- `result.exit === 4`;
- `backend.snapshot` deep-equals the selected snapshot (line 3345), meaning no journal
  change;
- `backend.effects` contains only the fixed reads `authority-read`, `page-read`,
  `native-history-readback` and `native-proof-record-readback`, which the assertion
  message labels "only fixed reads, never writes at admission" (lines 3346-3358);
- `captureFiles()` is unchanged (line 3359).

The revised design changes every one of those assertions except `exit` and `phase`
for the ordinal-16 iteration:

- The "Observable completed16 resume result" section fixes `preparationReason` to
  `'native-source-unavailable'`.
- A clean resume appends steps 17 and 18 to the journal, so the snapshot differs.
- Dispatch17 and cache18 produce store write effects, and the new existing read
  produces read effects not on the allowed list.
- Cache18 "may update its declared active-task bytes", so the captured local state
  can change too.

The design nonetheless says, in "Qualification and delivery boundary": "Preserve the
existing known-prefix, policy/interlock, public-stage, original cache/dispatch,
partial-reporting, complete recovery and vertical-saga cases". The "Source boundaries"
table says the fixture work must "preserve all original cases/assertions". The
following paragraph forbids "test removal".

The first qualification bullet ("First observe the genuine captured16 restart failing
because remaining continuation is unavailable") implicitly treats that existing
ordinal-16 assertion as the red baseline. But the design never says what happens to
it at green. An implementer is left with three readings:

1. Narrow the loop to ordinals 1–15 and move ordinal 16 into the new resume
   qualification. This is the only reading consistent with the new contract. It is
   an intentional expectation change, but the text as written would class it as
   "test removal" or a broken "preserve".
2. Keep the assertion unchanged. That forces the implementation to special-case the
   fixture or to fail the green step.
3. Silently delete or weaken the iteration. This is the outcome the "no test removal"
   rule exists to prevent.

`qualifyOriginalEntryRefusals` (the helper the same case calls at line 3332) receives
the same `knownSnapshots` map, ordinal 16 included. The design should state that its
refusal expectations for ordinal 16 are unchanged. That should hold, since each
refusal still happens before any effect, but the plan has to confirm it.

This is a contract-transition gap, not an architectural defect. Leaving it implicit
puts the plan's red/green expectations in conflict with two of the design's own
preservation instructions.

## Required changes

1. **State the ordinal-16 known-prefix expectation transition explicitly.** Add a
   sentence to "Qualification and delivery boundary" (and align the "Source
   boundaries" fixture row) covering three points:
   - The existing `knownPrefixCapture` real-restart assertions
     (`native-stage-continuation-fixture.mjs:3339-3360`) stay unchanged for ordinals
     1–15.
   - For ordinal 16, the old `known-prefix-continuation-unavailable` / unchanged
     snapshot / fixed-reads-only assertions are the recorded red baseline. They are
     replaced, in the same case, by the new completed16 resume assertions: the exact
     return record, the full 17/18 snapshot, the operation trace, and the
     active-task file delta.
   - This deliberate expectation change for a contract the design changes is not test
     removal. The `1..16` capture-completeness assertion (lines 3178-3182) and the
     `qualifyOriginalEntryRefusals` refusal expectations for all sixteen ordinals stay
     unchanged.
   
   (R2-F001)

## Optional suggestions

1. **Consider whether `native-source-unavailable` is the best fixed reason.** A clean
   completed16 resume, an actor-drift refusal, an envelope-drift refusal and an
   interruption inside cache18 all now return the same
   `preparationReason: 'native-source-unavailable'`, which also replaces the
   previously distinct `known-prefix-continuation-unavailable`. The snapshot-only
   contract makes this safe for verification. But for an operator reading a single
   result, "native source unavailable" suggests a source-capture problem when the
   actual cause is the step19 fence. The author's stated reason for the choice, never
   deriving the reason from an untrusted thrown object, applies just as well to any
   *fixed* string. A fixed resume-specific reason chosen by Core according to the
   terminal category it already knows would keep that safety property and
   aid diagnosis. Examples: `known-prefix-continuation-unavailable` retained, or a
   single constant like `completed16-tail-fence`. Not required. The current choice is
   honest and conservative.

## Decision

revisions-requested
