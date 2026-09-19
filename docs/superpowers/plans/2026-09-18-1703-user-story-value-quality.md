# User Story Value Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only when delegation is authorized. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make useful, evidence-grounded User Story prose a Plan-approval requirement, with deterministic validation and freshness binding, while allowing honest unfinished stories during intake.

**Architecture:** One pure quality module parses Story Intent, evaluates prose, renders child stories, and computes canonical digests. Existing creation, authoring, approval, and decomposition callers consume that contract; filesystem access stays behind the existing contained plan resolver. A separate Plan-exit guard checks content bindings independently of approval waivers, while shared provider guidance owns qualitative judgment.

**Tech Stack:** Existing Node.js ESM, `node:crypto`, `node:test`, GitHub issue-body mutation infrastructure, Markdown templates, and provider adapters. No new dependency or model-scored gate.

**Spec:** [User Story Value Quality Design](../specs/2026-09-18-1703-user-story-value-quality-design.md).

**Issue:** [#1703](https://github.com/kburson/ai-task-manager/issues/1703).

**Status:** Revised after manual Claude review round 1; awaiting reviewer response. This document does not approve the plan or authorize implementation, issue splitting, or lifecycle promotion.

**Source baseline:** Original drafting HEAD `846d459fd2e8d9e9eb2df94d58a886b6a294f5ae`; round-1 investigation HEAD `cbd39fd3bc36e8d2937c7a0785c12086e043c443`; spec SHA-256 `10a055950643330cc9609dc387efe0e03e416c6a7320f0208f1a87a9755a930a`. The spec header still says pending review. The committed [Claude turn-3 response](../../peer-reviews/spec/2026-09-18-2026-09-18-1703-user-story-value-quality-design-review-31d4012650c25762c273a86bc677151c/review-31d4012650c25762c273a86bc677151c-reviewer-response-3.md) records `accepted` against that same digest with five optional suggestions and `authority_assurance: unavailable`; this plan does not upgrade that record into tool-certified acceptance.

## Global Constraints

- “Requiring substantive story prose before Plan” is a non-goal.
- “Reopening or re-gating issues already in Develop, Test, Review, or Done” is a non-goal.
- “Using a provider call, embedding similarity, or model-generated score as a lifecycle gate” is a non-goal.
- “Silently rewriting a story during Plan approval” is a non-goal.
- The canonical intent object has “exactly four non-empty, single-line string fields”: `beneficiary`, `capability`, `need`, `value`.
- Canonical rendering is exactly `As a {beneficiary}`, `I want to {capability} because {need}`, `So that {value}`, joined by LF.
- “Never fall back from either linked-plan branch to deep-dive intent.”
- “Both entry points exclude HTML-comment-led in-section marker lines before shape validation, normalization, or hashing.”
- “Internal wording and spacing remain significant because they are part of what was approved.”
- “All tasks in the plan are parsed and validated before the first child is created.”
- Historical plans stay readable; every extracted task needs reviewed intent before a new split. No bulk rewrite or title-derived intent migration.
- Retain repository containment, symlink checks, governed-plan validation, forecast/trunk provenance, body concurrency checks, and exact read-back.
- New test files carry `// @story #1703`; after governed child creation, use the actual child attribution required by the repository. Do not invent child issue numbers.

## Story Intent

- **Beneficiary:** product owner reviewing planned work
- **Capability:** require evidence-grounded stakeholder value before development starts
- **Need:** early prose requirements and generic split stories currently reward administrative completeness over useful meaning
- **Value or failure prevented:** development decisions reflect the benefit and avoided failure of each planned change

## Execution and Review Boundaries

The six tasks below follow spec section 18 and run serially. Tasks 2–5 consume Task 1; Task 3 uses Task 2's authoring integration; Task 4 uses the same task authority parser already introduced in Task 1. Task 6 verifies the combined behavior. Each task has its own reviewable deliverable and executable verification group.

Before implementation, complete the user's manual review and normal plan acceptance. Then bind the exact approved issue, verify board/binding/worktree agreement, and follow normal Plan approval and decomposition policy. The earlier CLI import blocker was removed in #1706 / PR #1707; `npx aitm status` and `npx aitm board` now work. This review remains manual.

**Bootstrap limitation:** The current `split-plan` still emits generic stories. Do not use it to hydrate this plan's children unchanged. Before the replacement splitter is available, any approved child hydration must use the public shaped creator with reviewed task-intent story fragments and exact `Source-plan-section` metadata. Such hydration is a subsequent governed action, not part of this drafting request. After Task 4, exercise this plan with the new splitter's preview/preflight path without creating duplicate children. There is no unreviewed exception to the current decomposition gate.

The first implementation task must capture the corpus before production matchers are written. The corpus is implementation output, not a claimed artifact of this planning run. Source review is distinct from feature implementation. Before Develop, reconcile the issue verification citations with the coverage mapping below through the sanctioned issue-body workflow; this review does not change live acceptance criteria or verification records.

## Implementation Decisions for Manual Review

These resolve the spec suggestions and manual plan review without changing the feature goals:

1. Approval and Plan exit use the current contained working-tree plan, as existing governed-plan validation does. `Source-plan-commit` (and an inline reference commit suffix) records generation provenance only: do not read pinned Git content or treat a provenance-only edit as a changed intent. Split creation continues to read its explicitly pinned commit. Renewing approval of a changed current intent requires source review; the original generation commit is not rewritten. Fresh approval comparison covers the active key/path, complete selector, and policy-validated content fingerprint. Obtain a new observation synchronously inside the fresh-body callback and refuse a changed observation before writing.
2. Read `Source-plan-section` only inside live `## Plan Metadata`. A field in Story Origin is provenance, not an authority selector. Duplicate, blank, or template selector values fail with `story-intent-source-unresolvable`.
3. Retain the repository's plan-key precedence (`Implementation-plan`, `Source-plan`, `Plan`). When a task selector and a distinct `Source-plan` coexist with a higher-precedence plan, refuse rather than interpreting a parent task against the child's new plan. The repair is to remove the stale selector after reviewing the child's root intent, or restore the intended source-plan authority. Same-path aliases may resolve normally. Both `selectDecompositionPlanSection` and the intent resolver must use one pure selection decision so the decomposition gate cannot silently choose the whole plan where approval refuses.
4. Match task selectors against `extractPlanTasks().heading`, its normalized full heading including `### Task N:` or `### Milestone N:`. Diagnostics print the supplied selector and bounded exact candidate strings. Inline code is replaced with offset-preserving spaces in these headings; interior whitespace is significant. Include an untruncated candidate when it fits the diagnostic bound; otherwise direct the operator to extractor output. Repair instructions must preserve the exact extractor string, not a copied raw heading.
5. With no marker, the new binding guard returns success and leaves the missing-approval decision to the existing guard, including its disabled `analysisToDevelopment` behavior. With any marker, the new guard cannot be bypassed by that gate, an `approval.plan` waiver, or missing Ready for Planning entry evidence.
6. Directory-backed approval currently returns early after sealing a delivery contract. This feature must not report that as story-bound approval. Use the existing exported `readDirectoryContract` in `lib/github-records/contract-write.mjs` as a read-only preflight before invoking any seal operation. A non-null contract yields `story-approval-binding-unsupported`; an unreadable or malformed directory fails closed. For legacy bodies that proceed to mutation, recheck the fresh body with `parseIssueDirectory` and refuse if a directory appeared. Run story validation before any approval mutation, and never seal an unsupported directory representation. Extending the directory contract schema is outside this plan; this compatibility limitation needs explicit attention in manual review.

## File and Interface Map

| Surface                                                                                                                | Responsibility and change                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| New `scripts/task-tracker/lib/user-story-quality.mjs`                                                                  | Pure story/intent validation, source selection over observations, rendering, hashes; no GitHub or filesystem reads.                            |
| New `scripts/task-tracker/lib/plan-markdown-views.mjs`                                                                 | Move existing Markdown masking unchanged out of decomposition policy; expose aligned original, structural, and command lines for both parsers. |
| `scripts/task-tracker/lib/decomposition-policy.mjs`                                                                    | Keep path containment and task/metadata APIs; consume shared views and later attach intent and stripped scope.                                 |
| `scripts/task-tracker/lib/user-story-author.mjs`                                                                       | Own canonical template constants; retain exact governed replacement behavior.                                                                  |
| `scripts/task-tracker/lib/user-story-guard.mjs`                                                                        | Compatibility adapters over shared evaluation; remove early-state registry enforcement.                                                        |
| `scripts/task-tracker/lib/governed-plan-policy.mjs`                                                                    | Return the same validated content observation used by intent resolution; retain one contained read per observation.                            |
| New `scripts/task-tracker/lib/story-intent-source.mjs`                                                                 | Synchronous adapter consuming the governed-policy observation; no second unvalidated file-read path.                                           |
| New `scripts/task-tracker/lib/story-approval-binding-guard.mjs`                                                        | Deterministic Plan-exit content comparison with injected intent resolver.                                                                      |
| `scripts/task-tracker/verbs/plan-approve.mjs`, `lib/markers.mjs`, `lib/plan-approval-audit.mjs`                        | Validation ordering, marker bindings, complete no-op detection, explicit renewal, persisted verification and repair audit.                     |
| `scripts/task-tracker/states/refine.mjs`, `states/plan.mjs`, `verbs/promote.mjs`, `lib/move-state/guard-execution.mjs` | Correct lifecycle boundary and both guard-context injection paths.                                                                             |
| `scripts/task-tracker/preflight-issue.mjs`, `scripts/gh/create-issue.mjs`, `scripts/gh/lib/issue-body-verifier.mjs`    | Optional draft input while preserving required body structure and expected-form verification.                                                  |
| `scripts/task-tracker/lib/split-plan.mjs`, `verbs/split-plan.mjs`                                                      | Validate the entire proposal set before preflight/create; render only intent-derived stories and stripped scopes.                              |
| `templates/plan-file.md`, `scripts/task-tracker/lib/plan-file.mjs`                                                     | Root/task intent scaffolds in the source template and runtime constant; unfinished scaffolds remain drafts.                                    |
| `templates/`, `.ai-task-manager/templates/`, `skill/shared/`, `skill/adapters/`                                        | Consistent creation templates and one provider-neutral guidance source.                                                                        |

Avoid a dependency cycle: the quality module does not import decomposition policy. Move only the existing Markdown view helpers into the shared pure file; decomposition policy imports quality for intent annotation, and the I/O adapter imports governed-plan policy plus task extraction for validated observations. Put the shared selector decision in the pure quality module, accepting already extracted metadata/reference/task observations; decomposition policy adapts its existing public return shape. Keep marker fence helpers dedicated to marker parsing rather than broadening this extraction into a repository-wide Markdown rewrite. For canonical-template ownership, keep the literal constants in author and use a dependency-free quality core with the canonical template passed explicitly to evaluation; public caller adapters always pass that same constant.

Public contracts introduced by this plan:

```js
// All source lines are one-based in diagnostics. No I/O in these contracts.
// StoryIntent = { beneficiary: string, capability: string, need: string, value: string }
// Violation = { code: string, line: number | null, message: string }
// StoryResult = { ok: boolean, kind: 'empty' | 'template' | 'substantive',
//                 lines: string[], violations: Violation[] }
// IntentResult = { ok: boolean, intent: StoryIntent | null,
//                  range: { start: number, end: number } | null,
//                  violations: Violation[] }
// Resolution = { ok: boolean, intent: StoryIntent | null,
//                source: 'linked-plan-task' | 'linked-plan' | 'deep-dive' | null,
//                location: { path: string | null, heading: string, line: number } | null,
//                digest: string | null, violations: Violation[] }
// PlanObservation = { key: string, path: string, text: string, contentSha256: string,
//                     tasks: Array<{ heading: string, body: string, sourceLine: number }> }

evaluateStoryProse(prose, { mode, canonicalTemplate }); // -> StoryResult
evaluateStoryBody(body, { mode, canonicalTemplate }); // -> StoryResult
parseStoryIntent(markdown, { headingLevel, startLine, endLine }); // -> IntentResult
resolveStoryIntent({ body, plan }); // plan: PlanObservation | null -> Resolution
renderStoryFromIntent(intent); // -> three-line string; invalid fields throw TypeError
storyDigest(lines); // -> lowercase SHA-256 of validated, normalized lines
intentDigest(intent); // -> lowercase SHA-256 of fixed-key compact JSON
markdownViews(text); // -> { originalLines, structuralLines, commandLines }
resolveStoryIntentSource({ body, projectDir, governedPlan, deps }); // -> Resolution, synchronous adapter
// governedPlan: optional result from validateGovernedLinkedPlan for this exact body.
// Without it, call that validator once. Never read independently after validation.
```

`canonicalTemplate` is mandatory for both evaluators, supplied by the exported `CANONICAL_USER_STORY_TEMPLATE` in author. Missing configuration throws a programmer error; do not silently accept variant templates. `mode` must be exactly `draft` or `approval`. `parseStoryIntent` bounds are one-based inclusive; the default range is the entire document. A missing or malformed source produces `ok: false`, null intent/digest, and bounded diagnostics. Pure callers cannot pass a linked plan as `null` and thereby force deep-dive fallback: the resolver also examines live Plan Metadata. Add an immutable `observation: {key, path, content, contentSha256}` to successful governed-plan results and `observation: null` to non-applicable/invalid results, preserving their existing fields. The adapter maps `content` to `PlanObservation.text` and extracts tasks from those exact bytes. A supplied observation must match the body reference used to obtain it; no linked-plan result may use the no-plan branch. The fingerprint is a transaction consistency check, not a new persistent marker attribute.

## Implementation Tasks

### Task 1: Establish the shared story contract and audited regression corpus

#### Story Intent

- **Beneficiary:** product owner evaluating whether a planned change has meaningful value
- **Capability:** distinguish evidence-grounded stories from administrative filler using consistent objective checks
- **Need:** structural Connextra validation currently accepts stories that explain task completion without explaining a stakeholder benefit
- **Value or failure prevented:** meaningless stories are rejected consistently while legitimate operational and security outcomes remain expressible

**Files:**

- Create: `scripts/task-tracker/lib/user-story-quality.mjs` and `scripts/task-tracker/lib/plan-markdown-views.mjs`.
- Modify: `scripts/task-tracker/lib/decomposition-policy.mjs`, `scripts/task-tracker/lib/user-story-author.mjs`, `scripts/task-tracker/lib/user-story-guard.mjs`.
- Create: `scripts/tests/fixtures/user-story-quality/audited-stories.json` and `scripts/tests/unit/task-tracker/lib/user-story-quality.test.mjs`.
- Test: `scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs`, `scripts/tests/unit/task-tracker/lib/user-story-author.test.mjs`, `scripts/tests/unit/task-tracker/lib/user-story-guard.test.mjs`.

**Interfaces:** Consumes raw Markdown and explicit source observations. Produces the pure contracts above, exported template constants, and a versioned offline corpus. Existing extraction/classification and author/guard exports remain available to callers.

- [ ] **Step 1: Capture the 24 audited pairs before adding matchers.** Use read-only issue/history evidence for #1692, #1693, #1532–#1549, #1462, #1463, #749, and #750. No retained 2026-09-18 repaired-story snapshot was located in this checkout during review. The execution default is to capture the 24 current live bodies with `repairedSource: 'live-body'`, an actual current `capturedAt`, issue URL, and digest. State explicitly that these are present-day observations, not retained historical audit results. If separately authenticated audit evidence is supplied, cite it as such; never reconstruct repaired prose and call it observed. Acceptance requires all 24 observed repairs to pass; a live row that still needs repair must be reported rather than silently rewritten. Reconstruct weak generic stories only from the baseline renderer and verified per-issue task/parent metadata; #749/#750 use the canonical placeholder lines.

  Use this fixture schema, with actual observed values in every committed row:

  ```js
  // { schema: 'aitm.user-story-quality-corpus/v1', stories: [...] }
  // Row: { issue: number, issueUrl: string, weakStory: string,
  //        repairedStory: string, expectedViolationCodes: string[],
  //        provenance: { weakKind: 'reconstructed-renderer' | 'canonical-template',
  //          rendererCommit: string, metadataSource: string,
  //          repairedSource: string, capturedAt: string, repairedSha256: string } }
  const expectedIds = [
    749,
    750,
    1462,
    1463,
    ...Array.from({ length: 18 }, (_, i) => 1532 + i),
    1692,
    1693,
  ];
  assert.deepEqual(
    corpus.stories.map((row) => row.issue).sort((a, b) => a - b),
    expectedIds
  );
  assert.equal(new Set(corpus.stories.map((row) => row.issue)).size, 24);
  ```

- [ ] **Step 2: Add RED tests for both evaluation layers and hashes.** Use `node:test` and `node:assert/strict`, import the proposed quality API and author's canonical constant, and read the committed fixture relative to `import.meta.url`. Cover each of the nine spec codes in spec-table order, aggregation without duplicate codes, missing/late body section, raw first-H2 parity including a fenced H2 before the story, bullets, extra lines, exact case-sensitive prefixes, partial placeholders, and HTML-comment-led marker exclusion. Draft accepts empty/exact template only; approval rejects both. Substantive draft prose uses the same quality rules as approval.

  ```js
  const draft = { mode: 'draft', canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE };
  const approval = { ...draft, mode: 'approval' };
  assert.equal(evaluateStoryProse('', draft).ok, true);
  assert.equal(evaluateStoryProse(CANONICAL_USER_STORY_TEMPLATE, draft).ok, true);
  assert.deepEqual(
    evaluateStoryProse('', approval).violations.map((v) => v.code),
    ['story-required-at-plan-approval']
  );
  const good =
    'As a release operator\nI want to stop partial publication because checks can fail\nSo that consumers receive a complete package';
  const first = evaluateStoryBody(`## User Story\n\n${good}`, approval);
  const marked = evaluateStoryBody(
    `## User Story\r\n${good.replaceAll('\n', '\r\n')}\r\n<!-- evidence -->`,
    approval
  );
  assert.equal(first.ok, true);
  assert.equal(storyDigest(first.lines), storyDigest(marked.lines));
  assert.notEqual(
    storyDigest(first.lines),
    storyDigest([
      first.lines[0],
      first.lines[1].replace('stop partial', 'stop  partial'),
      first.lines[2],
    ])
  );
  for (const row of corpus.stories) {
    assert.deepEqual(
      evaluateStoryProse(row.weakStory, approval).violations.map((v) => v.code),
      row.expectedViolationCodes
    );
    assert.equal(evaluateStoryProse(row.repairedStory, approval).ok, true, String(row.issue));
  }
  ```

- [ ] **Step 3: Add RED structural/authority tests.** Use root `##`, task `####`, and deep-dive `### Story Intent` blocks; unknown/duplicate/empty fields; continuation lines; duplicate blocks; nested scope confusion; duplicate deep-dive sections; fenced/commented/inline-code heading decoys; inline code preserved in field values; tabs/bullet indentation and CRLF normalization. Test linked task over root, linked root over deep dive, unreadable observation refusal, normalized task headings, duplicate selectors only in Plan Metadata, and conflicting plan references from the review decisions. Exercise the same cases through `selectDecompositionPlanSection` and intent resolution: both refuse conflicts, while same-path aliases select the same task. Test inline-code task titles and repeated spaces: the generated selector round-trips exactly; a copied raw heading refuses and prints the matching extractor candidate. For the same field values, all three source kinds must yield the same intent digest. A changed field must change it. Run the Task 1 verification command; expect missing export/module failures before implementation.

- [ ] **Step 4: Extract the existing Markdown view helpers without changing their behavior.** Preserve one output entry per original source line, the existing verification-fence selection, multiline inline-code masking, and heading normalization. Add `originalLines` to `markdownViews`; import it into decomposition policy. Add `sourceLine` to extracted tasks now so pure source resolution can identify the chosen task before Task 4 changes split behavior. Put the canonical three placeholder lines in author as `CANONICAL_USER_STORY_LINES` and `CANONICAL_USER_STORY_TEMPLATE`; preserve any guard `PLACEHOLDERS` compatibility export by deriving it from those constants. Remove the author's dependency on guard to prevent a cycle. Preserve #503 raw first-H2 position semantics in the body evaluator, compatibility guard, and issue-body verifier through a shared predicate; do not silently change it to masked semantics. Masked structural parsing in spec §7.1 applies to Story Intent discovery. Test all three body validation entry points against the same fenced-heading adversarial cases; retain the independent marker-fence helpers unchanged.

- [ ] **Step 5: Implement the pure parser, evaluator, and deterministic hashing.** Locate headings/field labels in structural lines, then slice field values from original lines. Reject a non-empty continuation line rather than silently folding it. Use exact known labels, no duplicate/unknown fields, and closed authority selection. Keep empty/template approval refusals separate from malformed substantive input so a canonical template reports `story-required-at-plan-approval`, while partially substituted content reports `story-placeholder`. Emit quality violations in the spec's table order. Bound diagnostic excerpts to 240 characters.

  ```js
  const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
  export function storyDigest(lines) {
    return hash(lines.map((line) => line.trim()).join('\n'));
  }
  export function intentDigest(intent) {
    return hash(
      JSON.stringify({
        beneficiary: intent.beneficiary.trim(),
        capability: intent.capability.trim(),
        need: intent.need.trim(),
        value: intent.value.trim(),
      })
    );
  }
  // Validate the four fields before rendering or hashing.
  export function renderStoryFromIntent(intent) {
    return `As a ${intent.beneficiary.trim()}\nI want to ${intent.capability.trim()} because ${intent.need.trim()}\nSo that ${intent.value.trim()}`;
  }
  ```

  Build anchored normalized phrase families from the captured negative rows and targeted variants: bare governed/delivery/implementation agent; deliver/execute/implement a numbered Task or Milestone from a plan; issue/parent/epic/task advances or completes; traceable execution/implementation as the sole value. Strip harmless terminal punctuation for matching only. Do not normalize internal story spacing before hashing. Add positive contrasts for a release operator stopping a partial release and an auditor tracing an unauthorized change to prevent recurrence; do not ban `agent`, `delivery`, or `traceability` as substrings.

- [ ] **Step 6: Run GREEN tests and review the corpus independently of matcher implementation.** Check fixture provenance and exact ID coverage. Commit only this task's files using `[#1703] feat(story): add intent and value quality contract` when executing under the parent, or the actual governed child attribution.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/user-story-quality.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs scripts/tests/unit/task-tracker/lib/user-story-author.test.mjs scripts/tests/unit/task-tracker/lib/user-story-guard.test.mjs
```

### Task 2: Allow unfinished intake stories without weakening substantive writes

#### Story Intent

- **Beneficiary:** requester recording an early feature or defect
- **Capability:** submit and refine work before its final stakeholder story is known
- **Need:** intake currently demands polished prose before planning has established the evidence for value
- **Value or failure prevented:** useful requests enter planning without invented filler or lost issue-body safeguards

**Files:**

- Modify: `scripts/task-tracker/states/refine.mjs`, `scripts/task-tracker/lib/user-story-author.mjs`, `scripts/task-tracker/lib/user-story-guard.mjs`.
- Modify: `scripts/task-tracker/preflight-issue.mjs`, `scripts/gh/create-issue.mjs`, `scripts/gh/lib/issue-body-verifier.mjs`.
- Edit canonical templates: `templates/solo-issue-body.md`, `templates/sub-issue-body.md`, `templates/epic-body.md`; inspect `templates/defect-body.md` for parity (its existing placeholder needs no new parameter comment). Generate installed counterparts only with `npm run sync:templates`; never hand-edit the mirrors.
- Extend mirror coverage: `scripts/tests/integration/task-tracker/core/templates.test.mjs` (include defect and plan-file mirrors alongside the existing three issue-body comparisons).
- Test: `scripts/tests/unit/task-tracker/lib/preflight-issue.test.mjs`, `scripts/tests/unit/gh/create-issue.test.mjs`, `scripts/tests/integration/task-tracker/lib/issue-body-verifier.test.mjs`, `scripts/tests/integration/task-tracker/lib/create-issue-gate-compliance.test.mjs`, `scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs`, plus author/guard tests.

**Interfaces:** Consumes Task 1's evaluators with the canonical template. `validateExactUserStoryLines(value, { mode = 'approval' } = {})` continues to throw on invalid input and return normalized lines on success; draft callers opt in explicitly. The public `setUserStory` still requires real three-clause input and does not become a command for erasing a story.

- [ ] **Step 1: Add RED creation/guard tests.** Exercise omitted, empty, canonical-template, valid, malformed, and administrative story files for every non-stub shape. Omission/empty renders the heading with empty prose; template input remains the exact canonical template. A malformed substantive input fails before any GitHub creation/tether/comment call. Stub behavior remains unchanged. Assert no Refine-entry warning and no Refine-exit refusal for absent/blank/template prose, including a legacy issue missing the heading. Add positive production-registry calls in `guard-parity-early-stages.test.mjs`: import guard bootstrap, provide all unrelated valid dependencies, and assert `runGuards('refine', 'ready-for-plan', ctx).ok === true` for each draft form. Spy on the actual warning sink during Backlog→Refine and require zero story warnings. The existing accept fixture calls only library gates and is not this proof; creating a new non-stub body without its heading still fails body verification.

  ```js
  assert.deepEqual(validateExactUserStoryLines('', { mode: 'draft' }), []);
  assert.deepEqual(
    validateExactUserStoryLines(CANONICAL_USER_STORY_TEMPLATE, { mode: 'draft' }),
    CANONICAL_USER_STORY_LINES
  );
  assert.throws(
    () =>
      validateExactUserStoryLines(
        'As a governed delivery agent\nI want to deliver Task 2 from the pinned source plan\nSo that issue #1703 advances through traceable execution',
        { mode: 'draft' }
      ),
    /story-administrative-beneficiary/
  );
  assert.throws(
    () =>
      setUserStory('## User Story\n', {
        asA: 'governed delivery agent',
        iWant: 'deliver Task 2 from the pinned source plan',
        soThat: 'issue #1703 advances through traceable execution',
      }),
    /story-administrative-beneficiary/
  );
  ```

- [ ] **Step 2: Run RED verification, then remove both story guards from Refine's registry.** Retain unrelated contiguity, refinement-snapshot, stub-AC, parent, and required-field guards. Preserve compatibility exports for existing imports, backed by shared evaluation; lifecycle registration, not a global validator bypass, is what changes. Update stale comments that instruct users to fill stories to enter Refine/R4P.

- [ ] **Step 3: Make non-stub creator/preflight story input optional.** Remove only `user-story-file` from required-flag lists. Do not place an undefined value into spawned preflight arguments. In preflight use the draft validation wrapper and substitute `''` on omission. In body verification validate the body-scoped draft form and compare the expected rendered story payload; preserve the first-H2 rule and every other required section, checkbox, hidden marker, field, and exact read-back invariant.

  ```js
  const storyText = args['user-story-file']
    ? readFileOrDie(args['user-story-file'], '--user-story-file')
    : '';
  const userStory = validateExactUserStoryLines(storyText, { mode: 'draft' }).join('\n');
  // In the creator's preflight argument construction:
  const storyArgs = args['user-story-file'] ? ['--user-story-file', args['user-story-file']] : [];
  ```

  Keep canonical template text sourced from author, rather than introducing new placeholder variants in template comments. Change that parameter documentation in epic, solo, and sub-issue templates from “Complete three-line” to “Empty, canonical template, or validated three-line User Story”. The defect template has no such parameter line. Run `npm run sync:templates` after source edits, inspect generated changes, then run the mirror suite.

- [ ] **Step 4: Route authoring through substantive evaluation.** `buildUserStoryLines` retains clause-prefix composition, then runs the shared approval-mode prose evaluator. `setUserStory` retains marker preservation, first-heading insertion, fresh-base replacement, and idempotence. A substantive write in any state rejects objective violations; a pre-existing weak story is not bulk-touched or blocked merely by passing through an early lifecycle state.

- [ ] **Step 5: Run GREEN verification and commit the bounded intake change.** In each negative creator test assert zero external calls, not merely a diagnostic substring. Suggested message: `[#1703] feat(story): defer required prose to Plan approval`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/user-story-author.test.mjs scripts/tests/unit/task-tracker/lib/user-story-guard.test.mjs scripts/tests/unit/task-tracker/lib/user-story-quality.test.mjs scripts/tests/unit/task-tracker/lib/preflight-issue.test.mjs scripts/tests/unit/gh/create-issue.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs
node --test scripts/tests/integration/task-tracker/lib/issue-body-verifier.test.mjs scripts/tests/integration/task-tracker/lib/create-issue-gate-compliance.test.mjs
node --test scripts/tests/integration/task-tracker/core/templates.test.mjs
```

### Task 3: Bind approval to current story evidence and enforce Plan-exit freshness

#### Story Intent

- **Beneficiary:** reviewer deciding whether work is ready for development
- **Capability:** approve a specific story and its authoritative intent and detect subsequent changes
- **Need:** existing approval markers can survive edits to the content that justified approval
- **Value or failure prevented:** development cannot proceed on stale or missing stakeholder-value evidence represented as current approval

**Files:**

- Create: `scripts/task-tracker/lib/story-intent-source.mjs`, `scripts/task-tracker/lib/story-approval-binding-guard.mjs`.
- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`, `scripts/task-tracker/verbs/user-story.mjs`, `scripts/task-tracker/lib/markers.mjs`, `scripts/task-tracker/lib/plan-approval-audit.mjs`, `scripts/task-tracker/states/plan.mjs`.
- Modify shared read result: `scripts/task-tracker/lib/governed-plan-policy.mjs`; extend `scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs`.
- Reuse read-only APIs: `readDirectoryContract` in `scripts/task-tracker/lib/github-records/contract-write.mjs` and `parseIssueDirectory` from its existing directory parser. No new seal/inspect action is needed.
- Modify wiring: `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/lib/move-state/guard-execution.mjs`.
- Retain existing approval/trunk semantics: `scripts/task-tracker/lib/plan-approved-guard.mjs`.
- Create tests: `scripts/tests/unit/task-tracker/lib/story-intent-source.test.mjs`, `scripts/tests/unit/task-tracker/lib/story-approval-binding-guard.test.mjs`, `scripts/tests/unit/task-tracker/lib/plan-approval-story-audit.test.mjs`, `scripts/tests/unit/task-tracker/verbs/user-story.test.mjs`.
- Extend tests: `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`, `scripts/tests/unit/task-tracker/verbs/coverage-plan-approve.test.mjs`, `scripts/tests/unit/task-tracker/verbs/plan-approve-collapse.test.mjs`, `scripts/tests/unit/task-tracker/lib/markers.test.mjs`, `scripts/tests/unit/task-tracker/lib/guard-parity-plan-develop.test.mjs`, `scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs`.

**Interfaces:** `resolveStoryIntentSource` consumes `{body, projectDir, governedPlan, deps}`; filesystem injection remains in the governed-plan validator. `governedPlan` is optional prevalidated observation reuse for the exact same body, not a trust bypass. Add injectable `readDirectoryContract` to approval dependencies; run its asynchronous read before the synchronous mutation callback. Add `projectDir` and injectable state/body readers to `runUserStory` for best-effort reporting after the existing story transaction. The guard consumes `ctx.deps.resolveStoryIntent({body, projectDir})`, accepting a value or Promise; production wiring supplies the adapter. The adapter exposes no arbitrary absolute/override read path. Extend marker options/results with `storyDigest`, `storyIntentDigest`, `storyIntentSource`; legacy/malformed missing attributes decode as null, never synthesized values.

- [ ] **Step 1: Add RED marker and resolver tests.** Builders serialize kebab-case attributes and reject non-lowercase/non-64-hex digests and unknown source enums. Legacy colon/property markers parse with null bindings; partial/invalid attributes cannot satisfy a complete binding. Test containment, escaping symlink parents, unreadable/missing linked file, no-plan deep dive, task and root plans, plan-key conflict, and duplicate/blank selectors. Test a child pinned to commit A with changed current plan B: approval resolves B; malformed B refuses even when A is valid. Changing only `Source-plan-commit` leaves the content binding unchanged. A mocked policy read of A followed by an attempt to consume different B must not certify B; each observation shares one read for policy and intent. Keep forecast/mode/trunk parser assertions and update expected object shapes deliberately.

  ```js
  const intent = {
    beneficiary: 'release operator',
    capability: 'stop partial publication',
    need: 'registry checks can fail',
    value: 'consumers receive complete releases',
  };
  const lines = renderStoryFromIntent(intent).split('\n');
  const binding = {
    storyDigest: storyDigest(lines),
    storyIntentDigest: intentDigest(intent),
    storyIntentSource: 'deep-dive',
  };
  const marker = buildPlanApprovedMarker('2026-09-18T20:00:00Z', binding);
  assert.equal(parsePlanApprovedMarker(marker).storyDigest, binding.storyDigest);
  assert.equal(
    parsePlanApprovedMarker('<!-- aitm-plan-approved: 2026-09-18T20:00:00Z -->').storyDigest,
    null
  );
  assert.throws(
    () =>
      buildPlanApprovedMarker('2026-09-18T20:00:00Z', { ...binding, storyDigest: 'A'.repeat(64) }),
    /storyDigest/
  );
  ```

- [ ] **Step 2: Add RED approval transaction and bypass tests.** Upgrade approval harness default bodies to valid substantive stories plus deep-dive intent; use explicit invalid overrides to test refusals. Cover all three sources, missing/malformed evidence, same-digest no-op, stale story/intent/source renewal, legacy binding repair, missing Plan entry, forecast and epic paths, exact persisted-marker mismatch, and failed audit retry. Before every invalid-content outcome assert no marker write, audit post, or directory seal. Simulate story edits, deep-dive edits, path/selector changes, plan file changes, duplicate selector insertion, and a concurrent complete approval inside the fresh-body callback. Include the exact legacy branch gap: non-adaptive, no R4P entry, existing approval marker, both with and without Plan entry. Require persisted complete bindings and correct repair status, then prove the guard permits Develop. A mocked unchanged persisted marker must produce refusal, never `approved` or `re-stamped-entry`. For directory bodies with valid stories, inject a read-only contract and assert zero seal/projection/marker/audit writes; also cover unreadable directory and a directory introduced in the fresh body.

  The existing `makeDeps({beforeMutate, deps})` harness supports these races. Its mutation callback is synchronous: preload the first policy observation, then synchronously obtain a new policy plus intent observation inside the callback on every attempt. Reject changed key/path/selector/content fingerprint; do not silently approve different bytes. Async directory lookup stays outside; the fresh callback uses only the pure directory parser. Do not insert an async closure that the caller does not await.

- [ ] **Step 3: Implement contained source observation and marker binding.** Extend `validateGovernedLinkedPlan` to retain its validated observation. Build task observations from that exact content without a second read. All standalone resolver callers invoke that validator once per observation; approval reuses the existing initial validator result. Synchronous fresh-base and persisted-read-back checks each obtain another policy-validated observation and compare it to the original snapshot before accepting the result. A file change after sampling is not filesystem-locked; the Plan-exit revalidation remains required. Supply aligned task observations to the pure resolver; for no linked plan, resolve the live deep-dive body. Validate shape and quality before computing the two hashes. Export a single adapter and use it from approval, author reporting, and both promotion paths. A linked-plan read failure stays a refusal even if the issue has valid deep-dive intent.

- [ ] **Step 4: Reorder and complete approval orchestration.** For Plan-state approval, call the existing read-only `readDirectoryContract` before any seal writer; refuse unsupported, malformed, or unreadable directory authority without writes. For legacy bodies, perform story/intent checks after governed-plan validation and before approval writes or audit posts. Keep existing checklist, forecast, trunk, and epic checks. `approvalComplete` also requires all three live bindings to match. Recheck fresh directory absence, source selector/key/path, policy content fingerprint, and story digest inside the existing fresh-base mutation callback; for deep-dive authority reparse the fresh deep dive. Refuse concurrent differences using existing mutation failure handling; do not stamp stale values or alter story prose.

  ```js
  const storyBindingComplete =
    parsedApproval?.storyDigest === binding.storyDigest &&
    parsedApproval?.storyIntentDigest === binding.storyIntentDigest &&
    parsedApproval?.storyIntentSource === binding.storyIntentSource;
  // Add storyBindingComplete to approvalComplete, then pass ...binding into
  // every Plan-state insert/upsert branch. Add the currently missing final
  // branch: if Plan and the fresh marker binding differs, upsert it even when
  // non-adaptive, already approved, and lacking Ready for Planning provenance.
  // On persisted read-back, recompute the policy-validated live binding. Gate
  // ALL success statuses (including approved/re-stamped-entry) AND audit on
  // complete matching attributes. A persistence mismatch is a refusal.
  ```

  Capture the prior marker before replacement. Missing legacy bindings produce a new timestamp and current provenance, report `repaired-story-binding`, and record the superseded timestamp/known attributes. A stale complete binding also renews explicitly through approval. Use the current approval actor/mode for newly approved content; retaining an old human marker's mode must not falsely attest that the same human reviewed changed content. Already-current no-ops preserve their actor/time.

  Preserve the existing Develop-or-later adaptive forecast-only repair path without imposing new story quality gates or adding fabricated story bindings. Carry through existing valid story attributes if that path rewrites the marker. For unsupported directory-backed approval, return a stable `story-approval-binding-unsupported` refusal before invoking the seal writer, as called out for manual review above.

- [ ] **Step 5: Add idempotent repair-audit evidence without breaking historical Full-Auto audit recognition.** Add `buildStoryBindingRepairAudit({issueNumber, previousApproval, approved})` and `ensureStoryBindingRepairAudit({issueNumber, repo, previousApproval, approved, listComments, postComment})` in the audit module. The evidence key comprises issue, new timestamp, and new digests. Include previous known attributes, new actor/mode/time, trunk, source and digests. Post only after verified persistence; recognize exact retries. Human repairs get repair evidence without a false Full-Auto declaration. Keep the old canonical audit formatter/recognizer compatible, and still repair a missing audit on an otherwise complete no-op. If a retry cannot recover previous attributes, explicitly report unavailable prior evidence instead of inventing it; retain the original failed attempt's repair payload in the existing action evidence where available.

- [ ] **Step 6: Implement the separate binding guard and wire both promotion callers.** Give `storyApprovalBindingGuard` the ID `plan-exit-story-approval-binding` and register it in Plan exit next to `planApprovedGuard`, never in Develop entry. Do not map it to an approval workflow exception. Start with the existing guard's target check: `if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };` before any marker, body, or source read. Registry callers must supply `toState`. A missing marker returns success; an existing marker requires all attributes, a valid body, a resolvable intent, matching source, then matching story digest and intent digest, in that order.

  ```js
  // guard result diagnostic codes, in evaluation order:
  // story-approval-binding-missing
  // evaluator/source violation codes (with concrete repair instructions)
  // story-approval-stale-source
  // story-approval-stale-story
  // story-approval-stale-intent
  // Every refusal instructs: repair/review the source, then
  // npx aitm plan-approve #N before promotion; never auto-refresh here.
  const depsWithIntent = {
    ...deps,
    resolveStoryIntent: deps?.resolveStoryIntent ?? resolveStoryIntentSource,
  };
  // Pass depsWithIntent into guardCtx in both promote and guard-execution.
  ```

  Test the full matrix of marker absent/present/legacy/stale × approval waiver on/off × `analysisToDevelopment` on/off × R4P entry present/absent. Missing marker behavior comes only from the existing guard; every present malformed/stale binding refuses under all bypass combinations. Verify Test→Develop and Plan→Refine do not run this content gate.

- [ ] **Step 7: Add Plan-time author feedback.** Pass `projectDir` from the CLI context to `runUserStory`; inject `readIssueState`, `fetchIssueBody`, and the shared intent resolver. Preserve the existing valid-story transaction and exact read-back before advisory work. Then read board state; only in Plan, use the verified returned body or fetch a current body when the transaction/no-op result has none. Report the resolved source and that approval binds the final story. State, body-read, and resolver failures produce advisory diagnostics without changing a successful `written`/`no-op` outcome. Do not approve or refresh bindings. Tests cover both outcomes, absent result body, rejected state/body reads, resolver exceptions, and non-Plan intent-read counts of zero. This adds one state read and, when needed, one body read; never infer approval authority from that advisory state observation.

- [ ] **Step 8: Run GREEN tests and commit the approval contract.** Add CLI outcome formatting and switch handling for every new refusal/success status; ensure nonzero refusals and no misleading success text. Suggested message: `[#1703] feat(story): bind Plan approval to story evidence`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs scripts/tests/unit/task-tracker/verbs/coverage-plan-approve.test.mjs scripts/tests/unit/task-tracker/verbs/plan-approve-collapse.test.mjs
node --test scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs scripts/tests/unit/task-tracker/lib/story-intent-source.test.mjs scripts/tests/unit/task-tracker/lib/story-approval-binding-guard.test.mjs scripts/tests/unit/task-tracker/lib/plan-approval-story-audit.test.mjs scripts/tests/unit/task-tracker/lib/markers.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-plan-develop.test.mjs scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/user-story.test.mjs
```

### Task 4: Generate distinct child stories only from task-local intent

#### Story Intent

- **Beneficiary:** delivery reviewer comparing sibling work items
- **Capability:** read each generated child's specific capability and value without opening its parent plan
- **Need:** the splitter currently assigns every child the same administrative delivery story
- **Value or failure prevented:** reviewers can distinguish each child's contribution and malformed intent cannot create a partial sibling set

**Files:**

- Modify: `scripts/task-tracker/lib/decomposition-policy.mjs`, `scripts/task-tracker/lib/split-plan.mjs`, `scripts/task-tracker/verbs/split-plan.mjs`.
- Test: `scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs`, `scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs`, `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`.

**Interfaces:** Extend each extracted task with `storyIntent`, `storyIntentViolations`, `storyIntentRange`, and `scopeBody`; keep `body` as the original task text for existing readers. `sourceLine` is the one-based heading line from Task 1. `validateSplitTasks(tasks)` keeps `{ok, errors}` compatibility and adds `violations` records with task number/title/source line/code. Ordinary reading/classification does not require intent; splitting does.

- [ ] **Step 1: Replace generic-story positive assertions with RED intent-derived fixtures.** Give each fixture task a grammatical four-field intent. Keep a historical no-intent fixture for negative splits and a non-splitting readability assertion. Add missing/duplicate/unknown/multiline fields, fenced fake intent, masked headings, inline-code values, duplicate task numbers, no executable verifier, and two tasks where only the second has bad intent.

  ```js
  const intents = [
    {
      beneficiary: 'release operator',
      capability: 'stop partial publication',
      need: 'registry checks can fail',
      value: 'consumers receive complete releases',
    },
    {
      beneficiary: 'security auditor',
      capability: 'identify unauthorized changes',
      need: 'incident evidence is scattered',
      value: 'investigations can prevent recurrence',
    },
  ];
  // Put each intent into its fixture task using the exact four Markdown labels.
  // input() is the existing split-plan test helper, updated to that fixture.
  const proposals = buildSplitProposals(input());
  assert.equal(proposals[0].userStory, renderStoryFromIntent(intents[0]));
  assert.equal(proposals[1].userStory, renderStoryFromIntent(intents[1]));
  assert.notEqual(proposals[0].userStory, proposals[1].userStory);
  assert.doesNotMatch(proposals[0].scope, /^#### Story Intent\s*$/m);
  assert.match(proposals[0].planMetadata, /Source-plan-section/);
  ```

- [ ] **Step 2: Run RED verification and annotate tasks using the shared parser.** Parse intent within each task's actual structural boundary. Offset diagnostics to absolute source lines. Remove only the live intent heading and its block from `scopeBody`; retain all other scope text, verification commands, fenced examples, and task body bytes. Missing/invalid intent remains diagnostic metadata for ordinary extraction.

- [ ] **Step 3: Enforce all-task split validation before side effects.** `buildSplitProposals` first extracts every task, validates all intent contracts, renders all stories with `renderStoryFromIntent`, and runs prose-scoped approval evaluation using the canonical template. Aggregate failures before fragment writes, child preflight, or issue creation. Preserve existing metadata, plan commit, parent, dependency, and command extraction behavior. Use `scopeBody` for child scope. Delete the generic `renderUserStory(input, task)` function.

  ```js
  const rendered = tasks.map((task) => ({
    task,
    story: task.storyIntent ? renderStoryFromIntent(task.storyIntent) : null,
  }));
  // Merge task parse violations and evaluator results into a complete diagnostics
  // list first. Only map successful rendered entries into proposals after it is empty.
  // Use split-task-story-intent-missing for absent blocks and preserve underlying
  // story-intent-* / story-* codes for malformed fields and rendered quality.
  ```

- [ ] **Step 4: Prove atomicity at the command boundary.** In `runSplitPlan` tests inject counters for fragment/preflight/create calls. A bad final task must leave all counters zero. With valid tasks, preserve the existing guarantee that all child preflights finish before the first create call. This protects against malformed intent, not arbitrary transport failure after external creation; do not claim a multi-issue transaction GitHub does not provide. Add source-code absence assertions for the old generic renderer phrases under non-test `scripts/` files, excluding `scripts/tests/` and this Markdown plan.

- [ ] **Step 5: Run GREEN verification and preview this plan.** Assert six task headings, six valid task intents, six nonidentical rendered stories, one root intent, and each child's exact normalized `Source-plan-section`. Do not create issues during the smoke test. Suggested commit: `[#1703] feat(story): require task intent for plan splitting`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
```

### Task 5: Teach the same source-grounded story review to every provider

#### Story Intent

- **Beneficiary:** team lead using multiple coding-agent providers
- **Capability:** require every provider to review the same stakeholder-value questions before approval
- **Need:** objective validation cannot determine whether a plausible story states the most important source-supported benefit
- **Value or failure prevented:** switching providers does not lower story quality or encourage invented value to satisfy early workflow gates

**Files:**

- Create: `skill/shared/rules/user-story-quality.md`.
- Modify: `skill/shared/router.md`, `skill/shared/rules/create-issue.md`, `skill/shared/rules/plan-mode-backlog.md`, `skill/shared/rules/block.md`, `skill/shared/rules/state-walk.md`.
- Modify contradictory references: `skill/adapters/claude/SKILL.md`, `skill/adapters/codex/SKILL.md`, `skill/adapters/grok/SKILL.md`.
- Modify plan scaffolds: `templates/plan-file.md`, `scripts/task-tracker/lib/plan-file.mjs` (`PLAN_FILE_TEMPLATE`); sync the installed plan template with `npm run sync:templates`.
- Extend scaffold tests: `scripts/tests/integration/task-tracker/verbs/new-from-plan.test.mjs`, `scripts/tests/integration/task-tracker/core/templates.test.mjs`.
- Test: `scripts/tests/unit/providers/parity.test.mjs`.

**Interfaces:** All provider adapter chains reach the same packaged shared rule through the router. The rule owns the rubric and examples; adapters link, rather than reproduce it. Existing provider install recipes remain unchanged unless a tested installed surface cannot reach the rule.

- [ ] **Step 1: Add RED parity checks for Claude, Codex, and Grok.** Extend the existing parity suite's local assertion harness. Follow each provider's `skillAdapterPath` to its shared router, then verify all five routes (creation, authoring, Plan, approval, split) resolve the same rule. Assert the shared rule contains the seven questions and correct heading levels. Check the packaged/installed skill content in a temporary fixture via the repository's existing installer test mechanism; do not reinstall into the developer's live configuration.

  ```js
  const rulePath = path.join(REPO_ROOT, 'skill/shared/rules/user-story-quality.md');
  const rubric = readFileSync(rulePath, 'utf8');
  for (const question of [
    'Stakeholder',
    'Capability',
    'Need',
    'Counterfactual value',
    'Source grounding',
    'Sibling distinctness',
    'Standalone readability',
  ]) {
    assert.ok(rubric.includes(question), question);
  }
  for (const provider of ['claude', 'codex', 'grok']) {
    const adapter = readFileSync(
      path.join(REPO_ROOT, getProvider(provider).skillAdapterPath),
      'utf8'
    );
    assert.match(adapter, /skill\/shared\/(?:router|SKILL)\.md/);
    assert.ok(adapter.includes('User Story input is optional before Plan approval.'));
    // Also test the required-fragment assertions described below; this positive
    // sentence alone cannot prove that contradictory mandates were removed.
  }
  ```

  Add a tested assertion helper over active required-fragment paragraphs/lists in adapters and shared rules. It must reject both baseline forms: “Non-stub shapes require ... user-story.md” and “required ... fragments (including user-story.md for non-stub shapes)”, including line wrapping. Supply all three actual baseline adapter passages as negative fixtures and a passage that contains BOTH the new optional sentence and the old mandate; each must fail. Follow router links to prove the shared rule is reachable. Scope checks to active instructions so quoted negative examples do not fail parity.

- [ ] **Step 2: Write the shared rule after confirming RED.** Include optional pre-Plan prose, substantive-write validation, exact root/task/deep-dive schema, source precedence, the seven questions verbatim from spec section 8.5, safe operational/traceability examples, administrative counterexamples, missing/stale approval repair, JIT trunk freshness, and all-task historical-plan enrichment. Tell agents to research Scope, ACs, spec/plan, dependencies, deep dives, and siblings; repair missing evidence rather than invent it. Deterministic pass means objective checks passed, not that semantic review occurred.

- [ ] **Step 3: Route every affected workflow and remove contradictory mandates.** Add router rows for `user-story`/`story`, Plan work, and `split-plan`; have creation and approval/state-walk instructions load the shared rule. Update all required-fragment lists, defect wording, backlog examples, and blocker creation examples so `user-story.md` is optional during intake. Preserve required Scope, AC, and Story Origin fragments and all unrelated gates.

  Add the exact optional-input sentence used by the parity assertion to all three adapters.

  Canonical instruction text:

  ```text
  Before Plan approval, read rules/user-story-quality.md. Resolve Story Intent
  from the active governed plan or, only when no plan is linked, the deep dive.
  Apply all seven review questions and repair unsupported claims. An empty or
  canonical-template story is allowed during intake; it is not approval-ready.
  ```

- [ ] **Step 4: Update source and runtime plan scaffolds.** `templates/plan-file.md` is not the sole runtime source: discovery uses the independent `PLAN_FILE_TEMPLATE` literal in `lib/plan-file.mjs`. Update both to include root `## Story Intent` and one `### Task 1:` skeleton with `#### Story Intent`, the four exact labels, and `**Verification Commands:**`. Keep unfinished values visibly incomplete and leave the verifier non-executable until replaced; the raw scaffold must remain a valid discovery draft but must refuse approval/splitting. Put a fully worked example in a fenced guide block, not a live extra task that could become a generic child. In `new-from-plan.test.mjs`, assert root/task structure for both templates, existing discovery compatibility, unfinished split refusal, and successful parsing/splitting after a fixture deliberately fills every field and supplies a real verifier. Compare the templates after formatting-only normalization to catch runtime/source drift; after `npm run sync:templates`, require byte identity of the canonical and installed template.

- [ ] **Step 5: Verify installed parity and commit the guidance.** Assert no provider receives a copied or divergent rubric and no active shared/adapter/template instruction mandates substantive prose before Plan. Historical delivered docs and negative examples are not active instructions and must not be bulk rewritten. Suggested commit: `[#1703] docs(story): share Plan-stage value review across providers`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/providers/parity.test.mjs
node --test scripts/tests/integration/task-tracker/verbs/new-from-plan.test.mjs scripts/tests/integration/task-tracker/core/templates.test.mjs
```

### Task 6: Verify lifecycle adoption and publish operator repair guidance

#### Story Intent

- **Beneficiary:** maintainer upgrading a repository with existing planned and active work
- **Capability:** adopt story-quality approval with predictable repair instructions and verified lifecycle behavior
- **Need:** old approvals and plans lack story bindings while active development must remain undisturbed
- **Value or failure prevented:** upgrades prevent stale approvals without reopening delivered work or stranding operators behind unexplained refusals

**Files:**

- Modify: `scripts/tests/integration/task-tracker/gh/lib/eight-state-flow.test.mjs`.
- Extend `scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs` with positive production-registry and warning assertions. Existing guard-parity fixtures contain no story-based refusals; do not replace unrelated negative cases. Inspect Plan→Develop fixtures for any additional valid-binding setup the new guard requires.
- Extend: `scripts/tests/integration/task-tracker/verbs/github-record-contract-writes.test.mjs` and existing approval/split/provider suites where end-to-end coverage exposes gaps.
- Create: `docs/guides/user-story-quality.md`.
- Modify: `docs/DESIGN.md`, `docs/QUICKSTART.md` where active lifecycle guidance describes the replaced behavior.

**Interfaces:** Uses the production approval, resolver, registry, creator and splitter contracts. Integration tests supply local contained plan files and mocked GitHub adapters; tests do not mutate live issues or call providers.

- [ ] **Step 1: Add RED lifecycle scenarios using real guard composition.** The current eight-state `makeProject().move` only assigns status and does not run production guards. Add a separate guarded transition helper, import `guard-bootstrap.mjs` and `runGuards`, and supply the offline dependency setup used by `guard-parity-plan-develop.test.mjs`; extend that setup with the production intent adapter and a temporary contained plan directory. Preserve the existing wave-admission tests. Prove empty/template prose passes Backlog→Refine→R4P→Plan with no story warning. Missing intent/prose blocks approval without writes. Valid deep-dive, root-plan and split-child task intent each approve, and the persisted binding permits Plan→Develop. Edit story only, intent only, and source kind independently and assert the corresponding refusal. Restore or explicitly renew approval and verify recovery. Keep late-state/bounce-back scenarios with legacy markers to prove no retroactive gate.

  ```js
  async function guardedMove(project, number, target, ctx) {
    const before = project.read(number).status;
    const result = await runGuards(before, target, {
      ...ctx,
      issueNumber: number,
      fromState: before,
      toState: target,
    });
    if (result.ok) project.move(number, target);
    else assert.equal(project.read(number).status, before);
    return result;
  }
  function assertStoryRefusal(result, code) {
    assert.equal(result.ok, false);
    assert.ok(
      result.refusals.some(
        (refusal) =>
          refusal.id === 'plan-exit-story-approval-binding' && refusal.reason.includes(code)
      ),
      JSON.stringify(result.refusals)
    );
  }
  // Each scenario starts with a complete valid ctx, obtains its marker by
  // runPlanApprove, then makes one controlled story/intent/source edit.
  // Pass the resulting guardedMove result into assertStoryRefusal.
  ```

  Each case must run the actual transition/approval operation, check its result, and verify external mutation counts and persisted body. Add the positive `runGuards('refine', 'ready-for-plan', ...)` draft-story cases from Task 2 and an actual Refine-entry warning spy. Supply all unrelated valid context and assert the full result is successful; the current one-way refusal-superset assertion cannot establish that the story refusal disappeared. Preserve unrelated fixture refusals.

- [ ] **Step 2: Add combined adoption and concurrency cases.** A legacy Plan marker repairs with a new timestamp and supersession evidence, including non-adaptive/no-R4P cases with and without Plan entry; changed trunk requires another JIT repair; a missing-marker waiver leaves existing waiver semantics intact; an existing stale marker refuses under that same waiver. Demonstrate rejected directory-backed approval makes no seal/projection/audit write. Demonstrate the existing non-Plan forecast repair keeps its established scope and existing story attributes. Verify the plan-linked child generated in Task 4 resolves back to its exact task instead of the root or a sibling.

- [ ] **Step 3: Document the repair procedure and compatibility limits.** The guide explains where to put root/task/deep-dive intent and how to author a story using `npx aitm user-story`. It states that `npx aitm plan-approve #N` explicitly renews approval only after source review, and normal promotion follows immediately while trunk provenance remains current. Describe every diagnostic family, no-plan versus linked-plan repairs, directory-backed limitation, and the need to enrich every historical task before splitting. Explain that approval reads the current working-tree plan while the recorded source commit remains generation provenance. For task-selector repair, copy the exact candidate emitted by diagnostics (or extractor output if truncated), including interior spaces left by inline-code masking; copying the raw plan heading may not match. Do not tell operators to hand-edit markers or run internal body mutation helpers.

  Include this concrete story example:

  ```text
  As a release operator
  I want to stop partial publication because registry checks can fail
  So that consumers receive complete releases
  ```

- [ ] **Step 4: Run targeted tests, then the issue's complete verification commands.** The issue root commands remain execution authority: `vc:1` quality/author/guard, `vc:2` approval, `vc:3` split, `vc:4` lifecycle, `vc:5` provider parity, `vc:6` fast tests, `vc:7` slow tests, `vc:8` lint, `vc:9` formatting, `vc:10` latest commit. Before Develop, use the sanctioned issue-body workflow to add `vc:6` to the AC2/AC3/AC4/AC6 citations (and AC1 for the expanded early registry tests) and append a root `vc:11` running the template, runtime scaffold, and directory-contract integration suites listed below. Add `vc:11` to affected AC1/AC2/AC5/AC6 citations. Preserve existing root command IDs and commands. `vc:6` runs the new unit files; `vc:7` is the slow suite and is not a substitute for integration coverage. Run targeted new adapter/guard/corpus checks as additional evidence; do not claim those replace any root command. If dependencies prevent a test from loading, report that as unverified, not as a passing feature check.

- [ ] **Step 5: Review the final diff and commit verified consolidation.** Verify all six acceptance criteria against the coverage table below, retain current issue state until its required lifecycle actions occur, and hand off implementation evidence through the normal governed workflow. Suggested commit: `[#1703] test(story): verify Plan-stage quality adoption`.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/gh/lib/eight-state-flow.test.mjs
# Append this exact command as root vc:11 before Develop:
node --test scripts/tests/integration/task-tracker/core/templates.test.mjs scripts/tests/integration/task-tracker/verbs/new-from-plan.test.mjs scripts/tests/integration/task-tracker/verbs/github-record-contract-writes.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

## Acceptance and Specification Coverage

| Issue criterion / spec area                                      | Tasks      | Evidence                                                                                                                                       |
| ---------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1: optional early stories; spec §§6, 8.2, 11                   | 1, 2, 6    | Draft/body evaluator, four creation shapes, early registry assertions, template parity and eight-state flow; `vc:1`, `vc:4`, `vc:6`, `vc:11`.  |
| AC2: authoritative four-field intent; spec §§7, 14               | 1, 3, 4    | Root/task/deep-dive parsing, precedence, contained reads, ambiguity, scaffold and field failures; `vc:1`, `vc:2`, `vc:6`, `vc:11`.             |
| AC3: objective quality plus approval freshness; spec §§8.3–9, 15 | 1, 3, 6    | All nine codes, hashes, marker codec, fresh-base races, bypass matrix, exact read-back; `vc:2`, `vc:4`, `vc:6`.                                |
| AC4: all-task intent and no generic split fallback; spec §10     | 1, 4, 6    | Negative historical plan, six-task preview, no-side-effect failures, source-code absence; `vc:3`, `vc:6`.                                      |
| AC5: consistent provider guidance; spec §§8.5, 12                | 5, 6       | One rubric, five workflow routes, Claude/Codex/Grok installed parity and scaffold guidance; `vc:5`, `vc:11`.                                   |
| AC6: legacy repair without retroactive disruption; spec §13      | 2, 3, 6    | Renewed timestamps, audit supersession, JIT trunk repair, late-state immunity, unsupported-directory refusal; `vc:2`, `vc:4`, `vc:6`, `vc:11`. |
| Regression corpus; spec §16.1                                    | 1          | Exactly 24 IDs, current live-body repaired provenance, honestly reconstructed weak rows, offline tests; `vc:1`, `vc:6`.                        |
| Security/reliability; spec §17                                   | 1, 3, 4, 6 | Masked structural parsing, contained file reads, bounded diagnostics, fresh-base checks and all-task preflight.                                |
| Delivery decomposition; spec §18                                 | All        | Six independently reviewable tasks, each with intent and executable verification commands.                                                     |

## Plan Review Checklist

- [ ] Confirm the six implementation decisions, especially conflicting plan-key selection and directory-backed approval compatibility.
- [ ] Confirm the default current-live-body corpus capture and evidence schema before Task 1 matcher implementation; no retained audit snapshot is claimed.
- [ ] Review the template ownership/dependency direction, shared Markdown extraction, and public API names together.
- [ ] Review every approval return path and both promotion dependency-injection paths; no success path may skip content binding in Plan.
- [ ] Confirm renewal audit retry behavior and actor attribution do not turn old human approval into approval of changed content.
- [ ] Confirm all-task parsing preserves non-splitting historical readers and removes only the live intent block from child scope.
- [ ] Complete the user's manual Claude review and resolve findings before execution or issue hydration.
