// @story #1052
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSplitProposals,
  validateSplitTasks,
  writeProposalFragments,
} from '../../../lib/split-plan.mjs';
import {
  formatSplitPlanResult,
  parseSplitPlanArgs,
  runSplitPlan,
} from '../../../verbs/split-plan.mjs';
import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';

const PLAN_PATH = 'docs/superpowers/plans/example.md';
const SPEC_PATH = 'docs/superpowers/specs/example-design.md';
const pexec = promisify(execFile);

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
    assert.equal(
      readFileSync(paths.verificationCommands, 'utf8'),
      'node --test classifier.test.mjs\n'
    );
    assert.deepEqual(paths.creatorArgs.slice(-10), [
      '--scope-file',
      paths.scope,
      '--ac-file',
      paths.ac,
      '--story-origin-file',
      paths.storyOrigin,
      '--plan-metadata-file',
      paths.planMetadata,
      '--verification-commands-file',
      paths.verificationCommands,
    ]);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('sanctioned dry-run body preserves exact task verifiers behind AC citations', async () => {
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.tmp', 'split-plan-body-test-'));
  try {
    const [proposal] = buildSplitProposals(input());
    const paths = await writeProposalFragments({ proposal, scratchDir });
    const { stdout } = await pexec(
      process.execPath,
      [path.join(process.cwd(), 'bin/aitm.mjs'), ...paths.creatorArgs, '--dry-run'],
      {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    assert.deepEqual(
      parseVerificationCommands(stdout)
        .slice(0, proposal.verificationCommands.length)
        .map((item) => ({ id: item.id, command: item.command })),
      [{ id: 1, command: 'node --test classifier.test.mjs' }]
    );
    assert.match(stdout, /aitm-verified vc-list="vc:1"/);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

function orchestrationInput(overrides = {}) {
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.tmp', 'split-plan-run-test-'));
  return {
    issueNumber: 1052,
    mode: 'dry-run',
    cfg: { repo: 'owner/repo' },
    deps: {
      projectDir: process.cwd(),
      scratchDir,
      fetchIssueBody: async () =>
        [
          '## Plan Metadata',
          `- **Implementation-plan**: ${PLAN_PATH}`,
          `- **Governing-spec**: ${SPEC_PATH}`,
        ].join('\n'),
      evaluateIssueDecomposition: async () => ({
        classification: { status: 'must-split' },
        planDiagnostic: { path: '/repo/example.md', source: 'body' },
      }),
      readPlanAtCommit: async () => input().planText,
      fetchParentIssue: async () => 1048,
      resolveHead: async () => 'abc1234',
      runCreator: async () => ({ exitCode: 0, stdout: 'rendered body', stderr: '' }),
    },
    ...overrides,
    cleanup: () => rmSync(scratchDir, { recursive: true, force: true }),
  };
}

test('dry-run preflights every child and performs no live create', async () => {
  const calls = [];
  const args = orchestrationInput();
  args.deps.runCreator = async (creatorArgs) => {
    calls.push(creatorArgs);
    return { exitCode: 0, stdout: 'rendered body', stderr: '' };
  };
  try {
    const result = await runSplitPlan(args);
    assert.equal(result.status, 'dry-run');
    assert.equal(calls.length, 2);
    assert.ok(calls.every((creatorArgs) => creatorArgs.includes('--dry-run')));
    assert.ok(
      calls.every(
        (creatorArgs) => creatorArgs.includes('--shape') && creatorArgs.includes('sub-issue')
      )
    );
    assert.ok(result.proposals.every((proposal) => !proposal.creatorArgs.includes('--dry-run')));
  } finally {
    args.cleanup();
  }
});

test('reads proposal text from the pinned HEAD commit rather than the working tree', async () => {
  const reads = [];
  const args = orchestrationInput();
  args.deps.readPlanAtCommit = async (request) => {
    reads.push(request);
    return input().planText;
  };
  try {
    await runSplitPlan(args);
    assert.deepEqual(reads, [
      {
        projectDir: process.cwd(),
        planCommit: 'abc1234',
        planPath: PLAN_PATH,
      },
    ]);
  } finally {
    args.cleanup();
  }
});

test('default plan reader ignores uncommitted working-tree plan changes', async () => {
  const projectDir = mkdtempSync(path.join(process.cwd(), '.tmp', 'split-plan-git-test-'));
  const scratchDir = path.join(projectDir, 'scratch');
  const planFile = path.join(projectDir, PLAN_PATH);
  mkdirSync(path.dirname(planFile), { recursive: true });
  const committedPlan = [
    '### Task 1: Committed classifier',
    'Run: `node --test classifier.test.mjs`',
    '### Task 2: Committed CLI',
    'Run: `node --test cli.test.mjs`',
  ].join('\n');
  writeFileSync(planFile, committedPlan, 'utf8');
  await pexec('git', ['init'], { cwd: projectDir });
  await pexec('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir });
  await pexec('git', ['config', 'user.name', 'Test'], { cwd: projectDir });
  await pexec('git', ['add', PLAN_PATH], { cwd: projectDir });
  await pexec('git', ['commit', '-m', 'plan'], { cwd: projectDir });
  writeFileSync(
    planFile,
    '### Task 1: Uncommitted rewrite\nRun: `node --test wrong.test.mjs`',
    'utf8'
  );
  try {
    const result = await runSplitPlan({
      issueNumber: 1052,
      mode: 'dry-run',
      cfg: { repo: 'owner/repo' },
      deps: {
        projectDir,
        scratchDir,
        fetchIssueBody: async () => `## Plan Metadata\n- **Plan**: ${PLAN_PATH}`,
        evaluateIssueDecomposition: async () => ({
          classification: { status: 'must-split' },
          planDiagnostic: { path: planFile, source: 'metadata', diagnostic: null },
          values: { size: 'XL', estimate: 24 },
        }),
        fetchParentIssue: async () => null,
        runCreator: async () => ({ exitCode: 0, stdout: 'rendered', stderr: '' }),
      },
    });
    assert.deepEqual(
      result.proposals.map((proposal) => proposal.title),
      ['Committed classifier', 'Committed CLI']
    );
    assert.doesNotMatch(result.proposals[0].scope, /Uncommitted rewrite/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('human dry-run output exposes complete proposals and future creator argv', async () => {
  const args = orchestrationInput();
  try {
    const output = formatSplitPlanResult(await runSplitPlan(args));
    assert.match(output, /## Child 1: Classifier/);
    assert.match(output, /### Scope[\s\S]*Build only the classification policy/);
    assert.match(output, /### Acceptance Criteria[\s\S]*vc-list="vc:1"/);
    assert.match(output, /### Verification Commands\n- node --test classifier\.test\.mjs/);
    assert.match(output, /### Story Origin[\s\S]*discovered-during/);
    assert.match(output, /### Plan Metadata[\s\S]*Source-plan-commit/);
    assert.match(output, /Creator argv: "npx" "aitm" "create-issue"/);
  } finally {
    args.cleanup();
  }
});

test('hidden and placeholder Governing-spec metadata fall back to the sanctioned default', async () => {
  for (const governingField of [
    '<!-- - **Governing-spec**: docs/hidden.md -->',
    '- **Governing-spec**: <!-- TBD -->',
  ]) {
    const args = orchestrationInput();
    args.deps.fetchIssueBody = async () =>
      ['## Plan Metadata', `- **Implementation-plan**: ${PLAN_PATH}`, governingField].join('\n');
    try {
      const result = await runSplitPlan(args);
      assert.ok(
        result.proposals.every((proposal) =>
          proposal.planMetadata.includes(
            '**Governing-spec**: docs/superpowers/specs/2026-08-03-nested-epic-decomposition-design.md'
          )
        )
      );
    } finally {
      args.cleanup();
    }
  }
});

test('rejects a missing --plan value instead of consuming the next option', () => {
  assert.throws(() => parseSplitPlanArgs(['1052', '--plan', '--json']), /requires a path/);
});

test('confirm validates all drafts before the first live creation', async () => {
  const phases = [];
  const args = orchestrationInput({ mode: 'confirm' });
  args.deps.runCreator = async (creatorArgs) => {
    const dry = creatorArgs.includes('--dry-run');
    const title = creatorArgs[creatorArgs.indexOf('--title') + 1];
    phases.push(`${dry ? 'dry' : 'live'}:${title}`);
    return {
      exitCode: 0,
      stdout: dry ? 'rendered' : `https://github.com/owner/repo/issues/${phases.length + 100}`,
      stderr: '',
    };
  };
  try {
    const result = await runSplitPlan(args);
    assert.equal(result.status, 'created');
    assert.deepEqual(phases, ['dry:Classifier', 'dry:CLI', 'live:Classifier', 'live:CLI']);
    assert.equal(result.createdChildren.length, 2);
  } finally {
    args.cleanup();
  }
});

test('confirm performs no live creation when any draft preflight fails', async () => {
  const phases = [];
  const args = orchestrationInput({ mode: 'confirm' });
  args.deps.runCreator = async (creatorArgs) => {
    const title = creatorArgs[creatorArgs.indexOf('--title') + 1];
    phases.push(`${creatorArgs.includes('--dry-run') ? 'dry' : 'live'}:${title}`);
    return title === 'CLI'
      ? { exitCode: 1, stdout: '', stderr: 'invalid draft' }
      : { exitCode: 0, stdout: 'rendered', stderr: '' };
  };
  try {
    await assert.rejects(() => runSplitPlan(args), /preflight failed for CLI/);
    assert.deepEqual(phases, ['dry:Classifier', 'dry:CLI']);
  } finally {
    args.cleanup();
  }
});

test('refuses unresolved parent provenance before any creator call', async () => {
  const calls = [];
  const args = orchestrationInput();
  args.deps.fetchParentIssue = async () => {
    throw new Error('parent lookup unavailable');
  };
  args.deps.runCreator = async (creatorArgs) => {
    calls.push(creatorArgs);
    return { exitCode: 0, stdout: 'unexpected', stderr: '' };
  };
  try {
    await assert.rejects(() => runSplitPlan(args), /parent lookup unavailable/);
    assert.deepEqual(calls, []);
  } finally {
    args.cleanup();
  }
});

test('refuses malformed resolved parent provenance', async () => {
  const args = orchestrationInput();
  args.deps.fetchParentIssue = async () => 0;
  try {
    await assert.rejects(() => runSplitPlan(args), /resolved parent must be null or a positive/);
  } finally {
    args.cleanup();
  }
});

test('confirm stops on partial live failure and retains created issue numbers', async () => {
  const live = [];
  const args = orchestrationInput({ mode: 'confirm' });
  args.deps.readFile = () => `${input().planText}\n### Task 3: Docs\nRun: \`npm run docs:test\``;
  args.deps.runCreator = async (creatorArgs) => {
    if (creatorArgs.includes('--dry-run')) return { exitCode: 0, stdout: 'rendered', stderr: '' };
    const title = creatorArgs[creatorArgs.indexOf('--title') + 1];
    live.push(title);
    if (title === 'CLI') {
      return {
        exitCode: 6,
        stdout: '',
        stderr: 'AITM_CREATED_ISSUE=1102\n✗ issue #1102 created but tether failed',
      };
    }
    return {
      exitCode: 0,
      stdout: 'https://github.com/owner/repo/issues/1101',
      stderr: '',
    };
  };
  try {
    const result = await runSplitPlan(args);
    assert.equal(result.status, 'partial-success');
    assert.deepEqual(live, ['Classifier', 'CLI']);
    assert.deepEqual(result.createdChildren, [
      { title: 'Classifier', issueNumber: 1101 },
      { title: 'CLI', issueNumber: 1102, incomplete: true },
    ]);
    assert.equal(result.failed.taskNumber, 2);
    assert.equal(result.failed.title, 'CLI');
    assert.equal(result.failed.exitCode, 6);
    assert.match(result.recovery, /Inspect the created children before retrying/);
  } finally {
    args.cleanup();
  }
});
