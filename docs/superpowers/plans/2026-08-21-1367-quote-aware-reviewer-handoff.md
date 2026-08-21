# Quote-Aware Reviewer Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a session-authorized co-review reviewer hand off ordinary quoted prose such as Claude's `(F-001)` message without weakening the closed shell-command boundary.

**Architecture:** Keep the existing classifier, policy, grant, and CLI layers. Change only the classifier tokenizer so shell-sensitive bytes are evaluated in quote context, then prove the behavior at the pure classifier, live policy, real Bash-guard-to-CLI, generated-guidance, and operator-documentation boundaries.

**Tech Stack:** Node.js ES modules, `node:test`, AITM co-review CLI, Claude Bash PreToolUse guard, Markdown.

## Global Constraints

- Preserve exact `npx aitm co-review` entrypoint and closed subcommand/flag grammar.
- Preserve live provider/session grant matching, protocol integrity, locking, role separation, and archive behavior.
- Reject control bytes everywhere; reject shell syntax outside quotes; reject unescaped `$` and backticks inside double quotes.
- Treat single-quoted message bytes as literal data; the co-review CLI records them and never evaluates them.
- Do not alter either terminal #939 runtime.
- Modify existing test files; do not create a new test file or change the post-snapshot test registry.

---

### Task 1: Quote-Aware Classifier

**Files:**
- Modify: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`
- Modify: `scripts/task-tracker/lib/reviewer-co-review-command.mjs`

**Interfaces:**
- Consumes: `classifyReviewerCoReviewCommand(command, { projectDir, exists })` and its existing structured results.
- Produces: unchanged classifier result shapes; only quote-context recognition changes.

- [ ] **Step 1: Add failing positive and negative classifier cases**

Extend `reviewer command classifier accepts only the generated lifecycle forms` with Claude's exact single-quoted message:

```js
const punctuated = classify(
  'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
    '--review .tmp/co-review/p1/round-2-reviewer-review.md ' +
    '--review-of 0123456789012345678901234567890123456789 ' +
    '--decision accepted ' +
    "--message 'review complete: accepted with 4 refinement findings " +
    "(F-001 squash token completeness is the only load-bearing one)'"
);
assert.equal(punctuated.recognized, true);
assert.equal(
  punctuated.message,
  'review complete: accepted with 4 refinement findings ' +
    '(F-001 squash token completeness is the only load-bearing one)'
);

const literalSingleQuoted = classify(
  "npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude " +
    "--review .tmp/co-review/p1/round-2-reviewer-review.md " +
    "--review-of abc --decision accepted --message 'literal $USER $(pwd) `date`'"
);
assert.equal(literalSingleQuoted.recognized, true);
assert.equal(literalSingleQuoted.message, 'literal $USER $(pwd) `date`');
```

Add these cases to the rejected array:

```js
'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
  '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
  '--message "review for $USER"',
'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
  '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
  '--message "review from `whoami`"',
'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
  '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
  '--message review(F-001)',
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: FAIL because the punctuated and literal single-quoted handoffs return `{ recognized: false, reason: "not-one-literal-command" }`; all pre-existing tests remain green up to those assertions.

- [ ] **Step 3: Implement quote-context metacharacter validation**

Replace the global raw-input scan with explicit context sets and validate within `shellWords()`:

```js
const CONTROL_CHARACTERS = new Set(['\0', '\r', '\n']);
const SHELL_META = new Set([';', '&', '|', '<', '>', '`', '$', '*', '?', '{', '}', '(', ')', '[', ']', '~']);
const DOUBLE_QUOTE_EXPANSION = new Set(['`', '$']);

function shellWords(input) {
  const words = [];
  let word = '';
  let quote = '';
  let escaped = false;
  let started = false;
  for (const character of input) {
    if (CONTROL_CHARACTERS.has(character)) return null;
    if (escaped) {
      if (!quote && SHELL_META.has(character)) return null;
      word += character;
      escaped = false;
      started = true;
    } else if (character === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = '';
      else if (quote === '"' && DOUBLE_QUOTE_EXPANSION.has(character)) return null;
      else word += character;
      started = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (SHELL_META.has(character)) {
      return null;
    } else if (/\s/.test(character)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += character;
      started = true;
    }
  }
  if (quote || escaped) return null;
  if (started) words.push(word);
  return words;
}
```

Do not change `options()`, `literalPath()`, result fields, or `evaluateCoReviewWrite()`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: all tests pass, including the pre-existing broader-shell denial matrix.

- [ ] **Step 5: Commit the classifier cycle**

```bash
git add scripts/task-tracker/lib/reviewer-co-review-command.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
git commit -m "[#1367] fix: honor quotes in reviewer handoff prose"
```

### Task 2: Real Guard-to-CLI Persistence Proof

**Files:**
- Modify: `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`

**Interfaces:**
- Consumes: real `bash-guard.mjs`, local self-linked `npx aitm`, and co-review protocol fixture.
- Produces: proof that punctuated message bytes pass the guard and persist exactly in terminal state.

- [ ] **Step 1: Change the boundary fixture to use punctuated prose and assert persistence**

Define one message before building the command:

```js
const message =
  'review complete: accepted with 4 refinement findings ' +
  '(F-001 squash token completeness is the only load-bearing one)';
```

Use a single-quoted shell argument in `command`:

```js
`--message '${message}'`,
```

Pass the same unquoted argument value to `successfulNpx()`:

```js
'--message',
message,
```

After the existing terminal assertions, add:

```js
assert.equal(accepted.lastHandoff.message, message);
```

Keep all existing denied commands unchanged.

- [ ] **Step 2: Run the real boundary test**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: PASS; the actual Bash guard emits no block decision for the punctuated command, the offline local `npx aitm` handoff reaches `accepted`, and `lastHandoff.message` matches exactly.

- [ ] **Step 3: Run the combined policy and boundary evidence command**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: all tests pass with no weakening of the denied matrix.

- [ ] **Step 4: Commit the boundary proof**

```bash
git add scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
git commit -m "[#1367] test: prove punctuated reviewer handoff"
```

### Task 3: Reviewer Guidance and Full Verification

**Files:**
- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Modify: `docs/guides/github-native-coordination.md`

**Interfaces:**
- Consumes: generated reviewer handoff prose and the existing start fixture assertions.
- Produces: one operator-visible description matching the implemented quote boundary.

- [ ] **Step 1: Add a failing generated-guidance assertion**

After the existing arbitrary-Bash assertion in `co-review-start-cases.mjs`, add:

```js
assert.match(reviewer, /ordinary quoted prose.*supported/i);
assert.match(reviewer, /dynamic shell expressions.*remain blocked/i);
```

- [ ] **Step 2: Run the guidance test and verify RED**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL because the generated reviewer handoff does not yet contain the new quote-boundary wording.

- [ ] **Step 3: Update generated and operator guidance**

Append these sentences to the first reviewer-turn paragraph in `renderReviewerHandoff()`:

```text
Ordinary quoted prose in the handoff message is supported, including inert punctuation such as parentheses. Dynamic shell expressions and composed commands remain blocked; quote message prose instead of removing useful review detail.
```

Add the same operational rule after the reviewer-command paragraph in `docs/guides/github-native-coordination.md`, explicitly distinguishing single-quoted literal data from expansion-capable double-quoted `$` or backticks.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Run repository quality gates**

Run in order:

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
git diff --check
```

Expected: every command exits 0. If formatting changes are required, commit them before re-running the test lanes so receipts cover the final bytes.

- [ ] **Step 6: Commit guidance and final verification shape**

```bash
git add scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-start-cases.mjs docs/guides/github-native-coordination.md
git commit -m "[#1367] docs: explain reviewer message quoting"
```

- [ ] **Step 7: Verify issue attribution and clean state**

Run:

```bash
git log --oneline origin/trunk..HEAD
git status --short
```

Expected: every new commit subject begins `[#1367]`; status is clean.
