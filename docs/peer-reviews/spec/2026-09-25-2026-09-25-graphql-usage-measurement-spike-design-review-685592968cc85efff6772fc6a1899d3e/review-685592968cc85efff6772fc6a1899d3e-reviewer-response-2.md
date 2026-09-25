<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-685592968cc85efff6772fc6a1899d3e"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "6bcf9b6f85b92652dbb9cbbf87ceba4b9006d871"
artifact_blob: "6ac82144153ad36bb93c0720400be79c9d584bd0"
artifact_digest: "sha256:9702ff4c363f6370d62dabd8ab2b80381c346d6303f5be90476c366b7de2c347"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:289b97773b3782d3b2dfef33780a310c9f141f7ae855f5bf9039f7c43aa3c8dc"
  identity_source: "declared"
started_at: "2026-09-25T21:59:54.999Z"
submitted_at: "2026-09-25T22:06:47.355Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Both required changes are resolved, all three optional suggestions are
incorporated, and two of the resolutions are stronger than what I asked for. I
accept the specification at commit `6bcf9b6f85b92652dbb9cbbf87ceba4b9006d871`.

**R1-F001 — resolved, and extended past the request.** I asked for three things:
a root identifier on observations and manifest rows, a report that declares the
root it aggregated and names an out-of-root class, and a minimum-concurrency
sample bound to that root. All three are present. `commonRootId` is in the
manifest (line 103) and in the required schema fields (line 233); the Reporting
section now opens by declaring "one canonical common root and its `commonRootId`
as the aggregation boundary," classifies differing manifest rows as `out-of-root`
"distinct from missing/unknown enrollment," excludes foreign-root observations
from totals, and states that out-of-root participants "prevent claims of
fleet-wide completeness"; the minimum sample now reads "two enrolled, permitted
worktrees sharing the report's `commonRootId`."

Three details were not in my finding and improve it. The derivation is specified
rather than left open — canonical absolute common-directory path, symlinks
resolved, then hashed — which closes the case where one clone reached through two
symlinked paths would otherwise present as two roots, and keeps a username-bearing
absolute path out of the record. "Do not search other clones automatically" keeps
the fix from quietly becoming the cross-clone aggregation feature the spike
deliberately excludes. And "do not treat repository/remote equality as root
equality" forecloses the specific wrong inference an implementer would most likely
reach for, since the two clones in this failure mode share a remote and an
account; that sentence is the difference between a field that exists and a field
that is used correctly.

**R1-F002 — resolved, and set stricter than I asked.** AC6 now separates the two
claims: volume reductions "with stated coverage limits and matched workload," and
point reductions gated on complete coverage "for the compared group in both
intervals," closing with "otherwise no point-savings claim is supported." I asked
only that the gate hold for the compared group; requiring it in both intervals is
the correct reading, since a comparison between a fully covered interval and a
partially covered one is exactly the shape that would manufacture an apparent
reduction out of missing data. The two criteria no longer disagree.

**Optional suggestions — all three incorporated.** The mutation consequence is now
stated outright ("any candidate group containing mutations cannot pass the
total-point gate. Declare volume for such groups before collection"), which is the
cheap discovery I wanted. The builder/shim sentence names the shim as the single
record owner, so AC2's "without double counting" no longer rests on a pronoun.

On Git resolution, the author chose the better of the two options I offered and
was right to reject the other. I suggested either naming a minimum Git version or
degrading gracefully, and I cited 2.31 for `--path-format` from memory without
verifying it in this repository or against Git's release notes. The revision
detects the unsupported flag behaviourally instead — falling back to plain
`git rev-parse --git-common-dir`, resolving a relative result against that exact
command cwd, validating that the result is an existing common directory, and
raising a distinct `git-common-root-resolution-unavailable` rather than a
permission or storage label. That is correct for the reason the author gives: it
avoids hard-coding an unverified version assertion, and it keeps a resolution
failure from being misread as a sandbox denial. My version number should not be
carried into implementation.

I also confirmed the author's procedural note. My turn-1 response did carry
`finding_ids: []` in its protected frontmatter, with `R1-F001` and `R1-F002`
appearing only as body labels, so the author's account of the sealed ID set and
the rejected first submit attempt is accurate and was volunteered rather than
elided.

Three residual items are recorded below as optional. None blocks acceptance and
none needs another round; the first is the only one I would bother acting on.

Evidence method: read-only inspection of the revised artifact and the turn-1
author response. No Git command, no mutating command, no GitHub call, and no edit
to the artifact, index, refs, or any file other than this pending reviewer
response. I did not verify the author's Prettier, Markdown, or `git diff --check`
claims — running Git is outside the reviewer boundary, and no conclusion in this
review depends on them.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Consider naming out-of-root participants in AC9.** The out-of-root
   classification is now an unambiguous report obligation, but no acceptance
   criterion references it. AC9 requires a "participant manifest with denial
   counts and lower-bound/selection-bias disclosures," and an out-of-root
   participant is explicitly *not* a denial class, so a close-time AC check would
   not catch its omission. Adding out-of-root counts to AC9's disclosure list
   would close that.

   I am deliberately not raising this as required, and the distinction matters
   because it is the same shape as R1-F002. AC6 affirmatively asserted something
   the body forbade — two criteria in contradiction, which is a defect. AC9 merely
   does not enumerate one body obligation, which is this document's normal
   granularity: `budgetScopeId`, `contextScope`, the `(t - 60 minutes, t]` window
   definition, `callId` deduplication, and the augmentation-version record are all
   likewise specified in the body and absent from the criteria. Omission is not
   contradiction, and I do not think a round is warranted for it.

2. **A moved or renamed common directory orphans its own history.** Because the
   root ID is derived from the absolute path, relocating the main checkout mid-run
   gives every previously written observation a root ID that no longer matches the
   report's declared root, so that history becomes foreign-root and drops out of
   totals. The specification already keeps this honest — the records are reported
   as a root mismatch rather than silently discarded, and fresh enrollment is
   required after a root change — so the behavior is defensible and consistent with
   the document's stance everywhere else. It is only worth one clause saying so
   directly, since an implementer reading "canonical absolute path, then hash" is
   unlikely to anticipate that consequence on their own.

3. **Typo in the schema paragraph.** Line 233 reads "…`sessionSource`,
   `enrollmentId`, and `commonRootId`, and `collectorLaunchRoute`", carrying a
   duplicated conjunction from the insertion. Prettier will not catch it.

## Decision

accepted
