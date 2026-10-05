<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cca8cd1a6c8765cfef624488b76e2c68"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md"
artifact_commit: "29d09ff1ec0bba9e484da71a6af17ac5ea08271d"
artifact_blob: "b79199c74dc6ba4b6888dc8866c11a3d3e238383"
artifact_digest: "sha256:0db2ebf7e7f59aa3b1bcb99b6b4d0b9ed4a6bb1d412e8210d916ff3ed8469267"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:8182dd25c53e42272363b7c259fd4bea5763d10a5ecaa21a2e54717c1e91d762"
  identity_source: "runtime"
started_at: "2026-09-30T17:47:27.414Z"
submitted_at: "2026-09-30T17:48:38.944Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This pass covers the plan at `29d09ff1`, which renames the six `### Task N:` headings to the canonical kind-prefixed form `🐞 [BUG] <title>`. I traced how those headings flow through the registered decomposition path: `lib/decomposition-policy.mjs::extractPlanTasks` → `lib/split-plan.mjs::buildSplitProposals` / `baseCreatorArgs` → `scripts/gh/create-issue.mjs::buildIssueTitle` → `scripts/gh/lib/kind-prefix.mjs::ensureKindPrefix`.

The headings parse correctly. `TASK_HEADING_RE` captures the full remainder as `title`, so each child's `--title` is exactly `🐞 [BUG] <title>`, and the source-plan-section/AC heading carries the same string. `duplicate-child-guard` strips known prefixes before it checks similarity, so the prefix doesn't weaken duplicate detection. The rest of the plan's substance is unchanged from the previously accepted revision, and I found no new structural regressions in task Story Intent blocks, estimates (6+8+10+8+10+6 = 48h, matching the parent estimate), dependencies, or Verification Commands.

There is one material gap. The prefix is supposed to be derived from a label, but nothing in the plan makes sure the children get that label.

## Findings

1. **Kind-prefixed child titles aren't backed by the `bug` label that kind-prefix treats as the source of truth (material).** `kind-prefix.mjs` says outright that "The label remains the source of truth," and `ensureKindPrefix` only re-stamps when a kind label is present. `split-plan`'s `baseCreatorArgs` passes `create-issue --shape sub-issue --parent 1847 --title <title>` with no `--label`. `applyShapeDefaults` only adds `bug` for `--shape defect`, not `sub-issue`. So all six children would be created with a hard-coded `🐞 [BUG]` title and no `bug` label. That leaves a title/label split-brain. Label-aware reconcilers (`lib/beta-report-title-reconcile.mjs` strips known prefixes when no kind label exists), board filters, and any later `ensureKindPrefix` pass would treat these children as unlabeled and could strip or disagree with the title. The plan's "Parent validation and operational handoff" section says to create children only through `split-plan`, but it never says how the `bug` label gets applied. As written, the "canonical title" goal isn't actually achieved: the prefix is canonical only when the label drives it.

2. **Minor: the heading string is now load-bearing in three child surfaces.** The full heading, emoji included, is embedded in each child's AC text (`Deliver "### Task N: 🐞 [BUG] ..."`), `source-plan-section` in Story Origin, and Plan Metadata. That's fine while the plan is pinned by `Source-plan-commit`. But if someone later edits the plan to fix a prefix (for example, if the label decision changes), the heading-based section selection (`decomposition-policy.mjs` selection by heading) will no longer resolve against a new commit. It isn't blocking. It's just worth knowing that prefix churn in headings is expensive after split.

3. **Minor: Task 5's Files list is joined with semicolons in the middle of the list** (`scripts/gh/move-state.mjs`; `…promote.mjs`, …). That makes it harder to read as one enumerated set, and it's easy to misread as separate clauses. Cosmetic only.

## Required changes

1. In "Parent validation and operational handoff," add an explicit, sanctioned step that gives every created child the `bug` label right after the confirmed `split-plan` operation (label edits are permitted by the bash guard). Then verify each child's title, read back from GitHub, equals `ensureKindPrefix(title, ['bug'])`, i.e. exactly one `🐞 [BUG] ` prefix. If `split-plan` is expected to propagate parent kind labels instead, say so and cite the mechanism. As far as I can see, the current code has none. The alternative is to drop the literal prefix from the headings and let the label drive the title at creation. Either way, the title and label have to agree once the split finishes.

## Optional suggestions

1. Add a one-line note to the handoff saying the `🐞 [BUG]` prefix in headings is intentional and gets idempotently re-stamped by `ensureKindPrefix` when the label is present. That keeps a future editor from "fixing" it and breaking `source-plan-section` resolution.
2. Rewrite Task 5's Files list as one comma-separated (or bulleted) enumeration without the stray semicolons.

## Decision

revisions-requested
