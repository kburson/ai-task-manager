<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a8582e8562b81f1bf8569c28c6e579a2"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2165-close-cumulative-proof-design.md"
artifact_commit: "c72e8b832ce3519374327cee7059c7169332ae86"
artifact_blob: "5aceaef18d1791465656f1dedf9ba22954e3de8e"
artifact_digest: "sha256:01f88948c13fa7e321df3c832688234c9fa5adf6e8bcd983aa5f50e4d9aba974"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a46e9c4d6fd4c23f857b63418da502888a9c5061031f592d3b060dfc30b2578c"
  identity_source: "runtime"
started_at: "2026-11-05T18:16:43.330Z"
submitted_at: "2026-11-05T18:19:22.778Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the spec against `scripts/task-tracker/lib/action-decision/close.mjs` (`compareReadOnlyDeliveryContent`, `verifyDeliveryAuthority`, the readiness comment/trail reader), `scripts/task-tracker/lib/delivery-integration-proof.mjs` (`validateInventory`, `verifyObservedIntegration`), `scripts/task-tracker/lib/delivery-verification.mjs` (v5 observed-facts path), `scripts/task-tracker/lib/close-delivery-receipt.mjs` and `scripts/task-tracker/verbs/deliver.mjs::compareDeliveryContent`. I did not use Git, so all history facts below are taken from the spec or the code.

The core content proof is sound. If the integration-base tree equals the tree of a validated source ancestor P (where P descends from the requested source base and is an ancestor of the accepted head), and the integration-head tree equals the accepted-head tree, then the integration head is exactly P plus the accepted P→head suffix. That is a valid immutable proof. It is actually stronger than the `merge-tree --write-tree --merge-base` path in `deliver.mjs`, because it does not depend on how the overlapping file's hunks happen to line up. The spec forbids writes, mutable refs and new carriers, and that is correct. Plumbing the inventory is feasible: `gateInput.pullRequest.sourceCommitEvidence` is already in scope of the `verifyDeliveryAuthority` closure, and it is the same array `delivery-verification.mjs:961-979` passes as `sourceCommits`.

I am requesting revisions for three reasons:

1. The spec has not established which `compareContent` call actually throws. One plausible topology has the throw coming from a `rebase-step` probe that the spec explicitly excludes.
2. The renewal route adds a new `[#2161]` commit to the operator, and the spec does not say how the commit trail or Close treat it.
3. The spec is ambiguous about which identity the fresh Test receipt's `commitSha` carries. Close compares that field strictly against the accepted head.

## Findings

1. **The throwing call site is assumed, not established. In one topology it is a `rebase-step` probe that this extension refuses to touch.** `verifyObservedIntegration` (`delivery-integration-proof.mjs:162-262`) does not go straight to the squash comparison on a one-parent merge commit. When `sourceCommits.length > 1` and the inventory has no merges, it first walks `N-1` first-parents back from the merged commit. If `sourceBase` is an ancestor of the resulting `replayBase`, it then calls `compareContent({method:'rebase-step', ...})` for every source commit. Only if `matchedSteps === 0` does it reach the `squash` call.
   - The read-only comparator skips the ancestry check for `rebase-step` but still runs the overlap test. When it finds an overlap it **throws** `content-proof-unavailable`, and nothing in the replay loop catches that.
   - `deliver.mjs:2888-2901` does something different for the same probe. It returns `false` on a merge-tree conflict, or `true` when the hunks merge cleanly. So the read-only and writing comparators already diverge on the exploratory probes, not only on the final squash comparison.
   - Example: the spec's own history has `927c53d`'s parent equal to `bb0c008` (the source base). With a two-commit inventory, the probes would run. Step 0 would compare `bb0c008→7b5d9e` against `bb0c008→927c53d`, and step 1 would compare `7b5d9e→890` against `927c53d→e3ca90`. Both match on trees, so the classification would be `rebase`, not the `squash` the receipt records.
   - The receipt quartet (integration base `927c53d`) implies the probes either did not run or matched zero steps. That is consistent with `N ≥ 3`, but the spec never states it.
   - The spec admits that "the swallowed runtime exception stack remains unobserved". Its stated predicate (whole-blob difference on `package-boundary.test.mjs` across the base→integration-base and integration-base→final quartet) only fits the `squash` call.
   - If the real failing call is a probe, or the fixture's inventory shape differs from #2161's, the prefix extension will either never be reached or the RED will reproduce a different failure.

2. **The renewal route adds a new #2161-attributed commit that never reaches trunk under its own identity, and the spec does not say how the trail or Close handle it.** Step 4 adds a canonical `[#2161]` merge commit to `codex/2156-draft`, integrating the delivered trunk. Because the rework is real code integration, fresh Develop finalization and commit-trace may legitimately add that commit to #2161's commit trail.
   - Close readiness reads every trail SHA and requires the commit object locally (`close.mjs:345-353`, `cat-file -e` plus `show --name-only`). The registered guards then consume those files through `filesForSha`.
   - The spec also says "No new provider call for #2161", so this commit is never delivered. Its content reaches trunk only through #2165's delivery, and `e3ca90` is the only `[#2161]` trunk commit.
   - The spec should state the expected behaviour: whether the integration commit enters the trail, whether a trail SHA that is absent from `origin/trunk` is acceptable to the lineage and attribution guards, and how `show --name-only` on a merge commit (normally an empty combined-diff name list) feeds those guards.
   - The general fallback "retain the exact refusal and revise" defers this rather than designing it. It is the most likely point where the qualification harness will hit a refusal.

3. **Test-receipt subject identity is ambiguous, and Close compares it strictly against the accepted head.** `verifyDeliveryAuthority` passes `testReceiptSha: parseVerificationReceipt(gateInput.body, 'test')?.commitSha` (`close.mjs:396-398`). The delivery verifier then requires that value to equal the intent's `expectedHeadSha`, which is source890 (see also `diagnoseDeliverySnapshot`'s `test-head` predicate).
   - The spec says fresh receipts must "name the new actual HEAD/generation and source890's original commit/tree". It does not say which receipt field carries which identity.
   - If a fresh Test run against the advanced operator writes the operator HEAD into `commitSha`, Close will refuse even though the comparator fix is correct.
   - The renewal design depends on the existing `--artifact-commit` receipt shape: artifact identity in `commitSha`, operator and generation in separate fields. The spec should name that shape, cite the code that produces it, and require the harness to assert it.

4. **Minor: the order of the new rule relative to the existing proof is implicit.** The spec says the existing proof "remains authoritative" when no prefix is proven. It does not say whether the prefix rule is consulted only where the current code throws `content-proof-unavailable`, or also where it returns `false`. In the clean cases they should agree, since both reduce to final tree equals accepted head tree. But the rule should be written down so a future change cannot let the prefix rule override a definitive `false` from the existing proof. The two degenerate candidates also need defined handling:
   - P = requested source base is the existing exact case.
   - P = accepted head means the integration contributed no content, and the existing proof already returns `true`.

## Required changes

1. Before anything else, add a step that runs the production `verifyObservedIntegration` read-only on #2161's actual retained inventory, with only the comparator instrumented to record each call's method and quartet. Use that to identify the exact `compareContent` invocation (method and quartet) that throws. Record `sourceCommits.length`, any merge parents, and whether the `rebase-step` probe path runs.
   - The `close-v5-fixture` reproduction must use the same inventory length and topology as #2161, so that the RED fails at the same call.
   - If the throw comes from a `rebase-step` probe, revise the design before implementing. Either define the read-only probe's overlap result as `false`, matching `merge-tree` conflict semantics and keeping the downstream partial-match and receipt-equality refusals, or justify keeping the throw and explain how the squash comparison is then reached.
2. In the renewal section, specify how the step-4 `[#2161]` integration commit relates to #2161's commit trail and to Close's lineage and attribution guards (`close.mjs:345-353`, `filesForSha`). Add an explicit assertion for it to the increment-1 two-worktree qualification harness.
3. State which field of the fresh `--artifact-commit` Test (and Review) receipt holds source890 and which holds the operator HEAD and generation. Cite the producing code, and require the harness to show that Close's `testReceiptSha` resolves to `89018480…`.
4. State the rule order from Finding 4. The prefix rule only replaces the overlap indeterminate case and never overrides a definitive `false`. State that the degenerate candidates are handled by the existing proof.

## Optional suggestions

1. Bind the comparator's inventory to the same `gateInput.pullRequest.sourceCommitEvidence` array that `verifyObservedIntegration` receives. Refuse if the closure's view and the verifier's view differ (for example by comparing a frozen identity or canonical JSON). That makes "belong to that same observation" checkable rather than conventional.
2. Get the candidate commit and tree facts from read-only `git log --format='%H %T %P' <sourceBase>..<acceptedHead>`, or from per-candidate `cat-file`, and intersect the result with the inventory. Do not trust the inventory's `tree`/`parents` fields as data. This keeps Git objects authoritative, as step 2 already requires.
3. The renewal section (lines 45-64) is an operational runbook for #2161, embedded in a product design for #2165. Consider moving it to its own plan document or issue section so the #2165 content-proof design can be accepted and implemented independently of the renewal qualification. This matches the two-increment split the spec already forecasts.
4. Revise the claim that ordinary delivery "can prove this cumulative result". `merge-tree --merge-base` succeeds here only if the #2156 and #2161 hunks in the overlapping file do not conflict. The prefix proof does not depend on hunk layout, so it should not be described as parity with `deliver.mjs`.

## Decision

revisions-requested
