# Current-Schema Issue Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every sanctioned non-stub issue creation produce a complete Connextra story and current `vc-list` Acceptance Criterion citations that pass the next Refine gate without repair.

**Architecture:** Extend the existing file-fragment boundary with a required `--user-story-file`; normalize it through the repository's existing Connextra authoring helper before template substitution. After the root Verification Commands section is assembled, reuse the current body-invariant AC parsers to reject legacy, missing, empty, or dangling verifier citations at creation time. Keep stub creation intentionally sparse.

**Tech Stack:** Node.js 22 ESM, `node:test`, Markdown templates, AITM self-documenting command catalog, existing body-invariant and user-story helpers.

## Global Constraints

- Never call `gh issue create` directly; all behavior stays behind `npx aitm create-issue` and `preflight-issue`.
- Epic, sub-issue, solo, and defect shapes require `--user-story-file`; stub shape retains its intentional sparse body without a User Story section.
- The user-story fragment has exactly three non-empty lines beginning `As a`, `I want to`, and `So that`, with no heading and no template placeholder.
- Root Acceptance Criteria use only `<!-- aitm-verified vc-list="vc:N" -->` or the existing explicit non-demonstrable/waiver forms; Functional DoD items retain literal `cmd` declarations.
- Validate `vc-list` only after Verification Commands are assembled.
- Preserve canonical heading order, Story Origin behavior, sub-issue parent injection, DoD generation, duplicate-child protection, kind markers, and exact generated-skill parity.
- Do not infer user-story prose from a title and do not migrate historical issues.

---

### Task 1: Required Connextra fragment for non-stub shapes

**Files:**

- Create: `scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs`
- Modify: `scripts/tests/unit/meta/test-tree-layout.baseline.json`
- Modify: `scripts/task-tracker/preflight-issue.mjs`
- Modify: `scripts/gh/create-issue.mjs`
- Modify: `templates/epic-body.md`
- Modify: `templates/sub-issue-body.md`
- Modify: `templates/solo-issue-body.md`
- Modify: `templates/defect-body.md`
- Modify: `.ai-task-manager/templates/epic-body.md`
- Modify: `.ai-task-manager/templates/sub-issue-body.md`
- Modify: `.ai-task-manager/templates/solo-issue-body.md`
- Modify: `.ai-task-manager/templates/defect-body.md`
- Modify: existing preflight fixtures under `scripts/tests/unit/task-tracker/lib/` that render non-stub shapes

**Interfaces:**

- Consumes: `buildUserStoryLines({ asA, iWant, soThat })` from `scripts/task-tracker/lib/user-story-author.mjs`.
- Produces: exported `normalizeUserStoryFragment(value)` in `preflight-issue.mjs`; new `--user-story-file <path>` forwarding in `buildShapeFlags(args)`.

- [ ] **Step 1: Write failing focused tests**

Create a fixture with `story.md` containing:

```text
As a task author
I want to create a complete issue body
So that Refine accepts it without repair
```

Add tests that invoke `preflight-issue.mjs` and assert:

```js
assert.equal(missingStory.code, 2);
assert.match(missingStory.stderr, /--user-story-file required with --shape/);

assert.equal(valid.code, 0, valid.stderr);
assert.match(valid.stdout, /As a task author\nI want to create a complete issue body/);
assert.doesNotMatch(valid.stdout, /\[who wants to accomplish something\]/);

assert.equal(stub.code, 0, stub.stderr);
assert.doesNotMatch(stub.stdout, /^## User Story$/m);
```

Cover malformed fragments with two lines, four lines, a heading, and each canonical template placeholder. Add a pure forwarding assertion:

```js
const flags = buildShapeFlags({
  shape: 'solo',
  title: 'Complete issue',
  'user-story-file': 'story.md',
  'scope-file': 'scope.md',
  'ac-file': 'acs.md',
  'story-origin-file': 'origin.md',
});
assert.deepEqual(flags.slice(0, 10), [
  '--shape',
  'solo',
  '--title',
  'Complete issue',
  '--user-story-file',
  'story.md',
  '--scope-file',
  'scope.md',
  '--ac-file',
  'acs.md',
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs
```

Expected: FAIL because preflight does not require or render `--user-story-file`, and `buildShapeFlags` does not forward it.

- [ ] **Step 3: Implement minimal fragment normalization and forwarding**

Import the existing composer:

```js
import { buildUserStoryLines } from './lib/user-story-author.mjs';
```

Add this exported normalizer to `preflight-issue.mjs`:

```js
export function normalizeUserStoryFragment(value) {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 3 || lines.some((line) => /^#{1,6}\s+/.test(line))) {
    throw new TypeError('user-story-fragment: expected exactly three heading-free lines');
  }
  return buildUserStoryLines({ asA: lines[0], iWant: lines[1], soThat: lines[2] }).join('\n');
}
```

In non-stub `emitShape`, require `user-story-file` with the other fragments, read it, normalize it, and add `user_story` to `rawFills`. Catch normalization errors and route them through `die('--user-story-file ...')` so the CLI exits `2` before output or GitHub mutation.

In `create-issue.mjs`, add `user-story-file` to the non-stub required list and forward it before the other section files:

```js
for (const flag of ['user-story-file', 'scope-file', 'ac-file', 'story-origin-file']) {
  if (typeof args[flag] !== 'string') die(`--${flag} required with --shape`, 2);
}
flags.push('--user-story-file', args['user-story-file']);
```

Replace the three hard-coded template story lines in all eight non-stub template copies with:

```markdown
{{user_story}}
```

Do not change `stub-body.md`.

- [ ] **Step 4: Migrate existing non-stub test fixtures**

Add a `story` file to shared fixtures and pass `--user-story-file` in every existing test that intentionally renders epic, sub-issue, solo, or defect. Do not add it to stub tests. Keep each fixture's story specific and non-placeholder so tests also exercise the new validation.

- [ ] **Step 5: Run focused and directly affected tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs scripts/tests/unit/task-tracker/lib/preflight-issue.test.mjs scripts/tests/unit/task-tracker/lib/story-origin-authoring.test.mjs scripts/tests/unit/task-tracker/lib/defect-shape.test.mjs scripts/tests/unit/gh/create-issue.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/task-tracker/preflight-issue.mjs scripts/gh/create-issue.mjs templates .ai-task-manager/templates scripts/tests/unit/task-tracker/lib scripts/tests/unit/gh/create-issue.test.mjs scripts/tests/unit/meta/test-tree-layout.baseline.json
git commit -m "[#1382] feat: require complete non-stub user stories"
```

### Task 2: Reject legacy or unresolved AC verifier declarations at creation

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs`
- Modify: `scripts/task-tracker/preflight-issue.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/refine-exit-vc-citation-guardrail.test.mjs`

**Interfaces:**

- Consumes: `findAcsWithLegacyVerificationForm(body)` and `findAcsWithoutVerifierOrInvalidTag(body)` from `scripts/task-tracker/lib/body-invariants.mjs`.
- Produces: creation-time `preflight-issue: ac-verifier-contract` refusal with line/reason details.

- [ ] **Step 1: Add failing declaration tests**

Render a valid solo body with a complete story and explicit Verification Commands. Vary the AC fragment and assert:

```js
const cases = [
  ['<!-- aitm-verified cmd="`node --test x.test.mjs`" -->', /backtick-embedded-cmd/],
  ['<!-- aitm-verified cmd="vc:1" -->', /ordinal-cmd-citation/],
  ['<!-- aitm-verified vc-list="" -->', /empty-vc-list/],
  ['<!-- aitm-verified vc-list="vc:99" -->', /dangling-vc-list/],
  ['<!-- aitm-verified -->', /missing-vc-list/],
];
```

Also assert `vc-list="vc:1"` passes when command ID `1` exists, and `<!-- aitm-non-demonstrable -->` remains accepted.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs
```

Expected: FAIL because preflight currently permits declarations that Refine later rejects.

- [ ] **Step 3: Add one creation-time contract check after VC assembly**

Import both existing finders. After explicit and seeded Verification Commands have been inserted into `finalBody`, but before kind stamping and `verifyIssueBody`, collect offenders:

```js
const declarationOffenders = [
  ...findAcsWithLegacyVerificationForm(finalBody),
  ...findAcsWithoutVerifierOrInvalidTag(finalBody),
];
if (declarationOffenders.length > 0) {
  process.stderr.write('preflight-issue: ac-verifier-contract\n');
  for (const offender of declarationOffenders) {
    process.stderr.write(
      `  line ${offender.lineIndex + 1}: ${offender.reason}: ${offender.label}\n`
    );
  }
  process.exit(2);
}
```

Deduplicate offenders by line and reason so a dangling citation reports the specific citation failure without a redundant generic no-verifier line. Apply this check only to non-stub shapes; stubs intentionally carry a Refine placeholder.

- [ ] **Step 4: Run focused downstream-contract tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs scripts/tests/unit/task-tracker/lib/refine-exit-vc-citation-guardrail.test.mjs scripts/tests/unit/task-tracker/lib/story-origin-authoring.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/task-tracker/preflight-issue.mjs scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs
git commit -m "[#1382] fix: reject legacy AC verifiers at creation"
```

### Task 3: Synchronize help, skills, examples, and parity

**Files:**

- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: command-catalog source surfaced by `scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`
- Modify: `skill/shared/rules/create-issue.md`
- Modify: `skill/adapters/codex/SKILL.md`
- Modify: `skill/adapters/claude/SKILL.md`
- Modify: `skill/adapters/grok/SKILL.md`
- Modify: generated/installed task skill stubs only through the repository installer mechanism
- Modify: affected docs/help snapshot tests

**Interfaces:**

- Consumes: the Task 1 `--user-story-file` contract and Task 2 `vc-list` grammar.
- Produces: identical CLI help and skill guidance across provider surfaces.

- [ ] **Step 1: Add or strengthen failing help/parity assertions**

Assert both commands advertise `--user-story-file <path>`, non-stub required fragments include it, and creation guidance contains `aitm-verified vc-list="vc:N"` while excluding creation instructions that prescribe `aitm-verified cmd=` for ACs.

- [ ] **Step 2: Run help/parity tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
```

Expected: FAIL on missing flag and legacy guidance.

- [ ] **Step 3: Update authoritative help and skill text**

Add `--user-story-file <path>` to create/preflight usage, arguments, and examples. Update `rules/create-issue.md` so required non-stub fragments include `user-story.md` and every AC cites an existing generated VC ID through `vc-list`. Update each provider adapter's creation summary to the same grammar. Preserve DoD documentation that correctly uses literal commands.

- [ ] **Step 4: Regenerate or synchronize installed skill stubs**

Run the repository-owned installer/parity mechanism used by the existing provider tests. Do not hand-edit generated bytes beyond their canonical generator source.

- [ ] **Step 5: Run all focused issue-authoring tests**

```bash
node --test scripts/tests/unit/task-tracker/lib/current-schema-issue-authoring.test.mjs scripts/tests/unit/task-tracker/lib/preflight-issue.test.mjs scripts/tests/unit/task-tracker/lib/story-origin-authoring.test.mjs scripts/tests/unit/task-tracker/lib/defect-shape.test.mjs scripts/tests/unit/task-tracker/lib/refine-exit-vc-citation-guardrail.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs scripts/tests/unit/gh/create-issue.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run final formatting and diff checks**

```bash
npm run format:check
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/preflight-issue.mjs scripts/gh/create-issue.mjs skill .agents .claude scripts/tests templates .ai-task-manager/templates
git commit -m "[#1382] docs: synchronize current issue-authoring contract"
```

## Final governed verification

- [ ] Run `npx aitm commit-trace 1382`.
- [ ] Run `npx aitm test 1382` so lint/format finalization and every declared focused, fast, and slow verification command execute against the exact final SHA.
- [ ] Inspect the generated Test receipt and issue body evidence before reporting `CODE_COMPLETE`; do not run `/task review` or `/task close` as the agent.
