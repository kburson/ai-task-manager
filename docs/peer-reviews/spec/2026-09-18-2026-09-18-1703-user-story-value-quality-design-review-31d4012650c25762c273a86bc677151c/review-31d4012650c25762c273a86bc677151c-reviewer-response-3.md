<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-31d4012650c25762c273a86bc677151c"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-18-1703-user-story-value-quality-design.md"
artifact_commit: "60b118fab7d128bafb1fa6d0006cd816ac975a0c"
artifact_blob: "ed6ebd4b41bb1be45f500fb3cd50a9a2022f6652"
artifact_digest: "sha256:10a055950643330cc9609dc387efe0e03e416c6a7320f0208f1a87a9755a930a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:6e1dd389045e08c9a4bc582b0713b768b829df06c26e6381fded46d13179be4f"
  identity_source: "runtime"
started_at: "2026-09-19T02:17:31.000Z"
submitted_at: null
finding_ids: ["R3-F001","R3-F002","R3-F003","R3-F004","R3-F005"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All four required and all three optional turn-2 findings are resolved. I
verified each against the revised artifact at `artifact_commit` 60b118fa and
against the live source, not against the author response:

- **R2-F001** — section 7.2 is now a four-branch closed tree. Branch 1 keys on
  a linked plan **plus** exactly one substantive `Source-plan-section`, resolves
  the matching task heading, and parses that task's `#### Story Intent`. A
  missing, duplicate, or no-longer-matching section fails closed as
  `story-intent-source-unresolvable` with no promotion to root intent, which is
  the fail-closed shape I recommended. The enum at 9.3 is now
  `linked-plan-task|linked-plan|deep-dive`, 10.2 names the child's authority,
  15 carries the new diagnostic, 16.1 and 16.3 cover task-section resolution,
  18 requires split children to carry the section, and 19 states the rule. The
  blocking defect is gone: a `split-plan` child can now resolve its own intent.
- **R2-F002** — 9.5 now runs the binding guard only when an
  `aitm-plan-approved` marker is present, and defers the missing-marker case to
  `planApprovedGuard`. That is exactly the condition I asked for: the
  `approval.plan` waiver keeps working for projects that never approve, while
  bindings stay unwaivable once approval evidence exists. See R3-F004 for one
  imprecise sentence in the same paragraph.
- **R2-F003** — 8.3 is now "Validation entry points" and defines a prose-scoped
  evaluator and a body-scoped entry point, with the section-existence and
  section-position requirements living only on the latter. 9.4 step 4 and 9.5
  step 3 name the body-scoped entry point; 10.2 names the prose-scoped one and
  says why ("its child body does not exist until preflight"). 14.1 mirrors the
  split. The #503 invariant survives on the body-scoped path.
- **R2-F004** — 7.1 now states the two-view rule explicitly, including that
  values are read from the corresponding original source line and that plan and
  deep-dive parsing use the same rule so both canonicalize identically. 10.1 and
  14.2 match. This is implementable as written: `structuralLines` is pushed once
  per source line (`decomposition-policy.mjs:174`, `:193`), so masked and
  original indices align.
- **R2-F005** — 8.3 states that both entry points exclude HTML-comment-led
  in-section marker lines "before shape validation, normalization, or hashing,"
  which closes the `story-shape-invalid` relocation. 14.1 says the same.
- **R2-F006** — 16.4 now scopes the absence proof to "non-test source files
  under `scripts/`," which excludes both this design document and the fixture.
- **R2-F007** — 13.3 gains the JIT paragraph and states the reason
  (later trunk movement intentionally stales the renewed approval).

I also re-checked that the turn-1 fixes survived revision 2. The `I want to`
renderer (8.1), the section-position invariant (8.3), kebab-case marker
attributes (9.3), the 9.1 comment exclusion, the fixture path and honest
provenance labeling (16.1), the five contradicting guidance files (12), the
all-task split semantics (10.3, 13.5), the injected `deps.resolveStoryIntent`
(9.5), and the renewed-timestamp legacy repair (13.3) are all intact.

My decision is `accepted`. The five findings below are all optional. None of
them blocks implementation; three are consequences of R2-F001 moving the
authority selector into the issue body, and I would rather they be settled in
the specification than discovered in Task 3 or Task 4. All line references are
against `artifact_commit` 60b118fa as checked out in this worktree.

## Findings

No required changes.

## Required changes

None.

## Optional suggestions

### R3-F001 — The 9.4 fresh-base closure does not reconfirm `Source-plan-section`

Section 9.4's closure "re-extracts the story and, for deep-dive authority,
re-resolves intent from the fresh body," and for linked plans "reconfirms the
body still links the same plan reference."

Before R2-F001 that was complete: for a linked plan, every digest input lived in
a file whose provenance the plan/trunk checks already covered. R2-F001 moved
the authority *selector* into the issue body. `Source-plan-section` is now a
body-resident input to the intent digest, and the fresh-base closure exists
precisely because body-resident values can change between prevalidation and
write.

The failure is narrow and fails closed rather than open: if the section value
changes mid-transaction, the marker binds `D(task 3)` while the body selects
task 4, and the Plan-exit guard's step 5/6 source-and-digest comparison refuses
promotion. So the consequence is an approval that is immediately unusable, not
a false green — which is why this is optional rather than required.

Recommend adding `Source-plan-section` to the set the closure reconfirms
alongside the plan reference, or extending the deep-dive clause to "for any
authority whose selector lives in the issue body." One clause either way.

### R3-F002 — Which linked plan does `Source-plan-section` resolve against?

Section 7.2 branch 1 says "links a governed implementation plan and contains
exactly one substantive `Source-plan-section`," then resolves the task within
"the plan." The existing resolver picks the plan by key precedence:
`PLAN_METADATA_KEYS = ['Implementation-plan', 'Source-plan', 'Plan']`
(`decomposition-policy.mjs:24`), first substantive key wins
(`:302-310`).

A `split-plan` child is created with `Source-plan` and `Source-plan-section`
pointing at the same file, so today the pairing is correct by construction. It
stops being correct the moment that child gains its own `Implementation-plan` —
which is the normal thing to do when a sub-issue acquires its own governed plan.
Precedence then selects the new plan while the section still names a task in the
parent's plan, and branch 1 resolves a task heading against the wrong file. The
likely outcome is `story-intent-source-unresolvable` (fail-closed, fine), but a
heading collision across two plans — `### Task 1: Foo` is not an exotic
heading — would silently bind the wrong task's intent.

Recommend stating that `Source-plan-section` is interpreted only against the
plan named by `Source-plan`, and that an issue carrying both an
`Implementation-plan` and a `Source-plan-section` either resolves through
branch 2 or fails closed. Whichever you pick, say it, because key precedence
will otherwise decide it silently.

### R3-F003 — "Exactly one substantive `Source-plan-section`" needs its own check

Two small facts make this worth a sentence:

1. `metadataFieldValue` (`metadata-section.mjs:109-119`) returns the **first**
   matching field in the section and never reports duplicates, so the
   "exactly one" requirement in 7.2 is not something the existing helper
   provides. A duplicate would be silently resolved to the first, which is the
   opposite of the fail-closed behavior 7.2 promises.
2. Every `split-plan` child body carries the field name twice, in two sections:
   `- **Source-plan-section**` under `## Plan Metadata`
   (`split-plan.mjs:75`) and `- **source-plan-section**` under `## Story Origin`
   (`split-plan.mjs:64`, wrapped at `preflight-issue.mjs:420`). Key matching is
   case-insensitive (`metadata-section.mjs:113`), so only the `Plan Metadata`
   section scoping keeps these apart.

Neither is a defect in the design; both are traps for whoever implements Task 3.
Recommend 7.2 say the lookup is scoped to `## Plan Metadata` and that more than
one `Source-plan-section` field in that section is itself
`story-intent-source-unresolvable`.

### R3-F004 — 9.5's account of the missing-marker path overstates what `planApprovedGuard` does

Section 9.5: "A missing marker remains the existing `planApprovedGuard`'s
responsibility: when `approval.plan` is waived, both guards return successfully
without requiring a marker; otherwise that guard retains its current
missing-approval diagnostic."

The "otherwise" is not accurate. `planApprovedGuard` returns `{ ok: true }` when
the `analysisToDevelopment` gate resolves falsy (`plan-approved-guard.mjs:44-51`)
before it ever reaches the missing-marker refusal (`:75-79`). With that gate off
and no marker present, neither guard refuses and no diagnostic appears. I
believe that is the intended outcome — no approval means nothing to bind — but
the sentence as written tells a reader the refusal still fires.

Separately, guard step 1 reads as two behaviors in one step ("return
successfully when ... otherwise defer"). Splitting the waiver case from the
gate case would make the four-path matrix from turn-1 R1-F003 legible at a
glance.

Suggest: "when no marker is present, this guard returns successfully and the
missing-approval decision stays with `planApprovedGuard`, which itself returns
successfully under an `approval.plan` waiver or a disabled
`analysisToDevelopment` gate."

### R3-F005 — Say that the task-heading match is against the normalized heading

Section 7.2 branch 1 matches the task "whose full heading exactly matches that
metadata value." `extractPlanTasks` does not emit the plan's literal heading
line; it emits a normalized one (`decomposition-policy.mjs:230`), capitalizing
the first letter of `Task`/`Milestone`, lowercasing the remainder, and trimming
the title. A plan line reading `### TASK 3: Foo` yields heading
`### Task 3: Foo`.

For `split-plan`-generated children this is invisible, because `split-plan`
writes `task.heading` — the already-normalized value — into metadata
(`split-plan.mjs:75`). It matters for a hand-authored or hand-repaired
`Source-plan-section`, where a literal copy-paste from the plan can fail the
exact match and produce `story-intent-source-unresolvable` for no reason the
operator can see from the two strings.

One clause naming the comparison basis — the normalized heading `extractPlanTasks`
returns, not the plan's literal source line — makes the refusal diagnosable, and
lets the diagnostic print both strings.

## Decision

accepted
