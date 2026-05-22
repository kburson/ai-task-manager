#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, BUDGETS, SCENARIO_BUDGETS, SCENARIO_NAMES } from '../measure-context.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '..', 'measure-context.mjs');

// Programmatic API: foundational modes pass (Epic #114).
const idle = measure({ mode: 'idle' });
assert.equal(idle.status, 'OK', `idle ${idle.total} exceeded ${BUDGETS.idle}`);
assert.ok(idle.total <= BUDGETS.idle);

for (const adapter of ['claude', 'codex']) {
  const inv = measure({ mode: 'invoked', adapter });
  assert.equal(inv.status, 'OK', `invoked(${adapter}) ${inv.total} exceeded ${BUDGETS.invoked}`);

  const act = measure({ mode: 'active', adapter });
  assert.equal(act.status, 'OK', `active(${adapter}) ${act.total} exceeded ${BUDGETS.active}`);

  // Every named scenario fits its budget for every adapter (#202 ACs).
  for (const scenario of SCENARIO_NAMES) {
    const r = measure({ mode: 'scenario', adapter, scenario });
    const budget = SCENARIO_BUDGETS[adapter][scenario];
    assert.equal(typeof budget, 'number', `missing budget for ${adapter}/${scenario}`);
    assert.equal(r.status, 'OK', `scenario ${scenario}/${adapter}: ${r.total} exceeded ${budget}`);
    assert.ok(r.headroom >= 0, `scenario ${scenario}/${adapter}: negative headroom`);
  }
}

// Both new #202 scenarios are present and budgeted per-adapter.
for (const required of ['bind+review+close', 'parallel-orchestration']) {
  assert.ok(SCENARIO_NAMES.includes(required), `missing required scenario: ${required}`);
  for (const adapter of ['claude', 'codex']) {
    assert.equal(
      typeof SCENARIO_BUDGETS[adapter][required],
      'number',
      `missing ${adapter} budget for ${required}`
    );
  }
}

// CLI: --all exits 0 when all budgets pass, for both adapters.
for (const adapter of ['claude', 'codex']) {
  const r = await pexec('node', [SCRIPT, '--all', '--adapter', adapter]);
  assert.match(r.stdout, /idle:/);
  assert.match(r.stdout, /invoked/);
  // Every named scenario should appear in the output.
  for (const name of SCENARIO_NAMES) {
    assert.match(r.stdout, new RegExp(`scenario:${name.replace(/\+/g, '\\+')}`));
  }
  assert.doesNotMatch(r.stdout, /\[OVER\]/);
}

// CLI: --scenario <name> runs only that scenario and prints its label.
for (const scenario of ['bind+review+close', 'parallel-orchestration']) {
  for (const adapter of ['claude', 'codex']) {
    const r = await pexec('node', [SCRIPT, '--scenario', scenario, '--adapter', adapter]);
    assert.match(
      r.stdout,
      new RegExp(`scenario:${scenario.replace(/\+/g, '\\+')}`),
      `--scenario ${scenario}/${adapter} missing label in stdout`
    );
    assert.doesNotMatch(r.stdout, /\[OVER\]/);
  }
}

// CLI: --json on --all emits a parseable JSON array, one entry per scenario + foundational.
const j = await pexec('node', [SCRIPT, '--all', '--json', '--adapter', 'claude']);
const parsed = JSON.parse(j.stdout);
// idle + invoked + every named scenario.
assert.equal(parsed.length, 2 + SCENARIO_NAMES.length);
assert.ok(parsed.every((p) => typeof p.total === 'number' && p.status));

// CLI: --idle alone returns just one section (back-compat).
const i = await pexec('node', [SCRIPT, '--idle']);
assert.match(i.stdout, /idle:/);
assert.doesNotMatch(i.stdout, /invoked/);

// CLI: --list-scenarios names both new scenarios + per-adapter budgets.
const list = await pexec('node', [SCRIPT, '--list-scenarios']);
assert.match(list.stdout, /bind\+review\+close/);
assert.match(list.stdout, /parallel-orchestration/);
assert.match(list.stdout, /budget \(claude\)/);
assert.match(list.stdout, /budget \(codex\)/);

// Negative path: unknown scenario errors out (not silent).
try {
  await pexec('node', [SCRIPT, '--scenario', 'no-such-scenario']);
  assert.fail('expected unknown scenario to exit non-zero');
} catch (err) {
  assert.ok(err.code && err.code !== 0, 'unknown scenario should non-zero');
  assert.match((err.stderr || '') + (err.stdout || ''), /unknown scenario/i);
}

console.log('measure-context.test.mjs OK');
