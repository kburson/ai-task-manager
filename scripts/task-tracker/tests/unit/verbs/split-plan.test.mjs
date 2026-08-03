import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSplitProposals,
  validateSplitTasks,
  writeProposalFragments,
} from '../../../lib/split-plan.mjs';

const PLAN_PATH = 'docs/superpowers/plans/example.md';
const SPEC_PATH = 'docs/superpowers/specs/example-design.md';

function input(overrides = {}) {
  return {
    sourceIssue: 1052,
    outerParent: 1048,
    planPath: PLAN_PATH,
    planCommit: 'abc1234',
    governingSpec: SPEC_PATH,
    planText: [
      '### Task 1: Classifier',
      'Build only the classification policy.',
      'Run: `node --test classifier.test.mjs`',
      'Run: `node --test classifier.test.mjs`',
      '',
      '### Milestone 2: CLI',
      'Expose the split workflow.',
      '**Verification Commands:**',
      '```sh',
      'node --test cli.test.mjs',
      'npm run lint',
      '```',
    ].join('\n'),
    ...overrides,
  };
}

test('builds one deterministic child proposal per numbered task', () => {
  const proposals = buildSplitProposals(input());
  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].title, 'Classifier');
  assert.deepEqual(proposals[0].verificationCommands, ['node --test classifier.test.mjs']);
  assert.match(proposals[0].planMetadata, /\*\*Parent-epic\*\*: #1048/);
  assert.match(proposals[0].planMetadata, /\*\*Nested-epic\*\*: #1052/);
  assert.match(proposals[0].planMetadata, /\*\*Source-plan-commit\*\*: abc1234/);
  assert.match(proposals[0].acceptanceCriteria, /aitm-verified vc-list="vc:1"/);
  assert.match(proposals[1].acceptanceCriteria, /aitm-verified vc-list="vc:1 vc:2"/);
  assert.deepEqual(proposals[1].verificationCommands, ['node --test cli.test.mjs', 'npm run lint']);
});

test('bounds Scope and provenance to the exact source task section', () => {
  const [first, second] = buildSplitProposals(input());
  assert.match(first.scope, /Task 1/);
  assert.match(first.scope, /Build only the classification policy/);
  assert.doesNotMatch(first.scope, /Expose the split workflow/);
  assert.match(first.storyOrigin, /\*\*kind\*\*: code/);
  assert.match(first.storyOrigin, /\*\*discovered-during\*\*: #1052/);
  assert.match(first.storyOrigin, /\*\*source-plan-section\*\*: ### Task 1: Classifier/);
  assert.match(first.planMetadata, /\*\*Source-plan-section\*\*: ### Task 1: Classifier/);
  assert.match(second.planMetadata, /\*\*Source-plan-section\*\*: ### Milestone 2: CLI/);
});

test('records a root source as both parent and nested epic', () => {
  const [proposal] = buildSplitProposals(input({ outerParent: null }));
  assert.match(proposal.planMetadata, /\*\*Parent-epic\*\*: #1052/);
  assert.match(proposal.planMetadata, /\*\*Nested-epic\*\*: #1052/);
  assert.deepEqual(proposal.creatorArgs.slice(0, 6), [
    'create-issue',
    '--shape',
    'sub-issue',
    '--parent',
    '1052',
    '--title',
  ]);
});

test('refuses duplicate numbers, empty titles, and missing verifiers', () => {
  const result = validateSplitTasks([
    { number: 1, title: 'First', heading: 'Task 1: First', commands: ['node a.mjs'] },
    { number: 1, title: 'Duplicate', heading: 'Task 1: Duplicate', commands: ['node b.mjs'] },
    { number: 2, title: '  ', heading: 'Task 2:', commands: ['node c.mjs'] },
    { number: 3, title: 'No verifier', heading: 'Task 3: No verifier', commands: [] },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'duplicate task number: 1',
    'task 2 has an empty title',
    'task 3 has no executable verifier',
  ]);
});

test('writes canonical deterministic fragments for sanctioned creation', async () => {
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.tmp', 'split-plan-test-'));
  try {
    const [proposal] = buildSplitProposals(input());
    const paths = await writeProposalFragments({ proposal, scratchDir });
    assert.equal(path.basename(path.dirname(paths.scope)), 'task-001');
    assert.equal(readFileSync(paths.scope, 'utf8'), `${proposal.scope}\n`);
    assert.equal(readFileSync(paths.ac, 'utf8'), `${proposal.acceptanceCriteria}\n`);
    assert.equal(readFileSync(paths.storyOrigin, 'utf8'), `${proposal.storyOrigin}\n`);
    assert.equal(readFileSync(paths.planMetadata, 'utf8'), `${proposal.planMetadata}\n`);
    assert.deepEqual(paths.creatorArgs.slice(-8), [
      '--scope-file',
      paths.scope,
      '--ac-file',
      paths.ac,
      '--story-origin-file',
      paths.storyOrigin,
      '--plan-metadata-file',
      paths.planMetadata,
    ]);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});
