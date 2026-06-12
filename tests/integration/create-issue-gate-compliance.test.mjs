// Integration test for #298: a body emitted by `scripts/gh/create-issue.mjs
// --dry-run` must be gate-compliant — i.e. it must satisfy every body-shape
// requirement of the five state-transition gates in the 7-state machine:
//
//   1. Backlog → Refine entry   (`planPriorityGate`)
//   2. Refine  → Plan   exit #1 (`planRefinementEstimate` — body half)
//   3. Refine  → Plan   exit #2 (`gateRefineToPlan` — board + body lint)
//   4. Plan    → Develop entry  (`planDeepDiveGate`)
//   5. Backlog → Refine entry-fields body sections (`checkRequiredBodySections`)
//
// Workflow-deferred markers (the `aitm-refinement-rationale` block added by
// the `refine` verb and the `aitm-deep-dive-*` markers added during plan)
// are NOT the responsibility of `create-issue.mjs`. This test asserts those
// gates fail ONLY on the workflow-deferred pieces, never on body-shape
// pieces — proving the created body is "as ready as creation can make it".
//
// Board values are synthesized by parsing the `aitm-fields:` JSON block the
// new (#298) `--priority/--size/--estimate/--sequence/--start-time`
// forwarding emits at the body tail. Labels are stubbed because they live on
// the issue, not in the body.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  checkRequiredBodySections,
  checkRequiredFields,
  validateBody,
} from '../../scripts/task-tracker/lib/body-gates.mjs';
import {
  planPriorityGate,
  planRefinementEstimate,
} from '../../scripts/task-tracker/lib/apply-refinement-estimate.mjs';
import { gateRefineToPlan } from '../../scripts/task-tracker/lib/refine-to-plan-gate.mjs';
import { planDeepDiveGate } from '../../scripts/task-tracker/lib/deep-dive-gate.mjs';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const FIXTURE_DIR = path.join(repoRoot, 'tests', 'fixtures', 'create-issue-gate-compliance');

const SEED = {
  priority: 'P1',
  size: 'M',
  estimate: 4,
  sequence: 99,
  startTime: '2026-06-04 22:46:35 -05:00',
};
const SEED_LABELS = ['test', 'demo'];

function runDryRun() {
  const args = [
    path.join(repoRoot, 'scripts', 'gh', 'create-issue.mjs'),
    '--title',
    'gate-compliance fixture',
    '--shape',
    'sub-issue',
    '--scope-file',
    path.join(FIXTURE_DIR, 'scope.md'),
    '--ac-file',
    path.join(FIXTURE_DIR, 'ac.md'),
    '--plan-metadata-file',
    path.join(FIXTURE_DIR, 'plan-meta.md'),
    '--parent',
    '1',
    '--priority',
    SEED.priority,
    '--size',
    SEED.size,
    '--estimate',
    String(SEED.estimate),
    '--sequence',
    String(SEED.sequence),
    '--start-time',
    SEED.startTime,
    '--dry-run',
  ];
  const r = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`create-issue.mjs --dry-run failed (exit ${r.status}):\n${r.stderr}`);
  }
  return r.stdout;
}

function parseFieldsBlock(body) {
  const m = body.match(/<!--\s*aitm-fields:\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) throw new Error('body has no aitm-fields: marker');
  return JSON.parse(m[1]).values;
}

const CFG = Object.freeze({ repo: 'fixture/repo', projectId: 0 });

function fakeFieldDefs() {
  return {
    project: { id: 0, number: 0, title: 'fixture' },
    fields: { priority: {}, size: {}, estimate: {}, sequence: {}, startTime: {} },
  };
}

function valuesReader(values) {
  return async () => values;
}

test('create-issue.mjs --dry-run body is gate-compliant', async (t) => {
  const body = runDryRun();
  const values = parseFieldsBlock(body);

  await t.test('structural body gates (validateBody)', () => {
    const r = validateBody(body);
    assert.deepEqual(r, { ok: true }, `structural refusals: ${JSON.stringify(r)}`);
  });

  await t.test('required body sections present', () => {
    const refusals = checkRequiredBodySections(body);
    assert.deepEqual(
      refusals,
      [],
      `missing sections: ${refusals.map((r) => r.message).join('; ')}`
    );
  });

  await t.test('checkRequiredFields with seeded values + labels', () => {
    const refusals = checkRequiredFields(values, SEED_LABELS);
    assert.deepEqual(refusals, [], `field refusals: ${JSON.stringify(refusals)}`);
  });

  await t.test('gate 1 — Backlog → Refine entry (planPriorityGate)', async () => {
    const r = await planPriorityGate({
      cfg: CFG,
      issueNumber: 1,
      deps: {
        loadProjectFieldDefs: fakeFieldDefs,
        projectValuesForIssue: valuesReader(values),
      },
    });
    assert.equal(r.ok, true, `priority-gate blockers: ${JSON.stringify(r.blockers)}`);
  });

  await t.test('gate 2 — Refine → Plan exit body half (planRefinementEstimate)', async () => {
    const r = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body,
      deps: {
        loadProjectFieldDefs: fakeFieldDefs,
        projectValuesForIssue: valuesReader(values),
      },
    });
    // Created body has size/estimate/priority on board, has ACs, has the
    // required sections — the only refusal allowed is rationale-missing,
    // which the `refine` verb adds (not create-issue.mjs).
    assert.equal(r.ok, false, 'expected rationale-missing refusal');
    const allowed = ['refine-rationale-missing'];
    const offending = (r.blockers || []).filter((b) => !allowed.some((a) => b.startsWith(a)));
    assert.deepEqual(
      offending,
      [],
      `unexpected non-rationale blockers: ${JSON.stringify(offending)}`
    );
  });

  await t.test('gate 3 — Refine → Plan exit board half (gateRefineToPlan)', async () => {
    const r = await gateRefineToPlan({
      cfg: CFG,
      issueNumber: 1,
      deps: {
        loadProjectFieldDefs: fakeFieldDefs,
        projectValuesForIssue: valuesReader(values),
        fetchLabels: async () => SEED_LABELS,
        fetchBody: async () => body,
      },
    });
    assert.equal(r.ok, true, `refine→plan board refusals: ${JSON.stringify(r.blockers)}`);
  });

  await t.test('gate 4 — Plan → Develop entry (planDeepDiveGate)', () => {
    const r = planDeepDiveGate({ body });
    // Deep-dive markers are added during plan, not at creation. The gate
    // must refuse for that reason ONLY — never for a body-shape reason.
    assert.equal(r.ok, false, 'expected deep-dive-not-posted refusal');
    const allowed = /(deep-dive|aitm-deep-dive)/i;
    const offending = (r.blockers || []).filter((b) => !allowed.test(b));
    assert.deepEqual(
      offending,
      [],
      `unexpected non-deep-dive blockers: ${JSON.stringify(offending)}`
    );
  });

  await t.test('DoD functional lines carry dod:functional:* suffixes', () => {
    const required = [
      'dod:functional:tests',
      'dod:functional:lint',
      'dod:functional:acs',
      'dod:functional:commits',
      'dod:functional:checkboxes',
    ];
    for (const tag of required) {
      assert.ok(body.includes(`<!-- ${tag} -->`), `body is missing DoD suffix marker ${tag}`);
    }
  });

  await t.test('body-version marker emitted', () => {
    // #376: preflight now seeds the new `version="N"` property grammar.
    assert.match(body, /<!--\s*aitm-body-version\s+version="\d+"\s*-->/);
  });

  await t.test('parent epic marker emitted exactly once', () => {
    const occurrences = body.match(/\*\*Parent epic:\*\*/g) || [];
    assert.equal(
      occurrences.length,
      1,
      `expected 1 **Parent epic:** line, got ${occurrences.length}`
    );
  });

  await t.test('numbered ACs were normalized to checkbox form', () => {
    const acHead = body.match(/^##\s+Acceptance Criteria\s*$/m);
    assert.ok(acHead, 'missing ## Acceptance Criteria section');
    const after = body.slice(acHead.index + acHead[0].length);
    const next = after.search(/^##\s+/m);
    const section = next >= 0 ? after.slice(0, next) : after;
    // No bare numbered items left (`1.` / `2.`) and no bare bullets without `[ ]`.
    assert.ok(!/^\s*\d+\.\s+/m.test(section), 'AC still contains numbered list items');
    assert.ok(!/^\s*-\s+(?!\[)/m.test(section), 'AC still contains bare bullets (no checkbox)');
  });
});
