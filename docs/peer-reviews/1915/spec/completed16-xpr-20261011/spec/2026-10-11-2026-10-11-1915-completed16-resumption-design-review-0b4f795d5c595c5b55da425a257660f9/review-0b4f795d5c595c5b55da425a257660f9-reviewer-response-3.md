<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-0b4f795d5c595c5b55da425a257660f9"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
artifact_commit: "d985e728d1a8ff871945909b79cb17795b79620b"
artifact_blob: "8a4843c3dbba07581b6fe9e00422aa7f1bf1ad7d"
artifact_digest: "sha256:00c8ce01f7b4c19062fe01452c5d70c1dc2f26b7920c2b45aa8a05c4768a6cda"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7f709c3acc0a5562493b71731ee6551460300f0ea6ca3ac56fa6825532a2c6f4"
  identity_source: "runtime"
started_at: "2026-10-11T19:23:05.405Z"
submitted_at: "2026-10-11T19:31:45.637Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised artifact (digest
`sha256:00c8ce01f7b4c19062fe01452c5d70c1dc2f26b7920c2b45aa8a05c4768a6cda`, commit
`d985e728d1a8ff871945909b79cb17795b79620b`) against author response 2. This was
read-only inspection of the source and test fixture. I ran no tests, made no Git or
GitHub call, and did not touch the artifact.

**R2-F001 is resolved.** "Qualification and delivery boundary" now sets out the
ordinal 16 expectation transition explicitly:

- the real-restart assertions stay unchanged for ordinals 1–15;
- the old ordinal 16 `known-prefix-continuation-unavailable`, unchanged-snapshot and
  fixed-reads-only assertions are the recorded red baseline;
- that iteration's expectations are replaced, in the same case, by the exact
  completed16 return contract, the full landed 17/18 snapshot, the operation trace and
  the memory active-task resource delta;
- the change is stated not to be removal, filtering or weakened coverage.

The `1..16` capture-completeness assertion and the full map passed to
`qualifyOriginalEntryRefusals` are kept. The "Source boundaries" fixture row and the
final preservation bullet now both refer to this single exception, so the earlier
contradiction is gone.

**I accept both of the author's source corrections; both are accurate.**

1. **Physical files.** In round 2 I said cache18 "may update its declared
   active-task bytes, so the captured local state can change too", implying
   `captureFiles()` would change at ordinal 16. That was wrong.
   - `captureFiles()` (`native-stage-continuation-fixture.mjs:870-882`) hashes actual
     files under `f.projectDir`.
   - `writeMemoryNativeStageCache` (`store.mjs:4537-4544`) only assigns
     `m.nativeStageResources.local.activeTask` inside the memory backend.
   - The existing tail fixture already asserts "actual cache effects never touch host
     state" (`native-stage-continuation-fixture.mjs:3470`).
   
   Keeping the unchanged-physical-files assertion at every ordinal, 16 included, is
   correct and stricter. The design now states this precisely.
2. **Refusal helper scope.** `qualifyOriginalEntryRefusals` checks readback and
   resource drift only at the representative ordinals `[1, 7, 13, 16]`
   (`scripts/tests/helpers/native-stage-original-entry-controls.mjs:121-128`), not at
   all sixteen. My round 2 wording ("refusal expectations for all sixteen ordinals")
   overstated the existing coverage. The revised design keeps the helper's actual
   expectations and does not claim the broader coverage.

**Those helper refusals stay valid under the new contract.** At ordinal 16:

- `readback = null` turns the journal into an incomplete step16, which is excluded
  before admission.
- A one-byte change to `local.activeTask` breaks the exact whole resource vector that
  admission requires.

Both still refuse before any new effect. So the helper's assertions that the snapshot
is retained, that no effects occur beyond the fixed read audits, and that physical
files are unchanged (lines 59-65) all continue to hold.

**I accept the author's decision to decline round 2 optional suggestion 1.** Keeping
the fixed `native-source-unavailable` reason is honest and conservative. The
snapshot-only progress contract plus the mandatory snapshot and trace assertions in
every terminal category keep it safe. A more specific operator diagnostic can
reasonably wait for the later continuation frontiers (#1923/#1925).

**Overall.** I re-read the full artifact for consistency. The round 1 resolutions are
all still intact:

- the pinned return contract;
- the cross-checked actor identity that binds the cache18 sink;
- the mandatory `stage-write` memory stage-effect scope;
- equality of the existing read with the whole recorded step16 response and census.

The scope boundaries are unchanged: completed16 only, `test` target only, no body
grant, the ordinary pending fence kept, the SAR digest renewal requirement recorded,
and no claim that #1915, #1928 or #1957 is complete. I have no remaining required
changes. I recommend acceptance. One optional note for the implementation plan
follows.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Do not reuse the existing refusal helper's classification predicate for the new
   admitted-branch refusal cases.** In
   `native-stage-original-entry-controls.mjs:51-58`, `refuse()` accepts a returned
   result as a refusal only when `result.phase !== 'native-stage-resume'`. It also
   asserts that the whole snapshot is unchanged (line 59).

   Under the revised contract, every admitted completed16 terminal category returns
   `phase: 'native-stage-resume'` with `exit: 4`. That includes the admitted-branch
   refusals the design adds: actor provider/sid/executor drift, response-envelope
   drift, target or `onEnter` mismatch, and outside-scope invocation. Separately,
   interruption cases must keep the *landed* 17/18 state rather than the original
   snapshot.

   If the plan routes those new cases through `refuse()` unchanged, they will fail
   its predicate even when the implementation is correct. The tempting "fix" is to
   loosen that predicate, which would also weaken the existing pre-admission refusal
   cases.

   The plan should instead classify the new cases with a separate assertion set built
   from the "Observable completed16 resume result" table: the exact return record plus
   the exact snapshot and operation trace. It should leave `refuse()` and its
   predicate unchanged for the pre-admission controls. This is a plan-level detail.
   The design's general requirement to "assert every exact return field ... and
   independently assert the full backend snapshot and operation trace" already
   permits it, so no artifact change is required.

## Decision

accepted
