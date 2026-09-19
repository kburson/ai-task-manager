<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-31d4012650c25762c273a86bc677151c"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-18-1703-user-story-value-quality-design.md"
artifact_commit: "ff4612475b3369afc2f218c58546da0d36352c68"
artifact_blob: "fafca0fce0b9decfb7a20628120134580dd7d972"
artifact_digest: "sha256:999fb90d9f1b48cc7f5a533eb76545d84bc3afb1a42bc9ea1bcf2adf888ef8bb"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:6e1dd389045e08c9a4bc582b0713b768b829df06c26e6381fded46d13179be4f"
  identity_source: "runtime"
started_at: "2026-09-18T22:00:10.990Z"
submitted_at: null
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004","R2-F005","R2-F006","R2-F007"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All sixteen turn-1 findings are genuinely resolved. I re-verified each one against
the revised artifact and the live source rather than against the author response,
and the dispositions are accurate:

- **R1-F001** — section 8.1 now renders `I want to {capability} because {need}`,
  and `capability` is defined at 7.1 as "a verb phrase suitable after
  `I want to`". Applying the 7.1 example yields
  `I want to stop package publication before any partial release occurs because ...`,
  which satisfies `/^I want to \S.*$/` at `user-story-author.mjs:70`. Section 8.3
  now names the exact accepted prefixes. Correctly fixed at the cheaper option (a).
- **R1-F002** — resolved as an explicit preservation, not a deletion:
  `story-section-missing` and `story-section-position-invalid` are in the 8.4 code
  set and in 8.3's approval-mode requirement list.
- **R1-F003** — the bypasses are addressed by extracting a separate
  `storyApprovalBindingGuard`. The separation of content integrity from human
  approval is the right architecture. See R2-F002 for the one boundary it
  overshoots.
- **R1-F004** — 7.1, 10.1, and 14.2 all now name the fence-masked structural view.
  I confirmed `structuralLines` is pushed once per source line
  (`decomposition-policy.mjs:174`, `:193`), so masked indices align with
  `originalLines` and the intent-stripped scope in 10.1 is implementable. See
  R2-F004 for what else that view masks.
- **R1-F005** — kebab-case throughout 9.3.
- **R1-F006** — 9.1 excludes HTML-comment-led lines and states that marker
  updates do not stale the digest.
- **R1-F007** — 16.1 now names the fixture path, the 24 issue sources (2 + 18 +
  2 + 2 = 24, arithmetic checks), the capture task, and — importantly — labels
  reconstructed negative rows honestly rather than claiming retained snapshots.
  That honesty is the right call and better than the finding asked for.
- **R1-F008** — all five contradicting guidance files are enumerated in section
  12 and the parity assertion now covers the lifecycle-timing claim.
- **R1-F009** — 10.1, 10.3, and 13.5 all state all-task, all-or-nothing semantics
  and the resulting migration cost.
- **R1-F010** through **R1-F016** — each addressed at the cited section.

I am nevertheless requesting a second round. The revision introduced four new
defects, and one of them is blocking in the same way R1-F001 was: as written,
**no issue created by `split-plan` can pass its own Plan approval**, because
authority resolution sends the child to the wrong block of the plan — a block
section 18 does not even require plans to contain. The remaining three are a
waiver regression, a mode/scope mismatch in split-plan validation, and an
unspecified interaction between the masked view and field values.

These are consequences of the fixes, not of the product direction, which I
continue to endorse. All line references are against `artifact_commit` ff461247
as checked out in this worktree.

## Findings

### R2-F001 — Split children resolve the parent plan's root intent, not their own task intent

This is the blocking one.

Section 7.2 step 1: "If `Plan Metadata` links a governed implementation plan,
resolve that file ... and parse exactly one root `## Story Intent` block."
Step 3: "Never fall back from a linked plan to deep-dive intent."

Every child `split-plan` creates carries a linked plan. `renderPlanMetadata`
(`split-plan.mjs:68-78`) emits:

```text
- **Source-plan**: <planPath>
- **Source-plan-section**: ### Task N: Title
```

and `linkedPlanReference` (`decomposition-policy.mjs:302-310`) reads
`PLAN_METADATA_KEYS = ['Implementation-plan', 'Source-plan', 'Plan']`
(`:24`), so `Source-plan` **is** a linked governed plan for resolution purposes.

Two failures follow, and they compound:

1. **The plan has no root block to resolve.** Section 18 requires only that "the
   implementation plan must give every task its own `#### Story Intent` block."
   Nothing in the design requires a plan to carry a root `## Story Intent`. So for
   a plan built to this specification, every child's `plan-approve` hits
   `story-intent-missing: linked plan has no root ## Story Intent block`
   (section 15, verbatim), with no repair available short of editing the parent's
   plan. The feature's own decomposition in section 18 produces six such children.

2. **Even with a root block, it is the wrong intent.** The child's prose was
   rendered from its task's `#### Story Intent` (10.2). Approval would bind that
   prose against the *parent-level* intent digest. Section 5.2 says prose is "a
   concise projection" of the bound intent; here it projects a different object.
   Worse, all siblings would bind the identical intent digest, which directly
   defeats rubric question 6 (sibling distinctness) and the 10.3 safeguard that
   children differ when their intent differs.

The repository already supplies the fix. The child carries
`Source-plan-section: ### Task N: Title`, which uniquely identifies the
originating task. Authority resolution should be a three-way tree:

1. `Plan Metadata` links a plan **and** carries `Source-plan-section` → resolve
   that task's `#### Story Intent` block within that plan;
2. links a plan without a task section → resolve the root `## Story Intent`;
3. no linked plan → deep dive.

State this in 7.2, say what happens when `Source-plan-section` names a task that
no longer exists in the plan (I recommend a fail-closed
`story-intent-source-unresolvable` rather than silent promotion to the root
block), and reconcile it with 9.5 step 4's source-kind match — a task-scoped
source is a third source kind, and the 9.3 enum
`linked-plan|deep-dive` needs a corresponding value. Whichever shape you choose,
sections 7.2, 9.3, 10.2, and 18 must agree on it.

### R2-F002 — The unwaivable binding guard breaks the `approval.plan` waiver entirely

Section 9.5: the guard "is independent of the existing `approval.plan` workflow
waiver," and its step 1 is "require all three story-binding attributes."

My turn-1 recommendation was narrower and deliberately so: run the binding check
"whenever a `plan-approved` marker is present and the transition is
`plan → develop`." The revision dropped the presence condition and made the
attributes mandatory unconditionally. That inverts a live policy.

`approval.plan` is a real, waivable catalog requirement
(`workflow-policy/catalog.mjs:12`), and `planApprovedGuard` honors the waiver by
returning `{ ok: true }` before any marker logic
(`plan-approved-guard.mjs:43`); `guard-registry-plan-exit.test.mjs:151` asserts
exactly that. A project that waives `approval.plan` never runs `plan-approve`,
so no `aitm-plan-approved` marker exists at all. Under section 9.5 as written,
step 1 refuses every such promotion with `story-approval-binding-missing`, and
the stated repair — "run `npx aitm plan-approve #N`" — is precisely the command
the waiver exists to remove. The waiver becomes unusable.

The distinction that makes this coherent is already in your own framing:
freshness is a content-integrity property *of an approval*. With no approval,
there is nothing to be stale against.

Recommended: condition the guard on marker presence. If
`hasPlanApprovedMarker(body)` is false and `approval.plan` is waived, return ok.
If the marker is present, validate bindings unconditionally — waiver, gate, and
entry marker notwithstanding. That keeps the entire R1-F003 guarantee (no
approved issue rides a stale digest into Develop) without converting a supported
waiver into a hard stop. If you intend instead to make story binding mandatory
even under waiver, say so explicitly in section 4 as an accepted policy change
and name the waiver regression, because that is a behavior removal, not a
clarification.

### R2-F003 — Approval-mode validation is body-scoped, but split-plan applies it to a bare three-line string

Section 8.3 defines approval mode as requiring "the `## User Story` section to
exist and remain the first level-two heading," and 8.4 gives that requirement two
codes: `story-section-missing` and `story-section-position-invalid`.

Section 10.2: "It then runs approval-mode objective quality validation on the
rendered result before any issue preflight or mutation."

The rendered result is three lines of prose (section 8.1's renderer output). It
has no `## User Story` heading and no surrounding body. Under 8.3, every
`split-plan` run would emit `story-section-missing` on every child, before
preflight. This is the same shape of defect as turn-1 R1-F001 — a validator
applied to an input it was not defined over — and it arrived with the R1-F002
fix.

Section 14.1 already implies the right structure: "story extraction and
canonicalization" is listed separately from "draft and approval validation
modes." Make that separation explicit in 8.3: the section-existence and
section-position requirements belong to a body-scoped entry point, while shape,
prefix, placeholder, and anti-pattern checks belong to a prose-scoped evaluator
that both entry points share. Then say in 10.2 which one `split-plan` calls, and
in 9.4/9.5 which one `plan-approve` and the binding guard call. Note also that
10.2's ordering — validate the rendered string before preflight — cannot detect
a position violation at all, since the child body does not exist yet; that is
fine, but only once 8.3 stops claiming otherwise.

### R2-F004 — The masked structural view also blanks inline code and comments; the design does not say which view supplies field values

Sections 7.1 and 10.1 now correctly route intent parsing through the fence-masked
structural view. But that view masks more than fences. `stripLineMarkdown`
(`decomposition-policy.mjs:80-128`) replaces with spaces:

- every inline code span with a closing run (`:102-112`), and
- every HTML comment span (`:85-92`, `:117-122`).

Bold survives, so `- **Beneficiary:** ...` parses — I verified that, and the
field-label syntax in 7.1 is safe. The unaddressed case is field *values*:

```markdown
- **Capability:** refuse `npm publish` before provenance verification completes
```

On the structural view this field's value reads
`refuse                 before provenance verification completes`. Section 10.1
says intent is parsed from the masked lines "while ordinary prose is preserved
from the original lines," which reads as: values come from the masked view.
Three consequences the design should decide deliberately rather than inherit:

1. The 9.2 intent digest hashes the blanked text, so a purely cosmetic backtick
   edit changes the digest — the exact false-staleness class 9.2 sets out to
   prevent.
2. The 8.1 renderer emits the blanked run into the child's User Story, producing
   a visible gap in shipped prose.
3. The deep-dive path (7.2 step 2) parses a live issue body, presumably not
   through `decomposition-policy`. Identical authored text would then canonicalize
   differently depending on source kind, which undermines 9.2's premise that the
   digest is a property of the intent.

State that heading discovery and block-boundary detection use the masked view
while field values are read from the corresponding original lines, and require
the deep-dive parser to apply the same rule so both sources canonicalize
identically. If you instead intend values to be masked, say so and add a
refusal for a field whose value is empty after masking, so case 1 fails loudly
rather than binding a blank.

## Required changes

1. **R2-F001** — Make authority resolution task-scoped for split children.
   Extend the 7.2 decision tree to resolve `Source-plan-section` to that task's
   `#### Story Intent` block, add the corresponding `story-intent-source` enum
   value in 9.3, specify the fail-closed behavior when the named task section is
   absent, and reconcile 9.5 step 4, 10.2, and 18 with the result. Without this,
   no `split-plan` child can be approved.
2. **R2-F002** — Condition `storyApprovalBindingGuard` on the presence of an
   `aitm-plan-approved` marker so the `approval.plan` waiver keeps working, or
   declare the waiver regression explicitly in section 4. Keep the
   unwaivability once a marker is present.
3. **R2-F003** — Split section 8.3 into a body-scoped entry point (section
   existence and position) and a prose-scoped evaluator (shape, prefixes,
   placeholders, anti-patterns), and name which one each caller in 9.4, 9.5, and
   10.2 invokes.
4. **R2-F004** — State that intent field values are read from the original
   lines while boundaries use the masked view, and require the deep-dive parser
   to canonicalize identically.

## Optional suggestions

### R2-F005 — Section 8.3 does not inherit 9.1's comment exclusion

The R1-F006 fix landed in 9.1, scoped to "the story canonicalizer." Section 8.3
independently requires "exact three-line shape," and 8.4 defines
`story-shape-invalid` as "not exactly three correctly prefixed non-empty lines."
If shape validation runs on the raw section, an in-section marker is a fourth
non-empty line and trips `story-shape-invalid` — the same blocked promotion
R1-F006 identified, relocated one code over. The author response says exclusion
happens "before shape validation and hashing," which is right; the artifact only
says hashing. One clause in 8.3 referencing 9.1's exclusion would close it.

### R2-F006 — Scope the fallback-absence proof

Section 16.4 promises "proof that the old generic fallback text is absent from
production code" and notes the corpus exclusion. Since the revision, the exact
fallback string also appears in section 2 of this design document
(lines 41-43) and will appear in the 16.1 fixture. Naming the scope — non-test
files under `scripts/` — makes the assertion implementable without the reviewer
guessing which exclusions are intended.

### R2-F007 — Repaired legacy approvals inherit trunk staleness immediately

Section 13.3 has repair stamp "current trunk provenance." `planApprovedGuard`
compares `approved.trunkSha` against live trunk and refuses on any difference
(`plan-approved-guard.mjs:58-71`). A repair performed any meaningful interval
before promotion therefore goes stale on the next trunk commit, and the planner
repeats the repair. This is pre-existing JIT-planning behavior rather than
something the revision introduced, so I raise it only as a note: one sentence in
13.3 saying repair is expected immediately before promotion would set the right
expectation for whoever implements Task 3.

## Decision

revisions-requested
