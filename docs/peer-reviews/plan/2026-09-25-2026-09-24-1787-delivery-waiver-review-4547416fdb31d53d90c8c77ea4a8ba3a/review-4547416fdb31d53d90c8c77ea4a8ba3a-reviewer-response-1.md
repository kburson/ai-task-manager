<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4547416fdb31d53d90c8c77ea4a8ba3a"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md"
artifact_commit: "f48cf94aa0cbf60294b91ead1279947e6e932e7c"
artifact_blob: "fc909345ee02dd26feaf9a5bb0813ec6e922d51f"
artifact_digest: "sha256:a11695175a901a661be14f7412c3969a6332491c3829be47310342c37065db05"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:8e0418558a5e2f38060c9beb87d020a67aa9b8e59decc898115b1b3b6a388f7e"
  identity_source: "declared"
started_at: "2026-09-25T03:36:33.935Z"
submitted_at: "2026-09-25T03:42:35.546Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Review of the Story Intent amendment to the #1787 implementation plan at commit
`f48cf94a`, blob `fc909345`, SHA-256
`a11695175a901a661be14f7412c3969a6332491c3829be47310342c37065db05` (536 lines). I read the
whole artifact rather than only the amended region, and I evaluated the amendment against
the repository's live Story Intent contract in source — `scripts/task-tracker/lib/user-story-quality.mjs`,
`scripts/task-tracker/lib/decomposition-policy.mjs`, `scripts/task-tracker/lib/story-intent-source.mjs`,
`scripts/task-tracker/lib/split-plan.mjs`, `scripts/task-tracker/lib/governed-plan-policy.mjs`,
`scripts/task-tracker/lib/plan-markdown-views.mjs`, and the canonical scaffold in
`templates/plan-file.md` / `scripts/task-tracker/lib/plan-file.mjs`. Per the reviewer Git
boundary I ran no Git command, so I did not diff against the previously accepted blob;
line-number correspondence with the prior accepted revision (a uniform +7 offset across
every landmark the round-2 response cited — old 55/184/400/417/418/420/468/469/478/486/492
now at 62/191/407/424/425/427/475/476/485/493/499) is consistent with an
insertion-only amendment at the head of the file, and I re-read the body sections at those
new offsets to confirm their content is the accepted text.

The amendment consists of the `**Plan status:**` paragraph (line 15) and the root
`## Story Intent` section (lines 17-22). I confirmed the sealed spec digest
`bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb` on line 11 is unchanged
and that no task now asks for a spec behavior change.

**What the amendment gets right, verified mechanically rather than assumed.** The root
section parses under the real extractor. `resolveStoryIntent`
(`user-story-quality.mjs:363-444`) takes the no-selector branch, finds exactly one
`/^## Story Intent\s*$/` match (line 17, index 16), scans forward to the next `#{1,2}`
heading — `## Global Constraints` at line 24, index 23 — and calls `parseStoryIntent` with
`headingLevel: 2`, `startLine: 17`, `endLine: 23`. Inside `parseStoryIntent`
(lines 188-275) the heading is found once at level 2, `stop` lands on `end` because the
section contains no nested heading, the two blank lines at indices 17 and 22 are skipped by
the `line 239` guard, and each of the four bullets matches
`/^[ \t]*-[ \t]+\*\*([^*]+):\*\*/` with an exactly-canonical label from `INTENT_LABELS`
(`Beneficiary`, `Capability`, `Need`, `Value or failure prevented`), a non-empty
single-line value, and no duplicates. The values survive the `commandLines` cross-check at
line 255 because `markdownViews` only blanks fenced or inline-code spans and these bullets
carry neither. The section also satisfies the `roots.length > 1` ambiguity guard: there is
exactly one `## Story Intent` in the file.

I also confirmed the plan still passes `validateGovernedPlanContent`
(`governed-plan-policy.mjs:49-60`): no line in the artifact matches the
`gh issue edit --body`/`--body-file`, `mutateIssueBody(`, one-off `.scratch|.tmp/gh/*.mjs`
mutator, or `.tmp/(gh|plan)/` scratch-drift rules, so `resolveStoryIntentSource` will not
refuse on policy grounds.

The `**Plan status:**` claim is accurate. The prior plan review record
`review-ceeecb3db9ae33154a3aa9cd648031fd` shows `"status": "accepted"`,
`"acceptance_basis": "reviewer-consensus"`, author GPT-6 Astra (`codex`) and reviewer Claude
Opus 5 (`claude-code`), with `final_commit` `5b1a4d91`. The statement that peer acceptance
neither approves implementation nor activates a waiver is correct and worth keeping.

**Why I am not accepting.** The amendment supplies one half of the repository's Story Intent
contract and leaves the artifact unable to satisfy the other half, and the one artifact the
amendment actually produces — the rendered user story — is malformed. Both are mechanical,
not stylistic:

1. `renderStoryFromIntent` concatenates the four field values into a three-line story, and
   the amendment's capitalized, period-terminated values produce a grammatically broken
   sentence at the `because` join. This is the string that `resolveStoryIntentSource` hashes
   into `storyIntentDigest` and binds at Plan approval.
2. All eleven tasks are `## Task N:` (H2). `TASK_HEADING_RE` in `decomposition-policy.mjs:22`
   is anchored to `^###\s+(Task|Milestone)\s+(\d+):`, so `extractPlanTasks` returns zero
   tasks for this plan. That silently suppresses the `task-count` must-split signal on an
   eleven-task plan, makes `split-plan` refuse, and makes any child issue's
   `Source-plan-section` selector unresolvable. Because per-task `#### Story Intent` blocks
   are parsed only *within* an extracted task's line range
   (`decomposition-policy.mjs:87-91`, `headingLevel: 4`), the heading level and the missing
   per-task intents are one defect, not two independent ones.

Neither is introduced by the Story Intent section in isolation; the H2 task headings predate
this amendment. I am raising them here because this amendment's stated purpose is to make
the plan satisfy the Story Intent contract before Plan approval, and the contract has a root
level and a task level that are implemented by the same modules. Landing the root half alone
produces a plan that passes `plan-approve` while remaining unsplittable and invisible to the
decomposition gate — which is the specific failure mode the round-1 and round-2 reviews of
this plan were careful to avoid elsewhere.

## Findings

1. **The rendered user story is grammatically malformed.**
   `renderStoryFromIntent` (`user-story-quality.mjs:181-184`) builds
   `As a ${beneficiary}\nI want to ${capability} because ${need}\nSo that ${value}`. With the
   amendment's values (lines 19-22) that renders as:

   ```
   As a Release operator responsible for closing a delivered issue.
   I want to Authorize one named PR-delivery verifier divergence through a scoped, host-verified human decision and receive a visibly waived delivery receipt. because A benign, understood difference between an authorized PR intent and independently observed merge evidence can otherwise strand the issue after the code has reached trunk.
   So that The operator can complete an auditable delivery without adding a one-off reconciliation branch or representing the waived invariant as an ordinary pass.
   ```

   The `receipt. because A benign` join is the visible break; the mid-sentence capitals and
   the terminal period on line 1 are the same root cause. I traced this through
   `evaluateStoryProse` to be precise about severity: it does **not** fail the automated
   gate. The three shape patterns at `user-story-quality.mjs:62` are satisfied (`As a ` +
   non-space, `I want to ` + non-space, `So that ` + non-space); the placeholder scan at
   line 70-75 cannot fire because the amendment contains no `[`; the
   `story-administrative-beneficiary` regex at line 79 does not match
   `release operator responsible for closing a delivered issue`; the
   `story-task-as-capability` regex at line 87 does not match; and neither the
   `story-workflow-progress-value` nor the `story-traceability-only-value` regex at lines 98
   and 108 matches the value phrase. So this is a quality defect in a durable bound artifact,
   not a gate failure — but the bound artifact is precisely what this amendment exists to
   produce, and the canonical worked example at `templates/plan-file.md:66-69` demonstrates
   the intended form: lowercase openers, no terminal periods, each value written to read as a
   clause rather than a sentence.

2. **Task headings are at the wrong level, so the plan has zero extractable tasks.**
   The artifact's eleven tasks are H2 (`## Task 1:` at line 160 through `## Task 11:` at
   line 478). `TASK_HEADING_RE` (`decomposition-policy.mjs:22`) requires H3. I confirmed by
   pattern-matching the artifact that it contains zero `^### (Task|Milestone) \d+:` headings.
   The house convention contradicts this artifact: `2026-09-21-1668-delivery-readiness.md`,
   `2026-09-23-1678-consumer-release-split.md`, `2026-09-22-1671-guidance-validation.md`,
   `2026-09-22-1672-guidance-source-trust.md`, `2026-09-04-1514-externalize-forecast-comparables.md`,
   `2026-08-19-test-corpus-membership-registry.md`, `2026-08-07-terminal-timing-seal.md`, and
   `2026-09-02-1219-cloud-test-portfolio-wbs.md` all use `### Task N:`. Only
   `2026-09-22-1765-correct-lifecycle-capture.md` shares this artifact's H2 form, and it is
   nonconforming for the same reason. Three concrete consequences:

   - **The must-split safety signal is suppressed.** `classifyDecomposition`
     (`decomposition-policy.mjs:159-177`) computes `taskCount` from `extractPlanTasks`. With
     eleven real tasks the count would be 11, which is `>= DECOMPOSITION_THRESHOLDS.splitTaskCount`
     (4) and therefore `must-split` (line 131-133). With zero extracted tasks the signal never
     fires, and `decompositionPlanExitGuard` (`decomposition-plan-exit-guard.mjs:146-156`) —
     which blocks a non-epic plan→develop transition on `must-split` absent a complete visible
     `## Decomposition Waiver` — is satisfied by default. An eleven-task, eleven-commit plan is
     exactly the shape that gate exists to catch.
   - **`split-plan` cannot run.** `validateSplitTasks` (`split-plan.mjs:68-69`) emits
     `split-tasks-missing` ("plan has no numbered tasks") for an empty task list, so the
     sanctioned decomposition path the artifact itself invokes on line 38 ("or its assigned
     child issue after sanctioned decomposition") is unreachable today.
   - **Per-task intent selection cannot resolve.** `selectStoryIntentTask`
     (`user-story-quality.mjs:340-359`) matches a child issue's `Source-plan-section` value
     against `task.heading`, and `resolveStoryIntent` then parses at `headingLevel: 4` inside
     that task's bounds (`user-story-quality.mjs:402-410`). With no tasks extracted, every
     `Source-plan-section` selector refuses, and `plan-approve` on any child issue fails with
     `story-intent-source-unresolvable`.

3. **No task carries a `#### Story Intent` block or a `**Verification Commands:**` fence.**
   The canonical scaffold (`templates/plan-file.md:35-54`, mirrored in
   `plan-file.mjs:44-57`) places a `#### Story Intent` under every `### Task N:`, and
   `validateSplitTasks` (`split-plan.mjs:45-66`) refuses each task lacking one with
   `split-task-story-intent-missing` ("Add one valid #### Story Intent block before
   splitting"). The same function refuses each task with no executable verifier
   (`split-task-verifier-missing`, lines 38-44), and `commandsFromTaskBody`
   (`decomposition-policy.mjs:46-68`) reading the `commandLines` view can only see a fence
   that `markdownViews` marked `verification: true` — which requires an immediately preceding
   `**Verification Commands:**` label (`plan-markdown-views.mjs:1`, `116-137`) — or a bare
   `Run: \`cmd\`` line matching `RUN_COMMAND_RE` (`decomposition-policy.mjs:24`). This artifact
   has zero `Verification Commands` labels and zero conforming `Run:` lines; its Task 11
   `sh` block is introduced by `- [ ] Run:`, which the regex rejects because of the checkbox
   prefix, and its `js` blocks are illustrative rather than executable. So even after
   Finding 2 is fixed, `split-plan` would still refuse all eleven tasks twice over. This is
   conditional on the decomposition lane, which is why I have scoped the required change
   below to a decision plus the work that decision implies, rather than demanding per-task
   blocks unconditionally.

4. **The prior plan acceptance is asserted without a durable pointer.** Line 13 cites the
   spec's acceptance completely — manifest path, participants, basis, and finalization commit
   `3358b074`. Line 15 asserts the plan-level acceptance ("The prior revision was accepted by
   Astra 6 / Opus 5 peer review") with no path, record id, or commit. I verified the claim
   independently against
   `docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/review-ceeecb3db9ae33154a3aa9cd648031fd-review-manifest.md`
   and it holds, but a reader of the plan alone cannot. Minor and non-blocking; recorded as an
   optional suggestion.

## Required changes

1. **Rewrite the four Story Intent values so `renderStoryFromIntent` emits a well-formed
   story.** Lowercase the leading word of each value, drop the terminal periods, and phrase
   `Need` so it reads as a `because` clause. Concretely, something of this shape renders
   correctly and preserves the amendment's meaning:

   - **Beneficiary:** release operator responsible for closing a delivered issue
   - **Capability:** authorize one named PR-delivery verifier divergence through a scoped, host-verified human decision and receive a visibly waived delivery receipt
   - **Need:** a benign, understood divergence between an authorized PR intent and independently observed merge evidence can otherwise strand the issue after its code has reached trunk
   - **Value or failure prevented:** the operator completes an auditable delivery without a one-off reconciliation path and without representing the waived invariant as an ordinary pass

   Check the rendered three-line form, not just the bullets — the `because` join is where the
   current wording breaks. Keep each value a single line with no `\r`/`\n`, since
   `normalizedIntent` (`user-story-quality.mjs:161-175`) throws on a multi-line field.

2. **Promote the eleven task headings from `## Task N:` to `### Task N:`.** This is what makes
   the plan's tasks visible to `extractPlanTasks`, and therefore to the decomposition
   classifier, to `split-plan`, and to per-task intent selection. Check the two nested `###`
   headings at lines 50 (`### Consumption Serialization Decision`) and 522 (`### #1783
   Handoff`) while making this change: once tasks are H3, any `###` sibling inside a task's
   bounds terminates that task's body at `SECTION_HEADING_RE` (`decomposition-policy.mjs:23`,
   `84`). Both currently sit outside task bodies — line 50 under `## Scope and Planning
   Decisions` and line 522 under `## Acceptance Matrix and Spec Coverage` — so demoting them to
   `####` is optional, but confirm no new `###` lands inside a task block.

3. **State the decomposition lane explicitly and supply what it requires.** Fixing required
   change 2 makes `taskCount = 11`, which is `must-split`. The plan must then say which lane it
   takes, because each has a different obligation:

   - *Split into child issues* — add a `#### Story Intent` block and a `**Verification
     Commands:**` fence to each of the eleven tasks, so `validateSplitTasks` passes. The fence
     must be preceded by the exact `**Verification Commands:**` label for `markdownViews` to
     mark it a verification fence; a `js` illustration block does not count, and a checkbox-
     prefixed `- [ ] Run:` line does not match `RUN_COMMAND_RE`. Most tasks already name their
     `node --test ...` command inline, so this is largely relocation into a labelled fence.
   - *Execute on #1787 under a waiver* — record that decision here and note that a complete
     visible `## Decomposition Waiver` section (all six fields of
     `decomposition-policy.mjs:27-34`, with a valid `Expected-focused-duration` and ISO
     `Approved-at`) must exist in the **issue body**, not in this plan file, before
     plan→develop.

   Either is defensible; leaving it implicit is not, because line 38 currently gestures at
   decomposition ("or its assigned child issue after sanctioned decomposition") while the
   artifact cannot be split.

## Optional suggestions

1. Cite the prior plan acceptance the way line 13 cites the spec acceptance — record id
   `review-ceeecb3db9ae33154a3aa9cd648031fd`, the manifest path under
   `docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/`,
   and `final_commit` `5b1a4d91` — so the `**Plan status:**` claim is verifiable from the plan
   alone. Worth also noting there, as line 13 does for the spec, that the plan acceptance
   likewise carries no signed human-authority attestation: the prior manifest records
   `"authority_assurance": "unavailable"` and `"residual_risk": ["human-authority-unavailable"]`.

2. Two further template divergences are harmless today but cheap to close while editing the
   head of the file: the plan has no `## Plan Metadata` section, and its scope heading is
   `## Scope and Planning Decisions` rather than the exact `## Scope` that
   `validatePlanContent` (`plan-file.mjs:117-126`) requires. I checked both before raising
   them: `planMetadata` (`user-story-quality.mjs:279-299`) reads the **issue** body rather
   than the plan file, and `validatePlanContent` is called only from
   `scripts/task-tracker/verbs/save-plan.mjs:50`, so neither blocks approval. The only real
   exposure is that re-saving this plan through `save-plan` would refuse on the scope heading.

3. `Value or failure prevented` says the operator avoids "adding a one-off reconciliation
   branch." In this plan "branch" is used two ways — the `--reconcile-merge-method` *code*
   branch (line 433) and Git branches/refs (lines 56, 349). Since the intended sense is the
   code path, "a one-off reconciliation path" or "a one-off reconciliation code path" removes
   the ambiguity. Folded into the required change 1 wording above.

4. The plan-level Story Intent sits between `**Plan status:**` and `## Global Constraints`,
   whereas the canonical scaffold places it after `## Plan Metadata` and immediately before the
   tasks. Nothing enforces the position — `resolveStoryIntent` locates the section by regex
   anywhere in the file — so this is purely about matching the scaffold a reader expects. No
   change needed unless suggestion 2 is taken, in which case placing it after a new
   `## Plan Metadata` section costs nothing.

## Decision

revisions-requested
