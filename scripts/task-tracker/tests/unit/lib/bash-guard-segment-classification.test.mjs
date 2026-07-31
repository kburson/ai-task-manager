// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBashGuard } from '../../../bash-guard.mjs';

function baseDeps(overrides = {}) {
  return {
    projectRoot: '/repo',
    homeDir: '/home/test',
    readBoundState: () => ({ activeIssue: '#1049', state: 'develop' }),
    isChoreModeActive: () => false,
    ...overrides,
  };
}

test('every mutator operand is classified so a leading scratch path cannot hide a source effect', async () => {
  for (const command of [
    'touch .tmp/inspect/safe src/touch.mjs',
    'rm .tmp/inspect/safe src/remove.mjs',
    'mkdir -p .tmp/inspect/safe src/new-dir',
    'cp .tmp/inspect/input src/copied.mjs',
    'mv .tmp/inspect/input src/moved.mjs',
    'install -m 755 .tmp/inspect/input src/installed.mjs',
    'printf x | tee .tmp/inspect/safe src/tee.mjs',
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
});

test('nested command substitutions are recursively classified', async () => {
  for (const command of [
    'echo $(touch src/substitution.mjs)',
    'echo "$(touch src/double-quoted-substitution.mjs)"',
    'printf "%s\\n" `touch src/backtick-substitution.mjs`',
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
});

test('interpreter payloads, preload scripts, wrappers, and ambiguous commands fail closed to source authority', async () => {
  for (const command of [
    'sed -i.bak s/old/new/ src/edited.mjs',
    "node -e \"require('node:fs').writeFileSync('src/inline.mjs', 'x')\"",
    'node -r scripts/custom-loader.mjs tests/example.test.mjs',
    'node --require scripts/custom-loader.mjs tests/example.test.mjs',
    'env node scripts/custom-generator.mjs',
    'command node scripts/custom-generator.mjs',
    'custom-generator --output src/generated.mjs',
    'node --require scripts/custom-loader.mjs --check src/index.mjs',
    'npm run lint -- --fix',
    'git worktree add ../other feature',
    'git diff --output=src/diff.txt',
    'gh api repos/o/r/issues/1 -X PATCH -f state=closed',
    'find scripts -name stale.mjs -delete',
    'sort -o src/sorted.txt src/input.txt',
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
});

test('all-scratch mutations and positively proven reads remain authority-free', async () => {
  const commands = [
    'touch .tmp/inspect/one .tmp/inspect/two',
    'rm .tmp/inspect/one .tmp/inspect/two',
    'cp .tmp/inspect/one .tmp/inspect/two',
    'mv .tmp/inspect/one .tmp/inspect/two',
    'echo "cp src/a src/b"',
    "printf '%s\\n' 'touch src/not-a-command.mjs'",
    'pwd',
    'ls -la src',
    'cat src/index.mjs',
    'rg -n source-write scripts/task-tracker',
    'git status --short',
    'git diff --check',
    'sed -n 1,20p src/index.mjs',
    'echo "$(git rev-parse HEAD)"',
    'node --check scripts/task-tracker/bash-guard.mjs',
    'npm run lint',
    'npm run format:check',
    'git worktree list --porcelain',
    'gh api repos/o/r/issues',
    "find scripts -name '*.mjs' -print",
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
    assert.equal(result.decision, 'allow', command);
    assert.equal(governed, 0, command);
  }
});

test('missing and stale lease refusals cover every adversarial source-effect family with zero callback effect', async () => {
  const commands = [
    'touch .tmp/inspect/safe src/touch.mjs',
    'echo $(touch src/substitution.mjs)',
    'cp .tmp/inspect/input src/copied.mjs',
    'sed -i s/old/new/ src/edited.mjs',
    "node -e \"require('node:fs').writeFileSync('src/inline.mjs', 'x')\"",
    'env node scripts/custom-generator.mjs',
    'custom-generator --output src/generated.mjs',
  ];
  for (const authorityCode of ['lease-not-held', 'fence-stale']) {
    for (const command of commands) {
      let commandCallback = 0;
      const result = await runBashGuard(
        { tool_name: 'Bash', tool_input: { command } },
        baseDeps({
          withGovernedEffect: async () => {
            const error = new Error(`refused ${authorityCode}`);
            error.code = authorityCode;
            throw error;
          },
          onAuthorizedCommand: () => {
            commandCallback += 1;
          },
        })
      );
      assert.equal(result.decision, 'block', `${authorityCode}: ${command}`);
      assert.equal(result.code, 'bash-source-authority-refused', command);
      assert.match(result.reason, new RegExp(authorityCode), command);
      assert.equal(commandCallback, 0, command);
    }
  }
});
