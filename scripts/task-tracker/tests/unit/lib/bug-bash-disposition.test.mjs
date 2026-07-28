// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUG_BASH_DISPOSITIONS } from '../../fixtures/state-engine-bug-bash-dispositions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const EVIDENCE_PATH = path.join(
  ROOT,
  'docs/superpowers/specs/2026-07-27-state-engine-bug-bash-evidence.md'
);
const ALLOWED_DISPOSITIONS = new Set([
  'direct-child',
  '1006-audit-input',
  'verification-constraint',
  'already-centralized',
  'independent-concern',
]);

function parseEvidenceIssueIds(markdown) {
  const register = markdown.match(/## 3\. Evidence Register(?<body>[\s\S]*?)## 4\./)?.groups.body;
  assert.ok(register, 'evidence register section');
  return [...register.matchAll(/^\| #(\d+) /gm)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
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
  const evidenceIssues = parseEvidenceIssueIds(markdown);
  const dispositionIssues = BUG_BASH_DISPOSITIONS.map(({ issue }) => issue);

  assert.equal(evidenceIssues.length, 53);
  assert.equal(new Set(dispositionIssues).size, dispositionIssues.length);
  assert.deepEqual(
    [...dispositionIssues].sort((a, b) => a - b),
    evidenceIssues
  );

  for (const row of BUG_BASH_DISPOSITIONS) {
    assert.ok(ALLOWED_DISPOSITIONS.has(row.disposition), `#${row.issue}`);
    assert.ok(row.target.length > 0, `#${row.issue} target`);
    assert.ok(row.regressionOwner.length > 0, `#${row.issue} regression owner`);
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
