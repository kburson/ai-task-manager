// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBashGuard } from '../../../bash-guard.mjs';

const PROJECT_ROOT = '/repo';

function baseDeps(overrides = {}) {
  return {
    projectRoot: PROJECT_ROOT,
    homeDir: '/home/test',
    readBoundState: () => ({ activeIssue: '#1049', state: 'develop' }),
    isChoreModeActive: () => false,
    ...overrides,
  };
}

test('pure Bash policy refusals never initialize work-lease authority', async () => {
  const commands = [
    'gh issue create --title x --body y',
    'gh issue close 1049',
    'gh issue edit 1049 --body "replacement"',
    'node scripts/gh/move-state.mjs 1049 done',
  ];
  for (const command of commands) {
    let governed = 0;
    const result = await runBashGuard(
      { tool_name: 'Bash', tool_input: { command } },
      baseDeps({
        withGovernedEffect: async () => {
          governed += 1;
        },
      })
    );
    assert.equal(result.decision, 'block', command);
    assert.equal(governed, 0, command);
  }
});

test('accepted shell source mutation verifies exact bound issue and operation once', async () => {
  const calls = [];
  const result = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: 'printf x > src/guarded.mjs' } },
    baseDeps({
      withGovernedEffect: async (options, callback) => {
        calls.push(options);
        return callback();
      },
    })
  );
  assert.equal(result.decision, 'allow');
  assert.deepEqual(calls, [
    {
      issueId: '1049',
      operation: 'source-write',
      heartbeat: true,
    },
  ]);
});

test('quoted redirect, tee, and write-command targets remain governed without prose false positives', async () => {
  for (const command of [
    'echo x > "src/double-quoted.mjs"',
    "echo x > 'src/single-quoted.mjs'",
    'echo x | tee "src/tee-quoted.mjs"',
    "touch 'src/touch-quoted.mjs'",
  ]) {
    let governed = 0;
    const result = await runBashGuard(
      { tool_name: 'Bash', tool_input: { command } },
      baseDeps({
        withGovernedEffect: async (options, callback) => {
          governed += 1;
          assert.equal(options.operation, 'source-write');
          return callback();
        },
      })
    );
    assert.equal(result.decision, 'allow', command);
    assert.equal(governed, 1, command);
  }

  let governed = 0;
  const prose = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: "echo 'touch src/not-a-command.mjs'" } },
    baseDeps({
      withGovernedEffect: async () => {
        governed += 1;
      },
    })
  );
  assert.equal(prose.decision, 'allow');
  assert.equal(governed, 0);
});

test('stale source fence blocks before the command callback can run', async () => {
  let commandCallback = 0;
  const result = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: 'touch src/guarded.mjs' } },
    baseDeps({
      withGovernedEffect: async () => {
        const error = new Error('stale source lease');
        error.code = 'fence-stale';
        throw error;
      },
      onAuthorizedCommand: () => {
        commandCallback += 1;
      },
    })
  );
  assert.equal(result.decision, 'block');
  assert.equal(result.code, 'bash-source-authority-refused');
  assert.match(result.reason, /fence-stale/);
  assert.equal(commandCallback, 0);
});

test('missing lease blocks source and bound commit commands with zero callback effect', async () => {
  for (const [command, code] of [
    ['touch src/guarded.mjs', 'bash-source-authority-refused'],
    ['git commit -m "feat: bound but unleased"', 'bash-commit-authority-refused'],
  ]) {
    let commandCallback = 0;
    const result = await runBashGuard(
      { tool_name: 'Bash', tool_input: { command } },
      baseDeps({
        withGovernedEffect: async () => {
          const error = new Error('session has no persisted work lease');
          error.code = 'lease-not-held';
          throw error;
        },
        onAuthorizedCommand: () => {
          commandCallback += 1;
        },
      })
    );
    assert.equal(result.decision, 'block');
    assert.equal(result.code, code);
    assert.match(result.reason, /lease-not-held/);
    assert.equal(commandCallback, 0);
  }
});

test('issue-attributed commit verifies exact bound target and rejects mismatches first', async () => {
  const calls = [];
  const allowed = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: 'git commit -m "[#1049] feat: guarded"' } },
    baseDeps({
      withGovernedEffect: async (options, callback) => {
        calls.push(options);
        return callback();
      },
    })
  );
  assert.equal(allowed.decision, 'allow');
  assert.deepEqual(calls, [
    {
      issueId: '1049',
      operation: 'issue-attributed-commit',
      heartbeat: true,
    },
  ]);

  const mismatch = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: 'git commit -m "[#1050] feat: wrong"' } },
    baseDeps({
      withGovernedEffect: async () => {
        throw new Error('mismatch must not initialize authority');
      },
    })
  );
  assert.equal(mismatch.decision, 'block');
  assert.equal(mismatch.code, 'bash-commit-binding-mismatch');
  assert.match(mismatch.reason, /#1050/);
  assert.match(mismatch.reason, /#1049/);
});

test('sanctioned AITM commands bypass Bash authority but arbitrary node scripts do not', async () => {
  let governed = 0;
  const sanctioned = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: 'npx aitm promote 1049' } },
    baseDeps({
      withGovernedEffect: async () => {
        governed += 1;
      },
    })
  );
  assert.equal(sanctioned.decision, 'allow');
  assert.equal(governed, 0);

  const arbitrary = await runBashGuard(
    {
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/custom-generator.mjs' },
    },
    baseDeps({
      withGovernedEffect: async (options, callback) => {
        governed += 1;
        assert.equal(options.operation, 'source-write');
        return callback();
      },
    })
  );
  assert.equal(arbitrary.decision, 'allow');
  assert.equal(governed, 1);
});

test('read, test, build, scratch, chore, and unbound commits preserve authority bypass', async () => {
  const cases = [
    ['git status --short', false, '#1049'],
    ['node --test tests/example.test.mjs', false, '#1049'],
    ['node --test scripts/task-tracker/tests/unit/lib/example.test.mjs', false, '#1049'],
    ['npm run build', false, '#1049'],
    ['touch .tmp/inspect/probe.mjs', false, '#1049'],
    ['git commit -m "chore: local maintenance"', false, null],
    ['touch src/chore-only.mjs', true, null],
  ];
  for (const [command, choreMode, activeIssue] of cases) {
    let governed = 0;
    const result = await runBashGuard(
      { tool_name: 'Bash', tool_input: { command } },
      baseDeps({
        readBoundState: () => ({ activeIssue, state: activeIssue ? 'develop' : null }),
        isChoreModeActive: () => choreMode,
        withGovernedEffect: async () => {
          governed += 1;
        },
      })
    );
    assert.equal(result.decision, 'allow', command);
    assert.equal(governed, 0, command);
  }
});

test('tokenless commit with an active binding is session-attributed and governed', async () => {
  const calls = [];
  const result = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command: 'git commit -m "feat: warning comes later"' } },
    baseDeps({
      withGovernedEffect: async (options, callback) => {
        calls.push(options);
        return callback();
      },
    })
  );
  assert.equal(result.decision, 'allow');
  assert.equal(calls[0].issueId, '1049');
  assert.equal(calls[0].operation, 'issue-attributed-commit');
});
