<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b1dae1956ef2500be0281d489862b34f"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-21-1719-story-token-cost.md"
artifact_commit: "3203fdbbde83e7745a2f296677544350cffb0127"
artifact_blob: "de872531149f42acd9d8346dd68994541b380402"
artifact_digest: "sha256:f8cdd1d6d9bb67d0ae9f372cf1fa3292c6dec8ea7e26ab3774e325d96ee5c8eb"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:93081810c0fb3160b771d352194e93139c8f400dd0d8cd296ffab3da7db87047"
  identity_source: "declared"
started_at: "2026-09-24T06:33:41.689Z"
submitted_at: "2026-09-24T06:42:55.690Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Scope reviewed: the Story Intent amendment described at `docs/superpowers/plans/2026-09-21-1719-story-token-cost.md:19` — a root `## Story Intent` block, sixteen nested `#### Story Intent` blocks, and the canonical `### Task N: <title>` headings that carry them — plus the amendment's effect on the surrounding status and constraint prose. The sixteen implementation tasks' technical content is out of scope for this round except where the amendment contradicts it.

**The mechanical half of the amendment is correct and I verified it by execution, not by reading.** All seventeen intent blocks resolve under the repository's own canonical extractor at the exact heading scopes the resolver demands, all sixteen task headings are recognized and unique as `Source-plan-section` selector candidates, and all seventeen rendered stories pass `evaluateStoryProse` in `approval` mode. Nothing in this amendment will produce a `story-intent-*` refusal at `plan-approve`. Evidence is in R1-F007 below.

**The prose half is not consistent.** The amendment asserts a new fact — that the implementation epic and its sixteen children "were subsequently authorized and hydrated" — and drops that fact next to three pieces of unrevised text that the fact falsifies: a present-tense status paragraph that says hydration may happen only after plan approval and that approval is still pending; a global constraint whose stated precondition is that implementation issues do *not* yet exist; and a five-item author-check block, entirely ticked, whose ticks were earned against the pre-amendment artifact and therefore certify nothing about the seventeen blocks this round exists to approve. Each is a small edit. None is a design problem. All three matter because this plan is about to become the *authoritative binding source* for sixteen child issues, and `plan-approve` binds a digest of these exact bytes.

Decision: **revisions-requested**, on three required changes, none of which touches the technical steps.

**Verified as correct.** I checked the amendment's binding claims against the repository's own resolver rather than against the guide's prose, and the following hold.

- **All sixteen tasks parse at the required heading scope.** `extractPlanTasks` (`scripts/task-tracker/lib/decomposition-policy.mjs:74`) calls `parseStoryIntent` with `headingLevel: 4`, bounded from the task heading line to the next `#{1,3}` heading. Every task returned a populated `storyIntent` and an empty `storyIntentViolations` array. The `#### Story Intent` → `#### Implementation Steps` ordering is what makes this work: `parseStoryIntent` refuses a *nested* heading inside the block (`user-story-quality.mjs:234`), and a sibling `####` is not nested, so the block terminates cleanly at `Implementation Steps` in all sixteen cases.
- **The root block resolves at `headingLevel: 2`.** `resolveStoryIntent`'s root path (`user-story-quality.mjs:415`) matches `/^## Story Intent\s*$/` exactly, finds one occurrence at line 21, bounds it at `## Global Constraints` (line 28), and parses. The amendment correctly used `##` for the root and `####` for tasks; using a uniform level would have failed one of the two paths with `story-intent-invalid` ("heading is at the wrong scope").
- **No duplicate or shadow blocks.** `parseStoryIntent` refuses with `story-intent-ambiguous` on a second `Story Intent` heading inside its bounds, and root discovery refuses on a second root block. Neither fired. The plan's fenced code blocks and inline-code spans are masked by `markdownViews`, so no example line can masquerade as a heading or a field bullet.
- **All four field labels are exact in all seventeen blocks.** `INTENT_LABELS` (`user-story-quality.mjs:153`) accepts only `Beneficiary`, `Capability`, `Need`, and `Value or failure prevented`, each as a single-line `- **Label:** value` bullet with no continuation lines. Seventeen blocks × four fields matched with zero `story-intent-invalid` results.
- **All seventeen rendered stories pass approval-mode quality.** `renderStoryFromIntent` composes `As a <beneficiary> / I want to <capability> because <need> / So that <value>`; each of the seventeen passed `evaluateStoryProse` with `mode: 'approval'`. Specifically, none tripped `story-administrative-beneficiary`, `story-task-as-capability`, `story-workflow-progress-value`, or `story-traceability-only-value` — the four traps that per-task intents on an infrastructure plan most often fall into. The capability fields describe capabilities rather than "implement task N from the plan," and the value fields name failures prevented rather than issue progress.
- **The sixteen task headings are unique and byte-stable as selector candidates.** `extractPlanTasks` reconstructs each heading from the *structural* view, and no task title contains backticks or inline code, so the reconstructed `### Task N: <title>` is byte-identical to the raw heading. An operator copying a heading into `Source-plan-section` will select the intended bytes — the failure mode the user-story guide warns about under "task-selector diagnostics" does not apply here.
- **`split-plan`'s precondition is now satisfied.** `docs/guides/user-story-quality.md` requires that "historical plans must gain valid Story Intent in every task before `split-plan` can create children." Before this amendment that was false for all sixteen tasks; after it, it is true for all sixteen. This is the amendment's core value and it is delivered.

## Findings

Three required findings (R1-F001 – R1-F003), three optional findings (R1-F004 – R1-F006), and one informational entry recording the verification I ran (R1-F007). All line references are to `docs/superpowers/plans/2026-09-21-1719-story-token-cost.md` at `3203fdbb`.

### R1-F001 — The Plan status block and the amendment paragraph assert contradictory current states (required)

Line 17 reads, in the present tense:

> **Plan status:** Proposed, undergoing its separately authorized XPR; implementation approval remains pending. ... Issue #1719 remains the design-and-plan deliverable; hydrate implementation issues through the governed workflow only after plan approval.

Line 19 then reads:

> **Story Intent amendment:** The historical status above records the original plan review. The implementation epic and its 16 children were subsequently authorized and hydrated.

These cannot both describe the present. Line 17 states a rule ("hydrate ... only after plan approval") and a fact ("implementation approval remains pending"); line 19 states that hydration has already occurred. A reader has exactly three readings available and the artifact does not choose between them: (a) hydration was separately authorized ahead of plan approval and the line-17 rule was deliberately superseded; (b) plan approval in fact occurred and line 17's "remains pending" is stale; or (c) the governed workflow was violated. Reading (a) is almost certainly the truth, but the artifact does not say so, and this is the paragraph an approver reads to establish *current* authority.

The label is the specific defect. Line 19 characterizes line 17 as "the historical status above," but line 17 is not marked historical — it is headed **Plan status** and is written in the present tense, and it appears *first*. The retroactive relabel in a later paragraph does not reach a reader who stops at the status line, and it leaves the superseded rule textually in force.

This matters beyond tidiness because line 17 is the artifact's own statement of what this review may authorize. The invitation puts the artifact under XPR for Plan approval; if the status block is ambiguous about whether approval has already happened, an acceptance on this round cannot be cleanly attributed.

**Fix.** Rewrite lines 17–19 as an explicit two-state history with dates, so that current authority is stated once and unambiguously. Concretely: retitle line 17 to something like `**Plan status (original, <date>):**`, and have the amendment paragraph state the current status positively — that the implementation epic and its sixteen children were authorized and hydrated ahead of plan approval under separate authorization, that this supersedes the original "only after plan approval" sequencing sentence, and that plan approval for the amended artifact is what this XPR round is for. Keep the four standing prohibitions (no production implementation, no historical backfill, no live billing credentials, no provider account access) in the *current* status, not only in the historical one, since they are still in force and currently sit inside the paragraph now labeled historical.

### R1-F002 — The `@story` tag constraint's stated precondition is now false (required)

Line 42 reads:

> All new executable files carry the implementation issue's `@story` tag. Examples use #1719 until implementation issues exist; do not invent issue numbers. Before executing any implementation task, substitute its approved implementation issue in every executable story tag and commit subject; fixture issue numbers may remain 1719.

"Until implementation issues exist" was accurate when written and is falsified by line 19. The constraint's *instruction* (substitute before executing) survives, so this is not a correctness hole in the steps — but the constraint now reads as conditional on a state that has passed, and a conditional whose condition is false is exactly the kind of clause an executing agent resolves in whichever direction is convenient. The stake is concrete and repository-enforced: every one of the sixteen task commit steps hardcodes a `[#1719]` subject (`git commit -m '[#1719] ...'` at line 164 and its fifteen siblings), and the subject-line lint gate described in `CLAUDE.md` checks the `[#N]` token against the issue actually being worked. A child issue committing `[#1719]` fails that gate, or worse, passes it while attributing sixteen children's deliverables to the parent — which is precisely the message-based attribution path `commit-trace`, `review-preflight`, and `close` grep.

**Fix.** Restate the clause for the current world: implementation issues now exist, so substitution is unconditional, not deferred. Suggested shape — "Examples in this plan use #1719. The implementation issues now exist; before executing any task, substitute its own implementation issue in every executable `@story` tag and every commit subject. Do not invent issue numbers, and do not commit a `[#1719]` subject from a child issue's worktree. Fixture issue numbers may remain 1719." Pair this with R1-F003's mapping suggestion so the substitution target is discoverable rather than remembered.

### R1-F003 — The author-check block is fully ticked but predates the amended content (required)

Lines 896–901 present five author checks, all `[x]`, ending with "Hand off the plan for the separately requested XPR." Those ticks were earned against the pre-amendment artifact. The amendment added seventeen intent blocks and restructured every task heading region, and not one of the five checks covers that content:

- "Check each coverage row and all thirteen failure cases against the ratified spec" — unrelated to intents.
- "Check exact file paths, exported signatures, payload field names, status vocabularies and dependency order" — unrelated to intents.
- "Check snippets for undefined contracts, incomplete examples and accidental unsafe payload keys" — unrelated to intents.
- "Validate Markdown, formatting, spelling, example syntax and source hash" — the closest, but a Markdown-validity check does not establish that seventeen blocks resolve at the correct heading scopes under `parseStoryIntent`, which is the only property that matters here and is not a Markdown property.
- "Hand off the plan for the separately requested XPR" — process, not content.

So the artifact now carries a complete green checklist over content that checklist never examined. That is a stale-evidence pattern this repository treats as a defect in its own right, and it is avoidable here at near-zero cost because the verification is a two-line script against the repository's own resolver — the same one I ran, reproduced verbatim under **Verification performed** below.

**Fix.** Add one author check covering the amendment, and record the command and its result rather than only ticking it. Suggested text: "Verify that the root `## Story Intent` and all sixteen `#### Story Intent` blocks resolve under `parseStoryIntent` at heading levels 2 and 4 respectively, that `extractPlanTasks` returns sixteen tasks with empty `storyIntentViolations`, and that every rendered story passes `evaluateStoryProse` in approval mode." If the existing five ticks are to be retained as historical, mark them as belonging to the original submission so the new check is visibly the one covering the amended bytes.

### R1-F004 — Record the epic number and the task → child issue mapping (optional)

Line 19 asserts sixteen children exist but names neither the epic nor any child, and gives no mapping from task number to issue number. Two consequences. First, the assertion is unverifiable from the artifact — I could confirm the sixteen *tasks* by execution but nothing in-repo substantiates the sixteen *issues*, so that clause is the one claim in this amendment I am accepting on the author's word. Second, and more practically, each child binds its intent by `Source-plan-section` against a heading in this file; if the mapping lives only on GitHub, a drifted or renamed heading breaks the binding with no in-artifact record of what was supposed to match.

Consider adding a short table — task number, task heading, child issue — or, if the author prefers not to embed issue numbers that the plan cannot keep current, a single sentence naming the epic and stating that each child selects its intent via `Source-plan-section` set to that task's exact `### Task N: <title>` heading. The second form is cheap, stays true under renumbering, and tells a future operator exactly which bytes are load-bearing. It also pairs with R1-F002: it gives "substitute its own implementation issue" a discoverable referent.

### R1-F005 — Task 12's intent is a near-duplicate of the root intent (optional)

Root (lines 23–26) and Task 12 (lines 618–621) share a beneficiary (`delivery engineering leader`) and near-identical capabilities — "see evidence-backed agent and metered automation cost for a story through delivery and Done" versus "inspect story cost and independent coverage across stages and delivery boundaries." Their rendered stories will read almost the same. The user-story guide asks that a story "remain distinct from sibling work"; strictly, Task 12 *is* distinct from its fifteen siblings and it is the root it echoes, which is defensible — Task 12 is the task that realizes the headline capability, so convergence is expected rather than accidental.

Still, when both are approved, an operator reading the epic's story and child 12's story gets no signal about which is which. Narrowing Task 12's capability to what is uniquely its own — the read-only, offline-by-default reporting surface and the *independent* coverage inventory that refuses to render missing evidence as zero — would make the child story self-identifying without touching the root. This is a readability improvement, not a gate risk; both pass today.

### R1-F006 — Three value fields state system invariants rather than the stakeholder's stake (optional)

Tasks 1, 3, and 7 phrase "Value or failure prevented" as properties of the system:

- Task 1 (line 133): "downstream accounting accepts only well-formed evidence without exposing sensitive content"
- Task 3 (line 215): "stage timing and cost attribution survive healing, migration, and rollup unchanged"
- Task 7 (line 393): "publication remains auditable and idempotent across failures"

Each does name a real failure prevented — secret exposure, evidence loss across rewrites, duplicate or lost records — so all three satisfy the field's "or failure prevented" branch and all three pass the quality evaluator. The weaker property is that none of them says who is worse off when the failure occurs, which leaves the named beneficiary doing no work in the sentence. Compare Task 14 (line 705), which does this well: "utilization and remaining capacity are visible without distorting delivery totals" names both the gain and the distortion avoided, and the subscription manager is recognizably the one who cares.

If the author wants these three to carry the same weight, tie each to its beneficiary's consequence — for Task 1, that a delivery engineer's cost records cannot leak prompt or credential content into a public issue; for Task 3, that an analyst's stage timings and cost attribution are not silently corrupted by a healing sweep; for Task 7, that an operator never double-counts or loses a publication after an interrupted write. No gate depends on this.

### R1-F007 — Verification performed (informational)

Both commands were run read-only from the review worktree against the artifact at `3203fdbb`. No Git command was invoked, no file outside this response was written, and the artifact was not modified.

**1. Task extraction and per-task intent resolution.**

```bash
node -e "
import('./scripts/task-tracker/lib/decomposition-policy.mjs').then(async (m)=>{
const fs=await import('node:fs');
const text=fs.readFileSync('docs/superpowers/plans/2026-09-21-1719-story-token-cost.md','utf8');
const tasks=m.extractPlanTasks(text);
console.log('tasks',tasks.length);
for(const t of tasks){
  console.log(t.number, t.heading, '| intent:', t.storyIntent? 'OK':'MISSING', JSON.stringify(t.storyIntentViolations));
}
});
"
```

Result: `tasks 16`; every task reported `intent: OK` with `[]` violations. Headings returned were `### Task 1: Closed schemas and safe fixture vocabulary` through `### Task 16: Acceptance matrix, prospective rollout and package verification`, all sixteen distinct.

**2. Root intent resolution and approval-mode story quality for all seventeen blocks.**

```bash
node -e "
(async()=>{
const q=await import('./scripts/task-tracker/lib/user-story-quality.mjs');
const m=await import('./scripts/task-tracker/lib/decomposition-policy.mjs');
const ua=await import('./scripts/task-tracker/lib/user-story-author.mjs');
const fs=await import('node:fs');
const text=fs.readFileSync('docs/superpowers/plans/2026-09-21-1719-story-token-cost.md','utf8');
const lines=text.split('\n');
const start=lines.findIndex(l=>/^## Story Intent\s*\$/.test(l));
let end=start+1; while(end<lines.length && !/^#{1,2}\s+/.test(lines[end])) end++;
const root=q.parseStoryIntent(text,{headingLevel:2,startLine:start+1,endLine:end});
console.log('ROOT', root.ok, JSON.stringify(root.violations));
const opts={mode:'approval',canonicalTemplate:ua.CANONICAL_USER_STORY_TEMPLATE};
const check=(label,intent)=>{
  const r=q.evaluateStoryProse(q.renderStoryFromIntent(intent),opts);
  console.log(label, r.ok?'PASS':'FAIL '+JSON.stringify(r.violations));
};
check('root',root.intent);
for(const t of m.extractPlanTasks(text)) check('task'+t.number,t.storyIntent);
})();
"
```

Result: `ROOT true []`, then `root PASS` and `task1 PASS` … `task16 PASS` — seventeen passes, zero violations.

**Not verified.** Two claims are outside what I could establish from this worktree, and neither is treated as a finding:

- The existence, numbering, and one-to-one correspondence of the implementation epic and its sixteen children (line 19). This is GitHub state; R1-F004 asks for it to be recorded in the artifact partly for this reason.
- That the amendment "does not change the technical steps" (line 19). The Reviewer Git boundary forbids Git commands, so I could not diff `3203fdbb` against its parent. I reviewed the sixteen tasks' technical content as it now stands for consistency with the amendment and found no conflict beyond R1-F002; I am not certifying the absence of an unrelated change. If the author wants that certified, it belongs in an author-side check.

## Required changes

1. **R1-F001** — Resolve the contradiction between the `**Plan status:**` block (line 17) and the `**Story Intent amendment:**` paragraph (line 19). State current authority once, in the present tense, with the original status explicitly labeled and dated as historical; carry the four standing prohibitions into the current status rather than leaving them inside the paragraph now described as historical.
2. **R1-F002** — Update the `@story` tag constraint (line 42) so it no longer conditions on "until implementation issues exist," which line 19 falsifies. Make substitution of the child's own implementation issue unconditional for both the `@story` tag and the `[#N]` commit subject, and state explicitly that a child must not commit a `[#1719]` subject.
3. **R1-F003** — Add an author check covering the amended content, recording the resolver verification (heading scopes 2 and 4, sixteen tasks with empty `storyIntentViolations`, seventeen approval-mode story passes) rather than only ticking a box; mark the existing five ticks as belonging to the original submission if they are retained.

## Optional suggestions

1. **R1-F004** — Record the epic number and the task → child issue mapping, or at minimum state that each child binds via `Source-plan-section` set to that task's exact `### Task N: <title>` heading.
2. **R1-F005** — Narrow Task 12's capability so its story is distinguishable from the root story.
3. **R1-F006** — Rephrase the Tasks 1, 3, and 7 value fields to name the beneficiary's consequence, not only the system invariant.

## Decision

revisions-requested
