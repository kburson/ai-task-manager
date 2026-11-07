<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a8582e8562b81f1bf8569c28c6e579a2"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2165-close-cumulative-proof-design.md"
artifact_commit: "745580d3d3747defa6d1b41ad61853860629f5c2"
artifact_blob: "c1560f385f144c64f7bde692472293b8853f4dc8"
artifact_digest: "sha256:2b320807a79ce5c5ef2a612286886bc7ef0be5a680827378ec8b0ceb05a92fa7"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a46e9c4d6fd4c23f857b63418da502888a9c5061031f592d3b060dfc30b2578c"
  identity_source: "runtime"
started_at: "2026-11-05T18:16:43.330Z"
submitted_at: "2026-11-05T18:28:36.624Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This turn re-reviews the revised artifact `745580d3` against author response 1 and the source. Every turn-1 required change is addressed, and I checked each fix against the code. No use of Git.

1. **Topology and trace (turn-1 Finding 1).** The new inventory facts are consistent with `verifyObservedIntegration` (`delivery-integration-proof.mjs:167-213`): 23 linear commits and the one-parent chain `e3ca90→927c53→bb0c008→13dba5`.
   - With `sourceCommits.length = 23`, the replay walks back 22 first-parents from `e3ca90`, so `replayBase` falls strictly older than `bb0c008`.
   - The walk can also end early, either at an uninspectable commit (`validChain = false`) or at a merge commit (`next.parents.length !== 1`). In every case no `rebase-step` probe runs.
   - Control then reaches the `squash` call at line 242. `isAncestor(bb0c008, 927c53)` holds there, so the overlap throw in `compareReadOnlyDeliveryContent` is the predicted failure.
   - The spec rightly labels this a prediction and makes the executed comparator trace the first qualification gate before product changes. The fixture is now required to mirror the 23-commit, index-7 prefix topology, which closes the gap I raised.
2. **Operator integration commit (turn-1 Finding 2).** The stated contract matches the code:
   - `close.mjs:345-353` requires every trail object to exist locally and reads its `show --name-only` names.
   - `close-gates.mjs::issueDirtyGate` (lines 146-177) only uses those paths to check for dirty files. It does not require each SHA to be on trunk.
   - Lineage requires the attributed delivered content on the real target, which `e3ca90` already provides.
   - The spec now requires the qualification harness to assert all of this, including an empty merge name list, and forbids trail removal or loosening any guard if the prediction fails.
3. **Receipt fields (turn-1 Finding 3).** These are confirmed in `verification-receipt.mjs`:
   - Top-level `commitSha` is taken from `artifactSubject.commitSha` (line 194), and `createVerificationReceipt` refuses if they differ (lines 221-225).
   - `artifactSubject` and `operatorContext` are stored separately, and `bindingGenerationId` is required (line 129).
   - The receipt comparator checks `commitSha`, `artifactSubject` and `operatorContext` independently (lines 637-648).
   - So a fresh `--artifact-commit 89018480…` Test receipt gives `testReceiptSha` = source890, and the new HEAD and generation sit in `operatorContext`. The spec now asserts each field separately.
4. **Rule order (turn-1 Finding 4).** The prefix proof now runs only at the overlap-indeterminate branch, and existing `true`/`false` results are final.
   - Restricting the search to commits strictly between source base and accepted head is correct. Neither endpoint can reach the overlap branch: P = source base is the exact case, and P = accepted head means the current integration-base entry equals the source entry, so line 95 does not throw.

I accept the reason for declining my turn-1 optional suggestion 3, splitting off the #2161 recovery runbook. The human requires a qualified route back to #2161, and the two-increment split gives independent review points. The other three optional suggestions were adopted.

## Findings

None blocking.

## Required changes

None.

## Optional suggestions

1. The plan should say exactly where the test-only module-loader observation hook lives (under `scripts/tests/`). It should also require that the hook cannot load from the production entry or the package `files` set, so the package-boundary test keeps passing without exemptions.
2. The read-only exploratory `rebase-step` probe still throws on overlap, while the writing comparator returns `false` on conflict. The spec correctly leaves this unchanged for this history, but it is a latent parity gap for other topologies (for example, a 2-commit inventory where the parent of the integration base is the source base). Consider filing a separate tracking issue rather than leaving it only as spec prose.
3. Step 4 of the renewal route predicts that ordinary commit-trace will record the integration merge. If native commit-trace with `--artifact-commit` instead refuses or filters that merge, the spec already says to retain the refusal and revise. Name that specific outcome as an expected branch point in the plan so it is not discovered mid-qualification.

## Decision

accepted
