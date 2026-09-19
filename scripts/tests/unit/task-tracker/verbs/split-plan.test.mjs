// @story #1052 #1710 #1712
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSplitProposals,
  validateSplitTasks,
  writeProposalFragments,
} from '../../../../task-tracker/lib/split-plan.mjs';
import {
  formatSplitPlanResult,
  parseSplitPlanArgs,
  runSplitPlan,
} from '../../../../task-tracker/verbs/split-plan.mjs';
import { parseVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';
import { extractPlanTasks } from '../../../../task-tracker/lib/decomposition-policy.mjs';
import { parseStoryIntent } from '../../../../task-tracker/lib/user-story-quality.mjs';

const PLAN_PATH = 'docs/superpowers/plans/example.md';
const SPEC_PATH = 'docs/superpowers/specs/example-design.md';
const pexec = promisify(execFile);
const INTENT = [
  '#### Story Intent',
  '- **Beneficiary:** release operator',
  '- **Capability:** stop partial publication',
  '- **Need:** registry checks can fail',
  '- **Value or failure prevented:** consumers receive complete releases',
  '#### Scope',
].join('\n');
const SECOND_INTENT = INTENT.replace('release operator', 'security auditor')
  .replace('stop partial publication', 'identify unauthorized changes')
  .replace('registry checks can fail', 'incident evidence is scattered')
  .replace('consumers receive complete releases', 'investigations can prevent recurrence');

function input(overrides = {}) {
  return {
    sourceIssue: 1052,
    outerParent: 1048,
    planPath: PLAN_PATH,
    planCommit: 'abc1234',
    governingSpec: SPEC_PATH,
    planText: [
      '### Task 1: Classifier',
      INTENT,
      'Build only the classification policy.',
      'Run: `node --test classifier.test.mjs`',
      'Run: `node --test classifier.test.mjs`',
      '',
      '### Milestone 2: CLI',
      SECOND_INTENT,
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
  assert.equal(
    proposals[0].userStory,
    'As a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases'
  );
  assert.equal(
    proposals[1].userStory,
    'As a security auditor\nI want to identify unauthorized changes because incident evidence is scattered\nSo that investigations can prevent recurrence'
  );
  assert.notEqual(proposals[0].userStory, proposals[1].userStory);
  assert.doesNotMatch(proposals[0].scope, /^#### Story Intent$/m);
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
  const result = validateSplitTasks(
    [
      { number: 1, title: 'First', heading: 'Task 1: First', commands: ['node a.mjs'] },
      { number: 1, title: 'Duplicate', heading: 'Task 1: Duplicate', commands: ['node b.mjs'] },
      { number: 2, title: '  ', heading: 'Task 2:', commands: ['node c.mjs'] },
      { number: 3, title: 'No verifier', heading: 'Task 3: No verifier', commands: [] },
    ].map((task) => ({
      ...task,
      storyIntent: {
        beneficiary: 'release operator',
        capability: 'stop partial publication',
        need: 'registry checks can fail',
        value: 'consumers receive complete releases',
      },
      storyIntentViolations: [],
    }))
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'duplicate task number: 1',
    'task 2 has an empty title',
    'task 3 has no executable verifier',
  ]);
});

test('writes canonical deterministic fragments for sanctioned creation', async () => {
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.scratch', 'split-plan-test-'));
  try {
    const [proposal] = buildSplitProposals(input());
    const paths = await writeProposalFragments({ proposal, scratchDir });
    assert.equal(path.basename(path.dirname(paths.scope)), 'task-001');
    assert.equal(readFileSync(paths.userStory, 'utf8'), `${proposal.userStory}\n`);
    assert.equal(readFileSync(paths.scope, 'utf8'), `${proposal.scope}\n`);
    assert.equal(readFileSync(paths.ac, 'utf8'), `${proposal.acceptanceCriteria}\n`);
    assert.equal(readFileSync(paths.storyOrigin, 'utf8'), `${proposal.storyOrigin}\n`);
    assert.equal(readFileSync(paths.planMetadata, 'utf8'), `${proposal.planMetadata}\n`);
    assert.equal(
      readFileSync(paths.verificationCommands, 'utf8'),
      'node --test classifier.test.mjs\n'
    );
    assert.deepEqual(paths.creatorArgs.slice(-12), [
      '--user-story-file',
      paths.userStory,
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
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.scratch', 'split-plan-body-test-'));
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

test('sanctioned creator still refuses explicitly supplied administrative prose', async () => {
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.scratch', 'split-plan-refusal-test-'));
  try {
    const [proposal] = buildSplitProposals(input());
    proposal.userStory =
      'As a governed delivery agent\nI want to deliver Task 1 from the pinned source plan\nSo that issue #1052 advances through traceable execution';
    const paths = await writeProposalFragments({ proposal, scratchDir });
    await assert.rejects(
      pexec(
        process.execPath,
        [path.join(process.cwd(), 'bin/aitm.mjs'), ...paths.creatorArgs, '--dry-run'],
        { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 }
      ),
      (error) => {
        assert.equal(error.code, 2);
        assert.match(error.stderr, /--user-story-file story-administrative-beneficiary:/);
        assert.match(error.stderr, /story-task-as-capability:/);
        assert.match(error.stderr, /story-workflow-progress-value:/);
        assert.match(error.stderr, /story-traceability-only-value:/);
        assert.equal(error.stdout, '');
        return true;
      }
    );
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

function orchestrationInput(overrides = {}) {
  const scratchDir = mkdtempSync(path.join(process.cwd(), '.scratch', 'split-plan-run-test-'));
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

test('historical tasks remain readable but cannot produce split proposals', () => {
  const planText = '### Task 1: Historical\nRun: `node check.mjs`';
  assert.equal(extractPlanTasks(planText).length, 1);
  assert.throws(
    () => buildSplitProposals(input({ planText })),
    /split-task-story-intent-missing.*Task 1: Historical.*line 1/
  );
});

test('aggregates rendered quality and malformed intent across all tasks', () => {
  const planText = input()
    .planText.replace('release operator', 'governed delivery agent')
    .replace(
      '- **Need:** incident evidence is scattered',
      '- **Unknown:** incident evidence is scattered'
    );
  assert.throws(
    () => buildSplitProposals(input({ planText })),
    (error) => {
      assert.match(error.message, /story-administrative-beneficiary/);
      assert.match(error.message, /story-intent-invalid/);
      assert.match(error.message, /Task 1: Classifier/);
      assert.match(error.message, /Milestone 2: CLI/);
      assert.equal(error.violations.length, 2);
      return true;
    }
  );
});

test('bad final task causes zero fragment, preflight, and create calls', async () => {
  const malformed = [
    '',
    SECOND_INTENT.replace('- **Need:** incident evidence is scattered\n', ''),
    SECOND_INTENT.replace('#### Scope', '- **Need:** duplicate\n#### Scope'),
    SECOND_INTENT.replace('**Need:**', '**Unknown:**'),
    SECOND_INTENT.replace('#### Scope', '  continuation\n#### Scope'),
    SECOND_INTENT.replace('#### Scope', '#### Story Intent\n#### Scope'),
    '```markdown\n' + SECOND_INTENT + '\n```',
    '<!--\n' + SECOND_INTENT + '\n-->',
    SECOND_INTENT.replace('#### Story Intent', '#### `Story Intent`'),
    SECOND_INTENT.replace('security auditor', 'governed delivery agent'),
  ];
  for (const intent of malformed) {
    const args = orchestrationInput({ mode: 'confirm' });
    const calls = { fragments: 0, preflight: 0, create: 0 };
    args.deps.readPlanAtCommit = async () => input().planText.replace(SECOND_INTENT, intent);
    args.deps.writeProposalFragments = async () => {
      calls.fragments += 1;
      throw new Error('unexpected fragment write');
    };
    args.deps.runCreator = async (argv) => {
      calls[argv.includes('--dry-run') ? 'preflight' : 'create'] += 1;
      return { exitCode: 0, stdout: 'rendered', stderr: '' };
    };
    try {
      await assert.rejects(
        () => runSplitPlan(args),
        /(?:story-intent|story-administrative-beneficiary)/
      );
      assert.deepEqual(calls, { fragments: 0, preflight: 0, create: 0 });
      assert.deepEqual(readdirSync(args.deps.scratchDir), []);
    } finally {
      args.cleanup();
    }
  }
});

test('production scripts contain no generic split-story renderer phrases', () => {
  const root = path.resolve('scripts');
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (path.relative(root, file).startsWith(`tests${path.sep}`)) continue;
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /As a governed delivery agent|from the pinned source plan|advances through traceable execution/,
      file
    );
  }
});

test('accepted plan previews six distinct stories with exact normalized selectors', () => {
  const planPath = 'docs/superpowers/plans/2026-09-18-1703-user-story-value-quality.md';
  const planText = readFileSync(planPath, 'utf8');
  const tasks = extractPlanTasks(planText);
  assert.equal(tasks.length, 6);
  assert.ok(tasks.every((task) => task.storyIntent && task.storyIntentViolations.length === 0));
  assert.equal(
    parseStoryIntent(planText, {
      headingLevel: 2,
      endLine: planText
        .split('\n')
        .findIndex((line) => line === '## Execution and Review Boundaries'),
    }).ok,
    true
  );
  const proposals = buildSplitProposals(input({ planPath, planText, sourceIssue: 1703 }));
  assert.equal(new Set(proposals.map((proposal) => proposal.userStory)).size, 6);
  for (let index = 0; index < 6; index += 1) {
    assert.ok(
      proposals[index].planMetadata.includes(`- **Source-plan-section**: ${tasks[index].heading}`)
    );
    assert.doesNotMatch(proposals[index].scope, /^#### Story Intent$/m);
  }
});

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
    INTENT,
    'Run: `node --test classifier.test.mjs`',
    '### Task 2: Committed CLI',
    SECOND_INTENT,
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
            '**Governing-spec**: docs/superpowers/specs/delivered/2026-08-03-nested-epic-decomposition-design.md'
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
