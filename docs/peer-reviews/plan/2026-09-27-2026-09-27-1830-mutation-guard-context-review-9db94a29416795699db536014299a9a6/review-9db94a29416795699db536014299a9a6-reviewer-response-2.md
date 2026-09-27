<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9db94a29416795699db536014299a9a6"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md"
artifact_commit: "9d4601aa15f20770fed1a1f57699b78680e4adf5"
artifact_blob: "16f153a85a66e0703da18d9568805ffc5b338d8e"
artifact_digest: "sha256:b381fb29a67f0cf482a38a5ba9c02fb908cfb59d69ad3a3af8865bf11f085aad"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:88456a5175584c25e8366623b2a32c0cef6ebfff68c38191fc362d8f50486e4b"
  identity_source: "declared"
started_at: "2026-09-27T21:03:38.690Z"
submitted_at: "2026-09-27T21:46:10.504Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed r4 (`b381fb29…`, blob `16f153a8`, commit `9d4601aa`) and the sealed
author response for turn 1. All four required findings are closed; all four
optional suggestions are addressed. No new required finding.

Method: read the author response in full, then re-read r4 end to end rather than
only its changed passages, then re-verified each disposition against the live
source in this worktree rather than accepting the author's probe narrative. Where
the author reported a baseline behavior I had not myself confirmed in turn 1, I
confirmed it independently before crediting the fix.

### Verification of each disposition

**R1-F001 — closed.** r4 lines 210-219 name the exact seam
(`activity-policy.mjs::isAllowed`), specify the minimally scoped repair (add
`COMMIT_DOCS` to the `state == null` refusal set, leave other classes' allowance
untouched), keep unknown non-null states fail-closed, and enumerate the negatives:
null and undefined state directly, plus never-bound, paused, and unknown-state
sessions through the hook, held distinct from a Plan session with a missing
binding record. The AC4 proof column (r4 line 291) now carries them.

The author's additional seam is real and I confirmed it independently:
`activity-guard.mjs:187` is `if (isChoreModeActive(projectRoot)) process.exit(0);`
— a blanket early return that precedes the `isAllowed` call at
`activity-guard.mjs:199`. Editing the pure function alone would therefore have
left a parallel bypass, and r4 lines 216-219 require the new class's
binding/state decision ahead of that return plus an explicit chore-plus-unbound
negative. That is a genuine strengthening beyond what turn 1 asked for.

I also confirmed the scope of the original defect is exactly as r4 now states it.
`activity-guard.mjs:191-197` already refuses every non-`READ_*` class when
`activeIssue` is truthy and `state == null` (the drift branch), so the fail-open
window is specifically the *unbound* session, where `activeIssue` is falsy and
that branch is skipped. r4's parenthetical "which reduces either to null state"
is accurate, and the distinction it draws from a Plan-state missing-binding
record is the correct one.

**R1-F002 — closed; the stronger of the two offered readings was chosen.**
r4 lines 178-190 preserve `activity-guard`'s existing #659 ordering explicitly,
then add the shared lexical/physical installed-target check to
`source-edit-gate.mjs` ahead of its chore-mode and scratch returns, require the
hook entry point to resolve all targets before those returns, and label it a
deliberate new refusal in that individual guard. It is a numbered deliverable
(step 4, r4 lines 274-276), an AC4 negative (r4 line 291), and it carries both
negative controls (installed self-link, scratch alias into an installed tree) and
positive controls (ordinary scratch, the package's own non-installed checkout).
The ambiguity I raised is gone: the sentence now says which guard keeps existing
behavior and which one changes.

The identifier is correct — `decideSourceEdit` is the exported pure decision
helper at `source-edit-gate.mjs:85`, and its `choreModeActive` return is the first
branch of its body. r4 cites it accurately.

**R1-F003 — closed; option (a) chosen.** r4 lines 261-264 direct every
shared-helper regression table into the five existing VC1 files and state plainly
that no separate helper test file is part of this repair, so VC1 remains the
complete targeted proof and the issue's verification command is untouched.
Lines 295-307 then assign the work per file by exact path — parser/policy and
null-state tables, patch extraction and envelope tables, activity entry and
staged-index fixtures, source-edit interlock and ancestry and transport fixtures,
and combined linked-worktree binding parity. Lines 306-307 add the sentence that
matters most: general suite discovery alone is not evidence for a `vc:1` citation.
Every AC's citation now resolves to a command that actually executes the code it
attests to.

**R1-F004 — closed.** r4 lines 150-156 state the predicate is a fixed contract in
the shared helper, independent of project activity policy, and name `docGlobs`,
`docGlobsExtra`, and any other `activity-policy.json` key as unable to define or
widen `COMMIT_DOCS` eligibility, while leaving existing configurable edit
classification separate. The required negatives are concrete and falsifiable —
replacing `docGlobs` with `['**/*']`, and adding root `CLAUDE.md`, `scripts/**`,
or `docs/**` through `docGlobsExtra`, must not admit root instructions, source,
configuration, or executable files. AC3's proof column (r4 line 290) carries it.

### Optional suggestions from turn 1

All four are addressed, and none were addressed by deletion or by weakening a
claim. Review-state collateral routes through governed rework to Develop with
fresh Test/Review evidence and no new commit exception (r4 lines 223-225). AC4's
"intended pre-Develop" is pinned to exactly Plan (r4 lines 221-222). The
conflicting-patch-field change is labeled a deliberate tightening, with identical
duplicates allowed, differing nonempty values treated as conflicts, and a
requirement to establish real per-adapter field semantics from fixtures before
switching rather than inferring single-field use (r4 lines 242-249). The Epic W2
(#67) header note is scoped to Git mutation discovery with broader shell
write-target extraction left explicitly deferred and no claim of epic completion
(r4 lines 271-273).

### Integrity boundaries

r4 preserves every honesty boundary from r3 without softening: the preflight
snapshot is still a snapshot, pre-existing hooks and concurrent writers are still
outside the claim, the current-code probes are still labeled evidence of old
behavior rather than passing tests, and Plan approval remains AITM's to record.
The author response likewise claims only a plan revision and disclaims runtime
success, acceptance authority, and human approval. The r3 SAR convergence record
is correctly scoped to the bytes it reviewed (r4 lines 16-17), and historical
snapshots are retained rather than rewritten.

Two process notes for the record, neither affecting this decision. This review's
`authority_assurance` is `unavailable` and the reviewer identity is `declared`,
so this is one independent reviewer's document review — not implementation
verification, not Plan approval, and not a substitute for the issue's own
verification commands, none of which were run here. The plan is accepted as a
plan.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Leave a note at the `isAllowed` null-state seam.** r4 correctly chooses the
   minimally scoped repair, so that branch stays deny-by-exclusion: it names the
   classes it refuses and allows everything else. That shape is what made
   R1-F001 possible, and it will do the same to whoever adds the next activity
   class. A one-line comment at `activity-policy.mjs:324-327` saying the list is
   deny-by-exclusion, and that any new write or commit class must be added there,
   would cost nothing in this change and prevent the repeat. Non-blocking.

2. **`activity-guard.mjs:181-186` cross-references source-edit-gate by line
   number, and that reference is already stale.** The comment points at
   source-edit-gate's `chore-mode-bypass` as "line 76"; it now sits at
   `source-edit-gate.mjs:105-108`. The same comment asserts under #440 AC2 that
   the two Edit/Write gates "never disagree about whether chore-mode grants a
   bypass." Step 4 keeps that true for installed targets — both will refuse ahead
   of chore — but the passage is worth rereading and rewording while step 3 is
   already updating block messages and workflow documentation, so the parity claim
   stays accurate and the pointer stops rotting.

3. **Say where the `isAllowed` tables live, in one clause.** r4 places the
   null-state and policy-override tables in
   `scripts/tests/unit/task-tracker/lib/activity-policy-classify-bash.test.mjs`.
   That is inside VC1, which is what R1-F003 required, and I am not asking for it
   to move. But the file is named for `classifyBash`, and `isAllowed` state tables
   are not that. A describe-block name or header comment naming what the
   non-`classifyBash` tables cover would keep them findable.

## Decision

accepted
