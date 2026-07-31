// @story #1049
// cspell:ignore execdir fprint okdir
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

async function authorityCalls(command, overrides = {}) {
  const calls = [];
  const result = await runBashGuard(
    { tool_name: 'Bash', tool_input: { command } },
    baseDeps({
      withGovernedEffect: async (options, callback) => {
        calls.push(options);
        return callback();
      },
      ...overrides,
    })
  );
  return { result, calls };
}

test('file-descriptor redirects write files while true descriptor duplication remains read-only', async () => {
  for (const command of [
    'printf x 1> src/stdout.mjs',
    'printf x 2> src/stderr.mjs',
    'printf x 2>> src/stderr-append.mjs',
    'printf x 2>&src/stderr-named.mjs',
  ]) {
    const { result, calls } = await authorityCalls(command);
    assert.equal(result.decision, 'allow', command);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ['source-write'],
      command
    );
  }

  const duplicated = await authorityCalls('printf x 2>&1');
  assert.equal(duplicated.result.decision, 'allow');
  assert.deepEqual(duplicated.calls, []);
});

test('process substitutions recurse for source effects and defeat whole-command AITM bypass', async () => {
  for (const command of [
    'cat <(touch src/process-input.mjs)',
    'printf x > >(touch src/process-output.mjs)',
    'npx aitm status <(touch src/aitm-process.mjs)',
  ]) {
    const { result, calls } = await authorityCalls(command);
    assert.equal(result.decision, 'allow', command);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ['source-write'],
      command
    );
  }
});

test('quoted outside paths in descriptors, process substitutions, and target directories pure-block before authority', async () => {
  for (const command of [
    'printf x 2> "/tmp/stderr.mjs"',
    'cat <(touch "/tmp/process-input.mjs")',
    'cp --target-directory="/tmp/outside" .tmp/inspect/input',
  ]) {
    let authorityCount = 0;
    const result = await runBashGuard(
      { tool_name: 'Bash', tool_input: { command } },
      baseDeps({
        withGovernedEffect: async () => {
          authorityCount += 1;
        },
      })
    );
    assert.equal(result.decision, 'block', command);
    assert.match(result.reason, /outside allowed scope/, command);
    assert.equal(authorityCount, 0, command);
  }
});

test('sed, find, and target-directory mutation forms are governed', async () => {
  for (const command of [
    'sed -ni s/old/new/ src/edited.mjs',
    'sed --in-place=.bak s/old/new/ src/edited.mjs',
    'find scripts -name stale.mjs -execdir touch src/found.mjs {} +',
    'find scripts -name stale.mjs -okdir touch src/found.mjs {} +',
    'find scripts -fprintf src/find-report.txt "%p\\n"',
    'find scripts -fprint src/find-print.txt',
    'find scripts -fls src/find-list.txt',
    'cp --target-directory=src .tmp/inspect/input',
    'mv --target-directory src .tmp/inspect/input',
    'mv --target-directory=.tmp/inspect src/input.mjs',
    'install -t src .tmp/inspect/input',
  ]) {
    const { result, calls } = await authorityCalls(command);
    assert.equal(result.decision, 'allow', command);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ['source-write'],
      command
    );
  }
});

test('operand roles preserve scratch-only writes', async () => {
  for (const command of [
    'cp src/input.mjs .tmp/inspect/output.mjs',
    'cp --target-directory=.tmp/inspect src/input.mjs',
    'mkdir -m 755 .tmp/inspect/mode-dir',
    'touch -r src/reference.mjs .tmp/inspect/stamped.mjs',
    'install -m 755 src/input.mjs .tmp/inspect/installed.mjs',
  ]) {
    const { result, calls } = await authorityCalls(command);
    assert.equal(result.decision, 'allow', command);
    assert.deepEqual(calls, [], command);
  }
});

test('commit grammar normalizes execution wrappers, shell clusters, control words, and process substitutions', async () => {
  for (const command of [
    'env -u FOO git commit -m "[#1049] env unset"',
    'env sh -lc "git commit -m \'[#1049] env shell\'"',
    'sh -lc "git commit -m \'[#1049] shell cluster\'"',
    'exec git commit -m "[#1049] exec"',
    'time git commit -m "[#1049] time"',
    'nice -n 5 git commit -m "[#1049] nice"',
    '{ git commit -m "[#1049] group"; }',
    '! git commit -m "[#1049] negated"',
    'if true; then git commit -m "[#1049] conditional"; fi',
    'cat <(git commit -m "[#1049] process commit")',
  ]) {
    const { result, calls } = await authorityCalls(command);
    assert.equal(result.decision, 'allow', command);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ['issue-attributed-commit'],
      command
    );
  }
});

test('commit refs come only from message sources and still reject an actually wrong message', async () => {
  const correct = await authorityCalls(
    'git -c user.name="[#1050]" commit --author="Other [#1050]" -m "[#1049] correct" # [#1050]'
  );
  assert.equal(correct.result.decision, 'allow');
  assert.deepEqual(
    correct.calls.map((call) => call.operation),
    ['issue-attributed-commit']
  );

  const fromFile = await authorityCalls('git commit --file .tmp/inspect/commit-message.txt', {
    readCommitMessageFile: () => '[#1049] from file',
  });
  assert.equal(fromFile.result.decision, 'allow');
  assert.deepEqual(
    fromFile.calls.map((call) => call.operation),
    ['issue-attributed-commit']
  );

  const wrong = await authorityCalls('time git commit --message="[#1050] wrong"');
  assert.equal(wrong.result.decision, 'block');
  assert.equal(wrong.result.code, 'bash-commit-binding-mismatch');
  assert.deepEqual(wrong.calls, []);
});

test('common unbound analysis commands and env-wrapped exact AITM remain authority-free', async () => {
  for (const command of [
    'cd scripts && git status --short',
    'git branch -vv',
    'git remote -v',
    'git tag --list',
    'gh auth status',
    'npx eslint scripts/task-tracker/bash-guard.mjs',
    'npx prettier --check scripts/task-tracker/bash-guard.mjs',
    'npx cspell scripts/task-tracker/bash-guard.mjs',
    'env npx aitm status',
    "find scripts -name '*.mjs' -print",
  ]) {
    const { result, calls } = await authorityCalls(command, {
      readBoundState: () => ({ activeIssue: null, state: null }),
    });
    assert.equal(result.decision, 'allow', command);
    assert.deepEqual(calls, [], command);
  }
});

test('missing and stale authority prevent representative parser effects', async () => {
  for (const authorityCode of ['lease-not-held', 'fence-stale']) {
    for (const command of [
      'printf x 2> src/stderr.mjs',
      'cat <(touch src/process-input.mjs)',
      'sed -ni s/old/new/ src/edited.mjs',
      'cp --target-directory=src .tmp/inspect/input',
    ]) {
      let callbackCount = 0;
      const result = await runBashGuard(
        { tool_name: 'Bash', tool_input: { command } },
        baseDeps({
          withGovernedEffect: async () => {
            const error = new Error(authorityCode);
            error.code = authorityCode;
            throw error;
          },
          onAuthorizedCommand: () => {
            callbackCount += 1;
          },
        })
      );
      assert.equal(result.decision, 'block', `${authorityCode}: ${command}`);
      assert.equal(callbackCount, 0, command);
    }
  }
});
