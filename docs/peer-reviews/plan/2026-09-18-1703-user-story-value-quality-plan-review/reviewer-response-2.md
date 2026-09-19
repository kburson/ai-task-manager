---
schema: 'manual-peer-review.response/v1'
review_id: 'plan-review-1703-user-story-value-quality'
role: 'reviewer'
turn: 2
orchestration: 'manual (ai-peer-review package uninstalled on trunk; no tool-certified authority assurance)'
authority_assurance: 'unavailable'
artifact_path: 'docs/superpowers/plans/2026-09-18-1703-user-story-value-quality.md'
artifact_state: 'untracked working-tree file'
reviewed_artifact_digest: 'sha256:3befd4879c5e441ac80e293783fa7df55a9aa73dd221c18147d4e76d5f3a7ad6'
prior_artifact_digest: 'sha256:f66e7ce33a9f447fc5c065b43996b12727c5f9a579541a3e4c0109b9c2c04719'
author_response: 'author-response-1.md'
author_response_digest: 'sha256:79f5e85b016b1046c8b1adc1b317cbbcc7fd0eb7ca666cb0ae2070a10f7c3dc0'
spec_path: 'docs/superpowers/specs/2026-09-18-1703-user-story-value-quality-design.md'
spec_digest: 'sha256:10a055950643330cc9609dc387efe0e03e416c6a7320f0208f1a87a9755a930a'
repo_head_at_review: 'cbd39fd3bc36e8d2937c7a0785c12086e043c443'
resolved_finding_ids:
  [
    'R1-F001',
    'R1-F002',
    'R1-F003',
    'R1-F004',
    'R1-F005',
    'R1-F006',
    'R1-F007',
    'R1-S001',
    'R1-S002',
    'R1-S003',
    'R1-S004',
    'R1-S005',
    'R1-S006',
  ]
reviewer_errors_conceded: ['R1-F002']
new_findings_required: ['R2-F001', 'R2-F002', 'R2-F003']
new_findings_optional: ['R2-S001', 'R2-S002', 'R2-S003']
agent:
  host: 'claude-code'
  provider: 'anthropic'
  model_id: 'claude-opus-5'
  model_display: 'Claude Opus 5'
---

# Reviewer Response 2 — User Story Value Quality Implementation Plan

Disposition: **changes requested (narrow)**. All thirteen turn-1 findings are
resolved. Three new required findings, all small and mechanical, and all
introduced or exposed by the turn-1 revision itself.

## Digest verification

Both digests in the author response verify byte-exact against this checkout:

| Artifact                   | Claimed             | Computed            |
| -------------------------- | ------------------- | ------------------- |
| Revised plan               | `3befd487…7ad6`     | `3befd487…7ad6` ✅  |
| My `reviewer-response-1.md` | `d178803b…76e5`     | `d178803b…76e5` ✅  |
| Spec (unchanged)           | `10a05595…930a`     | `10a05595…930a` ✅  |

## Independent re-validation of the revised plan

I re-ran the author's validation claims rather than accepting them:

- `extractPlanTasks` → **6 tasks**; `validateSplitTasks` → `{ok: true, errors: []}`.
- `#### Story Intent` blocks inside task bodies → **6**. Root `## Story Intent` → **1**.
- `validateGovernedPlanContent(revisedPlan)` → **`ok: true`**, zero violations.
- All 28 `scripts/tests/**` paths cited in the revised plan resolve: 22 exist on
  disk, and the 6 that do not (`user-story-quality.test.mjs`,
  `story-intent-source.test.mjs`, `story-approval-binding-guard.test.mjs`,
  `plan-approval-story-audit.test.mjs`, `verbs/user-story.test.mjs`,
  `fixtures/user-story-quality/audited-stories.json`) are each explicitly
  declared as **Create** in their owning task. The newly added
  `scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs` exists at
  exactly the cited path.

Every author claim under "Validation and handoff" checks out.

---

## Turn-1 findings — dispositions

### R1-F002 — I was wrong; conceding without reservation

The author is correct and my premise was false. `readDirectoryContract` is an
exported read-only function at `lib/github-records/contract-write.mjs:362`. I
verified the full mechanism:

- It calls `parseIssueDirectory({issueBody})` first and returns `null` when the
  body carries no directory — a **pure, synchronous, zero-network** short-circuit,
  so non-directory issues pay nothing.
- `parseIssueDirectory` is independently exported from
  `lib/github-records/issue-directory.mjs:80`, so the synchronous fresh-body
  recheck the plan now specifies is genuinely available.
- `writeDirectoryContractOperation:272` already calls `readDirectoryContract`
  before any mutation and returns `{status: 'legacy'}` on null.

So neither a new `inspect` action nor permission to leave a seal behind was
needed. I asserted "there is no read-only probe" without searching the module's
full export list — that was insufficient diligence on my part, not a disputed
judgment. Decision 6 and Task 3 Step 4 as revised are correct, and Task 6 Step 2
can keep its zero-seal assertion.

### R1-F001 — resolved

Task 3 Step 4 now names the gap explicitly ("Add the currently missing final
branch: if Plan and the fresh marker binding differs, upsert it even when
non-adaptive, already approved, and lacking Ready for Planning provenance") and
closes the reporting half: "Gate ALL success statuses (including
approved/re-stamped-entry) AND audit on complete matching attributes. A
persistence mismatch is a refusal." Step 2 adds the exact population as a test
case and requires that a mocked unchanged persisted marker produce a refusal,
never `approved` or `re-stamped-entry`. That is the whole defect.

### R1-F003 — resolved, and resolved the right way

Decision 1 now makes a clean, defensible choice rather than papering over the
ambiguity: current contained working-tree content is authoritative, consistent
with `validateGovernedLinkedPlan`; `Source-plan-commit` and inline commit
suffixes are generation provenance only and are never read for intent; split
creation keeps its pinned read. Commit metadata is out of fresh comparison, and
`PlanObservation` gains `contentSha256` as a transaction consistency check with
the explicit note that it is "not a new persistent marker attribute." The
pinned-A/current-B and provenance-only-edit test cases are the right proofs.

### R1-F004 — resolved, and stronger than I asked for

`skill/adapters/claude/SKILL.md` is now in the Files list. The Grok-only regex is
replaced by a positive optional-input sentence plus a tested assertion helper
that must reject **both** real baseline forms, with all three actual adapter
passages supplied as negative fixtures and a combined passage carrying the new
sentence *and* the old mandate that must also fail. Scoping the check to active
instructions so quoted counterexamples don't trip parity is a refinement I did
not think of and agree with.

### R1-F005 — resolved on scope; the author's qualification is correct

I accept the correction. My original ask — "assert that the scaffold it produces
passes the new task-intent contract" — was wrong. A raw scaffold with
placeholder values must **not** pass, or placeholders become valid intent and the
feature defeats itself. Step 4's formulation is right: the untouched scaffold
stays a valid discovery draft (`validatePlanContent` only requires H1 + `## Scope`,
which I confirmed) but refuses approval and splitting, with a separate fixture
that fills every field and supplies a real verifier as the positive case, and the
fully worked example kept inside a fence so it cannot become a live extra task.

The scope addition is also correct and better than my finding: I verified
`templates/plan-file.md` (332 bytes) and `PLAN_FILE_TEMPLATE`
(`lib/plan-file.mjs:10`, 328 bytes) are **already drifted** today — the Markdown
file has blank lines after headings, the constant does not — and `templates.test.mjs`
contains zero `plan-file` references, so nothing catches it. Two scaffolds must
indeed be updated. See R2-F001 for the one thing that is wrong about *why*.

### R1-F006 — resolved

Task 2 now edits canonical templates only, generates mirrors with
`npm run sync:templates`, forbids hand-editing mirrors, names
`scripts/tests/integration/task-tracker/core/templates.test.mjs`, and adds it to
the Verification Commands. The three-vs-four template correction is recorded
accurately (`defect-body.md` genuinely has no parameter-documentation line).
See R2-F002 for what this change now requires that is still missing.

### R1-F007 — resolved

The fictional six-fixture edit list is gone, replaced with the accurate statement
that "Existing guard-parity fixtures contain no story-based refusals; do not
replace unrelated negative cases." Task 2 Step 1 and Task 6 Step 1 now require
positive `runGuards('refine', 'ready-for-plan', ctx).ok === true` assertions with
all unrelated dependencies satisfied, plus a real Refine-entry warning spy. The
added sentence — "the current one-way refusal-superset assertion cannot establish
that the story refusal disappeared" — is exactly the point, stated better than I
stated it.

### Suggestions R1-S001 through R1-S006 — all adopted

- **S001** — `governed-plan-policy.mjs` is now a first-class row in the File map
  with an immutable `observation: {key, path, content, contentSha256}`, and the
  adapter row explicitly says "no second unvalidated file-read path." The
  qualifier "This does not claim a filesystem lock; Plan exit still validates
  current content" is the honest framing.
- **S002** — Decision 4 now documents offset-preserving space substitution for
  inline code, significant interior whitespace, untruncated candidates where they
  fit, and the rule that operators copy the extractor string rather than the raw
  heading. Task 6 Step 3 carries it into the guide.
- **S003** — Task 3 Step 6 now opens with the literal
  `if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };`.
- **S004** — Task 3 Step 7 names `projectDir`, the injected `readIssueState` /
  `fetchIssueBody`, no-op body recovery, advisory-only failure semantics, and
  the zero-intent-read assertion outside Plan.
- **S005** — vc:6 citations added, root vc:11 appended for the integration
  suites, existing IDs preserved, and the explicit warning that "`vc:7` is the
  slow suite and is not a substitute for integration coverage." See R2-F003 for
  the remaining hole in vc:11's composition.
- **S006** — Decision 3 now requires one shared pure selection decision across
  `selectDecompositionPlanSection` and the intent resolver, and the File map note
  makes the explicit compatibility choice to keep #503's raw first-H2 rule in all
  three places while masked parsing applies only to Story Intent discovery, with
  adversarial parity tests. That is the right call and it is now stated rather
  than left implicit.

---

## New required findings

### R2-F001 — The plan now asserts that discovery uses `PLAN_FILE_TEMPLATE`. Nothing uses it; it is dead code

**Severity: medium. Plan lines 79, 503, 554.**

Task 5 Step 4 opens: "`templates/plan-file.md` is not the sole runtime source:
discovery uses the independent `PLAN_FILE_TEMPLATE` literal in
`lib/plan-file.mjs`."

That is false. I grepped the whole repository excluding `node_modules` and
`.git`: `PLAN_FILE_TEMPLATE` appears in exactly three places — its own
definition at `scripts/task-tracker/lib/plan-file.mjs:10`, the author response,
and the revised plan. **It has zero importers.** Every consumer of
`plan-file.mjs` imports something else:

| Consumer | Imports |
| --- | --- |
| `verbs/save-plan.mjs` | `savePlanFile`, `validatePlanContent`, `extractTitle` |
| `verbs/new.mjs` | `loadPlanFile` |
| `lib/draft-file.mjs` | `extractTitle`, `titleToSlug` |
| `tests/slow/.../discover-autosave.test.mjs` | `savePlanFile` |
| `tests/integration/.../new-from-plan.test.mjs` | (plan-file helpers, not the constant) |

The only live pointer to a plan scaffold anywhere in the product is
`skill/adapters/claude/SKILL.md:63`, which directs the agent to
**`templates/plan-file.md`** — the Markdown file, not the constant. So the
relationship is the inverse of what the plan states.

The *action* stays right — both copies must be handled — but the plan will carry
a false statement into implementation, and an implementer who believes it will
prioritize the wrong artifact and may skip the adapter pointer entirely.

Required: replace the rationale with the verified one. Something like: the
Markdown template is the live scaffold referenced by
`skill/adapters/claude/SKILL.md:63`; `PLAN_FILE_TEMPLATE` is an unreferenced
`#414` leftover that has already drifted from it (332 vs 328 bytes). Then decide
explicitly: delete the dead constant, or keep it and add the drift assertion. I
have no preference, but the plan should say which and why.

### R2-F002 — The new mirror assertions cannot pass: `bin/lib/template-manifest.mjs` is the gating file and appears nowhere in the plan

**Severity: medium. Plan lines 252, 503, 554.**

Task 2 Files now says: "Extend mirror coverage: `templates.test.mjs` (include
defect and plan-file mirrors alongside the existing three issue-body
comparisons)." Task 5 Step 4 says: "after `npm run sync:templates`, require byte
identity of the canonical and installed template."

Neither is achievable as written. `syncTemplates` is **allowlist-driven**, not
directory-driven — it iterates `TEMPLATE_FILES` imported from
`bin/lib/template-manifest.mjs`, whose own header states: "Adding a
runtime-mirrored template means editing this array and nothing else."

`TEMPLATE_FILES` currently contains exactly eight names:
`pickup-directive.md`, `definition-of-done.md`, `epic-body.md`,
`sub-issue-body.md`, `solo-issue-body.md`, `session-boot.md`,
`session-state-template.md`, `worker-report.md`.

It contains **neither `defect-body.md` nor `plan-file.md`**. Consequences I verified:

- **`plan-file.md`**: `.ai-task-manager/templates/` has no `plan-file.md` at all.
  The proposed byte-identity assertion will `ENOENT` on its first run, and
  `npm run sync:templates` will never create it.
- **`defect-body.md`**: the mirror file *does* exist in
  `.ai-task-manager/templates/` — but since it is not in `TEMPLATE_FILES`, sync
  will not refresh it. Task 2 edits `templates/defect-body.md`, runs sync, and
  the mirror silently goes stale. The new assertion then fails, and it will look
  like a regression Task 2 caused rather than pre-existing latent drift.
- `templates.test.mjs:26` loops a **hardcoded three-name array**
  `['epic-body.md','solo-issue-body.md','sub-issue-body.md']`, which is why this
  drift is invisible today.

`grep -c` over the revised plan: `template-manifest` → **0**, `TEMPLATE_FILES` →
**0**, `installTemplates` → **0**.

Required: add `bin/lib/template-manifest.mjs` to the File map and to Task 2's and
Task 5's Files, with the explicit instruction to extend `TEMPLATE_FILES` with
`defect-body.md` and `plan-file.md` before extending the mirror assertions. Also
note the downstream consequence: adding `plan-file.md` to that array means
`installTemplates()` will begin installing it into every consumer project's
`.ai-task-manager/templates/`, which is a real behavioral change for existing
installs and deserves one sentence rather than arriving silently.

### R2-F003 — The integration lane is CI-only, so two of AC1's own proof suites are run by no root verification command, including after vc:11

**Severity: medium. Plan lines 628, 637, 649.**

Task 6 Step 4's reasoning is correct and I want to reinforce it before naming the
gap. I confirmed against `scripts/run-tests-lanes.mjs`:

```
fast = unit    integration = CI-only    slow = slow
```

`laneFiles('fast')` returns `manifest.unit` only (line 62), and `#1413` made the
integration lane CI-only so "the local composite lanes stop including it." So on
#1703: vc:6 (`npm test`) runs unit only, vc:7 (`npm run test:slow`) runs slow
only, and **no root command runs the integration lane** except the explicit
per-file `node --test` citations in vc:4 and the proposed vc:11.

The gap: vc:11 as drafted at line 637 runs
`templates.test.mjs`, `new-from-plan.test.mjs`, and
`github-record-contract-writes.test.mjs`. It omits the two integration suites
that Task 2 nominates as the actual proof of optional story input at creation:

- `scripts/tests/integration/task-tracker/lib/issue-body-verifier.test.mjs`
- `scripts/tests/integration/task-tracker/lib/create-issue-gate-compliance.test.mjs`

I confirmed both are in the integration lane via `laneFiles('integration')`.
Neither appears in vc:1–vc:10, and neither would appear in vc:11. Yet AC1
("optional early stories") cites `vc:1, vc:4, vc:6, vc:11` — **none of which
executes either file.** That is precisely the false-green AC citation shape this
repository's evidence discipline forbids, and it lands on the acceptance
criterion the feature's whole premise rests on.

Required: add both files to the vc:11 command string at line 637 (or append a
vc:12). While you are there, state plainly in Step 4 that the integration lane is
CI-only under `#1413`, so an operator running the complete root command set
locally executes no integration test unless it is cited by path. That fact is
load-bearing for every integration citation in the coverage table and is
currently left implicit.

---

## New optional suggestions

### R2-S001 — The plan scaffold has a provider-parity gap, inside the parity task

`skill/adapters/claude/SKILL.md:63` is the only adapter that points an agent at
`templates/plan-file.md`. Codex and grok have no plan-scaffold pointer at all.
Task 5 is the task whose entire purpose is "require every provider to review the
same stakeholder-value questions," and Step 4 adds Story Intent to that scaffold —
but two of three providers are never told the scaffold exists. Worth one line in
Step 3 or Step 4, or an explicit note that plan authoring is deliberately
Claude-only today.

### R2-S002 — Say what a malformed directory record produces

Decision 6 says an unreadable or malformed directory "fails closed." Mechanically
that is already true — `readDirectoryContract` will throw (either on
`contractRecord.envelope` when `getCommentsByNodeIds` returns an empty array, or
inside `validateDeliveryContract`), `runPlanApprove` does not catch it, and
`verbPlanApprove` exits 1 with a generic `plan-approve: <message>`. That is
fail-closed but it is not a *stable code*, and every other refusal this plan
introduces has one. One sentence deciding between "keep the existing generic
throw" and "catch and return a stable `story-approval-binding-unsupported`
variant" would remove the ambiguity.

### R2-S003 — `docs/QUICKSTART.md` has zero User Story mentions

Line 580 keeps `docs/QUICKSTART.md` as a modify target "where active lifecycle
guidance describes the replaced behavior." `grep -c "User Story"` returns **0**
for QUICKSTART and 1 for DESIGN. Either drop QUICKSTART from the list or say what
non-matching guidance is expected to need editing, so the implementer does not
spend a pass looking for text that is not there.

---

## Bottom line

This is a strong revision. Every finding was addressed on the merits, two were
improved beyond what I asked (the F004 assertion helper and the F005 "scaffold
must not pass" qualification), and one correctly told me I was wrong. The
approval-orchestration gap in F001 and the authority question in F003 — the two
findings that could have produced a shipped feature that silently does nothing —
are both closed with specific, testable language.

The three remaining findings are mechanical: one false sentence about
`PLAN_FILE_TEMPLATE`, one missing file (`bin/lib/template-manifest.mjs`) that
gates two newly added assertions, and two test paths missing from vc:11. None
touches design. Fix those and I accept.

## Standing caveats

- `authority_assurance` remains **unavailable**. This round was orchestrated by
  hand because `ai-peer-review` was removed from this worktree by
  `9e7d54cf`/`cbd39fd3`. The digests in the frontmatter were computed locally by
  me and are the only binding between this response and the artifacts.
- I ran no test suite. Every claim above comes from reading source or from
  executing `extractPlanTasks`, `validateSplitTasks`,
  `validateGovernedPlanContent`, and `laneFiles` directly against this checkout.
- I did not audit the 24 corpus issues' live bodies; that remains Task 1
  execution work. The revised Task 1 default (current live-body capture with
  `repairedSource: 'live-body'`, actual capture date, URL and digest, claiming no
  retained 2026-09-18 snapshot) matches what I found in the repository and is the
  honest position.
