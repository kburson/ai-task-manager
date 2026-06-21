// @story #487
// #487 — bash-guard rail refusing direct `node node_modules/ai-task-manager
// /scripts/...` invocations of commands the `aitm` orchestrator already exposes.
//
// Pure-logic coverage of `evaluateAitmPath` + the doc-lint helper. The registry
// resolution is deterministic from repo source, so no process spawn is needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateAitmPath,
  isHookWiring,
  findOffendingDocLines,
  DIRECT_NODE_MODULES_RE,
} from '../../lib/aitm-path-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');

// AC1 — a direct path to an exposed support script is refused, and the steer
// message names the exact `npx aitm <name>` replacement.
test('AC1: refuses a direct exposed-script path, names npx aitm <name>', () => {
  const cmd =
    'node node_modules/ai-task-manager/scripts/gh/dispatch-prep.mjs 12 --description "go"';
  const res = evaluateAitmPath({ command: cmd });
  assert.equal(res.block, true);
  assert.match(res.reason, /npx aitm dispatch-prep/);
});

// AC1 — the verb hub resolves to a verb-named steer, surfacing the caller's verb.
test('AC1: refuses a direct verb-hub path, names the concrete verb', () => {
  const cmd = 'node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs promote 12';
  const res = evaluateAitmPath({ command: cmd });
  assert.equal(res.block, true);
  assert.match(res.reason, /npx aitm promote/);
});

// AC1 — absolute-path prefix before node_modules is still caught.
test('AC1: refuses an absolute-path-prefixed direct invocation', () => {
  const cmd =
    'node /repo/node_modules/ai-task-manager/scripts/gh/ensure-wave-parent.mjs --children 1,2';
  const res = evaluateAitmPath({ command: cmd });
  assert.equal(res.block, true);
  assert.match(res.reason, /npx aitm ensure-wave-parent/);
});

// AC6 — the sanctioned `npx aitm` form passes untouched.
test('AC6: allows the npx aitm form', () => {
  const res = evaluateAitmPath({ command: 'npx aitm dispatch-prep 12 --description "go"' });
  assert.equal(res.block, false);
});

// AC2 — hook-runner wiring by direct path is allowlisted via isHookWiring.
test('AC2: allows hook-runner wiring direct path (hook-handler.mjs)', () => {
  const cmd = 'node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs';
  const res = evaluateAitmPath({ command: cmd });
  assert.equal(res.block, false);
  assert.equal(isHookWiring(cmd), true);
});

// AC3 — a path mapping to no registry command is internal-only; not steered.
test('AC3: allows a non-aitm / unregistered script path', () => {
  const cmd = 'node node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs';
  const res = evaluateAitmPath({ command: cmd });
  assert.equal(res.block, false);
});

test('AC3: ignores a wholly unrelated command', () => {
  assert.equal(evaluateAitmPath({ command: 'git status' }).block, false);
});

// findOffendingDocLines: catches a forbidden line, skips the hook-wiring carve-out.
test('findOffendingDocLines flags direct paths but not hook wiring', () => {
  const text = [
    'node node_modules/ai-task-manager/scripts/gh/dispatch-prep.mjs 12',
    'node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs',
    'npx aitm promote 12',
  ].join('\n');
  const offenders = findOffendingDocLines(text);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /dispatch-prep/);
  assert.match(offenders[0], DIRECT_NODE_MODULES_RE);
});

// AC4 — no residual direct-path invocations of exposed commands remain in the
// skill docs, including router.md + rules/*.md (the set #487 broadens beyond
// AC8's SKILL.md-only scan).
test('AC4: skill docs (router.md + rules/*.md) carry no residual direct paths', () => {
  const docFiles = [];
  const router = path.join(ROOT, 'skill', 'shared', 'router.md');
  if (existsSync(router)) docFiles.push(router);
  const rulesDir = path.join(ROOT, 'skill', 'shared', 'rules');
  if (existsSync(rulesDir)) {
    for (const f of readdirSync(rulesDir))
      if (f.endsWith('.md')) docFiles.push(path.join(rulesDir, f));
  }
  const offenders = docFiles.filter(
    (f) => findOffendingDocLines(readFileSync(f, 'utf8')).length > 0
  );
  assert.deepEqual(
    offenders.map((f) => path.relative(ROOT, f)),
    [],
    'no skill doc should instruct a direct node_modules/.../scripts invocation'
  );
});
