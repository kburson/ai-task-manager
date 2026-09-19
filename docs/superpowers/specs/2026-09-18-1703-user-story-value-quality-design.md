# User Story Value Quality Design

| Metadata | Value                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Date     | 2026-09-18                                                                         |
| Issue    | #1703                                                                              |
| Status   | DRAFT - approved in design discussion; pending peer review and written-spec review |

## 1. Summary

AITM will move substantive User Story prose from an early intake requirement to
a Plan-phase quality contract. Backlog, Refine, and Ready for Planning may carry
an empty User Story section or the canonical template. During Plan, the planner
must establish structured Story Intent and turn it into concise three-line prose
that names the stakeholder, capability, motivating need, and meaningful value or
failure prevented.

Plan approval becomes the first hard semantic boundary. It resolves one
authoritative Story Intent source, rejects missing or objectively administrative
prose with stable violation codes, and binds canonical story and intent digests
into the Plan approval marker. Plan to Develop re-resolves the intent and
revalidates both digests so later edits cannot ride on stale approval.

Plan decomposition uses the same contract. Every splittable task must include
its own Story Intent. `split-plan` renders each child story from that intent and
has no generic delivery-story fallback. Shared instructions teach the nuanced
quality rubric to every provider, while deterministic code gates only objective
conditions that can be enforced consistently without an LLM score.

## 2. Problem

AITM currently asks for finished User Story prose before planning has established
the value of the work. The Refine lifecycle guards validate Connextra shape,
placeholder removal, and section placement, but they do not establish that the
actor is a real beneficiary or that the outcome matters.

At the same time, `scripts/task-tracker/lib/split-plan.mjs` manufactures a story
for every extracted plan task using the same administrative pattern:

```text
As a governed delivery agent
I want to deliver Task N from the pinned source plan
So that the parent issue advances through traceable execution
```

That prose passes the current structural guards while communicating none of the
task's product, operational, security, reliability, or delivery value. The
failure is systemic rather than provider-specific: generation lacks task intent,
and validation rewards syntactic completeness at the wrong lifecycle stage.

Manual feature requests and defects expose the opposite side of the same
problem. They may enter the backlog before anyone knows the complete stakeholder
or counterfactual value. Forcing polished prose during intake encourages agents
to invent generic language. The proper time to determine and approve that value
is Plan, after a reviewed implementation plan or a deep dive has supplied the
necessary evidence.

## 3. Goals

1. Permit absent, empty, or canonical template story prose through Backlog,
   Refine, and Ready for Planning.
2. Establish a provider-neutral Story Intent schema containing beneficiary,
   capability, need, and value or failure prevented.
3. Resolve Story Intent from a governed implementation plan when one is linked,
   or from the issue deep dive when no implementation plan is linked.
4. Make Plan approval the first hard story-quality gate and bind what was
   approved with deterministic digests.
5. Revalidate the live story and intent before Plan can advance to Develop.
6. Make each splittable plan task self-sufficient for generating a distinct,
   useful child story.
7. Reject objective administrative anti-patterns with stable, testable codes.
8. Teach all providers the same source-grounded qualitative review rubric.
9. Preserve a clear repair path for legacy Plan approvals without disrupting
   work already in Develop or later.
10. Use the audited weak and repaired stories as a permanent regression corpus.

## 4. Non-goals

- Bulk rewriting existing backlog or historical issue prose.
- Reopening or re-gating issues already in Develop, Test, Review, or Done.
- Requiring substantive story prose before Plan.
- Using a provider call, embedding similarity, or model-generated score as a
  lifecycle gate.
- Proving full semantic equivalence between free-form story prose and Story
  Intent through heuristics.
- Silently rewriting a story during Plan approval.
- Making traceability, auditability, or delivery roles invalid when they are the
  actual stakeholder value; only their use as generic substitutes is rejected.
- Migrating all historical implementation plans in place.

## 5. Design Principles

### 5.1 Planning earns specificity

Intake records the request. Planning determines who benefits, what behavior is
needed, why it is needed, and what failure or outcome matters. A blank or
templated early story is more honest than polished administrative filler.

### 5.2 Intent is evidence; prose is a concise projection

Story Intent is the structured planning artifact. The three-line User Story is
the human-readable issue summary. Approval validates both and binds their exact
canonical forms, but the structured fields remain the source for generation and
future review.

### 5.3 Objective failures are code; judgment is guidance

Code can reliably reject placeholders, missing lines, workflow-only actors,
numbered-task capabilities, and value lines that only say an issue advances.
Whether a technically valid story captures the most important stakeholder value
requires source-aware judgment. Every provider receives the same rubric and is
required to self-review before approval, but AITM does not pretend a lexical
score is semantic truth.

### 5.4 One authority at a time

When an issue links a governed implementation plan, that plan is the Story
Intent authority. The deep dive is authoritative only when no implementation
plan is linked. A planner may not use the deep dive as a silent fallback for a
linked plan that omitted its intent contract.

### 5.5 Approval is fresh or it is not approval

The approval marker records what was reviewed, not merely that a command once
ran. Changes to story prose or authoritative intent make approval stale and
must be repaired explicitly before development begins.

## 6. Lifecycle Contract

| State boundary               | User Story behavior                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Issue creation               | Heading remains; prose may be empty, canonical template, or substantive.           |
| Backlog                      | No warning or refusal for empty/template prose.                                    |
| Backlog to Refine            | No story completeness warning or gate.                                             |
| Refine to Ready for Planning | No story completeness gate.                                                        |
| Ready for Planning to Plan   | No story completeness gate; Plan is where intent is established.                   |
| Plan work                    | Planner authors one authoritative Story Intent and useful three-line story prose.  |
| `plan-approve`               | Requires intent, validates objective quality, applies rubric, and records digests. |
| Plan to Develop              | Re-resolves intent and requires live digests to match the approval marker.         |
| Develop and later            | This feature adds no retroactive lifecycle gate.                                   |

The current `userStoryWarnGuard` and `userStoryBlockGuard` therefore leave the
Refine state definition. Approval-mode validation belongs in the Plan approval
path and its Plan-exit guard, not in intake transitions.

Substantive prose authored before Plan is not granted immunity. Commands that
write a real story continue to reject objective malformed or administrative
anti-patterns. The lifecycle simply does not require prose to exist yet.

## 7. Story Intent Contract

### 7.1 Fields

The canonical intent object has exactly four non-empty, single-line string
fields:

```text
beneficiary
capability
need
value
```

Their meanings are:

- `beneficiary`: one real human or operational stakeholder who benefits, written
  as a singular role phrase suitable after `As a`;
- `capability`: the concrete behavior, safeguard, or result the task creates,
  written as a verb phrase suitable after `I want to`;
- `need`: the condition, gap, or observed failure that made the capability
  necessary, written as a clause suitable after `because`;
- `value`: the meaningful outcome enabled or failure prevented, written as a
  clause suitable after `So that`.

The accepted Markdown representation is exact and provider-neutral:

```markdown
## Story Intent

- **Beneficiary:** release operator responsible for unattended publishing
- **Capability:** stop package publication before any partial release occurs
- **Need:** registry and provenance checks can fail after irreversible work begins
- **Value or failure prevented:** consumers never receive an incomplete or unverifiable release
```

Plan task blocks use the same fields beneath a level-four heading:

```markdown
#### Story Intent

- **Beneficiary:** release operator responsible for unattended publishing
- **Capability:** stop package publication before any partial release occurs
- **Need:** registry and provenance checks can fail after irreversible work begins
- **Value or failure prevented:** consumers never receive an incomplete or unverifiable release
```

For no-plan issues, the deep-dive appendix uses a level-three `### Story Intent`
heading because the appendix itself is a root-level issue section.

The parser is structural rather than based on substring searches. Heading and
block-boundary discovery consume the fence-, comment-, and inline-code-masked
structural view used for plan heading discovery, so examples inside fenced code
blocks cannot become live intent. After locating a field, the parser reads its
value from the corresponding original source line, preserving inline code and
ordinary Markdown exactly. Plan and deep-dive parsing use this same two-view
rule so identical intent canonicalizes identically regardless of source kind.
The parser requires the exact heading at the expected scope, each known field
exactly once, no unknown fields, and a non-empty single-line value after
trimming. Duplicate blocks, duplicate fields, multiline continuation values,
and ambiguous heading scope are refusals.

### 7.2 Authority resolution

`resolveStoryIntent` follows this closed decision tree:

1. If `Plan Metadata` links a governed implementation plan and contains exactly
   one substantive `Source-plan-section`, resolve the plan with the existing
   repository-bound plan-path policy, locate the one task or milestone whose full
   heading exactly matches that metadata value, and parse that task's exactly
   one `#### Story Intent` block. A missing, duplicate, or no-longer-matching
   task section fails closed as `story-intent-source-unresolvable`; it never
   falls back to root plan intent.
2. If `Plan Metadata` links a governed implementation plan without a
   `Source-plan-section`, resolve that file and parse exactly one root
   `## Story Intent` block. Missing or malformed root plan intent is an error.
3. If no implementation plan is linked, parse exactly one `### Story Intent`
   block inside the root `## Deep-Dive Analysis (...)` section of the live issue
   body. Missing, malformed, or duplicate deep-dive intent is an error.
4. Never fall back from either linked-plan branch to deep-dive intent. The linked
   plan or its task-section metadata must be repaired and reviewed so its
   authority remains complete.

The resolver returns the normalized intent, source kind (`linked-plan-task`,
`linked-plan`, or `deep-dive`), source location, and canonical digest.
Diagnostics name the source and violated field without dumping unrelated issue
or plan content.

### 7.3 Plan review responsibility

The existing governed-plan and review workflow remains responsible for whether
a linked plan is accepted. This feature does not invent a second peer-review
marker. It makes Story Intent part of the plan content that reviewers inspect
and that Plan approval consumes.

## 8. User Story Contract

### 8.1 Canonical prose

Substantive story prose remains exactly three non-empty lines with no bullets:

```text
As a <real human or operational stakeholder>
I want to <concrete capability or behavior, with motivating need where useful>
So that <meaningful value, avoided failure, or enabled outcome>
```

The canonical deterministic renderer used by `split-plan` is:

```text
As a {beneficiary}
I want to {capability} because {need}
So that {value}
```

Intent authors must therefore write `need` as a grammatical clause after
`because`. The free-form `user-story` command may produce more natural prose
that distributes the need differently, but Plan approval still requires the
same structured intent and the provider rubric must confirm all four concepts
remain understandable in the three lines.

### 8.2 Draft states

Draft-mode validation accepts these forms:

1. no prose after the `## User Story` heading;
2. the canonical three-line template;
3. substantive three-line prose that passes objective quality validation.

The heading remains part of the standard body schema. "Absent" in lifecycle
requirements means absent prose, not an issue body with arbitrary missing
sections. Creation templates should render an empty section by default when no
story file is supplied. Existing canonical template text remains accepted.

### 8.3 Validation entry points

The quality module exposes two explicit validation layers:

- the prose-scoped evaluator accepts extracted story prose plus
  `mode: 'draft' | 'approval'`; and
- the body-scoped entry point accepts a complete issue body, requires the
  `## User Story` section to exist and remain the first level-two heading,
  extracts its prose, and delegates to the prose evaluator.

Both entry points exclude HTML-comment-led in-section marker lines before shape
validation, normalization, or hashing. In approval mode the prose evaluator
requires substantive prose, exact three-line shape, the exact `As a` or `As an`,
`I want to`, and `So that` prefixes, no template tokens, and no objective quality
violations. It returns normalized story lines and all violations in stable order
so callers can report every repairable problem in one pass. `plan-approve` and
the Plan-exit binding guard use the body-scoped entry point, preserving the
existing #503 section-position invariant. `split-plan` uses the prose-scoped
approval evaluator because its child body does not exist until preflight.

### 8.4 Objective violation codes

The initial closed code set is:

| Code                               | Meaning                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `story-section-missing`            | The issue body has no `## User Story` heading.                             |
| `story-section-position-invalid`   | `## User Story` is not the first level-two heading.                        |
| `story-required-at-plan-approval`  | Story prose is empty or only canonical template content.                   |
| `story-shape-invalid`              | Prose is not exactly three correctly prefixed non-empty lines.             |
| `story-placeholder`                | A line still contains a recognized template placeholder.                   |
| `story-administrative-beneficiary` | The actor is only a governed/delivery/implementation agent.                |
| `story-task-as-capability`         | The desire is only to deliver/execute/implement a numbered plan task.      |
| `story-workflow-progress-value`    | The value is only that an issue, parent, epic, or task advances/completes. |
| `story-traceability-only-value`    | Traceable execution/implementation is the sole claimed outcome.            |

Matching uses anchored, normalized phrases and tested phrase families rather
than broad keyword bans. For example, "release operator" is not rejected merely
because the work concerns delivery, and a security auditor may legitimately
benefit from traceability when the story explains the concrete accountability
or incident-response failure it prevents.

The evaluator returns `{ code, line, message }` records. Messages may improve,
but codes are API-like behavior and remain stable within the schema version.

### 8.5 Provider self-review rubric

Before invoking Plan approval, every provider must answer these questions from
the plan or deep-dive evidence:

1. **Stakeholder:** Is the actor a real human or operational role that receives
   the benefit, rather than the agent performing the work?
2. **Capability:** Does the desire identify behavior or a safeguard, rather than
   task completion?
3. **Need:** Can a reader tell what gap, condition, or failure made the work
   necessary?
4. **Counterfactual value:** Does the outcome explain what improves or what
   failure is avoided if the capability exists?
5. **Source grounding:** Are all claims supported by Scope, acceptance criteria,
   the governing specification, the plan, dependency analysis, or deep dive?
6. **Sibling distinctness:** Would a sibling task receive materially different
   prose because it contributes a different capability or safeguard?
7. **Standalone readability:** Can a reviewer understand the story without
   opening the implementation plan?

Failing the rubric means the agent repairs the intent or story before approval.
The agent must not fabricate a stakeholder or value merely to satisfy the form.

## 9. Canonicalization and Approval Binding

### 9.1 Story digest

The story canonicalizer first excludes lines whose trimmed form begins with an
HTML comment opener, matching the existing guard and author behavior for
in-section markers. It then extracts the three substantive lines, converts CRLF
to LF, trims leading and trailing whitespace from each line, joins them with one
LF, and hashes the resulting UTF-8 bytes with SHA-256. Internal wording and
spacing remain significant because they are part of what was approved; adding
or updating an in-section hidden marker does not stale the prose digest.

### 9.2 Intent digest

The intent canonicalizer trims each already-single-line field and serializes a
fixed-key JSON object in this exact key order:

```json
{ "beneficiary": "...", "capability": "...", "need": "...", "value": "..." }
```

It hashes those UTF-8 bytes with SHA-256. Markdown spacing, bullet indentation,
and line endings therefore do not create false staleness, while any field-value
change does.

### 9.3 Approval marker

The existing `aitm-plan-approved` marker gains three attributes:

```text
story-digest="<64 lowercase hex>"
story-intent-digest="<64 lowercase hex>"
story-intent-source="linked-plan-task|linked-plan|deep-dive"
```

Marker builders validate all digest and enum values. Parsers accept legacy
markers without these attributes and return `null` for missing bindings. They do
not invent values or treat a legacy marker as fully bound.

### 9.4 Approval transaction

Before any marker or audit mutation, `plan-approve`:

1. fetches the live issue body;
2. validates the governed linked plan when present;
3. resolves authoritative Story Intent;
4. validates the live issue body through the body-scoped approval entry point;
5. applies the provider self-review obligation;
6. computes both canonical digests;
7. performs the existing checklist, forecast, provenance, and epic checks;
8. writes the marker through the existing fresh-base mutation path; and
9. verifies persisted body and marker values before reporting success.

The fresh-base closure re-extracts the story and, for deep-dive authority,
re-resolves intent from the fresh body. If either digest no longer matches the
prevalidated values, the mutation refuses as a concurrent change. For linked
plans, existing plan/trunk provenance remains authoritative and the closure
reconfirms the body still links the same plan reference.

No approval path rewrites the story. Refusals display stable codes and direct
the planner to repair the story or its authoritative intent source.

### 9.5 Plan to Develop revalidation

A separate `storyApprovalBindingGuard` runs on Plan to Develop as a
content-integrity guard whenever an `aitm-plan-approved` marker is present. A
missing marker remains the existing `planApprovedGuard`'s responsibility: when
`approval.plan` is waived, both guards return successfully without requiring a
marker; otherwise that guard retains its current missing-approval diagnostic.
Once a marker exists, story binding is independent of the `approval.plan`
workflow waiver, the `analysisToDevelopment` gate, and the presence of a Ready
for Planning entry marker. Those controls may alter whether approval is
required, but they cannot let an existing approval carry stale or incomplete
content bindings into Develop.

The guard:

1. return successfully when no approval marker exists and `approval.plan` is
   waived, otherwise defer the missing-marker refusal to `planApprovedGuard`;
2. when a marker exists, require all three story-binding attributes;
3. validate the live issue body through the body-scoped approval entry point;
4. resolve the current authoritative intent source;
5. require the source kind to match the marker;
6. recompute story and intent digests; and
7. compare them to the marker in constant, deterministic order.

Any mismatch refuses promotion with a diagnostic that distinguishes missing
legacy binding, changed story, changed intent, changed source, and now-invalid
quality. The repair action is to run `npx aitm plan-approve #N` after correcting
and reviewing the source; promotion never refreshes approval implicitly.

The guard receives a `deps.resolveStoryIntent` adapter, analogous to the
existing injected trunk resolver. The adapter performs the contained plan read;
the guard remains deterministic over supplied observations. A missing or
unreadable linked plan fails closed with a source-specific diagnostic. The
existing `planApprovedGuard` retains its human-approval and trunk-provenance
responsibilities and may retain their current waiver semantics.

## 10. Plan Decomposition Contract

### 10.1 Task parsing

`extractPlanTasks` continues to identify `### Task N: Title` or
`### Milestone N: Title` boundaries. Within each task boundary it also requires
exactly one `#### Story Intent` block when that plan is used for splitting.

The parser returns `storyIntent`, source line information, and a scope body with
the live intent block removed from each task. Heading and block boundaries come
from the masked structural lines; field values come from the corresponding
original lines, preserving inline code and ordinary Markdown. A plan may still
be read for non-splitting purposes without task intent, but
`validateSplitTasks` refuses any attempted split unless every task extracted
from the plan has valid intent.

### 10.2 Child story rendering

`split-plan` renders each child User Story only from that task's intent using the
canonical renderer in section 8.1. It then runs the prose-scoped approval
evaluator on the rendered result before any issue preflight or mutation. The
child's `Source-plan-section` metadata makes `linked-plan-task` the authority
that later Plan approval resolves and binds.

The current hard-coded `renderUserStory(input, task)` behavior is deleted. There
is no fallback to parent issue prose, task title, task ordinal, plan path,
workflow progress, or traceability language.

Child Scope uses the intent-stripped task body. The child User Story carries the
human-readable projection, while the linked source plan and task metadata retain
the structured intent as provenance; the issue does not duplicate a live
`#### Story Intent` block inside Scope.

### 10.3 Atomic preflight behavior

All tasks in the plan are parsed and validated before the first child is created.
If any task intent is missing, malformed, duplicated, or objectively invalid,
the split refuses with task number, title, source line, and stable violation
codes. This preserves the existing expectation that one malformed task does not
leave a partially created sibling set.

Sibling distinctness remains a provider review responsibility. Tests include a
minimal deterministic safeguard that separately rendered children are not
byte-identical when their intent differs, but code does not attempt fuzzy
semantic comparison.

## 11. Issue Intake and Authoring

### 11.1 Creation

For non-stub issue shapes, `--user-story-file` becomes optional. When omitted,
preflight renders the normal `## User Story` heading with no prose. When
provided, the file may contain either the exact canonical template or
substantive prose that passes draft-mode validation.

Issue-body verification compares against the expected rendered draft form and
continues to enforce every unrelated section, hidden marker, checkbox, field,
and read-back invariant. Optional story prose does not make the body schema
optional.

### 11.2 Templates

The solo, sub-issue, epic, and defect templates retain the User Story heading.
Template substitution supports an empty story payload. A single canonical
placeholder form is defined in `user-story-author.mjs` and reused by templates,
preflight, and validators so providers do not maintain variant placeholder
lists.

### 11.3 Author command

`npx aitm user-story` remains the governed way to replace story prose. It keeps
fresh-body comparison and exact read-back. Substantive writes run objective
quality validation in every state. During Plan, the command should also print
the active intent source and remind the agent that Plan approval binds the final
story; it does not approve or refresh digests itself.

## 12. Shared Provider Guidance

A new shared rule, `skill/shared/rules/user-story-quality.md`, owns:

- lifecycle timing for when prose is optional or required;
- the exact Story Intent schema;
- authority resolution rules;
- the seven-question self-review rubric;
- prohibited administrative substitutes and examples;
- repair instructions for approval and split refusals; and
- the rule that agents research Scope, criteria, governing sources,
  dependencies, deep dives, and siblings before authoring prose.

The task router links this rule from issue creation, story authoring, Plan,
Plan approval, and split-plan workflows. The change also updates the existing
contradictory instructions in `skill/shared/rules/create-issue.md`,
`skill/shared/rules/plan-mode-backlog.md`, `skill/shared/rules/block.md`,
`skill/adapters/codex/SKILL.md`, and `skill/adapters/grok/SKILL.md`. Provider
adapters do not copy the rubric; installation exposes the shared rule through
the existing provider mechanism. Provider parity tests assert both that Claude,
Codex, and Grok resolve the same contract and that no installed surface still
claims substantive User Story prose is mandatory before Plan.

Guidance distinguishes an empty early story from bad substantive prose. It must
never instruct an agent to fill a template merely to pass Refine. At Plan, it
must instruct the agent to repair missing evidence rather than invent value.

## 13. Compatibility and Migration

### 13.1 Pre-Plan issues

Existing issues in Backlog, Refine, or Ready for Planning are untouched. Empty,
templated, weak, or substantive stories are not bulk-rewritten. Once an issue
enters Plan, current approval rules apply before it can advance.

### 13.2 Unapproved Plan issues

Every issue in Plan without an approval marker must supply valid intent and
story prose before approval. This is the normal adoption boundary and requires
no migration marker.

### 13.3 Legacy approved Plan issues

A Plan-state issue with an existing approval marker that lacks story bindings
cannot advance. `npx aitm plan-approve #N` becomes the explicit repair path:
it revalidates all current approval requirements, resolves intent, and replaces
the marker with a newly timestamped approval carrying current trunk provenance
and the story digests. The approval audit records the superseded timestamp and
any known legacy attributes rather than presenting old time with newly observed
provenance. The repair is read back exactly and reported as
`repaired-story-binding`.

Because the existing approval guard binds approval to current trunk, operators
perform this repair immediately before Plan to Develop promotion. A later trunk
change intentionally makes the renewed approval stale and requires another JIT
repair.

If intent is unavailable, the repair refuses and tells the planner to enrich the
linked plan or no-plan deep dive. It never stamps digests over unknown content.

### 13.4 Develop and later

The new checks run only in Plan approval and Plan exit. Issues already in
Develop, Test, Review, or Done are not demoted, reopened, or blocked by missing
story-binding attributes.

### 13.5 Historical implementation plans

Historical plans remain readable and reviewable. Because `split-plan` has no
task-selection mechanism, a historical plan cannot newly drive any split until
every task extracted from that plan is enriched with Story Intent and the
change follows the normal review process. No migration script invents intent
from task titles or old generic stories.

## 14. Module Boundaries

### 14.1 New pure quality module

`scripts/task-tracker/lib/user-story-quality.mjs` owns:

- body-scoped story extraction and section-position validation;
- prose-scoped draft and approval validation;
- canonicalization shared by both entry points after comment-line exclusion;
- objective anti-pattern detection;
- Story Intent Markdown parsing;
- intent authority resolution over supplied observations;
- deterministic story rendering from intent; and
- SHA-256 story and intent digests.

The pure parsing and validation functions accept strings and explicit source
metadata. Filesystem and GitHub reads remain in callers or thin adapters, which
keeps the corpus tests fast and provider-independent.

### 14.2 Existing modules

- `user-story-author.mjs` owns canonical templates and governed replacement.
- `user-story-guard.mjs` adapts quality results into lifecycle diagnostics.
- `decomposition-policy.mjs` supplies plan/task boundaries, exposes aligned
  original and masked structural views, attaches intent whose boundaries come
  from the masked view and whose field values come from original lines, and
  returns intent-stripped task scope.
- `split-plan.mjs` validates all tasks, renders child stories, and orchestrates
  existing preflight/create behavior.
- `plan-approve.mjs` orchestrates authority reads, approval checks, fresh-body
  mutation, audits, and exact read-back.
- `markers.mjs` serializes and parses backward-compatible approval attributes.
- `plan-approved-guard.mjs` retains approval and trunk-provenance checks; the
  new content-integrity guard performs unwaivable Plan-exit story freshness
  checks through an injected intent resolver whenever an approval marker exists.
- creation and verifier modules render and compare the accepted draft form.

No provider adapter receives a separate semantic implementation.

## 15. Failure and Diagnostic Contract

Commands aggregate independent story-quality violations when safe to do so.
Diagnostics begin with the stable code, identify the story line or intent field,
and give one concrete repair direction. They do not claim that a provider's
subjective judgment passed merely because objective checks passed.

Representative failures are:

```text
story-required-at-plan-approval: ## User Story still contains no substantive prose
story-section-missing: issue body has no ## User Story section
story-section-position-invalid: ## User Story is not the first level-two section
story-administrative-beneficiary: line 1 names the delivery agent instead of the beneficiary
story-intent-missing: linked plan has no root ## Story Intent block
story-intent-source-unresolvable: Source-plan-section does not identify exactly one plan task
story-intent-ambiguous: deep dive contains 2 Story Intent blocks; expected exactly 1
story-approval-binding-missing: legacy Plan approval has no story digests; rerun plan-approve
story-approval-stale-story: live User Story differs from the approved digest
story-approval-stale-intent: linked-plan Story Intent differs from the approved digest
split-task-story-intent-missing: Task 4 has no #### Story Intent block
```

Transport ambiguity, stale issue bodies, or read-back mismatch continue to use
the repository's existing mutation refusals. Story validation never bypasses
those safeguards.

## 16. Test Strategy

### 16.1 Quality and corpus tests

`user-story-quality.test.mjs` covers:

- empty and canonical template acceptance in draft mode;
- their rejection in approval mode;
- exact three-line parsing and canonical digest behavior;
- each objective violation code independently and in aggregation;
- legitimate operational and traceability stakeholders that must not be false
  positives;
- task-scoped linked-plan, root linked-plan, and deep-dive intent parsing,
  precedence, source resolution, and ambiguity;
- the 24 audited weak-pattern instances as negative fixtures; and
- their repaired stories as positive fixtures.

The committed fixture is
`scripts/tests/fixtures/user-story-quality/audited-stories.json`. It contains one
row for #1692, #1693, #1532-#1549, #1462, #1463, #749, and #750, with issue URL,
weak story, repaired story, expected violation codes, and provenance. Task 1
captures it before implementing production matchers. Repaired prose comes from
the completed 2026-09-18 live read-back audit. Generic negative prose is
reconstructed from the exact `split-plan` renderer and each issue's recorded
task/parent metadata; #749 and #750 use the exact canonical placeholders
identified by the audit. The fixture labels reconstructed rows honestly rather
than claiming they are retained historical body snapshots. Unit tests read only
the committed fixture and require no live GitHub access.

### 16.2 Lifecycle tests

Existing author and guard tests prove draft/approval mode integration. The
eight-state integration flow proves that story prose is optional through Ready
for Planning, required at approval, and freshness-bound before Develop.

### 16.3 Approval tests

Plan approval tests cover all three authority sources, task-section resolution,
fresh-base races, marker serialization and parsing, no-op completeness, stale
story/intent repair, a missing-marker `approval.plan` waiver, legacy approval
repair, forecast/provenance coexistence, and read-back failure.

### 16.4 Decomposition tests

Split-plan tests cover valid multi-task rendering, task-local source lines,
missing and duplicate fields, grammatical canonical output, preflight-before-
creation atomicity, historical-plan refusal, and proof that the old generic
fallback text is absent from non-test source files under `scripts/`. The
existing positive assertion for `As a governed delivery agent` in
`scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs` is replaced as part
of this task; production-code absence checks exclude the negative corpus.

### 16.5 Provider parity

Provider parity tests prove that each installed provider resolves the same
shared rule, no adapter contains a divergent copy of the rubric, and no shared
or adapter guidance requires a substantive story before Plan.

The issue's root verification commands remain the execution authority for the
eventual implementation.

## 17. Security, Reliability, and Operational Considerations

Story and intent values are untrusted Markdown text. Parsers operate on bounded
issue/plan content already fetched by existing paths and never execute embedded
commands. Diagnostic excerpts are length-limited and avoid echoing an entire
body.

Plan paths continue through repository containment, symlink, readability, and
governed-content checks. Story Intent does not introduce an alternate file-read
path. Hashes provide freshness detection, not authenticity; GitHub issue
mutation and plan provenance remain the authority mechanisms.

All body changes use existing fresh-base comparison and exact read-back. Plan
approval validates before writing audit evidence, and a failed story check does
not leave a partial approval marker. Split-plan validates every plan task
before creating any child, preventing malformed intent from producing a partial
issue set.

## 18. Delivery Decomposition

This XL change should be implemented as a governed parent with independently
reviewable tasks in this order:

1. Story Intent schema, quality evaluator, canonicalization, and capture of the
   committed 24-issue regression corpus.
2. Pre-Plan lifecycle and issue-intake behavior.
3. Plan approval marker binding, legacy repair, and Plan-exit freshness guard.
4. Plan-task intent parsing and split-plan rendering/refusal behavior.
5. Shared provider guidance and parity enforcement.
6. Cross-surface integration tests and documentation consolidation.

The implementation plan must give every task its own `#### Story Intent` block
so this feature's first real split exercises the contract it introduces. Each
generated child's `Source-plan-section` must identify that task block, making
task-scoped linked intent the child's later Plan-approval authority.

## 19. Resolved Decisions

- Substantive prose is optional until Plan approval, not until Refine.
- Story Intent has four fields: beneficiary, capability, need, and value or
  failure prevented.
- A linked implementation plan is authoritative; split children bind the task
  selected by `Source-plan-section`, root issues bind the plan's root intent,
  and deep dive is authoritative only when no plan is linked.
- Deterministic objective failures block approval; nuanced semantic judgment is
  enforced through shared provider guidance and review.
- Plan approval records both story and intent digests, and Plan exit revalidates
  them.
- Split-plan has no generic fallback.
- Legacy Plan approvals require explicit repair; Develop and later are not
  retroactively disrupted.
- Historical plans must be enriched before they can newly split.
