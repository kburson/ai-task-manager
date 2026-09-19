<!-- aitm-skill-version: 1.0.0 -->
<!-- aitm-rule-id: user-story-quality -->

# rules/user-story-quality.md

Tier-2. Load this rule for issue creation, governed story authoring, Plan work,
Plan approval, or plan splitting. On first read, emit:

```
aitm-skill-loaded:rules/user-story-quality:1.0.0
```

## Lifecycle boundary

User Story input is optional before Plan approval. Backlog, Refine, and Ready
for Planning may contain an empty story or the exact canonical template. If an
agent supplies substantive prose at any stage, it must already pass the
objective story-quality validator; optional input is not permission to save bad
prose. Plan approval requires a substantive, valid three-line story and a valid
authoritative Story Intent. Develop and later states are not retroactively
reopened or demoted by this contract.

An objective validator passing means only that deterministic checks passed. It
does not prove that semantic stakeholder-value review happened.

## Evidence to inspect

Before writing or approving a story, read the issue Scope and Acceptance
Criteria, governing specification and active plan, native dependencies, the
current deep dive, and sibling tasks. Repair missing evidence in its authority
source. Never invent a stakeholder, need, or value merely to satisfy a gate.

## Story Intent schema and authority

Story Intent has exactly four non-empty, single-line labeled bullets:

```markdown
- **Beneficiary:** <human or operational role receiving the benefit>
- **Capability:** <behavior or safeguard the work enables>
- **Need:** <gap, condition, or failure that makes it necessary>
- **Value or failure prevented:** <improvement or avoided failure>
```

Use exactly one authority source, in this order:

1. A child linked to a governed plan uses its exact selected task's
   `#### Story Intent`.
2. A root issue linked to a governed plan uses that plan's root
   `## Story Intent`.
3. Only when no plan is linked, use `### Story Intent` inside the one current
   root `## Deep-Dive Analysis` section.

Do not fall back past an unreadable, conflicting, stale, or malformed linked
plan. A historical plan used by `split-plan` must have valid intent for every
task; do not synthesize missing intent from titles or generic prose.

## Seven-question semantic review

Answer all seven questions from the inspected evidence before Plan approval or
splitting. If any answer is no, repair the intent or story first.

### 1. Stakeholder

Is the actor a real human or operational role that receives the benefit, rather
than the agent performing the work?

### 2. Capability

Does the desire identify behavior or a safeguard, rather than task completion?

### 3. Need

Can a reader tell what gap, condition, or failure made the work necessary?

### 4. Counterfactual value

Does the outcome explain what improves or what failure is avoided if the
capability exists?

### 5. Source grounding

Are all claims supported by Scope, Acceptance Criteria, the governing
specification, the plan, dependency analysis, or deep dive?

### 6. Sibling distinctness

Would a sibling task receive materially different prose because it contributes
a different capability or safeguard?

### 7. Standalone readability

Can a reviewer understand the story without opening the implementation plan?

## Authoring and examples

Render approved prose from the authoritative intent as:

```text
As a <beneficiary>
I want to <capability> because <need>
So that <value or failure prevented>
```

Operational roles and traceability can be legitimate when the story names the
concrete safeguard and consequence. For example, a release operator may need to
stop partial publication so consumers receive complete releases, and a security
auditor may need an attributable change trail so an unauthorized change can be
investigated and prevented from recurring.

Administrative substitutes are not stakeholder value. Do not use the coding
agent as beneficiary, describe completing a numbered task as the capability, or
claim only that an issue advances, governance is followed, or implementation is
traceable.

Quoted obsolete instructions may appear in tests or migration notes, but they
must not become active guidance. For example, these are counterexamples:

```text
Non-stub shapes require user-story.md.
The required fragments include user-story.md for non-stub shapes.
```

## Workflow routes and repairs

- **Creation:** `--user-story-file` may be omitted. Omission renders the normal
  `## User Story` heading with no prose. A supplied exact canonical template is
  also a draft; supplied substantive prose must pass draft validation. Scope,
  Acceptance Criteria, Story Origin, and all unrelated gates remain required.
- **Authoring:** use `npx aitm user-story`; do not edit governed story prose
  around its fresh-body and exact-read-back transaction.
- **Plan:** resolve current intent, apply all seven questions, and repair source
  evidence before approval. Use `.ai-task-manager/templates/plan-file.md` in an
  installed project, or `templates/plan-file.md` in this package repository.
- **Approval:** missing or stale story bindings are repaired only by reviewing
  current evidence and rerunning `npx aitm plan-approve #N`. Approval never
  rewrites the story and remains JIT-bound to current trunk and source bytes.
- **Splitting:** validate every task intent and rendered story before the first
  fragment, preflight, or GitHub create side effect. Enrich every task in a
  historical plan before retrying; never create a partial sibling set.

Canonical Plan instruction:

```text
Before Plan approval, read rules/user-story-quality.md. Resolve Story Intent
from the active governed plan or, only when no plan is linked, the deep dive.
Apply all seven review questions and repair unsupported claims. An empty or
canonical-template story is allowed during intake; it is not approval-ready.
```
