// @story #1325
// cspell:ignore Ovim textcon
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  MutationParseError,
  extractApplyPatchTargets,
  extractBashWriteTargets,
} from '../../../../task-tracker/lib/mutation-targets.mjs';
import { classifyReviewerCoReviewCommand } from '../../../../task-tracker/lib/reviewer-co-review-command.mjs';
import { evaluateCoReviewWrite } from '../../../../task-tracker/lib/co-review-write-policy.mjs';
import { findMainWorktreePath } from '../../../../task-tracker/fleet-registry.mjs';
import { closedBindingsPath } from '../../../../task-tracker/paths.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('apply_patch parser extracts add, update, delete, move, and multiple targets', () => {
  const patchText = `*** Begin Patch
*** Add File: .tmp/review/new.md
+new
*** Update File: src/a.mjs
@@
-old
+new
*** Move to: src/b.mjs
*** Delete File: src/c.mjs
*** End Patch`;
  assert.deepEqual(extractApplyPatchTargets(patchText), [
    '.tmp/review/new.md',
    'src/a.mjs',
    'src/b.mjs',
    'src/c.mjs',
  ]);
});

test('apply_patch parser rejects malformed, unsupported, empty, and traversing patches', () => {
  for (const input of [
    '',
    '*** Begin Patch\n*** End Patch',
    '*** Begin Patch\n*** Rename File: a\n*** End Patch',
    '*** Begin Patch\n*** Add File: ../escape\n*** End Patch',
    '*** Add File: a',
  ]) {
    assert.throws(() => extractApplyPatchTargets(input), MutationParseError);
  }
});

test('bash parser reports destinations and rejects shell composition or unknown mutations', () => {
  const root = '/repo';
  assert.deepEqual(extractBashWriteTargets('printf x > .tmp/review.md && touch src/a', root), {
    targets: ['/repo/.tmp/review.md', '/repo/src/a'],
    ambiguousMutation: true,
  });
  assert.equal(
    extractBashWriteTargets('node -e "writeFileSync(x,y)"', root).ambiguousMutation,
    true
  );
  assert.equal(extractBashWriteTargets('printf x > "$TARGET"', root).ambiguousMutation, true);
  for (const command of [
    "sed -i 's/old/new/' src/a.mjs",
    'dd if=input.bin of=src/output.bin',
    'curl https://example.test/file --output src/file.bin',
    'git apply changes.patch',
    'git switch other',
    'git stash push',
    'git pull',
    'find src -type f -delete',
    'tar -xf payload.tar',
    'PATH=/tmp rg needle src',
    '/tmp/rg needle src',
    'git diff --output=src/a.mjs',
    "git -c alias.diff='reset --hard' diff",
    'git grep -O vim needle',
    'sort -o src/a.mjs input.txt',
    'uniq input.txt src/a.mjs',
    'rg --hostname-bin=./mutator needle src',
    'cat missing 1> src/clobber.txt',
    'cat missing 2> src/clobber.txt',
    'cat missing &> src/clobber.txt',
    'cat package.json & dd if=/dev/zero of=src/clobber.txt',
    "cat package.json & sed -i.bak 's/a/b/' src/a.mjs",
    'git grep -Ovim needle',
    'file -C -m src/payload.magic',
    'cat <(dd if=/dev/zero of=src/clobber.txt)',
    'git cat-file --textcon HEAD:package.json',
    'git cat-file --fil HEAD:package.json',
    'git grep --open-files-in-page=false name -- package.json',
  ]) {
    assert.equal(
      extractBashWriteTargets(command, root).ambiguousMutation,
      true,
      `${command} must not fall through as read-only`
    );
  }
  for (const command of ['printf x2> src/clobber.txt', 'echo hello2>src/clobber.txt']) {
    assert.deepEqual(extractBashWriteTargets(command, root).targets, ['/repo/src/clobber.txt']);
  }
  for (const command of ['git status --short', 'git diff --stat', 'rg needle src', 'cat src/a']) {
    assert.equal(
      extractBashWriteTargets(command, root).ambiguousMutation,
      false,
      `${command} is an explicitly read-only reviewer command`
    );
  }
});

function classifierFixture() {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-review-command-'));
  const localBin = path.join(projectDir, 'node_modules', '.bin', 'aitm');
  mkdirSync(path.dirname(localBin), { recursive: true });
  writeFileSync(localBin, '#!/usr/bin/env node\n', 'utf8');
  const classify = (command, overrides = {}) =>
    classifyReviewerCoReviewCommand(command, {
      projectDir,
      exists: existsSync,
      ...overrides,
    });
  return { projectDir, localBin, classify };
}

test('reviewer command classifier recognizes the sanctioned dogfood self-link topology', () => {
  const projectDir = mkdtempSync(
    path.join(projectScratchDir('test'), 'aitm-review-command-self-link-')
  );
  mkdirSync(path.join(projectDir, 'node_modules'), { recursive: true });
  mkdirSync(path.join(projectDir, 'bin'), { recursive: true });
  symlinkSync('..', path.join(projectDir, 'node_modules', 'ai-task-manager'), 'dir');
  writeFileSync(path.join(projectDir, 'bin', 'aitm.mjs'), '#!/usr/bin/env node\n', 'utf8');
  writeFileSync(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify({
      name: '@kburson/ai-task-manager',
      bin: { aitm: 'bin/aitm.mjs' },
    })}\n`,
    'utf8'
  );

  assert.deepEqual(
    classifyReviewerCoReviewCommand('npx aitm co-review help handoff', { projectDir }),
    { recognized: true, kind: 'help-handoff' }
  );

  writeFileSync(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify({
      name: '@kburson/ai-task-manager',
      bin: { aitm: 'bin/not-aitm.mjs' },
    })}\n`,
    'utf8'
  );
  assert.deepEqual(
    classifyReviewerCoReviewCommand('npx aitm co-review help handoff', { projectDir }),
    { recognized: false, reason: 'local-aitm-unavailable' }
  );
});

test('reviewer command classifier accepts only the generated lifecycle forms', () => {
  const { classify } = classifierFixture();
  const absoluteRuntime = '/repo/.worktrees/939/.tmp/co-review/p1';
  const absoluteReview = `${absoluteRuntime}/round-2-reviewer-review.md`;
  assert.deepEqual(classify('npx aitm co-review status --dir .tmp/co-review/p1'), {
    recognized: true,
    kind: 'status',
    runtimeDir: '.tmp/co-review/p1',
    json: false,
  });
  assert.deepEqual(classify('npx aitm co-review status --json --dir .tmp/co-review/p1'), {
    recognized: true,
    kind: 'status',
    runtimeDir: '.tmp/co-review/p1',
    json: true,
  });
  assert.deepEqual(classify('npx aitm co-review help handoff'), {
    recognized: true,
    kind: 'help-handoff',
  });
  assert.deepEqual(classify(`npx aitm co-review status --dir ${absoluteRuntime}`), {
    recognized: true,
    kind: 'status',
    runtimeDir: absoluteRuntime,
    json: false,
  });
  assert.deepEqual(
    classify(
      `npx aitm co-review handoff --dir ${absoluteRuntime} --actor claude ` +
        `--review ${absoluteReview} --review-of abc --decision accepted ` +
        '--message "review complete"'
    ),
    {
      recognized: true,
      kind: 'reviewer-handoff',
      runtimeDir: absoluteRuntime,
      actor: 'claude',
      reviewPath: absoluteReview,
      reviewOf: 'abc',
      decision: 'accepted',
      summaryPath: null,
      message: 'review complete',
    }
  );

  const handoff = classify(
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/round-2-reviewer-review.md ' +
      '--review-of 0123456789012345678901234567890123456789 ' +
      '--decision accepted --message "review complete"'
  );
  assert.deepEqual(handoff, {
    recognized: true,
    kind: 'reviewer-handoff',
    runtimeDir: '.tmp/co-review/p1',
    actor: 'claude',
    reviewPath: '.tmp/co-review/p1/round-2-reviewer-review.md',
    reviewOf: '0123456789012345678901234567890123456789',
    decision: 'accepted',
    summaryPath: null,
    message: 'review complete',
  });

  const punctuated = classify(
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/round-2-reviewer-review.md ' +
      '--review-of 0123456789012345678901234567890123456789 ' +
      '--decision accepted ' +
      "--message 'review complete: accepted with 4 refinement findings " +
      "(F-001 squash token completeness is the only load-bearing one)'"
  );
  assert.equal(punctuated.recognized, true);
  assert.equal(
    punctuated.message,
    'review complete: accepted with 4 refinement findings ' +
      '(F-001 squash token completeness is the only load-bearing one)'
  );

  const doubleQuotedPunctuation = classify(
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/round-2-reviewer-review.md ' +
      '--review-of abc --decision accepted --message "review complete (F-001) [accepted]"'
  );
  assert.equal(doubleQuotedPunctuation.recognized, true);
  assert.equal(doubleQuotedPunctuation.message, 'review complete (F-001) [accepted]');

  const literalSingleQuoted = classify(
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/round-2-reviewer-review.md ' +
      "--review-of abc --decision accepted --message 'literal $USER $(pwd) `date`'"
  );
  assert.equal(literalSingleQuoted.recognized, true);
  assert.equal(literalSingleQuoted.message, 'literal $USER $(pwd) `date`');

  assert.deepEqual(
    classify(
      'npx aitm co-review handoff --summary .tmp/co-review/p1/summary.md ' +
        '--decision changes-requested --review-of abc123 --message "changes requested" ' +
        '--review .tmp/co-review/p1/round-2-reviewer-review.md --actor claude ' +
        '--dir .tmp/co-review/p1'
    ),
    {
      recognized: true,
      kind: 'reviewer-handoff',
      runtimeDir: '.tmp/co-review/p1',
      actor: 'claude',
      reviewPath: '.tmp/co-review/p1/round-2-reviewer-review.md',
      reviewOf: 'abc123',
      decision: 'changes-requested',
      summaryPath: '.tmp/co-review/p1/summary.md',
      message: 'changes requested',
    }
  );
});

test('reviewer command classifier rejects every broader shell and CLI form', () => {
  const { classify, localBin } = classifierFixture();
  const rejected = [
    'npx aitm co-review status --dir .tmp/co-review/p1 && touch owned',
    'npx aitm co-review status --dir .tmp/co-review/p1 > .tmp/status.json',
    'npx aitm co-review status --dir "$RUNTIME"',
    'npx aitm co-review status --dir $(pwd)',
    'PATH=/bin npx aitm co-review status --dir .tmp/co-review/p1',
    'bash -lc "npx aitm co-review status --dir .tmp/co-review/p1"',
    'node scripts/review/co-review.mjs status --dir .tmp/co-review/p1',
    './node_modules/.bin/aitm co-review status --dir .tmp/co-review/p1',
    'npx aitm close 1365',
    'npx aitm co-review claim --dir .tmp/co-review/p1 --actor claude',
    'npx aitm co-review help status',
    'npx aitm co-review status --dir .tmp/co-review/p1 --dir .tmp/co-review/p2',
    'npx aitm co-review status --dir ../outside',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision maybe ' +
      '--message review',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message "review for $USER"',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message "review from `whoami`"',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message review(F-001)',
    'npx aitm co-review status --dir ".tmp/co-\\review/p1"',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review ".tmp/co-review/p1/round-2-\\reviewer-review.md" ' +
      '--review-of abc --decision accepted --message review',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --summary ".tmp/co-review/p1/\\summary.md" ' +
      '--review-of abc --decision changes-requested --message review',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message "review\tcomplete"',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message "review\u0007complete"',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message "review\u001bcomplete"',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision accepted ' +
      '--message "review\u007fcomplete"',
  ];
  for (const command of rejected) {
    assert.equal(classify(command).recognized, false, command);
  }
  assert.equal(
    classify('npx aitm co-review status --dir .tmp/co-review/p1', {
      exists: (candidate) => candidate !== localBin,
    }).recognized,
    false
  );
});

function policyFixture() {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-review-policy-'));
  const dir = path.join(projectDir, '.tmp', 'review-protocol');
  mkdirSync(dir, { recursive: true });
  const pending = path.join(dir, 'round-2-reviewer-review.md');
  const grant = {
    protocolId: 'p1',
    dir,
    worktree: projectDir,
    reviewer: 'claude',
    lifecycle: 'active',
    pendingReviewPath: pending,
    claimedRole: 'reviewer',
    claimedProvider: 'grok',
    claimedSid: 'sid-1',
    ownerHandoffCommit: '0123456789012345678901234567890123456789',
  };
  const rows = { p1: grant };
  const evaluate = (overrides = {}) =>
    evaluateCoReviewWrite({
      projectDir,
      worktreePath: projectDir,
      provider: 'grok',
      sid: 'sid-1',
      toolName: 'Write',
      targets: [pending],
      reviewerCommand: { recognized: false, reason: 'not-co-review' },
      readIndex: () => rows,
      resolveGrant: () => grant,
      resolveRuntimeRoot: () => ({ callerRoot: projectDir, root: projectDir }),
      ...overrides,
    });
  return { projectDir, dir, pending, grant, rows, evaluate };
}

function matchingHandoff({ dir, pending, grant }) {
  return {
    recognized: true,
    kind: 'reviewer-handoff',
    runtimeDir: dir,
    actor: grant.reviewer,
    reviewPath: pending,
    reviewOf: grant.ownerHandoffCommit,
    decision: 'accepted',
    summaryPath: null,
    message: 'review complete',
  };
}

test('matching reviewer status, help, and handoff commands use the session grant', () => {
  const fixture = policyFixture();
  const status = fixture.evaluate({
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: {
      recognized: true,
      kind: 'status',
      runtimeDir: fixture.dir,
      json: false,
    },
  });
  assert.equal(status.reason, 'session-bound-co-review-command');

  const help = fixture.evaluate({
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: { recognized: true, kind: 'help-handoff' },
  });
  assert.equal(help.reason, 'session-bound-co-review-command');

  const handoff = fixture.evaluate({
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: matchingHandoff(fixture),
  });
  assert.equal(handoff.reason, 'session-bound-co-review-command');
});

test('reviewer command fields must agree exactly with live authority', () => {
  const fixture = policyFixture();
  const base = matchingHandoff(fixture);
  const mutations = [
    { runtimeDir: path.join(fixture.projectDir, '.tmp', 'other') },
    { actor: 'codex' },
    { reviewPath: path.join(fixture.dir, 'other.md') },
    { reviewOf: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    {
      decision: 'changes-requested',
      summaryPath: path.join(fixture.projectDir, 'outside.md'),
    },
  ];
  for (const mutation of mutations) {
    const result = fixture.evaluate({
      toolName: 'Bash',
      targets: [],
      ambiguousMutation: true,
      reviewerCommand: { ...base, ...mutation },
    });
    assert.equal(result.decision, 'deny');
  }
});

test('authority targets deny before an otherwise matching reviewer command', () => {
  const fixture = policyFixture();
  const authorityFile = path.join(fixture.projectDir, '.tmp/aitm/fleet/co-review-index.json');
  const result = fixture.evaluate({
    toolName: 'Bash',
    targets: [authorityFile],
    authorityFiles: [authorityFile],
    ambiguousMutation: false,
    reviewerCommand: matchingHandoff(fixture),
  });
  assert.equal(result.code, 'co-review-authority-file');
});

test('a recognized command cannot cross provider-session ownership', () => {
  const fixture = policyFixture();
  const result = fixture.evaluate({
    toolName: 'Bash',
    provider: 'codex',
    sid: 'other-session',
    resolveGrant: () => null,
    statusProtocol: () => ({
      protocolId: 'p1',
      lifecycle: 'active',
      integrity: { ok: true },
      currentRole: 'reviewer',
      turnState: 'claimed',
      claim: { role: 'reviewer', actor: 'claude' },
    }),
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: matchingHandoff(fixture),
  });
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /different provider session/);
});

test('foreign-cwd reviewer command resolves authority from its target runtime', () => {
  const fixture = policyFixture();
  const foreignCaller = path.join(fixture.projectDir, 'foreign-caller');
  mkdirSync(foreignCaller, { recursive: true });
  let resolutionInput;
  const result = fixture.evaluate({
    worktreePath: foreignCaller,
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: matchingHandoff(fixture),
    resolveRuntimeRoot: () => ({ callerRoot: foreignCaller, root: fixture.projectDir }),
    resolveGrant: (input) => {
      resolutionInput = input;
      return fixture.grant;
    },
  });
  assert.equal(result.reason, 'session-bound-co-review-command');
  assert.equal(resolutionInput.runtimeDir, fixture.dir);
  assert.equal(resolutionInput.runtimeRoot, fixture.projectDir);
});

test('foreign-cwd command targeting a live reviewer claim cannot fall through', () => {
  const fixture = policyFixture();
  const foreignCaller = path.join(fixture.projectDir, 'foreign-caller');
  mkdirSync(foreignCaller, { recursive: true });
  const result = fixture.evaluate({
    worktreePath: foreignCaller,
    sid: 'wrong-session',
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: false,
    reviewerCommand: {
      recognized: true,
      kind: 'status',
      runtimeDir: fixture.dir,
      json: false,
    },
    resolveRuntimeRoot: () => ({ callerRoot: foreignCaller, root: fixture.projectDir }),
    resolveGrant: () => null,
    statusProtocol: () => ({
      protocolId: 'p1',
      lifecycle: 'active',
      integrity: { ok: true },
      currentRole: 'reviewer',
      turnState: 'claimed',
      claim: { role: 'reviewer', actor: 'claude' },
    }),
  });
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /different provider session/);
});

test('exact pending artifact is allowed only for the claimed provider session', () => {
  const { pending, evaluate } = policyFixture();
  assert.equal(evaluate().decision, 'allow');
  assert.equal(evaluate({ sid: 'other', resolveGrant: () => null }).decision, 'deny');
  assert.equal(evaluate({ provider: 'codex', resolveGrant: () => null }).decision, 'deny');
  assert.equal(evaluate({ targets: [pending, '/repo/src/a.mjs'] }).decision, 'deny');
});

test('authority files and other protocol or tmp targets deny before ordinary allowances', () => {
  const { projectDir, dir, evaluate } = policyFixture();
  for (const target of [
    path.join(projectDir, '.tmp/aitm/fleet/occupancy.json'),
    path.join(projectDir, '.tmp/aitm/fleet/co-review-index.json'),
    path.join(projectDir, '.tmp/aitm/fleet/closed-bindings.json'),
    path.join(dir, 'state.json'),
    path.join(projectDir, '.tmp/other.md'),
  ]) {
    assert.equal(evaluate({ targets: [target] }).decision, 'deny');
  }
});

test('terminal binding ledger is immutable even without an active reviewer grant', () => {
  const { projectDir, evaluate } = policyFixture();
  const result = evaluate({
    targets: [closedBindingsPath(findMainWorktreePath(projectDir))],
    resolveGrant: () => null,
    readIndex: () => ({}),
  });
  assert.equal(result.code, 'co-review-authority-file');
});

test('malformed or ambiguous reviewer mutations fail closed', () => {
  const { evaluate } = policyFixture();
  assert.equal(
    evaluate({ parseError: new MutationParseError('bad patch'), targets: [] }).decision,
    'deny'
  );
  assert.equal(evaluate({ ambiguousMutation: true, targets: [] }).decision, 'deny');
});

test('first creation is canonicalized through the registered parent and symlink drift denies later', () => {
  const { pending, dir, evaluate } = policyFixture();
  assert.equal(evaluate().decision, 'allow');
  const elsewhere = path.join(path.dirname(dir), 'elsewhere.md');
  writeFileSync(elsewhere, 'x');
  symlinkSync(elsewhere, pending);
  assert.equal(evaluate().decision, 'deny');
});

test('a symlink alias to the pending artifact is not the exact granted path', () => {
  const { projectDir, pending, evaluate } = policyFixture();
  writeFileSync(pending, 'review', 'utf8');
  const alias = path.join(projectDir, 'pending-alias.md');
  symlinkSync(pending, alias);
  assert.equal(evaluate({ targets: [alias] }).decision, 'deny');
});

test('symlink aliases cannot bypass authority or protocol-file protection', () => {
  const { projectDir, dir, rows, evaluate } = policyFixture();
  const authority = path.join(projectDir, '.tmp', 'authority.json');
  const authorityAlias = path.join(projectDir, '.tmp', 'authority-alias.json');
  const protocolFile = path.join(dir, 'state.json');
  const protocolAlias = path.join(projectDir, '.tmp', 'protocol-alias.json');
  writeFileSync(authority, '{}', 'utf8');
  writeFileSync(protocolFile, '{}', 'utf8');
  symlinkSync(authority, authorityAlias);
  symlinkSync(protocolFile, protocolAlias);

  const common = {
    resolveGrant: () => null,
    readIndex: () => rows,
    statusProtocol: () => ({ lifecycle: 'active', integrity: { ok: true }, currentRole: 'owner' }),
  };
  assert.equal(
    evaluate({ ...common, authorityFiles: [authority], targets: [authorityAlias] }).code,
    'co-review-authority-file'
  );
  assert.equal(evaluate({ ...common, targets: [protocolAlias] }).decision, 'deny');
});

test('an inert reviewer index claim does not block the author after handoff', () => {
  const { projectDir, rows, evaluate } = policyFixture();
  assert.equal(
    evaluate({
      targets: [path.join(projectDir, 'src/a.mjs')],
      resolveGrant: () => null,
      readIndex: () => rows,
      statusProtocol: () => ({
        protocolId: 'p1',
        lifecycle: 'active',
        integrity: { ok: true },
        currentRole: 'owner',
        turnState: 'available',
        claim: null,
      }),
    }).decision,
    'not-applicable'
  );
});

test('ordinary non-authority writes are not applicable when no reviewer grant is active', () => {
  const { projectDir, evaluate } = policyFixture();
  assert.equal(
    evaluate({
      targets: [path.join(projectDir, 'src/a.mjs')],
      resolveGrant: () => null,
      readIndex: () => ({}),
    }).decision,
    'not-applicable'
  );
});
