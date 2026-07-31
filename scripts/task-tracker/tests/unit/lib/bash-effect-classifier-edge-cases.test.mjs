// @story #1049
// cspell:ignore cmain execdir fprint nohup okdir
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

test('clobber redirects govern source writes while preserving scratch-only writes', async () => {
  const source = await authorityCalls('printf x >| src/clobbered.mjs');
  assert.equal(source.result.decision, 'allow');
  assert.deepEqual(
    source.calls.map((call) => call.operation),
    ['source-write']
  );

  const scratch = await authorityCalls('printf x >| .tmp/inspect/clobbered.txt');
  assert.equal(scratch.result.decision, 'allow');
  assert.deepEqual(scratch.calls, []);
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
    'printf x >| "/tmp/clobbered.mjs"',
    'cat <(touch "/tmp/process-input.mjs")',
    'cp --target-directory="/tmp/outside" .tmp/inspect/input',
    "find . -exec sh -c 'touch /tmp/find-plus.mjs' {} +",
    "find . -exec sh -c 'touch /tmp/find-semicolon.mjs' {} \\;",
    'find /tmp -delete',
    'find /tmp -exec rm {} +',
    `find /etc/passwd -exec sh -c 'rm -f "$1"' sh {} \\;`,
    `find /usr/bin/true -exec sh -c 'rm -f "$1"' sh {} +`,
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
    "find . -exec sh -c 'touch src/find-plus.mjs' {} +",
    "find . -exec sh -c 'touch src/find-semicolon.mjs' {} \\;",
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
    "find . -exec sh -c 'touch .tmp/inspect/find-plus.txt' {} +",
    "find . -exec sh -c 'touch .tmp/inspect/find-semicolon.txt' {} \\;",
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
    'nice -5 git commit -m "[#1049] nice shorthand"',
    'nohup git commit -m "[#1049] nohup"',
    '{ git commit -m "[#1049] group"; }',
    '! git commit -m "[#1049] negated"',
    'if true; then git commit -m "[#1049] conditional"; fi',
    'cat <(git commit -m "[#1049] process commit")',
    'find . -exec sh -c \'git commit -m "[#1049] find plus"\' {} +',
    'find . -exec sh -c \'git commit -m "[#1049] find semicolon"\' {} \\;',
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

test('unresolved commit-message sources fail closed before lease authority', async () => {
  for (const command of [
    'git commit',
    'git commit --amend',
    'git commit -F -',
    'git commit -F .tmp/inspect/missing-message.txt',
    'git commit -C HEAD',
    'git commit --reuse-message=HEAD',
    'git commit --amend --no-edit',
    'git commit --fixup=HEAD',
    'git commit --squash=HEAD',
    'git commit --fixup HEAD -m "[#1049] explicit body"',
    'git commit --squash HEAD -m "[#1049] explicit body"',
    'git commit -Cmain -m "[#1049] explicit body"',
    'git commit -cmain -m "[#1049] explicit body"',
    'git commit --reuse-message=HEAD -m "[#1049] explicit body"',
    'git commit --reedit-message=HEAD -m "[#1049] explicit body"',
    'git commit --template=.tmp/inspect/template.txt',
    'git commit -t.tmp/inspect/template.txt',
    'git commit -Cmain',
    'git commit -cmain',
  ]) {
    const { result, calls } = await authorityCalls(command, {
      readCommitMessageFile: () => {
        throw new Error('unreadable');
      },
    });
    assert.equal(result.decision, 'block', command);
    assert.equal(result.code, 'bash-commit-message-unresolved', command);
    assert.deepEqual(calls, [], command);
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

  const amendedInline = await authorityCalls('git commit --amend -m "[#1049] resolved amend"');
  assert.equal(amendedInline.result.decision, 'allow');
  assert.deepEqual(
    amendedInline.calls.map((call) => call.operation),
    ['issue-attributed-commit']
  );

  for (const command of [
    'git commit -t.tmp/inspect/template.txt -m "[#1049] explicit override"',
    'git commit -am"[#1049] clustered message"',
    'git commit -m"[#1049] attached message"',
  ]) {
    const explicit = await authorityCalls(command);
    assert.equal(explicit.result.decision, 'allow', command);
    assert.deepEqual(
      explicit.calls.map((call) => call.operation),
      ['issue-attributed-commit'],
      command
    );
  }

  let attachedFileReads = 0;
  const attachedFile = await authorityCalls('git commit -F.tmp/inspect/message.txt', {
    readCommitMessageFile: () => {
      attachedFileReads += 1;
      return '[#1050] wrong attached file';
    },
  });
  assert.equal(attachedFile.result.decision, 'block');
  assert.equal(attachedFile.result.code, 'bash-commit-binding-mismatch');
  assert.equal(attachedFileReads, 1);

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

test('GitHub issue mutations are never treated as authority-free reads', async () => {
  const edit = await authorityCalls('gh issue edit 1049 --add-label bug');
  assert.equal(edit.result.decision, 'allow');
  assert.deepEqual(
    edit.calls.map((call) => call.operation),
    ['source-write']
  );

  const reopen = await authorityCalls('gh issue reopen 1049');
  assert.equal(reopen.result.decision, 'block');
  assert.match(reopen.result.reason, /task reconcile/);
  assert.deepEqual(reopen.calls, []);
});

test('missing and stale authority prevent representative parser effects', async () => {
  for (const authorityCode of ['lease-not-held', 'fence-stale']) {
    for (const command of [
      'printf x 2> src/stderr.mjs',
      'printf x >| src/clobbered.mjs',
      'cat <(touch src/process-input.mjs)',
      'sed -ni s/old/new/ src/edited.mjs',
      'cp --target-directory=src .tmp/inspect/input',
      "find . -exec sh -c 'touch src/find-authority.mjs' {} +",
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
