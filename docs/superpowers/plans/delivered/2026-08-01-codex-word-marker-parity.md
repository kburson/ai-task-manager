# Codex Word-Marker Transcript Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex Desktop lifecycle sessions produce provider-neutral, nonzero,
auditable Word Markers from native rollout JSONL while preserving Claude counts.

**Architecture:** Provider adapters declare transcript schema and identity keys. A
pure normalizer converts Claude/Codex JSONL records into neutral prose/tool events;
the existing counter owns tier arithmetic and emits structured, deduplicated Codex
availability diagnostics. Runtime lifecycle tests prove the end-to-end cursor,
timing-row, and session-reference behavior.

**Tech Stack:** Node.js ESM, `node:test`, JSONL, existing provider registry, AITM
runtime/timing helpers, Markdown documentation.

## Global Constraints

- Preserve Claude transcript fixture counts exactly.
- Count only authoritative `response_item` Codex records, never event mirrors or
  reasoning.
- Exclude developer/system and injected Desktop context from every word tier.
- Keep historical timing rows untouched.
- Use TDD for every production behavior change.
- Use the sanctioned AITM lifecycle and commit every independently reviewable task.

---

### Task 1: Register Codex Desktop identity and transcript schema

**Files:**

- Modify: `scripts/providers/codex.mjs`
- Modify: `scripts/providers/claude.mjs`
- Modify: `scripts/providers/provider-adapter.mjs`
- Modify: `scripts/providers/tests/registry.test.mjs`
- Modify: `scripts/providers/tests/parity.test.mjs`
- Modify: `scripts/providers/tests/transcript-resolver.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/session-id-resolution.test.mjs`

**Interfaces:**

- Produces: adapter `transcriptSchema: 'claude-message-v1' | 'codex-rollout-v1'`.
- Produces: Codex `sessionIdEnvKeys` ordered as
  `['CODEX_THREAD_ID', 'CODEX_SESSION_ID']`.
- Preserves: `resolveSessionId({ env, transcriptDir }) -> string`.

- [ ] **Step 1: Write failing provider and session tests**

```js
test('Codex Desktop thread identity detects provider and wins session resolution', () => {
  const env = { CODEX_THREAD_ID: 'thread-id', CODEX_SESSION_ID: 'legacy-id' };
  assert.equal(detectProvider({ env }).name, 'codex');
  assert.equal(resolveSessionId({ env }), 'thread-id');
  assert.equal(codexAdapter.transcriptSchema, 'codex-rollout-v1');
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test scripts/providers/tests/registry.test.mjs \
  scripts/providers/tests/parity.test.mjs \
  scripts/providers/tests/transcript-resolver.test.mjs \
  scripts/task-tracker/tests/unit/lib/session-id-resolution.test.mjs
```

Expected: failure because `CODEX_THREAD_ID` and `transcriptSchema` are absent.

- [ ] **Step 3: Add the adapter capability and identity key**

```js
export const codexAdapter = {
  // existing capabilities stay unchanged
  transcriptSchema: 'codex-rollout-v1',
  sessionIdEnvKeys: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID'],
  detectionEnvKeys: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_HOME'],
};
```

Add `transcriptSchema: 'claude-message-v1'` to Claude and document the union in
`provider-adapter.mjs`.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run the Step 2 command. Expected: all tests pass and the date-bucket resolver
returns the rollout whose filename ends in the Desktop thread ID.

- [ ] **Step 5: Commit**

```bash
git add scripts/providers scripts/task-tracker/tests/unit/lib/session-id-resolution.test.mjs
git commit -m "fix(providers): detect Codex Desktop threads [#1092]"
```

### Task 2: Normalize Claude and Codex transcript records

**Files:**

- Create: `scripts/providers/transcript-normalizer.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs`
- Modify: `scripts/task-tracker/word-counter.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/word-counter.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/word-counter-full-expansion.test.mjs`

**Interfaces:**

- Produces:
  `normalizeTranscriptRecord(record) -> { events: TranscriptEvent[], recognized: boolean, schema: string | null }`.
- Consumes neutral event variants `text`, `tool-call`, and `tool-result`.
- Preserves:
  `countWords(filePath, fromLine) -> { count, totalLines, fullExpansion, ...availability }`.

- [ ] **Step 1: Write failing Codex prose and injection tests**

```js
const records = [
  responseMessage('user', [{ type: 'input_text', text: 'real user words' }]),
  responseMessage('assistant', [{ type: 'output_text', text: 'visible answer' }]),
  responseMessage('developer', [{ type: 'input_text', text: 'hidden instructions' }]),
  responseMessage('user', [{ type: 'input_text', text: '<environment_context> hidden' }]),
];
assert.equal(countWords(writeJsonl(records), 0).count, 5);
```

- [ ] **Step 2: Write failing tool-tier tests**

Cover `custom_tool_call`, `custom_tool_call_output`, `function_call`, and
`function_call_output`. Assert chips increase `count`, inputs/results only increase
`fullExpansion`, and malformed JSON input never throws.

- [ ] **Step 3: Run Codex tests and confirm RED**

```bash
node --test scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs
```

Expected: missing normalizer and zero Codex counts.

- [ ] **Step 4: Implement the pure normalizer**

```js
export function normalizeTranscriptRecord(record) {
  if (record?.type === 'response_item') return normalizeCodexPayload(record.payload);
  if (record?.type === 'user' || record?.type === 'assistant') {
    return normalizeClaudeMessage(record);
  }
  return { events: [], recognized: false, schema: null };
}
```

Return plain data only. Do not import `word-counter`, filesystem, timing, or provider
registry modules.

- [ ] **Step 5: Route tier arithmetic through neutral events**

Keep `isInjection`, recursive string-leaf collection, and the existing word-count
formula. Add Desktop injection prefixes:

```js
'<recommended_plugins>',
'# AGENTS.md instructions',
'<environment_context>',
```

- [ ] **Step 6: Prove Codex and Claude GREEN**

```bash
node --test scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs \
  scripts/task-tracker/tests/unit/lib/word-counter.test.mjs \
  scripts/task-tracker/tests/unit/lib/word-counter-full-expansion.test.mjs
```

Expected: Codex counts are nonzero and all existing Claude assertions are unchanged.

- [ ] **Step 7: Commit**

```bash
git add scripts/providers/transcript-normalizer.mjs \
  scripts/task-tracker/word-counter.mjs \
  scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs
git commit -m "fix(timing): normalize Codex rollout words [#1092]"
```

### Task 3: Make unavailable Codex measurements observable

**Files:**

- Modify: `scripts/task-tracker/word-counter.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs`
- Modify: `scripts/task-tracker/runtime.mjs` only if runtime must forward a
  structured diagnostic not already emitted by the counter.

**Interfaces:**

- Produces availability fields:
  `{ status: 'ok' | 'unavailable', diagnosticCode: string | null }`.
- Produces one-shot stderr line:
  `⚠ [aitm:word-measurement] <code> sid=<sid>`.

- [ ] **Step 1: Write failing diagnostic tests**

Assert distinct diagnostics for missing Desktop session ID, unresolved date-bucket
rollout, and a nonempty rollout with no recognizable records. Assert two identical
lookups emit one diagnostic through an injected sink.

- [ ] **Step 2: Run the Codex counter test and confirm RED**

```bash
node --test scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs
```

Expected: result lacks availability fields and the diagnostic sink remains empty.

- [ ] **Step 3: Implement structured diagnostics**

```js
function unavailable(code, details, onDiagnostic) {
  emitDiagnosticOnce({ code, details, onDiagnostic });
  return { status: 'unavailable', diagnosticCode: code };
}
```

Numeric `count`, `totalLines`, and `fullExpansion` remain zero for legacy callers,
but status is never `ok` when Codex identity/path/schema is unresolved.

- [ ] **Step 4: Run focused diagnostics and Claude compatibility tests**

Run the Task 2 Step 6 command. Expected: all pass with no diagnostic spam.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/word-counter.mjs \
  scripts/task-tracker/runtime.mjs \
  scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs
git commit -m "fix(timing): surface unavailable Codex metrics [#1092]"
```

### Task 4: Prove lifecycle timing and session references end to end

**Files:**

- Create: `scripts/task-tracker/tests/integration/lib/codex-word-marker-lifecycle.integration.test.mjs`
- Modify: `scripts/task-tracker/runtime.mjs` only for an injectable measurement
  seam required by the integration test.

**Interfaces:**

- Consumes: `buildContext()` and `ctx.flushActiveToGH(...)`.
- Proves: captured rows carry positive per-segment deltas and monotonic markers.
- Proves: `safeRecordSessionRef` receives the Desktop thread and native rollout path.

- [ ] **Step 1: Write the failing lifecycle integration test**

Create a temporary project/home, write a date-bucketed rollout ending in the test
thread ID, set `CODEX_THREAD_ID`, and capture `safePostTiming` and
`safeRecordSessionRef`. Append a second visible response between two flushes.

```js
assert.ok(first.deltaWords > 0);
assert.ok(second.deltaWords > 0);
assert.ok(second.wordMarker > first.wordMarker);
assert.equal(ref.sid, THREAD_ID);
assert.equal(ref.jsonlPath, rolloutPath);
```

- [ ] **Step 2: Run the integration test and confirm RED**

```bash
node --test scripts/task-tracker/tests/integration/lib/codex-word-marker-lifecycle.integration.test.mjs
```

Expected: current runtime uses `default-session`/Claude state or records zero words.

- [ ] **Step 3: Add the minimal runtime seam if necessary**

Keep production behavior unchanged; dependency injection may override only
measurement/path/time functions. Do not duplicate the flush algorithm in the test.

- [ ] **Step 4: Run integration and focused unit suites**

```bash
node --test scripts/task-tracker/tests/integration/lib/codex-word-marker-lifecycle.integration.test.mjs \
  scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs
```

Expected: positive deltas, increasing markers, correct session reference, all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/runtime.mjs \
  scripts/task-tracker/tests/integration/lib/codex-word-marker-lifecycle.integration.test.mjs
git commit -m "test(timing): prove Codex lifecycle markers [#1092]"
```

### Task 5: Document, verify, and finalize

**Files:**

- Modify: `docs/guides/settings-guide.md`
- Modify: `docs/architecture/body-markers.md`
- Modify: `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs` only
  if a runtime edit shifts characterized emitter locations.

**Interfaces:**

- Documents the supported identity, rollout records, exclusions, diagnostics, and
  session-reference behavior.

- [ ] **Step 1: Update provider/transcript documentation**

State exact key precedence, native rollout path grammar, counted record families,
injection exclusions, and each diagnostic code. State explicitly that no historical
backfill occurs.

- [ ] **Step 2: Run issue-specific verification**

```bash
node --test scripts/providers/tests/registry.test.mjs \
  scripts/providers/tests/transcript-resolver.test.mjs \
  scripts/task-tracker/tests/unit/lib/session-id-resolution.test.mjs
node --test scripts/task-tracker/tests/unit/lib/word-counter-codex.test.mjs
node --test scripts/task-tracker/tests/unit/lib/word-counter.test.mjs \
  scripts/task-tracker/tests/unit/lib/word-counter-full-expansion.test.mjs
node --test scripts/task-tracker/tests/integration/lib/codex-word-marker-lifecycle.integration.test.mjs
```

Expected: every command exits 0.

- [ ] **Step 3: Run repository quality gates**

```bash
npm run lint
npm run format:check
```

Expected: both exit 0 and leave the tree unchanged.

- [ ] **Step 4: Commit documentation and baseline-only changes**

```bash
git add docs/guides/settings-guide.md docs/architecture/body-markers.md \
  scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs
git commit -m "docs(timing): document Codex word markers [#1092]"
```

- [ ] **Step 5: Run the governed lifecycle**

```bash
npx aitm commit-trace 1092
npx aitm test 1092
npx aitm review 1092
```

Expected: clean-sandbox Test receipts, Review with no standard command rerun, and
all #1092 proof checkboxes eligible for genuine stamps.
