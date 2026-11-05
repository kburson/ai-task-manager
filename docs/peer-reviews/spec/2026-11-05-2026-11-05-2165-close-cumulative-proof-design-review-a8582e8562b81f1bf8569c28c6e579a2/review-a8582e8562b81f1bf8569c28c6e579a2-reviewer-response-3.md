<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a8582e8562b81f1bf8569c28c6e579a2"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-05-2165-close-cumulative-proof.md"
artifact_commit: "c7986f28b68cfca18dac295f756871658a0952d3"
artifact_blob: "44a7ce79713cffbdbfa78e347479e7b930e18e25"
artifact_digest: "sha256:c00c12a82d9dd5c27fb8af54df6b8373ace6360060862c91631e321002c0ebe3"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a46e9c4d6fd4c23f857b63418da502888a9c5061031f592d3b060dfc30b2578c"
  identity_source: "runtime"
started_at: "2026-11-05T18:16:43.330Z"
submitted_at: "2026-11-05T18:32:11.872Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This is the plan phase review of `docs/superpowers/plans/2026-11-05-2165-close-cumulative-proof.md` at `c7986f28`. I checked it against the spec accepted in turn 2, the source (`close.mjs` exports, `delivery-integration-proof.mjs`), the package `files` manifest, existing `scripts/tests/fixtures/` conventions and existing `registerHooks` test usage. I did not use Git.

The plan follows the accepted spec closely:

- Task 1 qualifies the two-worktree generation change, the real integration and the exact receipt fields before any product edit.
- Task 2 keeps the prefix proof private, puts it only at the overlap-indeterminate branch, and covers every negative the spec lists.
- The step-0 trace gate, the topology-matching fixture (23 commits, prefix at index 7) and the step-4a commit-trace branch point all carry forward my turn-2 suggestions.
- The new fixture paths follow the existing `scripts/tests/fixtures/*.mjs` convention.
- `registerHooks` already has precedent in four integration tests.
- `!scripts/tests/**` in `package.json` already excludes the loader from the package.

Three gaps make the plan not yet executable as written: the step-0 entry point is unspecified, the verification commands omit tests and lints affected by the changed files, and the new guide is packaged runtime content that the plan treats as if it had no package impact.

## Findings

1. **Task 1 Step 0 does not name the production entry that reaches the private comparator, or where its inputs come from.**
   - `compareReadOnlyDeliveryContent` is not exported. It is reachable only through `createCloseReadOnlyPorts` (exported, `close.mjs:107`), then `verifyDeliveryAuthority`, then `verifyCloseDeliveryReceipt`, then `verifyDeliveredPullRequest`, then `verifyObservedIntegration`.
   - The step says to "run production `verifyObservedIntegration` read-only". Called directly, that function requires the caller to supply `compareContent`. A test-supplied comparator would not be the production one, and the loader would then trace nothing.
   - The plan must say which real entry drives the trace. Options are the public `aitm explain 2161` / `close --explain --json` with the loader preloaded through `--import`, or `createCloseReadOnlyPorts(...).readDelivery` plus the guard path with real #2161 `gateInput`.
   - It must also say where the complete PR2164 inventory and v5 receipt come from (live read-only GitHub reads of #2161 and PR2164, or a retained capture), and confirm those reads go through the same read-only transport allowlist (`close.mjs:108-136`).
   - Step 0 is also the plan's only step that touches the live provider. Every other test is provider-isolated, and the plan does not authorize live reads or say whether Step 0's output is a committed test or a one-off scratch record.
   - Without this, Step 0 can "pass" by tracing a non-production wiring. That is exactly the false RED the spec is trying to prevent.
2. **The verification commands do not cover the files each task changes, and commits skip the Develop verification contract.**
   - Task 1 modifies `scripts/tests/helpers/close-v5-fixture.mjs` and claims "defaults remain unchanged", but Task 1's command does not run `action-close-v5.test.mjs`, which is that fixture's existing consumer.
   - The loader-exclusion claim ("package-boundary checks must prove exclusion without exemptions") relies on `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`, which appears in neither command list.
   - Task 1 Step 5 commits without lint, format or `node scripts/task-tracker/verify-develop.mjs`. `CLAUDE.md` requires that script before every Develop commit.
   - New test and fixture files are also subject to `lint:test-layout`, `lint:test-entrypoint-imports`, `lint:story-tags` (an `@story #2165` tag), `lint:line-cap` and `lint:test-reach`. None of these is named, and a 23-commit fixture plus a public-entry harness may hit the line cap.
3. **The new guide is packaged runtime content, which the plan does not account for.**
   - `package.json` `files` includes `docs/guides/`, so `docs/guides/close-cumulative-delivery.md` ships in the tarball.
   - That conflicts with "Keep package/runtime help unchanged" and "measure any package delta" unless the plan measures it explicitly.
   - The guide is also subject to `lint:md`, `lint:spell` and `lint:doc-anchors`, and possibly the guidance-release and budget checks (`lint:guidance-release`, `measure-guidance-context --assert-budgets` in `prepublishOnly`). The plan names none of these.
   - Either commit to the packaged guide and run those checks plus a measured `npm pack` delta, or place the narrow operator route somewhere unpackaged and say why.

## Required changes

1. In Task 1 Step 0, name the exact production entry that reaches `compareReadOnlyDeliveryContent`, either the public CLI with `--import` of the loader or `createCloseReadOnlyPorts` with real #2161 `gateInput`. Also state:
   - where the 23-commit inventory and v5 receipt come from;
   - that only read-only provider calls through the existing allowlist are used;
   - whether the step's output is committed or is an issue-scoped `.scratch/` record.
2. Extend Task 1's verification command with `action-close-v5.test.mjs` and `package-boundary.test.mjs`. Add `package-boundary.test.mjs` to Task 2 as well. Require `node scripts/task-tracker/verify-develop.mjs` before each of the two commits. Name the repository lints that apply to the new test, fixture and doc files (`lint:test-layout`, `lint:test-entrypoint-imports`, `lint:story-tags`, `lint:line-cap`, `lint:test-reach`, and for the guide `lint:md`, `lint:spell`, `lint:doc-anchors`).
3. Resolve the guide's packaging. Either keep it in `docs/guides/`, measure the tarball delta and run the guidance-release check, or move it to an unpackaged location with rationale. Make Task 2 Step 4's "package delta" check cover the result explicitly.

## Optional suggestions

1. Task 1 Step 1 relies on the real `deliver.mjs` comparator (`merge-tree --write-tree --merge-base`) to produce the fixture's v5 receipt. Write the P→H edit to the overlapping file as a hunk that does not overlap the B→P hunk, so the virtual merge succeeds. Then the fixture fails for the spec's reason (a whole-blob overlap) and not because of a delivery-side conflict.
2. Task 1 Step 3 runs a native Test verb inside a test process. State that the fixture's Test lock or mutator root is the fixture repository's own, never this checkout's. That keeps it consistent with the no-concurrent-`/task test` rule and the coordinator's exclusive Test slot.
3. Add a negative where Step 0's loader finds zero or multiple matching module headers, so a source refactor cannot silently turn the trace into a no-op. The interface text implies this but no step names it.

## Decision

revisions-requested
