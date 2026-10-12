<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-2cf594a8a446f9552e00ecc0ef920a86"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md"
artifact_commit: "83d422e92cf5f1ca95a5ef9ebd514c85698ee72e"
artifact_blob: "d777a17ac10117677f65776a55adc04e230900d8"
artifact_digest: "sha256:20b29a899742f77244f1a910bc1363f5fee8901f4f595e94bd9be46198f1fcc2"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:72a52ca24cb6d4dd4a36057be14d196a8e893cbdaf46f79afd97c8400ed95ec5"
  identity_source: "runtime"
started_at: "2026-10-11T14:27:52.157Z"
submitted_at: "2026-10-11T14:29:47.936Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the spec on its own terms and checked its source claims against the worktree at the artifact commit. The design is coherent and implementable. It has one pure classifier, one authority collector and one publication adapter. Admission always recomputes. A pending publication fence survives crashes. Prose waivers are removed. Epic aggregate effort is kept separate from story effort. These choices match the stated intent: record the estimate truthfully, flag the issue visibly, and stop implementation without changing lifecycle state.

Every source path in the inventory and the minimum adapter map exists. Every existing unit suite named in the map also exists, including `scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs`, which matches the abbreviation rule. `DECOMPOSITION_THRESHOLDS` holds review=16 and split=24 (`scripts/task-tracker/lib/decomposition-policy.mjs:13-15`). `inflate-estimate.mjs` swallows projection-write failures and returns `{ status: 'appended', boardUpdated }` (`:301`). Whole-hour ceiling normalization already exists as `ceilEstimateHours` (`inflate-estimate.mjs:83`, `apply-refinement-estimate.mjs:62`), so the 23.1→24 rule rests on existing behavior.

I found three gaps that need tightening before Refine. None of them is a design flaw.

## Findings

1. **Story/epic is the only kind split; other issue kinds are undefined.** The spec only defines "individual story" against "epic". The repository also has `audit`, `research` and `spike` kinds (`scripts/task-tracker/lib/issue-kind.mjs:28`, `NO_COMMIT_KINDS`), plus code/defect stories. The spec doesn't say whether a ≥24-hour spike or research issue gets `must-decompose`, or what "deny product implementation" means for kinds that produce no product commits. Two implementers could reasonably classify these differently. That breaks the requirement that "every supported writer and implementation admission surface must derive the same current decision".

2. **The recovery lane's own verbs are missing from the mandatory adapter/verifier map.** The spec allows "exact governed split/epic-conversion operations" under `must-decompose`, and it lists kind as a primary live observation. But `scripts/task-tracker/verbs/kind.mjs` and `scripts/task-tracker/verbs/split-plan.mjs` don't appear in the "Minimum concrete adapter and verifier map". A kind change from story to epic changes the assessment outcome (story `must-decompose` → epic `epic-readiness-required` or aggregate-exempt). Without an explicit mapping, either of two things can happen. (a) Every converted epic sits behind a stale projection, which the spec says yields indeterminate until refresh. (b) The conversion verb gets blocked by the combined-effect denial rules it is supposed to be exempt from. AC2 names a "permitted checkpoint/split lane", but the map has no named production surface for it.

3. **The existing remediation guidance still recommends a waiver.** `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs:122` emits: "Run `npx aitm split-plan <issue> --dry-run` or add a complete visible `## Decomposition Waiver` section." The spec removes prose-only admission, but it never requires retiring this user-facing (and agent-facing) instruction. Agents follow remediation text literally. If this string survives, an agent will be told to write a waiver that no longer grants anything, which recreates the #1855 failure mode as wasted work. The "guidance/remediation catalog" bullet doesn't clearly cover this pre-existing string.

4. **Minor: the status vocabulary diverges from the existing classifier.** The existing classifier returns `must-split` (`decomposition-policy.mjs:171`). The new schema uses `must-decompose`. The spec keeps the policy source and its signals but doesn't say whether `must-split` stays as a signal severity under a renamed assessment status, or gets renamed throughout. Leaving this open means two vocabularies across guards, Explain and the visible section.

## Required changes

1. Define the kind taxonomy for the estimate signal. State which kinds (`code`/story, defect, `spike`, `research`, `audit`, `epic`) get individual-story ≥24-hour enforcement, which are aggregate-exempt, and what capabilities `must-decompose` restricts for no-commit kinds. Add the kind dimension to the AC1 evidence row.
2. Add `verbs/kind.mjs` and `verbs/split-plan.mjs` (and any epic-conversion/child-creation entrypoint the audit finds) to the minimum adapter/verifier map. The required evidence is: (a) they are permitted under `must-decompose`, `pending` and `indeterminate` without sibling product effects; (b) a story→epic kind change triggers reassessment and projection refresh through the shared publisher instead of leaving a stale marker; (c) conversion alone doesn't clear the flag until epic readiness applies.
3. Require the existing Plan-exit remediation text at `decomposition-plan-exit-guard.mjs:122`, and any other guidance that suggests `## Decomposition Waiver`, to be replaced with the governed decomposition/re-estimation next actions. Add a regression proving no remediation output recommends a waiver for ≥24-hour estimate enforcement.

## Optional suggestions

1. Settle the `must-split` (signal severity) vs `must-decompose` (assessment status) mapping explicitly, so Explain, guards and the visible section share one vocabulary.
2. `plan-estimate.mjs:52` parses compatibility-appendix values with `parseFloat` and doesn't visibly ceil them. Say explicitly that proposal values go through the same `ceilEstimateHours` normalization before classification, so a 23.5-hour proposal flags the same way as a published 23.5→24.
3. The state table's "Ready for Planning" row is correct (`stage-entry-markers.mjs:26` notes it reuses the historical On Deck slot). A one-line note would stop readers expecting an On Deck row.

## Decision

revisions-requested
