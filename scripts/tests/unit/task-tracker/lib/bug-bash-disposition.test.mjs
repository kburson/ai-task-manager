// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUG_BASH_DISPOSITIONS } from '../../../fixtures/state-engine-bug-bash-dispositions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const EVIDENCE_PATH = path.join(
  ROOT,
  'docs/superpowers/specs/2026-07-27-state-engine-bug-bash-evidence.md'
);
const UNIT_TEST_DIR = path.join(ROOT, 'scripts/tests/unit/task-tracker/lib');
const REGRESSION_OWNER_FILES = new Set([
  'state-engine-policy-characterization.test.mjs',
  'timing-event-emitter-characterization.test.mjs',
  'executable-entrypoint-classification.test.mjs',
]);
const AUDIT_OWNER = '#1006 JIT audit and existing corrective regression suite';
const DELIVERY_OWNER = 'repository lint, format, fast, integration, and slow quality gates';
const CENTRALIZED_TARGETS = new Set([
  'demonstrable AC policy and verifier',
  'issue-kind commit-requirement policy',
  'AC evidence-reference policy',
  'lifecycle DoD marker parser',
  'no-commit issue-kind review policy',
  'VC evidence outcome policy',
  'honest unverified evidence policy',
  'explicit human approval policy',
]);
const ALLOWED_DISPOSITIONS = new Set([
  'direct-child',
  '1006-audit-input',
  'verification-constraint',
  'already-centralized',
  'independent-concern',
]);

function parseEvidenceRows(markdown) {
  const register = markdown.match(/## 3\. Evidence Register(?<body>[\s\S]*?)## 4\./)?.groups.body;
  assert.ok(register, 'evidence register section');
  return [...register.matchAll(/^\| #(\d+)\s+\|[^|]+\|\s+`([^`]+)`\s+\|/gm)]
    .map(([, issue, theme]) => ({ issue: Number(issue), theme }))
    .sort((a, b) => a.issue - b.issue);
}

function parseRenderedDispositions(markdown) {
  const table = markdown.match(/## 6\. Disposition and Regression Ownership(?<body>[\s\S]*)$/)
    ?.groups.body;
  assert.ok(table, 'rendered disposition section');
  return [...table.matchAll(/^\| #(\d+)\s+\| `([^`]+)`\s+\| ([^|]+) \| ([^|]+) \|$/gm)].map(
    ([, issue, disposition, target, regressionOwner]) => ({
      issue: Number(issue),
      disposition,
      target: target.trim(),
      regressionOwner: regressionOwner.trim().replaceAll('`', ''),
    })
  );
}

test('every evidence issue has one disposition, target, and regression owner', () => {
  const markdown = readFileSync(EVIDENCE_PATH, 'utf8');
  const evidenceRows = parseEvidenceRows(markdown);
  const dispositionRows = BUG_BASH_DISPOSITIONS.map(({ issue, theme }) => ({ issue, theme })).sort(
    (a, b) => a.issue - b.issue
  );

  assert.equal(evidenceRows.length, 53);
  assert.equal(new Set(dispositionRows.map(({ issue }) => issue)).size, dispositionRows.length);
  assert.deepEqual(dispositionRows, evidenceRows);

  for (const row of BUG_BASH_DISPOSITIONS) {
    assert.ok(ALLOWED_DISPOSITIONS.has(row.disposition), `#${row.issue}`);
    if (row.disposition === 'direct-child') {
      assert.match(row.target, /^#(?:1008|1009|1010|1011)\b/, `#${row.issue} target`);
      assert.ok(REGRESSION_OWNER_FILES.has(row.regressionOwner), `#${row.issue} owner`);
      assert.equal(
        readFileSync(path.join(UNIT_TEST_DIR, row.regressionOwner), 'utf8').includes(
          '// @story #1007'
        ),
        true,
        `#${row.issue} owner`
      );
    } else if (row.disposition === '1006-audit-input') {
      assert.match(row.target, /^#1006\b/, `#${row.issue} target`);
      assert.equal(row.regressionOwner, AUDIT_OWNER, `#${row.issue} owner`);
    } else if (row.disposition === 'verification-constraint') {
      assert.match(row.target, /^C1-C6\b/, `#${row.issue} target`);
      assert.equal(row.regressionOwner, DELIVERY_OWNER, `#${row.issue} owner`);
    } else if (row.disposition === 'already-centralized') {
      assert.ok(CENTRALIZED_TARGETS.has(row.target), `#${row.issue} target`);
      assert.equal(row.regressionOwner, AUDIT_OWNER, `#${row.issue} owner`);
    } else {
      assert.match(row.target, /^independent concern:/i, `#${row.issue} target`);
    }
    assert.equal(Object.isFrozen(row), true, `#${row.issue} frozen`);
  }
});

test('the rendered evidence table is a complete issue-ordered view of the fixture', () => {
  const markdown = readFileSync(EVIDENCE_PATH, 'utf8');
  const rendered = parseRenderedDispositions(markdown);
  const expected = BUG_BASH_DISPOSITIONS.map(({ issue, disposition, target, regressionOwner }) => ({
    issue,
    disposition,
    target,
    regressionOwner,
  })).sort((a, b) => a.issue - b.issue);
  assert.deepEqual(rendered, expected);
});

test('the disposition register is immutable', () => {
  assert.equal(Object.isFrozen(BUG_BASH_DISPOSITIONS), true);
});
