<!-- @story #1321 -->

<!-- cspell:ignore EEXIST -->

# Grok Provider Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Grok Build TUI a first-class AITM provider while enforcing one bound session per issue and a session-scoped, fail-closed co-review reviewer write boundary.

**Architecture:** Extend the pure-data provider registry with a Grok row and declarative install recipe, then route installation, transcript lookup, and session identity through provider capabilities rather than provider-name branches. Normalize native Grok hooks through one bridge into the existing Claude-shaped handlers. Keep occupancy and co-review authority in main-worktree-anchored, atomically written fleet files, and make every write guard consult the same session-bound reviewer grant before chore mode or `.tmp/**` allowances.

**Tech Stack:** Node.js 22+ ESM, `node:test`, synchronous filesystem primitives and directory locks, JSON/JSONL, Git worktree discovery, Claude/Codex/Grok project hook files, Prettier, ESLint, Markdownlint, and CSpell.

**Source spec:** `docs/superpowers/specs/2026-08-18-grok-provider-adapter-design.md` at accepted artifact commit `5fa6e0b425e4239fcd803e338babb247fafc670c`.

## Global Constraints

- Provider adapters remain pure data modules with no imports or side effects; call sites iterate `listProviders()` and do not add `if (name === 'grok')` ladders.
- Registration and detection order is exactly Grok, Codex, Claude; Claude remains the no-signal fallback.
- Default install means every registered provider. `--agent all`, comma-separated names, and repeated `--agent` select additive subsets; `--agent both` is rejected.
- Installation is additive and idempotent. A subset never deletes another host, and hook entries deduplicate by exact bridge command string.
- Do not write `~/.grok/config.toml` or `~/.grok/hooks`; Grok project hooks live only at `.grok/hooks/aitm.json` and require folder trust.
- Missing `GROK_SESSION_ID` in a Grok tool process fails closed for bind, occupancy, and transcript lookup; never use `default-session` or a latest-session file for Grok.
- Native Grok hook envelopes are camelCase with snake_case event values; shared handlers continue to receive Claude-shaped snake_case fields and PascalCase event values.
- One issue has at most one bound session. Pause retains occupancy; stop and close release it. There is no TTL steal.
- Co-review reviewer grants match protocol, role, provider, sid, worktree, and one pending review path; worktree-only and path-only grants are forbidden.
- Occupancy/index/protocol authority writes are denied before chore mode and before `.tmp/**`; malformed `apply_patch` input fails closed.
- Assignment policy `#1212` and cross-clone lease gap `#1048` remain unchanged.
- Synthetic fixtures only; tests never read live `~/.grok/sessions`.
- Commits use the `[#1321]` subject token.
- Develop verification is `node scripts/task-tracker/verify-develop.mjs`, not `npm run test:all`.

## Delivery topology

- **Child delivery stream 1 — Grok provider module:** Tasks 1–5 plus the Grok/install documentation in Task 9. It can ship first and provides honest Grok detection, hooks, and word counting.
- **Child delivery stream 2 — occupancy and co-review gate:** Tasks 6–8 plus the occupancy documentation in Task 9. Until it lands, operators keep one editing provider per worktree by convention.
- **Epic integration:** Task 9 runs the cross-stream checks on the integrated `#1321` branch. Neither child changes `#1212` or attempts `#1048`.

---

### Task 1: Extend the pure-data provider contract and add the Grok skill

**Files:**

- Modify: `scripts/providers/provider-adapter.mjs`
- Modify: `scripts/providers/claude.mjs`
- Modify: `scripts/providers/codex.mjs`
- Create: `scripts/providers/grok.mjs`
- Modify: `scripts/providers/index.mjs`
- Create: `skill/adapters/grok/SKILL.md`
- Modify: `bin/lib/stamp-skill-version.mjs`
- Modify: `scripts/tests/unit/providers/registry.test.mjs`
- Modify: `scripts/tests/unit/providers/parity.test.mjs`
- Modify: `scripts/tests/unit/providers/skill-version-stamp.test.mjs`

**Interfaces:**

- `ProviderAdapter.transcriptLayout` becomes `'flat' | 'date-bucketed' | 'cwd-session-dir' | null`.
- `ProviderAdapter.transcriptSchema` adds `'grok-chat-v1'`.
- Add `transcriptHomeEnv: string | null`, `transcriptHomeDefault: string | null`, `sessionIdFallback: 'legacy' | 'required'`, and `installRecipe: { writer: 'claude-settings' | 'codex-hooks' | 'grok-hooks'; hookTarget: string | null; commandTarget: string | null }`.
- `listProviders()` returns `['grok', 'codex', 'claude']`; `detectProvider()` uses that exact precedence.
- `SKILL_DETAIL_FILES` adds `{ id: 'grok-adapter', pkgRelPath: getProvider('grok').skillAdapterPath }` and contains exactly five entries.

- [ ] **Step 1: Add failing Grok registry and parity tests**

Add explicit literal assertions rather than snapshots:

```js
assert.equal(getProvider('grok'), grokAdapter);
assert.deepEqual(listProviders(), ['grok', 'codex', 'claude']);
assert.equal(detectProvider({ env: { GROK_SESSION_ID: 'g-1' } }).name, 'grok');
assert.equal(detectProvider({ env: { GROK_AGENT: '1' } }).name, 'grok');
assert.equal(detectProvider({ env: { GROK_AGENT: '1', CODEX_THREAD_ID: 'c-1' } }).name, 'grok');
assert.throws(() => getProvider('unknown'), /Known providers: grok, codex, claude/);
```

Extend both existing adapter baselines with the four new fields so Claude and Codex parity is explicit.

Add failing skill-version assertions that pin the new closed-list entry and the
install-time stamp behavior:

```js
const grokEntry = SKILL_DETAIL_FILES.find((entry) => entry.id === 'grok-adapter');
assert.equal(grokEntry.pkgRelPath, getProvider('grok').skillAdapterPath);
assert.equal(SKILL_DETAIL_FILES.length, 5);
```

Use a temporary package tree with `skill/adapters/grok/SKILL.md`, call
`stampAllSkillVersions`, and assert the Grok result is `stamped` and the copied
skill contains `<!-- aitm-skill-version: 1.2.3 -->`.

- [ ] **Step 2: Run the registry tests and verify RED**

```bash
node scripts/tests/unit/providers/registry.test.mjs
node scripts/tests/unit/providers/parity.test.mjs
node scripts/tests/unit/providers/skill-version-stamp.test.mjs
```

Expected: failures because `grok.mjs`, the expanded adapter properties, and the
`grok-adapter` stamp entry do not exist.

- [ ] **Step 3: Expand the adapter typedef and existing rows**

Keep the modules data-only. Claude and Codex use `sessionIdFallback: 'legacy'`, null transcript-home overrides, and their current writer kinds:

```js
transcriptHomeEnv: null,
transcriptHomeDefault: null,
sessionIdFallback: 'legacy',
installRecipe: {
  writer: 'codex-hooks',
  hookTarget: '.codex/hooks.json',
  commandTarget: null,
},
```

Claude uses `writer: 'claude-settings'`, `hookTarget: '.claude/settings.json'`, and `commandTarget: '.claude/commands/task.md'`.

- [ ] **Step 4: Add the Grok adapter and registration order**

Create the exact row:

```js
/** @type {import('./provider-adapter.mjs').ProviderAdapter} */
export const grokAdapter = {
  name: 'grok',
  installTarget: '.grok/skills/task',
  stateDir: '.tmp/aitm/app/grok',
  transcriptLocator: 'sessions',
  transcriptHomeEnv: 'GROK_HOME',
  transcriptHomeDefault: '.grok',
  transcriptLayout: 'cwd-session-dir',
  transcriptSchema: 'grok-chat-v1',
  sessionIdEnvKeys: ['GROK_SESSION_ID'],
  detectionEnvKeys: ['GROK_SESSION_ID', 'GROK_AGENT'],
  sessionIdFallback: 'required',
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/grok/SKILL.md',
  installRecipe: {
    writer: 'grok-hooks',
    hookTarget: '.grok/hooks/aitm.json',
    commandTarget: null,
  },
};
```

Import it first in `scripts/providers/index.mjs` and freeze the registry in Grok/Codex/Claude order.

- [ ] **Step 5: Add the thin Grok skill adapter and version stamp**

Mirror the Codex load-once pattern with `grok-adapter` as the sentinel id, route to `skill/shared/router.md`, set `user-invocable: true`, and state only these host facts: `.grok/skills/task`, `.grok/hooks`, native `/task`, project trust, and no assumption that `.codex/hooks.json` loads.

Add the matching `grok-adapter` row to `SKILL_DETAIL_FILES` using
`getProvider('grok').skillAdapterPath`. Keep the existing four rows unchanged.

- [ ] **Step 6: Run focused tests and commit**

```bash
node scripts/tests/unit/providers/registry.test.mjs
node scripts/tests/unit/providers/parity.test.mjs
node scripts/tests/unit/providers/skill-version-stamp.test.mjs
git add scripts/providers skill/adapters/grok/SKILL.md bin/lib/stamp-skill-version.mjs scripts/tests/unit/providers/registry.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
git commit -m "[#1321] feat: register the Grok provider adapter"
```

### Task 2: Replace the hardcoded install selector with registry-driven additive installation

**Files:**

- Create: `bin/lib/provider-selection.mjs`
- Modify: `bin/cli.mjs`
- Modify: `skill/adapters/codex/SKILL.md`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs`
- Modify: `scripts/tests/unit/providers/registry.test.mjs`

**Interfaces:**

- Export `parseProviderSelection(args, knownProviders)` returning an ordered array of unique provider names.
- No `--agent` and `--agent all` return every registered provider; repeated/comma-separated flags form one ordered subset.
- `installProvider(adapter, targetDir, linkMode, options)` dispatches on `adapter.installRecipe.writer`, never `adapter.name`.
- Export `patchGrokHooksJson(hooksPath, options)` and `grokHookCommand(handlerName)` from `bin/cli.mjs` for focused tests.

- [ ] **Step 1: Add failing selection and install matrix tests**

Pin the complete selection contract:

```js
assert.deepEqual(parseProviderSelection([], known), known);
assert.deepEqual(parseProviderSelection(['--agent', 'all'], known), known);
assert.deepEqual(parseProviderSelection(['--agent', 'grok'], known), ['grok']);
assert.deepEqual(parseProviderSelection(['--agent', 'claude,grok', '--agent', 'codex'], known), [
  'claude',
  'grok',
  'codex',
]);
assert.throws(() => parseProviderSelection(['--agent', 'both'], known), /grok, codex, claude/);
assert.throws(() => parseProviderSelection(['--agent', 'x'], known), /Unknown --agent/);
```

Add temporary-project integration cases proving default install creates all three skill targets, subset install leaves other host files byte-identical, and a second Grok install does not duplicate bridge commands.

- [ ] **Step 2: Run focused installer tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs
```

Expected: failures on the default, Grok target, repeated option, and `both` refusal cases.

- [ ] **Step 3: Implement provider selection without changing generic option parsing**

Scan all `--agent` occurrences so repeated flags work:

```js
export function parseProviderSelection(args, knownProviders) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--agent') continue;
    const raw = args[index + 1];
    if (!raw || raw.startsWith('--')) throw new Error('Missing value for --agent');
    values.push(
      ...raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    );
    index += 1;
  }
  if (values.length === 0 || values.includes('all')) {
    if (values.some((value) => value !== 'all')) throw new Error('--agent all cannot be mixed');
    return [...knownProviders];
  }
  const selected = [...new Set(values)];
  const unknown = selected.filter((value) => !knownProviders.includes(value));
  if (unknown.length)
    throw new Error(`Unknown --agent ${unknown.join(', ')}; known: ${knownProviders.join(', ')}`);
  return selected;
}
```

- [ ] **Step 4: Implement declarative writer dispatch and Grok output**

Replace the `claude|codex|both` branches with:

```js
const INSTALL_WRITERS = Object.freeze({
  'claude-settings': installClaude,
  'codex-hooks': installCodex,
  'grok-hooks': installGrok,
});

function installProvider(adapter, targetDir, linkMode, options) {
  const writer = INSTALL_WRITERS[adapter.installRecipe.writer];
  if (!writer) throw new Error(`Unsupported install writer: ${adapter.installRecipe.writer}`);
  writer(targetDir, linkMode, { ...options, adapter });
}
```

Make each existing installer consume its supplied adapter. `installGrok` writes the skill stub/symlink and patches only `.grok/hooks/aitm.json`. `patchGrokHooksJson` preserves unrelated JSON and deduplicates every entry by exact `grokHookCommand(handlerName)` string.

Remove the obsolete Codex adapter statement that names `--agent both`; describe Claude files as present only when Claude is among the selected providers.

- [ ] **Step 5: Preserve Codex Superpowers selection semantics**

Compute `selectedNames.includes('codex')` once. Run Codex Superpowers setup only when Codex is selected; never let a Grok-only subset add or remove Codex bootstrap files.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs
node scripts/tests/unit/providers/registry.test.mjs
git add bin/cli.mjs bin/lib/provider-selection.mjs skill/adapters/codex/SKILL.md scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs scripts/tests/unit/providers/registry.test.mjs
git commit -m "[#1321] feat: install registered providers additively"
```

### Task 3: Normalize native Grok hooks through a fail-closed wire bridge

**Files:**

- Create: `scripts/task-tracker/hooks/grok-wire.mjs`
- Modify: `bin/cli.mjs`
- Create: `scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs`

**Interfaces:**

- Export `normalizeGrokEnvelope(input)`, `translateGrokDecision(result)`, and `runGrokHandler(options)`.
- CLI form: `node scripts/task-tracker/hooks/grok-wire.mjs --handler <seed|timing|memory-index|bash-guard|activity-guard|source-edit-gate|agent-guard>`.
- Normalized payload fields are `hook_event_name`, `session_id`, `tool_name`, `tool_input`, `prompt_id`, and `event_timestamp`.
- A shared `block` result becomes Grok `deny` with exit 2. Missing bridge/handler is exit 2; other handler crashes fail open with a stderr diagnostic.

- [ ] **Step 1: Add failing native-envelope unit and subprocess tests**

Use only synthetic input:

```js
const normalized = normalizeGrokEnvelope({
  hookEventName: 'pre_tool_use',
  sessionId: 'grok-sid',
  toolName: 'run_terminal_command',
  toolInput: { command: 'rm -rf /' },
  timestamp: '2026-08-18T20:00:00.000Z',
  promptId: 'prompt-1',
});
assert.equal(normalized.hook_event_name, 'PreToolUse');
assert.equal(normalized.session_id, 'grok-sid');
assert.equal(normalized.tool_name, 'Bash');
assert.equal(normalized.event_timestamp, '2026-08-18T20:00:00.000Z');
assert.equal(normalized.prompt_id, 'prompt-1');
assert.deepEqual(translateGrokDecision({ code: 0, stdout: '{"decision":"block","reason":"x"}' }), {
  code: 2,
  stdout: '{"decision":"deny","reason":"x"}',
});
```

This native-envelope case must use only `timestamp` and `promptId`, with no
`eventTimestamp`. Cover `search_replace`, `write`, `spawn_subagent`, SessionStart,
PreCompact, PostCompact, malformed input, missing handler, allow, block, and
handler crash.

- [ ] **Step 2: Run the hook tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs
```

Expected: module-not-found and missing native deny behavior.

- [ ] **Step 3: Implement normalization and allowlisted handler resolution**

Use fixed maps, not provider conditionals:

```js
const EVENTS = Object.freeze({
  session_start: 'SessionStart',
  pre_tool_use: 'PreToolUse',
  pre_compact: 'PreCompact',
  post_compact: 'PostCompact',
});
const TOOLS = Object.freeze({
  run_terminal_command: 'Bash',
  search_replace: 'Edit',
  write: 'Write',
  spawn_subagent: 'Agent',
});
```

Normalize the common identity fields without dropping either host spelling:

```js
session_id: input.sessionId ?? input.session_id,
prompt_id: input.promptId ?? input.prompt_id,
event_timestamp: input.timestamp ?? input.eventTimestamp ?? input.event_timestamp,
```

Resolve handlers from a frozen name-to-package-relative-path map, spawn Node with the normalized JSON on stdin, and preserve stdout/stderr separately.

- [ ] **Step 4: Translate shared decisions and generate the full Grok hook table**

Parse handler stdout only when non-empty JSON. Convert exactly `decision: 'block'` to `decision: 'deny'` and exit 2. Write SessionStart, PreCompact, PostCompact, Bash, edit, and agent entries using bridge command identity; include memory-index entries only when the existing seed opt-in is active. Pin these exact matcher strings in the generated hook table and installer tests:

```text
SessionStart: startup|resume|clear|compact
PreCompact: manual|auto
PostCompact: manual|auto
Bash: Bash
edits: Edit|Write|NotebookEdit|search_replace|write
agent: Agent|Task|spawn_subagent
```

`Bash` relies on Grok's alias for `run_terminal_command`; do not replace the
matcher with the native tool name.

- [ ] **Step 5: Prove installed commands are idempotent and native envelopes deny**

Run installer hook tests twice in one temporary project and assert one exact command per handler. Spawn the installed Bash/edit/agent command with native Grok envelopes and assert deny output plus exit 2.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --test scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs
git add scripts/task-tracker/hooks/grok-wire.mjs scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs bin/cli.mjs
git commit -m "[#1321] feat: bridge native Grok hooks"
```

### Task 4: Deduplicate double-fired timing hooks by normalized event identity

**Files:**

- Create: `scripts/task-tracker/lib/hook-idempotency.mjs`
- Modify: `scripts/task-tracker/hook-handler.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/hook-session-start.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs`

**Interfaces:**

- Export `hookStampKey({ sid, hookEventName, promptId, eventTimestamp })` and `claimHookStamp({ projectDir, ...identity })`.
- Stamp root is `<main-worktree>/.tmp/aitm/locks/`; creation uses exclusive `openSync(path, 'wx')`.
- Idempotency applies only to SessionStart, PreCompact, and PostCompact. Same identity returns `claimed: false`; a later timestamp returns `claimed: true`.

- [ ] **Step 1: Add failing key, duplicate, and later-event tests**

```js
assert.equal(first.claimed, true);
assert.equal(duplicate.claimed, false);
assert.equal(laterTimestamp.claimed, true);
assert.notEqual(sessionStart.stampPath, preCompact.stampPath);
```

Assert two worktrees resolve the same main-anchored stamp and that an injected stamp-write error prevents the flush and prints a diagnostic.

- [ ] **Step 2: Run focused hook-handler tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/hook-session-start.test.mjs scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
```

- [ ] **Step 3: Implement stable hashing and exclusive creation**

Hash a canonical JSON tuple containing sid, normalized event, `promptId || 'session'`, and event timestamp. Sanitize no raw sid into the filename; use `hook-event-<sha256>.stamp`. Treat `EEXIST` as a duplicate and every other write failure as an error.

- [ ] **Step 4: Gate only timing flush entrypoints**

After parsing the payload, normalize `event_timestamp ?? eventTimestamp ?? timestamp` and `prompt_id ?? promptId` before SessionStart/PreCompact/PostCompact work, then claim the stamp. Exit 0 on duplicate. On stamp error, skip the flush, write one stderr diagnostic, and return the hook's fail-closed error status. Leave seed-check and memory-index outside this gate.

- [ ] **Step 5: Run focused tests and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/hook-session-start.test.mjs scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs
git add scripts/task-tracker/lib/hook-idempotency.mjs scripts/task-tracker/hook-handler.mjs scripts/tests/unit/task-tracker/lib/hook-session-start.test.mjs scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
git commit -m "[#1321] fix: deduplicate provider timing hooks"
```

### Task 5: Add Grok session identity, transcript resolution, and word normalization

**Files:**

- Modify: `scripts/task-tracker/lib/session-id.mjs`
- Modify: `scripts/providers/transcript-resolver.mjs`
- Modify: `scripts/providers/transcript-normalizer.mjs`
- Modify: `scripts/task-tracker/word-counter.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/session-id-resolution.test.mjs`
- Modify: `scripts/tests/unit/providers/transcript-resolver.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs`

**Interfaces:**

- Export `SessionIdRequiredError` with `code: 'provider-session-id-required'`.
- `resolveSessionId({ env, transcriptDir })` preserves legacy fallback for adapters declaring `sessionIdFallback: 'legacy'`; a detected `required` provider uses only the explicit override and that adapter's session keys, then throws.
- `resolveTranscriptPath` adds `cwd` and `env` options and resolves `cwd-session-dir` as `<grok-home>/sessions/<encodeURIComponent(cwd)>/<sid>/chat_history.jsonl` only when the file exists.
- `normalizeTranscriptRecord(record)` recognizes Grok top-level `user`, `assistant`, `tool_result`, `reasoning`, and `system` records without filesystem access.

- [ ] **Step 1: Add failing session-id tests**

```js
assert.equal(
  resolveSessionId({ env: { AI_TASK_MANAGER_SESSION_ID: 'override', GROK_AGENT: '1' } }),
  'override'
);
assert.equal(resolveSessionId({ env: { GROK_AGENT: '1', GROK_SESSION_ID: 'g-2' } }), 'g-2');
assert.throws(
  () => resolveSessionId({ env: { GROK_AGENT: '1', CLAUDE_SESSION_ID: 'wrong' } }),
  (error) => error.code === 'provider-session-id-required' && /GROK_SESSION_ID/.test(error.message)
);
```

Retain the existing Claude/Codex modification-time and `default-session` parity cases.

- [ ] **Step 2: Add failing resolver and normalizer tests**

Create a synthetic home and write only `sessions/<encoded-cwd>/<sid>/chat_history.jsonl`. Assert `GROK_HOME` is treated as the home itself, the default joins `homedir + '.grok'`, an absent file returns null, and the Claude/Codex layouts remain unchanged.

For normalization, assert text from strings and `{type:'text', text}` arrays, one assistant body without `tool_calls` double-counting, tool-result text, and recognized-empty reasoning/system records. Unknown and malformed records return `{ events: [], recognized: false, schema: null }`.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/session-id-resolution.test.mjs scripts/tests/unit/providers/transcript-resolver.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs
```

- [ ] **Step 4: Implement declarative session fallback and Grok home resolution**

Resolve the active adapter once. For `required`, stop before scanning other providers, transcript modification times, or the literal fallback. In the transcript resolver use:

```js
const providerHome =
  adapter.transcriptHomeEnv && env[adapter.transcriptHomeEnv]
    ? env[adapter.transcriptHomeEnv]
    : adapter.transcriptHomeDefault
      ? path.join(homedir, adapter.transcriptHomeDefault)
      : homedir;
const root = path.join(providerHome, adapter.transcriptLocator);
const file = path.join(root, encodeURIComponent(cwd), sid, 'chat_history.jsonl');
return existsSync(file) ? file : null;
```

- [ ] **Step 5: Dispatch every non-flat layout through the resolver**

In `word-counter.jsonlPath`, preserve the historical flat path only for `transcriptLayout === 'flat'`. Send both `date-bucketed` and `cwd-session-dir` through `resolveTranscriptPath` with `cwd: projectDir()` and `env: process.env`; return `''` when no file exists so session-ref remains sid-only and word count is zero.

- [ ] **Step 6: Implement Grok record normalization**

Select Claude when `record.message` exists, Codex when `record.type === 'response_item'`, and Grok for the five top-level Grok types. Emit text/tool-result events only for countable content and recognized-empty results for reasoning/system. Never traverse `encrypted_content` or `updates.jsonl`.

- [ ] **Step 7: Run focused and bounded-memory regressions, then commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/session-id-resolution.test.mjs scripts/tests/unit/providers/transcript-resolver.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-codex.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-bounded-memory.test.mjs
git add scripts/providers scripts/task-tracker/lib/session-id.mjs scripts/task-tracker/word-counter.mjs scripts/tests/unit/providers scripts/tests/unit/task-tracker/lib/session-id-resolution.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs
git commit -m "[#1321] feat: read Grok session transcripts"
```

### Task 6: Add authoritative local occupancy and wire the task lifecycle

**Files:**

- Modify: `scripts/task-tracker/paths.mjs`
- Create: `scripts/task-tracker/lib/occupancy.mjs`
- Create: `scripts/task-tracker/verbs/occupancy.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `skill/shared/router.md`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Modify: `scripts/task-tracker/verbs/stop.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/verbs/update.mjs`
- Modify: `scripts/task-tracker/hook-handler.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/occupancy.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/two-sessions-same-issue.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/two-sessions-different-issues.test.mjs`

**Interfaces:**

- `occupancyPath(mainWorktreePath)` resolves `.tmp/aitm/fleet/occupancy.json`.
- Export `readOccupancy`, `claimOccupancy`, `rollbackOccupancyClaim`, `heartbeatOccupancy`, `releaseOccupancy`, and `forceReleaseOccupancy`.
- Row shape is `{ issue, sid, provider, worktreePath, boundAt, lastHeartbeatAt }`, keyed by normalized numeric issue string.
- `claimOccupancy(input, { coReviewAllowsWorktree = () => false })` is lock-protected, atomic, idempotent for the same issue/sid, and moves one sid from its prior issue.
- `/task occupancy --release #N` is the only v1 administrative recovery; no `--steal` and no TTL reap.

- [ ] **Step 1: Add failing pure occupancy tests**

Cover same-sid idempotence, same-sid issue switch, second-sid refusal, different-provider same-worktree refusal, allowed co-review dependency result, exact holder diagnostics, pause retention, stop/close release, heartbeat, corrupted JSON refusal, and forced release.

```js
assert.equal(first.status, 'claimed');
assert.equal(repeat.status, 'unchanged');
assert.throws(() => claim(otherSid), /provider=codex.*sid=abc123/);
assert.deepEqual(Object.keys(readOccupancy(file)), ['1321']);
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/occupancy.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-same-issue.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-different-issues.test.mjs
```

- [ ] **Step 3: Implement the store with the existing fleet lock**

Reuse `findMainWorktreePath`, `withLock`, and same-directory temporary-file rename from `fleet-registry.mjs`. Do not reuse `readFleet` because occupancy is authority and malformed/unreadable JSON must throw rather than silently become `{}`.

- [ ] **Step 4: Claim before every bind mutation and roll back failed binds**

In every fresh/resume/switch branch, resolve `{ sid, provider, worktreePath }`, call `claimOccupancy` before `saveState` or remote timing mutation, and leave both local state and occupancy unchanged on refusal. The claim returns an exact previous-row snapshot. If any downstream timing, GitHub, or state write fails, call `rollbackOccupancyClaim`; it restores only when the current rows still exactly equal this claim, so it cannot erase a later process's valid claim. Add injected-failure tests for fresh bind and issue switch. Pass a default co-review predicate that returns false until Task 7 wires the index.

- [ ] **Step 5: Preserve on pause and release on stop/close**

Do not call occupancy release from `pause.mjs`. In `stop.mjs` and every successful close path, release the active issue only after required timing/GitHub work succeeds but before printing success. A terminal-review stop that intentionally keeps the binding must also keep occupancy.

- [ ] **Step 6: Add heartbeat and recovery command**

Call heartbeat from SessionStart and successful `/task update`. Add `occupancy --release #N` parsing, help, and router coverage; require an exact issue number and print the released provider/sid prefix. Explicitly reject `--steal`.

- [ ] **Step 7: Run focused lifecycle tests and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/occupancy.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-same-issue.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-different-issues.test.mjs
git add scripts/task-tracker/paths.mjs scripts/task-tracker/lib/occupancy.mjs scripts/task-tracker/verbs/occupancy.mjs scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/verbs/resume.mjs scripts/task-tracker/verbs/switch.mjs scripts/task-tracker/verbs/stop.mjs scripts/task-tracker/verbs/close.mjs scripts/task-tracker/verbs/update.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/hook-handler.mjs skill/shared/router.md scripts/tests/unit/task-tracker/lib/occupancy.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-same-issue.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-different-issues.test.mjs
git commit -m "[#1321] feat: enforce local issue occupancy"
```

### Task 7: Register co-review protocols and bind reviewer claims to provider sessions

**Files:**

- Modify: `scripts/task-tracker/paths.mjs`
- Create: `scripts/review/lib/index.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/review/lib/archive.mjs`
- Modify: `scripts/review/co-review.mjs`
- Modify: `scripts/task-tracker/lib/occupancy.mjs`
- Create: `scripts/tests/unit/review/co-review-index.test.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`

**Interfaces:**

- `coReviewIndexPath(mainWorktreePath)` resolves `.tmp/aitm/fleet/co-review-index.json`.
- Export `registerProtocol`, `recordReviewerClaim`, `markProtocolLifecycle`, `readProtocolIndex`, `resolveReviewerGrant`, and `isActiveCoReviewWorktree`.
- Index rows contain `{ protocolId, dir, worktree, owner, reviewer, lifecycle, artifact, pendingReviewPath, claimedRole, claimedProvider, claimedSid }`.
- Reviewer claim fails unless `detectProvider()` and `resolveSessionId()` produce a real provider/sid. Owner claims preserve existing identity behavior.
- Grant resolution re-runs live protocol integrity; an index row alone never authorizes a write.

- [ ] **Step 1: Add failing index lifecycle tests**

Assert custom ignored `--dir` registration, main-worktree anchoring across sibling worktrees, exact idempotent repair, conflicting registration refusal, reviewer claim fields, terminal lifecycle invalidation, and stale-row denial when protocol state/events fail integrity.

- [ ] **Step 2: Add failing claim identity tests**

```js
assert.throws(() => reviewerClaim({ env: {} }), /provider-session-id-required/);
assert.deepEqual(readProtocolIndex(file)[protocolId], {
  ...registered,
  pendingReviewPath: `${dir}/round-2-reviewer-review.md`,
  claimedRole: 'reviewer',
  claimedProvider: 'grok',
  claimedSid: 'grok-reviewer-sid',
});
```

Prove a different sid/provider in the same worktree receives no grant.

- [ ] **Step 3: Run focused co-review tests and verify RED**

```bash
node --test scripts/tests/unit/review/co-review-index.test.mjs scripts/tests/unit/review/co-review.test.mjs
```

- [ ] **Step 4: Implement lock-protected registration and lifecycle projection**

Use the fleet lock and atomic rename. Register after successful protocol initialization; allow an exact retry to repair a missing row. After handoff/finalize, project the resulting lifecycle. Because cross-file writes cannot be one transaction, `resolveReviewerGrant` must treat protocol state/events as authority and deny any mismatched or terminal row.

- [ ] **Step 5: Record reviewer session identity during claim**

At the CLI boundary resolve provider/sid only when `state.currentRole === 'reviewer'`. Prepare the exact index claim first, then call `claimTurn`: the row is inert until live protocol state contains the matching durable reviewer claim, and an interrupted protocol claim can retry the same index preparation idempotently. Compute the pending filename from the claimed round before the file exists. Never durably claim the reviewer turn first and then strand it behind a failed index write.

- [ ] **Step 6: Wire the co-review occupancy exception**

Replace Task 6's default-false predicate with `isActiveCoReviewWorktree({ worktreePath })`. This permits two providers in one worktree only while a live, integrity-valid protocol is active; it never permits two sessions to bind the same issue.

- [ ] **Step 7: Run focused tests and commit**

```bash
node --test scripts/tests/unit/review/co-review-index.test.mjs scripts/tests/unit/review/co-review.test.mjs scripts/tests/unit/task-tracker/lib/occupancy.test.mjs
git add scripts/review/lib/index.mjs scripts/review/lib/protocol.mjs scripts/review/lib/start.mjs scripts/review/lib/archive.mjs scripts/review/co-review.mjs scripts/task-tracker/paths.mjs scripts/task-tracker/lib/occupancy.mjs scripts/tests/unit/review/co-review-index.test.mjs scripts/tests/unit/review/co-review.test.mjs scripts/tests/fixtures/co-review-fixture.mjs scripts/tests/unit/task-tracker/lib/occupancy.test.mjs
git commit -m "[#1321] feat: index session-bound co-review claims"
```

### Task 8: Enforce the reviewer grant across Edit, Write, apply_patch, and Bash

**Files:**

- Create: `scripts/task-tracker/lib/mutation-targets.mjs`
- Create: `scripts/task-tracker/lib/co-review-write-policy.mjs`
- Modify: `scripts/task-tracker/source-edit-gate.mjs`
- Modify: `scripts/task-tracker/activity-guard.mjs`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/bash-guard-tmp-contract.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`

**Interfaces:**

- Export `extractApplyPatchTargets(patchText)` returning every create/update/delete/source/destination path or throwing `MutationParseError`.
- Export `extractBashWriteTargets(command, projectRoot)` returning normalized write destinations recognized by redirection, `tee`, and write-oriented commands, plus an `ambiguousMutation` flag.
- Export `evaluateCoReviewWrite({ projectDir, provider, sid, toolName, targets })` returning `{ decision: 'allow' | 'deny' | 'not-applicable', reason, code }`.
- The pending review path is canonicalized with `realpath(registeredDir) + basename` before creation and exact `realpath(target)` after creation.

- [ ] **Step 1: Add failing patch parser tests**

Cover `*** Add File`, `*** Update File`, `*** Delete File`, `*** Move to`, multi-file patches, absolute/relative paths, duplicate targets, traversal, missing headers, unsupported headers, and malformed input. Mixed pending-review plus source targets must remain a single denied operation.

- [ ] **Step 2: Add failing reviewer-policy tests**

Pin these cases for native Codex envelopes and direct policy calls:

```js
assert.equal(pendingOnly.decision, 'allow');
assert.equal(sourcePatch.decision, 'deny');
assert.equal(authorityPatch.decision, 'deny');
assert.equal(mixedPatch.decision, 'deny');
assert.equal(malformedPatch.decision, 'deny');
assert.equal(otherSid.decision, 'deny');
assert.equal(terminalProtocol.decision, 'deny');
```

Also prove another `.tmp/**` file is denied during the reviewer claim and first creation/later realpath checks reject symlink drift.

- [ ] **Step 3: Run focused guard tests and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs scripts/tests/unit/task-tracker/core/bash-guard-tmp-contract.test.mjs
```

- [ ] **Step 4: Implement shared target extraction and authority ordering**

Add `apply_patch` to `GATED_TOOLS` and to activity classification. Parse every target before policy evaluation; unparseable patches block. Call `evaluateCoReviewWrite` before installed-guard checks, chore mode, `.tmp/**`, bound-issue state, or activity-matrix allowances.

- [ ] **Step 5: Protect authority files in every guard**

Always deny occupancy/index and all registered protocol files except the exact session-bound pending path. The pending exception applies only to the claimed reviewer provider/sid. A model-visible index row never bypasses live protocol integrity.

- [ ] **Step 6: Enforce Bash mutation targets before normal path scope**

Move Bash write-target extraction into the shared helper, normalize relative paths against project root, and call the co-review policy before the ordinary project-root allowlist. While a reviewer grant is active, deny any mutating Bash command whose complete destinations cannot be proven; do not let `node -e`, shell indirection, command substitution, or an unparsed writer fall through. Preserve all current dangerous-command, GitHub mutation, worktree-binding, and read-scope rules.

- [ ] **Step 7: Run focused guards and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs scripts/tests/unit/task-tracker/core/bash-guard-tmp-contract.test.mjs
git add scripts/task-tracker/lib/mutation-targets.mjs scripts/task-tracker/lib/co-review-write-policy.mjs scripts/task-tracker/source-edit-gate.mjs scripts/task-tracker/activity-guard.mjs scripts/task-tracker/bash-guard.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs scripts/tests/unit/task-tracker/core/bash-guard-tmp-contract.test.mjs
git commit -m "[#1321] fix: enforce co-review writer isolation"
```

### Task 9: Document the operator contract and run integrated verification

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/DESIGN.md`
- Create: `docs/guides/grok-provider.md`
- Modify: `docs/guides/github-native-coordination.md`
- Modify: `scripts/tests/unit/providers/coverage-provider-adapter.test.mjs`
- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs`

**Interfaces:** none; this task documents and verifies the completed public behavior.

- [ ] **Step 1: Add failing documentation/package assertions**

Pin that package coverage reaches `grok.mjs`, `grok-wire.mjs`, occupancy/index modules, new focused tests, and the Grok guide. Assert public docs mention default all-provider install, subset syntax, no `both`, `/hooks-trust`, one issue/one session, pause retention, stop release, worktree isolation, and unbound reviewers.

- [ ] **Step 2: Run documentation/package tests and verify RED**

```bash
node --test scripts/tests/unit/providers/coverage-provider-adapter.test.mjs scripts/tests/unit/meta/package-test-corpus.test.mjs
```

- [ ] **Step 3: Update install and architecture documentation**

Change the README install table to Claude/Codex/Grok default behavior and `--agent <name>[,name]`. Add Grok to the provider table in `docs/DESIGN.md`, including its adapter, hook file, transcript layout, and required tool-env sid behavior.

- [ ] **Step 4: Add the Grok operator guide and coordination rules**

Document project trust via `/hooks-trust` or `--trust`, native `.grok/hooks/aitm.json`, expected Claude-compat double-fire, missing-sid refusal, occupancy diagnostics/release, one editing provider per worktree, and the co-review rule that reviewers stay unbound and write only the named review artifact. Link the guide from `docs/README.md`.

- [ ] **Step 5: Run all focused cross-stream tests**

```bash
node scripts/tests/unit/providers/registry.test.mjs
node scripts/tests/unit/providers/parity.test.mjs
node --test scripts/tests/unit/providers/transcript-resolver.test.mjs scripts/tests/unit/task-tracker/lib/session-id-resolution.test.mjs scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs scripts/tests/unit/task-tracker/lib/occupancy.test.mjs scripts/tests/unit/review/co-review-index.test.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
node --test scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/install-hooks.test.mjs scripts/tests/integration/task-tracker/lib/two-sessions-same-issue.test.mjs scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
```

Expected: all named tests pass with no live Grok home access.

- [ ] **Step 6: Run repository quality and Develop verification**

```bash
npm run format:check
npm run lint
node scripts/task-tracker/verify-develop.mjs
```

Expected: all commands exit 0. Do not substitute `npm run test:all` for the repository Develop verifier.

- [ ] **Step 7: Inspect scope and commit documentation**

```bash
git diff --check
git status --short
git diff --name-status
git add README.md docs/README.md docs/DESIGN.md docs/guides/grok-provider.md docs/guides/github-native-coordination.md scripts/tests/unit/providers/coverage-provider-adapter.test.mjs scripts/tests/unit/meta/package-test-corpus.test.mjs
git commit -m "[#1321] docs: publish the Grok provider workflow"
```

Expected: only the intended provider, installer, hook, transcript, occupancy, co-review, guard, test, and documentation files are present across the complete `#1321` branch.

## Spec coverage matrix

| Accepted spec area                                                  | Plan task                        |
| ------------------------------------------------------------------- | -------------------------------- |
| Pure-data Grok registry row, detection order, skill                 | Task 1                           |
| Default install-all, additive subsets, idempotent hooks, no `both`  | Task 2                           |
| Native Grok envelope mapping and deny translation                   | Task 3                           |
| Claude-compat/native double-fire timing idempotency                 | Task 4                           |
| Required Grok sid, home/layout/schema, zero-word missing file       | Task 5                           |
| One issue/session, worktree provider occupancy, pause/stop/recovery | Task 6                           |
| Main-anchored co-review index and exact reviewer claim identity     | Task 7                           |
| Authority protection, `apply_patch`, Bash, first/later path checks  | Task 8                           |
| Operator docs, package coverage, integrated verification            | Task 9                           |
| Preserve `#1212`; leave `#1048` out of scope                        | Global constraints and Tasks 6–9 |
