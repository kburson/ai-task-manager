<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-31d4012650c25762c273a86bc677151c"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-18-1703-user-story-value-quality-design.md"
artifact_commit: "10c82b6aa46b90b38fd56e1aa435679e09b97bf0"
artifact_blob: "02d695e6c062d69c3603f49ff69d9ce6839415d3"
artifact_digest: "sha256:5c8efc4138045b0722c2cf068f5556ed8b38f74449cb2e0095365d03c2a809c5"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:6e1dd389045e08c9a4bc582b0713b768b829df06c26e6381fded46d13179be4f"
  identity_source: "runtime"
started_at: "2026-09-18T22:00:10.990Z"
submitted_at: "2026-09-18T22:07:53.046Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010","R1-F011","R1-F012","R1-F013","R1-F014","R1-F015","R1-F016"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The core thesis is sound and I endorse it: moving substantive story prose from an
intake requirement to a Plan-phase quality contract is the right correction, the
diagnosis in section 2 is accurate, and separating deterministic objective gates
from provider judgment (section 5.3) is the correct boundary. The digest-binding
approach in section 9 is a genuine improvement over "a command once ran."

I am requesting revisions because the design contradicts several contracts that
are already live in this repository, and in one case the contradiction is a hard
runtime failure rather than a stylistic mismatch. I read the artifact against the
actual implementation rather than against its own description of that
implementation, and the two diverge in ways that would surface during Task 1 or
Task 4 of the section 18 decomposition.

The findings cluster into four groups:

1. **The canonical renderer emits prose the existing creation path rejects.**
   This is a blocking defect, not a preference (R1-F001).
2. **Two invariants are silently dropped.** Section-position enforcement
   disappears with the Refine guards (R1-F002), and Plan-exit revalidation
   inherits three pre-existing bypasses the design never acknowledges (R1-F003).
3. **Two parsing/canonicalization contracts are underspecified** in ways the
   repository's own helpers will violate: fenced-code masking for Story Intent
   (R1-F004) and in-section HTML comments for the story digest (R1-F006).
4. **Scope statements understate real work:** the corpus does not exist
   (R1-F007), shared-guidance surfaces beyond the rubric contradict the new
   optionality (R1-F008), and "selected task" describes a capability
   `split-plan` does not have (R1-F009).

Everything below cites the file and line I verified. All line references are
against `artifact_commit` 10c82b6a as checked out in this worktree.

## Findings

### R1-F001 — The canonical renderer produces stories the creation path hard-rejects

Section 8.1 defines the deterministic renderer as:

```text
As a {beneficiary}
I want {capability} because {need}
So that {value}
```

The second line begins `I want `, not `I want to `. The repository's Connextra
contract is `I want to `, and it is enforced in three independent places:

- `scripts/task-tracker/lib/user-story-author.mjs:70` —
  `validateExactUserStoryLines` matches line 2 against `/^I want to \S.*$/` and
  throws `expected exactly three complete heading-free Connextra lines` otherwise.
- `scripts/task-tracker/lib/user-story-author.mjs:32` — `CLAUSE_SPECS.iWant`
  prepends the canonical prefix `'I want to '`.
- `skill/shared/rules/create-issue.md:16` — "`user-story.md` contains exactly
  three non-empty, heading-free Connextra lines beginning `As a`, `I want to`,
  and `So that`". Restated at `skill/shared/rules/plan-mode-backlog.md:62`.

This is not a latent mismatch. Section 10.2 has `split-plan` render the child
story from intent, and the rendered story travels a path that ends in that exact
validator:

`split-plan.mjs:141` writes the rendered story to `user-story.md` →
`split-plan.mjs:156` appends `--user-story-file <path>` to `creatorArgs` →
`preflight-issue.mjs:386` calls `normalizeUserStoryFragment` →
`preflight-issue.mjs:207` calls `validateExactUserStoryLines`.

Applying the section 7.1 worked example to the section 8.1 renderer yields:

```text
I want package publication to stop before any partial release occurs because registry and provenance checks can fail after irreversible work begins
```

That line fails `/^I want to \S.*$/`. Every split would die at
`preflight-issue.mjs:390` with a message about Connextra form, which is a
confusing failure mode for a feature whose entire purpose is story quality.

The design must pick one and say so explicitly:

- **(a)** Change the renderer to `I want to {capability} because {need}` and
  redefine `capability` as a clause suitable after `I want to` (the section 7.1
  example becomes `to stop package publication before any partial release
  occurs`); or
- **(b)** Relax the `I want to` contract to `I want` across
  `validateExactUserStoryLines`, `CLAUSE_SPECS.iWant`, `create-issue.md:16`, and
  `plan-mode-backlog.md:62`, and list those files in section 14.2.

Option (a) is far cheaper and preserves a contract three surfaces already agree
on. Either way, section 8.3's phrase "valid Connextra prefixes" must state the
exact accepted prefixes rather than leave them to the reader.

### R1-F002 — Retiring the Refine guards silently deletes the #503 position invariant

Section 6 states that `userStoryWarnGuard` and `userStoryBlockGuard` "leave the
Refine state definition." Section 2 correctly notes that today's guards validate
"Connextra shape, placeholder removal, **and section placement**."

Section 8.3 then enumerates what approval mode requires: "substantive prose,
exact three-line shape, valid Connextra prefixes, no template tokens, and no
objective quality violations." Section placement is absent. Section 8.4's closed
code set contains no position code either.

The position rule is not enforced anywhere else. I grepped the non-test tree for
both the check and its helper:

- `user-story-guard.mjs:58` — `if (firstH2Heading(body) !== 'User Story')` is the
  only evaluation of the rule, and it lives inside `validateUserStory`.
- `validateUserStory` has exactly two non-test callers,
  `user-story-guard.mjs:84` and `:98`, which are the two guards being removed.
- `firstH2Heading` has one further non-test mention, a comment reference at
  `user-story-author.mjs:22`.

So after this change, nothing at any lifecycle stage enforces that
`## User Story` is the first `## ` heading. `setUserStory` still *positions* it
first (`user-story-author.mjs:100-110`), but a body authored in the GitHub web UI
or by any other path is unconstrained — and web-authored bodies are a real,
recurring shape in this repository.

Either add a position code to section 8.4 and to the approval-mode requirement
list in 8.3, or state explicitly in section 4 that dropping #503 is an intended
non-goal with the rationale. Dropping it by omission is the one outcome the
design should not choose.

### R1-F003 — Plan-exit revalidation inherits three bypasses the design does not address

Section 1 claims "Plan to Develop re-resolves the intent and revalidates both
digests so later edits cannot ride on stale approval." Section 9.5 describes the
six steps `plan-approved-guard` will perform.

`plan-approved-guard.mjs` returns `{ ok: true }` before reaching any marker logic
in three cases:

- `:42` — `if (ctx?.toState && ctx.toState !== 'develop') return { ok: true }`
  (correct and intended).
- `:43` — `if (ctx?.workflowPolicy?.isWaived?.('approval.plan')) return { ok: true }`.
- `:44-51` — if `resolveGate('analysisToDevelopment', ...)` is falsy.
- `:54-56` — marker present but no `ready-for-plan` entry marker: returns
  `{ ok: true }` **without** checking trunk provenance.

The `analysisToDevelopment` gate is routinely toggled off in this repository's
parallel and full-auto workflows. Under the design as written, turning that gate
off would also disable story and intent freshness validation entirely — the
section 1 guarantee would silently not hold, with no diagnostic.

Section 9.5 needs an explicit position on each of the four paths. My
recommendation: story/intent binding validation is a **content integrity** check,
not a **human approval** check, and should run whenever a `plan-approved` marker
is present and the transition is `plan → develop`, independent of
`approval.plan` waiver, `analysisToDevelopment`, and the `ready-for-plan` entry
marker. If the design instead intends it to be waivable, say so in section 4 and
soften the section 1 claim.

The `ready-for-plan` case deserves its own sentence: an issue that entered Plan
without passing through Ready for Planning skips trunk provenance today, and the
design must say whether it also skips story binding.

### R1-F004 — Story Intent parsing must specify the fence-masked view

Section 7.1 says the parser "is structural rather than based on substring
searches." Section 10.1 says `extractPlanTasks` "also requires exactly one
`#### Story Intent` block" within each task boundary.

`extractPlanTasks` maintains two parallel views of the plan text
(`decomposition-policy.mjs:214`): `structuralLines`, which blanks fenced code
blocks, and `commandLines`. Task **boundaries** are computed from
`structuralLines` (`:217`, `:223`). But the task **body** handed back to callers
is sliced from the unmasked source:

```js
const body = originalLines.slice(index + 1, end).join('\n');   // :224
```

The command body correctly uses the masked view (`:225`), so the asymmetry is
deliberate for commands but leaves `task.body` raw.

Consequence: a plan task that *documents* the Story Intent format inside a fenced
block — exactly what section 7.1 of this artifact does — yields two `#### Story
Intent` blocks from one task and refuses with `story-intent-ambiguous`. Section
18 mandates that this feature's own implementation plan give every task a
`#### Story Intent` block, and Task 1 ("Story Intent schema...") is precisely the
task most likely to include a fenced example. The contract would fail on its own
first use.

Section 7.1 or 10.1 must state that intent parsing operates on the fence-masked
structural view, and section 14.2's `decomposition-policy.mjs` bullet should say
it attaches intent parsed from that view rather than from `task.body`.

Positive note: I verified that `SECTION_HEADING_RE` (`decomposition-policy.mjs:21`)
is `/^#{1,3}\s+/`, which does **not** match `#### Story Intent`. The level-four
heading choice is correct and will not truncate task bodies. That part of the
design is right.

### R1-F005 — Marker attributes break the established naming convention

Section 9.3 specifies `storyDigest`, `storyIntentDigest`, and
`storyIntentSource`.

Every marker attribute currently written through `serializeMarker` is lowercase
single-word or kebab-case. From `markers.mjs:126-132`: `ts`,
`forecast-record-id`, `trunk-sha`, `mode`. Elsewhere: `version`
(`preflight-issue.mjs:588`), `url` and `kind` (`issue-kind.mjs:276`, `:334`),
`shas` (`commit-trail.mjs:64`), `state` (`gh-timing-comment.mjs:399`), `stage`,
`reason`, `visit` (`stage-entry-markers.mjs:64`, `:321`). I found no camelCase
attribute anywhere.

`MARKER_RE` at `marker-grammar.mjs:42` accepts `[a-zA-Z0-9_-]+`, so camelCase
parses — this is a convention break rather than a functional break. But section
9.3 is defining a permanent, API-like, backward-compatibility-sensitive surface,
and the design elsewhere is careful about stability (section 8.4: "codes are
API-like behavior"). Use `story-digest`, `story-intent-digest`, and
`story-intent-source`.

### R1-F006 — Story canonicalization does not say how in-section HTML comments are handled

Section 9.1 says the canonicalizer "extracts the three substantive lines" and
that "internal wording and spacing remain significant." Section 9.2 reasons
explicitly about avoiding false staleness for intent. Section 9.1 does the
opposite for the story and never addresses HTML comments living inside the
`## User Story` section.

This matters because the repository deliberately puts them there:

- `user-story-author.mjs:123-131` — `replaceInPlace` collects every
  comment-opener-led line inside the section and re-emits it after the fresh
  story lines. The comment at `:123-124` names the motivating case: "Preserve any
  HTML-comment markers that live inside the section (e.g. a future
  verified-marker)."
- `user-story-guard.mjs:69` — today's validator filters them, dropping any line
  whose trimmed form starts with the HTML comment opener.

So a marker written into the section after approval produces one of two wrong
outcomes under the design as written: a fourth non-empty line triggering
`story-shape-invalid`, or a changed digest triggering
`story-approval-stale-story` — in both cases blocking Plan → Develop over prose
nobody edited. Section 9.1 must state that HTML-comment lines are excluded before
the three lines are extracted and hashed, matching `user-story-guard.mjs:69`.

### R1-F007 — The regression corpus does not exist and has no specified home

Goal 10 commits to "use the audited weak and repaired stories as a permanent
regression corpus." Section 16.1 requires "the 24 audited weak stories as
negative fixtures" and "their repaired stories as positive fixtures."

I searched the repository (excluding `node_modules`) case-insensitively for
"audited weak", "weak stor", and "24 audited". The only file containing any of
them is this design document itself. There is no audit artifact, no issue
reference, no fixture path, and no capture procedure.

Section 16.1 says "the corpus should store issue number, weak story, repaired
story, and expected violation codes in a reviewable fixture" but never says where
that fixture lives or where the 24 audited stories come from. A delivery goal
that depends on an artifact with no provenance is not implementable as specified.
Name the source of the audit, name the fixture path, and make corpus capture an
explicit deliverable of section 18's Task 1.

### R1-F008 — Shared-guidance scope covers the rubric but not the contradicted instructions

Section 12 adds one rule file and closes with: "Provider parity tests assert that
Claude, Codex, and Grok surfaces all resolve the same shared contract" and
"Provider adapters do not copy the rubric."

The parity risk is not a copied rubric. It is that existing guidance actively
instructs agents to do the opposite of section 11.1's new optionality:

- `skill/shared/rules/create-issue.md:16` — "Required content fragments ...
  `user-story.md`, `scope.md`, `acs.md` ... and `story-origin.md`".
- `skill/shared/rules/create-issue.md:18` — "Every non-stub shaped call passes
  `--user-story-file ...`".
- `skill/shared/rules/plan-mode-backlog.md:62`, `:76`, `:101`, `:108` — stages
  and passes the fragment unconditionally.
- `skill/shared/rules/block.md:21` — same.
- `skill/adapters/grok/SKILL.md:36` — "Non-stub shapes **require** the
  `./.scratch/plan/user-story.md` fragment".
- `skill/adapters/codex/SKILL.md:60` — "fragments (including `user-story.md` for
  non-stub shapes)".

Parity tests scoped to "no adapter contains a divergent copy of the rubric" would
pass while every provider surface still tells agents the fragment is mandatory.
Section 12 should enumerate these files as edits, and the parity assertion should
cover the lifecycle-timing statement, not only the rubric.

### R1-F009 — "Selected task" describes a capability `split-plan` does not have

Sections 10.1, 10.3, and 13.5 all condition behavior on "selected tasks":
"`validateSplitTasks` refuses any attempted split that lacks valid intent for
every selected task", "All selected tasks are parsed and validated before the
first child is created", "They cannot newly drive `split-plan` unless each
selected task is enriched."

`buildSplitProposals` has no selection mechanism. It extracts every task in the
plan and maps all of them:

```js
const tasks = extractPlanTasks(input.planText || '');   // split-plan.mjs:99
const validation = validateSplitTasks(tasks);            // :100
return tasks.map((task) => ({ ... }));                   // :102
```

`validateSplitTasks` likewise iterates the whole array (`:15`).

This changes the meaning of section 13.5 materially. "Each selected task is
enriched" reads as per-task opt-in; the actual requirement is that **every task
in a historical plan** must carry a `#### Story Intent` block before that plan can
drive any split at all. That is a much larger migration burden than the current
wording conveys, and section 13.5 should state it plainly. If per-task selection
is intended as new behavior, it needs to be a named deliverable in section 18.

## Required changes

1. **R1-F001** — Resolve the `I want` / `I want to` contradiction. State the
   exact accepted Connextra prefixes in section 8.3, fix the section 8.1 renderer
   and the section 7.1 example to match, and if the prefix contract changes, list
   `user-story-author.mjs`, `preflight-issue.mjs`,
   `skill/shared/rules/create-issue.md`, and
   `skill/shared/rules/plan-mode-backlog.md` in section 14.2.
2. **R1-F002** — Decide the fate of the #503 section-position invariant
   explicitly: either add it to section 8.3's approval-mode requirements with a
   code in section 8.4, or declare its removal in section 4 with rationale.
3. **R1-F003** — Specify in section 9.5 whether story/intent revalidation runs
   when `approval.plan` is waived, when `analysisToDevelopment` is disabled, and
   when no `ready-for-plan` entry marker is present. Reconcile the answer with
   the guarantee asserted in section 1.
4. **R1-F004** — State that Story Intent parsing consumes the fence-masked
   structural view, and correct section 14.2's `decomposition-policy.mjs` bullet
   accordingly.
5. **R1-F005** — Rename the section 9.3 attributes to `story-digest`,
   `story-intent-digest`, and `story-intent-source`.
6. **R1-F006** — Specify in section 9.1 that HTML-comment lines inside the
   `## User Story` section are excluded before extraction and hashing.
7. **R1-F007** — Give the 24-story corpus a provenance and a fixture path, and
   make its capture an explicit section 18 deliverable.
8. **R1-F008** — Enumerate the shared-rule and adapter files whose current text
   contradicts section 11.1, and widen the section 12 parity assertion beyond the
   rubric to the lifecycle-timing statement.
9. **R1-F009** — Replace "selected task" with the actual all-or-nothing
   semantics, or make per-task selection a named deliverable; correct the section
   13.5 migration-cost statement either way.

## Optional suggestions

### R1-F010 — Section 10.2 misquotes the current `renderUserStory` signature

Section 10.2 describes the current behavior as
`renderUserStory({ ordinal, parentIssue })`. The actual signature is
`renderUserStory(input, task)` (`split-plan.mjs:47`), and the ordinal reaches it
via `taskLabel(task)` (`:9`). Worth correcting so the deletion instruction is
unambiguous.

### R1-F011 — The worked example renders an ungrammatical actor line

The section 7.1 example `beneficiary` is "release operators responsible for
unattended publishing" (plural), which the section 8.1 renderer turns into
`As a release operators responsible for unattended publishing`. The renderer
hardcodes `As a ` with no article or number agreement. Either constrain
`beneficiary` to singular in the field definition, or choose a singular example.
`validateExactUserStoryLines` accepts it (`/^As an? \S.*$/`), so this is a
quality defect in the worked example rather than a failure — but it is the
example implementers will copy.

### R1-F012 — Guard-side intent resolution needs a named injection point

Section 9.5 has `plan-approved-guard` resolve linked-plan intent, which requires
a filesystem read. That sits awkwardly against section 14.1's "Filesystem and
GitHub reads remain in callers or thin adapters" and against the guard's
documented contract at `plan-approved-guard.mjs:16-18` ("Context contract:
`{ body: string }`. No I/O."). Precedent exists — the guard already does git I/O
through `ctx.deps.resolveTrunkSha` (`:62`) — so I suggest naming that same
injection point explicitly and specifying the behavior when the linked plan is
missing or unreadable, by analogy with the existing `current trunk is unreadable`
refusal at `:72`.

### R1-F013 — Legacy repair cannot preserve trunk provenance that never existed

Section 13.3 says legacy repair preserves "its original approval timestamp and
known provenance attributes." Legacy colon-form markers carry no trunk
provenance — `parsePlanApprovedMarker` returns `trunkSha: null` for them
(`markers.mjs:156-164`) — and the guard refuses when `trunkSha` is absent
(`:58`). Repair therefore has to stamp a *current* trunk SHA under an *original*
timestamp, which is an internally inconsistent provenance record. Worth one
sentence resolving it.

### R1-F014 — No violation code covers an absent User Story heading

Section 8.4 has no code for an absent `## User Story` heading.
`story-required-at-plan-approval` is defined as "empty or only canonical template
content", so a missing heading would fall to `story-shape-invalid` and produce a
misleading diagnostic. Consider a distinct code, or widen the definition of the
first code to cover absence.

### R1-F015 — Child Scope will carry a duplicated intent block

`renderScope` embeds the raw `task.body` into the child's `## Scope`
(`split-plan.mjs:41`). Once tasks carry intent, every child issue's Scope will
contain a duplicated `#### Story Intent` block. It will not collide with the
section 7.2 resolver, which looks for `### Story Intent` under
`## Deep-Dive Analysis`, but the design should say whether the block is stripped
from the copied scope or deliberately retained as provenance.

### R1-F016 — The fallback-absence proof will trip over its own test fixture

Section 16.4 promises "proof that the old generic fallback text is absent from
production code." Note that the fallback string is also asserted in a test:
`scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs:55` matches
`/^As a governed delivery agent$/m`. Worth naming that test as part of Task 4's
change surface so the absence proof does not trip over its own fixture.

## Decision

revisions-requested
