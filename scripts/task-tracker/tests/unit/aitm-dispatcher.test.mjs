// @story #413
// #413 — `aitm` orchestrator dispatcher + registry contract.
//
// One test per acceptance criterion. Behavioral ACs spawn `node bin/aitm.mjs`
// (or a target script) as a child so the test exercises the real CLI surface,
// not just the in-process functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  VERBS,
  SCRIPTS,
  INTERNAL,
  kind,
  groupedListing,
} from '../../../../bin/aitm-registry.mjs';
import { findOffendingDocLines } from '../../lib/aitm-path-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const AITM = path.join(ROOT, 'bin', 'aitm.mjs');

function runNode(file, args, opts = {}) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    ...opts,
  });
}
const aitm = (args, opts) => runNode(AITM, args, opts);

// AC1 — listing is grouped, names only, no filepath / node_modules leakage.
test('AC1: `aitm` and `aitm help` print a grouped, names-only registry', () => {
  for (const argv of [[], ['help']]) {
    const r = aitm(argv);
    assert.equal(r.status, 0, `exit for ${JSON.stringify(argv)}`);
    const out = r.stdout;
    for (const group of ['Workflow', 'GitHub', 'Reports', 'Maintenance']) {
      assert.match(out, new RegExp(`${group}:`), `group ${group} present`);
    }
    assert.match(out, /Workflow verbs/);
    assert.ok(!out.includes('node_modules'), 'no node_modules substring');
    assert.ok(!out.includes('.mjs'), 'no .mjs filepath substring');
    // A sampled command name still shows up by bare name.
    assert.match(out, /set-priority/);
  }
});

// AC2 — a known verb is delegated to task-tracker.mjs and the child exit code
// passes through unchanged (compared against invoking task-tracker directly).
test('AC2: verb delegation passes the child exit code through unchanged', () => {
  const tt = path.join(ROOT, 'scripts', 'task-tracker', 'task-tracker.mjs');
  const direct = runNode(tt, ['promote']); // no args → deterministic usage exit, offline
  const viaAitm = aitm(['promote']);
  assert.equal(kind('promote'), 'verb');
  assert.equal(
    viaAitm.status,
    direct.status,
    'aitm <verb> exit code matches direct task-tracker invocation'
  );
  // It was routed (not caught by the dispatcher's unknown-command path).
  assert.ok(!viaAitm.stderr.includes('unknown command'), 'verb not treated as unknown');
});

// AC3 — a script name routes to the corresponding standalone script.
test('AC3: `aitm <script-name>` routes to the exposed standalone script', () => {
  assert.equal(kind('set-priority'), 'script');
  const r = aitm(['set-priority', 'help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Set the Priority field/, 'output came from set-priority self-doc');
  // Unknown command, by contrast, is the dispatcher's own exit 2.
  const unknown = aitm(['definitely-not-a-command']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown command/);
});

// AC4 — `aitm <name> help` and `aitm <name> ?` forward the help token; the
// target prints its full API plus who-should-call-it docs.
test('AC4: help/? forward to the target which self-documents', () => {
  for (const token of ['help', '?']) {
    const r = aitm(['set-priority', token]);
    assert.equal(r.status, 0, `exit for token ${token}`);
    assert.match(r.stdout, /Usage:/, 'API/usage present');
    assert.match(r.stdout, /Audience:/, 'who-should-call-it present');
  }
});

// AC5 — move-state is NOT exposed, and the rationale is documented.
test('AC5: move-state is excluded with a documented rationale', () => {
  assert.ok(!('move-state' in SCRIPTS), 'not in exposed scripts');
  assert.ok(!VERBS.has('move-state'), 'not a verb');
  assert.equal(kind('move-state'), null);
  assert.ok(INTERNAL['move-state'], 'documented in INTERNAL');
  assert.match(
    INTERNAL['move-state'].reason,
    /audited|promote|demote/i,
    'rationale names the audited-mutator / promote-demote reason'
  );
});

// AC6 — pure-plumbing scripts are excluded AND carry a do-not-invoke-directly
// header naming their intended caller.
test('AC6: plumbing scripts are excluded and carry a do-not-invoke header', () => {
  const plumbing = {
    'hook-handler': 'scripts/task-tracker/hook-handler.mjs',
    'bash-guard': 'scripts/task-tracker/bash-guard.mjs',
    'activity-guard': 'scripts/task-tracker/activity-guard.mjs',
    'agent-guard': 'scripts/task-tracker/agent-guard.mjs',
    'state-machine': 'scripts/task-tracker/state-machine.mjs',
    'issue-field-db': 'scripts/task-tracker/issue-field-db.mjs',
    'commit-trail-handler': 'scripts/task-tracker/commit-trail-handler.mjs',
    'source-edit-gate': 'scripts/task-tracker/source-edit-gate.mjs',
    'epic-base-edit-guard': 'scripts/task-tracker/epic-base-edit-guard.mjs',
    'move-state': 'scripts/gh/move-state.mjs',
  };
  for (const [name, rel] of Object.entries(plumbing)) {
    assert.ok(!(name in SCRIPTS), `${name} not exposed`);
    assert.ok(INTERNAL[name], `${name} documented in INTERNAL`);
    const head = readFileSync(path.join(ROOT, rel), 'utf8').slice(0, 600);
    assert.match(head, /INTERNAL/, `${name} header marked INTERNAL`);
    assert.match(
      head,
      /DO NOT INVOKE DIRECTLY|imported, never executed/,
      `${name} header states the invocation rule`
    );
  }
});

// AC7 — every exposed script supports help/? and prints non-empty API docs.
test('AC7: every exposed script self-documents on help', () => {
  for (const [name, doc] of Object.entries(SCRIPTS)) {
    const file = path.join(ROOT, doc.path);
    assert.ok(existsSync(file), `${name} → ${doc.path} exists`);
    const r = runNode(file, ['help']);
    assert.equal(r.status, 0, `${name} help exit 0`);
    assert.ok(r.stdout.trim().length > 0, `${name} help non-empty`);
    assert.match(r.stdout, /Usage:|Audience:/, `${name} help shows API/audience`);
  }
});

// AC8 — no operator-facing doc instructs invoking a script by a
// `node node_modules/ai-task-manager/scripts/...` path.
test('AC8: docs do not instruct direct node_modules script invocation', () => {
  const docFiles = [];
  const claudeMd = path.join(ROOT, 'CLAUDE.md');
  if (existsSync(claudeMd)) docFiles.push(claudeMd);

  const guidesDir = path.join(ROOT, 'docs', 'guides');
  if (existsSync(guidesDir)) {
    for (const f of readdirSync(guidesDir))
      if (f.endsWith('.md')) docFiles.push(path.join(guidesDir, f));
  }

  const adapterRoots = [path.join(ROOT, 'skill')];
  const walkSkill = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walkSkill(p);
      else if (entry.name === 'SKILL.md') docFiles.push(p);
    }
  };
  for (const r of adapterRoots) walkSkill(r);

  // Exception: hook-runner wiring legitimately names the real plumbing filepath.
  // The Claude hook runner invokes hook-handler.mjs by direct path — it is NOT an
  // `aitm` command, so settings.json examples must keep the node_modules path. The
  // detector + hook-wiring carve-out live in the #487 guard lib (single boundary).
  const offenders = docFiles.filter(
    (f) => findOffendingDocLines(readFileSync(f, 'utf8')).length > 0
  );
  assert.deepEqual(
    offenders.map((f) => path.relative(ROOT, f)),
    [],
    'no doc should instruct a direct node_modules/.../scripts invocation'
  );
});

// AC9 — package.json registers the aitm bin.
test('AC9: package.json registers the aitm bin at bin/aitm.mjs', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.bin?.aitm, 'bin/aitm.mjs');
});

// Sanity: REPO_ROOT from the registry resolves to the same repo root.
test('registry REPO_ROOT matches the test-derived root', () => {
  assert.equal(path.resolve(REPO_ROOT), path.resolve(ROOT));
  const { verbs, scriptGroups } = groupedListing();
  assert.ok(verbs.length > 0, 'verbs parsed');
  assert.ok(Object.keys(scriptGroups).length > 0, 'script groups built');
});
