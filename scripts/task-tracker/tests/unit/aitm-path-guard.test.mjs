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

// ---------------------------------------------------------------------------
// @story #572 — raw runtime-path-literal guard.
//
// AC1 of #572: every `.ai-task-manager/<runtime-file>` and `.claude/task-tracker`
// path literal in `scripts/**` (non-test) routes through a named `paths.mjs`
// helper; no raw literal survives outside `paths.mjs`. This block is the
// enforcement: it greps the live script tree for surviving FUNCTIONAL literals
// of the runtime FILE set (the artifacts #573/#574 relocate) and fails if any
// appear outside the explicit allowlist.
//
// The regex is deliberately scoped to the runtime FILE basenames (config,
// state, queue, fleet, lock, pickup, dod) and the runtime SUBDIRS (sessions/,
// locks/, scratch/) plus the legacy `.claude/task-tracker` prefix — NOT every
// `.ai-task-manager/*` string (provider stateDirs, project-fields.json, etc.
// are out of this story's move scope).
//
// Comment lines are skipped (they describe paths, they don't construct them).
// Remaining code-line occurrences must be in ALLOWLIST — each is a user-facing
// diagnostic message, an issue-body content constant, or a frozen one-shot
// fixture, NOT a live path-resolution site. A NEW functional literal anywhere
// in the core runtime fails this test loudly.
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = path.join(ROOT, 'scripts');

// #574 relocated pickup-directive.md / definition-of-done.md under
// `.ai-task-manager/templates/`, so the `templates/` segment is optional here —
// the guard must catch a raw literal at either the legacy or the new location.
const RUNTIME_LITERAL_RE =
  /\.ai-task-manager\/(task-tracker(-state|-queue)?\.json|task-fleet\.json|orchestrator\.lock|(?:templates\/)?pickup-directive\.md|(?:templates\/)?definition-of-done\.md|sessions\/|locks\/|scratch\/)|\.claude\/task-tracker/;

// Files whose surviving literal is a message / content constant / frozen
// fixture, not a path-construction site. Narrow and explicit so a reintroduced
// functional literal in any OTHER file fails loudly.
const LITERAL_ALLOWLIST = new Set([
  'gh/create-issue.mjs', // assignee-required diagnostic message
  'gh/lib/issue-body-verifier.mjs', // canonical `> Follow:` issue-body content constant + message
  'maintenance/verify-vocab-cleanup.mjs', // frozen #196 retirement fixture (CHECKS.file paths)
  'migrate/start-time-field.mjs', // one-shot migration NOTE message
  'task-tracker/lib/assignee-guard.mjs', // legacy `.claude/...` user hint message
  'task-tracker/lib/close-gates.mjs', // trunk-ref diagnostic message
  'task-tracker/migrate-fields-encoding.mjs', // missing-repo diagnostic message
  'task-tracker/preflight-issue.mjs', // `> Follow:` content + missing-template diagnostics
  'task-tracker/verbs/close.mjs', // "See .ai-task-manager/..." diagnostic message
  'task-tracker/verbs/review.mjs', // "See .ai-task-manager/..." diagnostic message
]);

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#');
}

function walkScripts(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      walkScripts(p, acc);
    } else if (/\.(mjs|sh)$/.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

test('AC1 (#572): no raw runtime-path literal survives outside paths.mjs + allowlist', () => {
  const offenders = [];
  for (const file of walkScripts(SCRIPTS_DIR)) {
    const rel = path.relative(SCRIPTS_DIR, file);
    if (rel.includes(`tests${path.sep}`)) continue; // test tree
    if (rel === path.join('task-tracker', 'paths.mjs')) continue; // the resolver itself
    const relPosix = rel.split(path.sep).join('/');
    if (LITERAL_ALLOWLIST.has(relPosix)) continue; // known message/content/fixture
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (RUNTIME_LITERAL_RE.test(line) && !isCommentLine(line)) {
        offenders.push(`${relPosix}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `raw runtime-path literal(s) must route through paths.mjs:\n${offenders.join('\n')}`
  );
});

test('AC1 (#572): allowlist is tight — every entry still carries a real occurrence', () => {
  const stale = [];
  for (const relPosix of LITERAL_ALLOWLIST) {
    const abs = path.join(SCRIPTS_DIR, relPosix);
    if (!existsSync(abs)) {
      stale.push(`${relPosix} (file missing)`);
      continue;
    }
    const hasCodeHit = readFileSync(abs, 'utf8')
      .split('\n')
      .some((line) => RUNTIME_LITERAL_RE.test(line) && !isCommentLine(line));
    if (!hasCodeHit) stale.push(`${relPosix} (no surviving literal — remove from allowlist)`);
  }
  assert.deepEqual(stale, [], `stale allowlist entries:\n${stale.join('\n')}`);
});
