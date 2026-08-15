// @story #1266

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const CLI = path.join(ROOT, 'scripts/review/co-review.mjs');
const temporaryRoots = new Set();

function temporaryRoot(prefix = 'aitm-co-review-') {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

function runCli(args, { cwd = temporaryRoot() } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function repositoryFixture() {
  const root = temporaryRoot();
  git(root, 'init', '-b', 'trunk');
  git(root, 'config', 'user.name', 'Co Review Test');
  git(root, 'config', 'user.email', 'co-review@example.test');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n');
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n\nRevision one.\n');
  git(root, 'add', '.gitignore', 'docs/artifact.md');
  git(root, 'commit', '-m', 'initial artifact');
  return {
    root,
    artifact: 'docs/artifact.md',
    initialCommit: git(root, 'rev-parse', 'HEAD'),
  };
}

async function protocol() {
  return import('../../../review/lib/protocol.mjs');
}

function readEvents(root, dir) {
  return readFileSync(path.join(root, dir, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function snapshotProtocol(root, dir) {
  return {
    state: readFileSync(path.join(root, dir, 'state.json'), 'utf8'),
    events: readFileSync(path.join(root, dir, 'events.jsonl'), 'utf8'),
  };
}

function commitArtifact(root, content, message = 'revise artifact') {
  writeFileSync(path.join(root, 'docs/artifact.md'), content);
  git(root, 'add', 'docs/artifact.md');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

async function initializedProtocol({ imported = false, maxReviewTurns = 6 } = {}) {
  const api = await protocol();
  const fixture = repositoryFixture();
  const options = {
    cwd: fixture.root,
    dir: '.tmp/review',
    artifact: fixture.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns,
  };
  if (imported) {
    mkdirSync(path.join(fixture.root, options.dir), { recursive: true });
    writeFileSync(
      path.join(fixture.root, options.dir, 'r1-review.md'),
      '# Review\n\n[finding:F-001] Clarify terminal acceptance.\n'
    );
    options.importReview = `${options.dir}/r1-review.md`;
    options.reviewOf = fixture.initialCommit;
  }
  const state = api.initializeProtocol(options);
  return { api, ...fixture, options, state };
}

test.afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

test('top-level help is recovery-grade and safe before initialization', () => {
  const emptyRoot = temporaryRoot();
  for (const args of [['help'], ['--help']]) {
    const result = runCli(args, { cwd: emptyRoot });
    assert.equal(result.status, 0, result.stderr);
    for (const heading of [
      'WHAT',
      'WHY',
      'WHO',
      'WHEN',
      'WHERE',
      'HOW',
      'LIFECYCLE',
      'COMMANDS',
      'OPTION GLOSSARY',
      'ARTIFACT FORMAT',
      'EXIT CODES',
      'CONTEXT-RESET CHECKLIST',
    ]) {
      assert.match(result.stdout, new RegExp(heading));
    }
    assert.deepEqual(readdirSync(emptyRoot), []);
  }
});

test('every command has standalone recovery help in both forms', () => {
  const emptyRoot = temporaryRoot();
  for (const command of ['init', 'status', 'claim', 'wait', 'handoff', 'continue']) {
    const canonical = runCli(['help', command], { cwd: emptyRoot });
    const flag = runCli([command, '--help'], { cwd: emptyRoot });
    assert.equal(canonical.status, 0, canonical.stderr);
    assert.equal(flag.stdout, canonical.stdout);
    for (const field of [
      'Purpose',
      'Authorized caller',
      'Prerequisites',
      'Usage',
      'Arguments',
      'Effects',
      'Validations',
      'Output',
      'Exit codes',
      'State transition',
      'Idempotency',
      'Examples',
      'Failure recovery',
      'Next commands',
    ]) {
      assert.match(canonical.stdout, new RegExp(field));
    }
  }
});

test('co-review is a routed agent-callable standalone command', async () => {
  const { SELF_DOC } = await import('../../../lib/self-doc.mjs');
  const { EXECUTABLE_ENTRYPOINTS } =
    await import('../../../task-tracker/lib/command-surface/entrypoints.mjs');
  assert.equal(SELF_DOC['co-review']?.path, 'scripts/review/co-review.mjs');
  assert.deepEqual(
    EXECUTABLE_ENTRYPOINTS.find((row) => row.command === 'co-review'),
    {
      path: 'scripts/review/co-review.mjs',
      classification: 'agent-callable-standalone',
      command: 'co-review',
    }
  );
});

test('fresh init records owner round one and the configured budget', async () => {
  const { initializeProtocol, STATE_SCHEMA } = await protocol();
  const { root, artifact } = repositoryFixture();
  const state = initializeProtocol({
    cwd: root,
    dir: '.tmp/review',
    artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 6,
  });
  assert.deepEqual(
    {
      schema: state.schema,
      lifecycle: state.lifecycle,
      currentRole: state.currentRole,
      turnState: state.turnState,
      round: state.round,
      reviewTurnsUsed: state.reviewTurnsUsed,
      maxReviewTurns: state.maxReviewTurns,
      remainingReviewTurns: state.remainingReviewTurns,
    },
    {
      schema: STATE_SCHEMA,
      lifecycle: 'active',
      currentRole: 'owner',
      turnState: 'available',
      round: 1,
      reviewTurnsUsed: 0,
      maxReviewTurns: 6,
      remainingReviewTurns: 6,
    }
  );
  assert.equal(existsSync(path.join(root, '.tmp/review/state.json')), true);
  assert.deepEqual(
    readEvents(root, '.tmp/review').map(({ type }) => type),
    ['init']
  );
});

test('imported review consumes reviewer turn one and starts owner round two', async () => {
  const { initializeProtocol } = await protocol();
  const { root, artifact, initialCommit } = repositoryFixture();
  mkdirSync(path.join(root, '.tmp/imported'), { recursive: true });
  writeFileSync(
    path.join(root, '.tmp/imported/r1-review.md'),
    '# Review\n\n[finding:F-001] Clarify the terminal state.\n'
  );
  const state = initializeProtocol({
    cwd: root,
    dir: '.tmp/imported',
    artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 6,
    importReview: '.tmp/imported/r1-review.md',
    reviewOf: initialCommit,
  });
  assert.equal(state.currentRole, 'owner');
  assert.equal(state.round, 2);
  assert.equal(state.reviewTurnsUsed, 1);
  assert.equal(state.remainingReviewTurns, 5);
  assert.equal(state.lastHandoff.from, 'reviewer');
  assert.equal(state.lastHandoff.commit, initialCommit);
  assert.match(state.lastHandoff.artifacts.review.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    readEvents(root, '.tmp/imported').map(({ type }) => type),
    ['init-import']
  );
});

test('exact init retry is idempotent and changed configuration refuses', async () => {
  const { initializeProtocol } = await protocol();
  const { root, artifact } = repositoryFixture();
  const options = {
    cwd: root,
    dir: '.tmp/review',
    artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 6,
  };
  const first = initializeProtocol(options);
  assert.equal(initializeProtocol(options).revision, first.revision);
  assert.equal(readEvents(root, options.dir).length, 1);
  const beforeState = readFileSync(path.join(root, options.dir, 'state.json'), 'utf8');
  const beforeEvents = readFileSync(path.join(root, options.dir, 'events.jsonl'), 'utf8');
  assert.throws(
    () => initializeProtocol({ ...options, maxReviewTurns: 7 }),
    /co-review:already-initialized/
  );
  assert.equal(readFileSync(path.join(root, options.dir, 'state.json'), 'utf8'), beforeState);
  assert.equal(readFileSync(path.join(root, options.dir, 'events.jsonl'), 'utf8'), beforeEvents);
});

test('init fails closed on invalid roles, budget, import pair, or runtime path', async () => {
  const { initializeProtocol } = await protocol();
  for (const mutate of [
    (options) => ({ ...options, reviewer: options.owner }),
    (options) => ({ ...options, maxReviewTurns: 0 }),
    (options) => ({ ...options, importReview: '.tmp/review/r1.md' }),
    (options) => ({ ...options, dir: 'review-state' }),
    (options) => ({ ...options, dir: '../outside' }),
  ]) {
    const { root, artifact } = repositoryFixture();
    const options = mutate({
      cwd: root,
      dir: '.tmp/review',
      artifact,
      owner: 'owner-agent',
      reviewer: 'reviewer-agent',
      maxReviewTurns: 6,
    });
    assert.throws(() => initializeProtocol(options), /co-review:/);
    if (options.dir.startsWith('.tmp/')) {
      assert.equal(existsSync(path.join(root, options.dir, 'state.json')), false);
    }
  }
});

test('init refuses artifact/index mismatch and an unreachable import commit', async () => {
  const { initializeProtocol } = await protocol();
  const dirty = repositoryFixture();
  writeFileSync(path.join(dirty.root, dirty.artifact), '# Artifact\n\nDirty.\n');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: dirty.root,
        dir: '.tmp/review',
        artifact: dirty.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 6,
      }),
    /co-review:artifact-drift/
  );

  const imported = repositoryFixture();
  mkdirSync(path.join(imported.root, '.tmp/review'), { recursive: true });
  writeFileSync(path.join(imported.root, '.tmp/review/r1.md'), '# Review\n');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: imported.root,
        dir: '.tmp/review',
        artifact: imported.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 6,
        importReview: '.tmp/review/r1.md',
        reviewOf: '0000000000000000000000000000000000000000',
      }),
    /co-review:git-commit/
  );
  assert.equal(existsSync(path.join(imported.root, '.tmp/review/state.json')), false);
});

test('surviving initialization mutex is reported and never stolen', async () => {
  const { initializeProtocol } = await protocol();
  const { root, artifact } = repositoryFixture();
  const lock = path.join(root, '.tmp/review/.co-review-lock');
  mkdirSync(lock, { recursive: true });
  writeFileSync(
    path.join(lock, 'owner.json'),
    `${JSON.stringify({ actor: 'other', pid: 7, host: 'test', at: '2026-08-15T00:00:00Z' })}\n`
  );
  assert.throws(
    () =>
      initializeProtocol({
        cwd: root,
        dir: '.tmp/review',
        artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 6,
      }),
    /co-review:locked/
  );
  assert.equal(existsSync(lock), true);
});

test('CLI initializes and reports human and JSON status', () => {
  const { root, artifact } = repositoryFixture();
  const initialized = runCli(
    [
      'init',
      '--dir',
      '.tmp/review',
      '--artifact',
      artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '6',
    ],
    { cwd: root }
  );
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).reviewTurnsUsed, 0);

  const human = runCli(['status', '--dir', '.tmp/review'], { cwd: root });
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Lifecycle: active/);
  assert.match(human.stdout, /Budget: 0 used \/ 6 max \/ 6 remaining/);

  const json = runCli(['status', '--dir', '.tmp/review', '--json'], { cwd: root });
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).integrity.ok, true);
});

test('CLI rejects unknown or incomplete init flags before mutation', () => {
  for (const args of [
    ['init', '--dir', '.tmp/review', '--unknown', 'value'],
    ['init', '--dir'],
  ]) {
    const { root } = repositoryFixture();
    const result = runCli(args, { cwd: root });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /co-review:usage/);
    assert.equal(existsSync(path.join(root, '.tmp/review/state.json')), false);
  }
});

test('claim is role-safe and an exact claimant retry is idempotent', async () => {
  const { api, root, options } = await initializedProtocol();
  assert.throws(
    () => api.claimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' }),
    /co-review:wrong-role/
  );
  const claimed = api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  assert.equal(claimed.turnState, 'claimed');
  assert.equal(claimed.claim.actor, 'owner-agent');
  const before = snapshotProtocol(root, options.dir);
  const retry = api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  assert.equal(retry.revision, claimed.revision);
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
  assert.deepEqual(
    readEvents(root, options.dir).map(({ type }) => type),
    ['init', 'claim']
  );
});

test('recorded immutable drift is visible in status and blocks claim', async () => {
  const { api, root, options } = await initializedProtocol({ imported: true });
  writeFileSync(
    path.join(root, options.dir, 'r1-review.md'),
    '# Review\n\n[finding:F-001] Mutated after import.\n'
  );
  const status = api.statusProtocol({ cwd: root, dir: options.dir });
  assert.equal(status.integrity.ok, false);
  assert.match(status.integrity.errors.join('\n'), /artifact-drift.*r1-review\.md/);
  const before = snapshotProtocol(root, options.dir);
  assert.throws(
    () => api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' }),
    /co-review:integrity/
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('bounded wait returns available or timeout without mutation', async () => {
  const { api, root, options } = await initializedProtocol();
  const before = snapshotProtocol(root, options.dir);
  const available = await api.waitForTurn({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    timeoutSeconds: 0.02,
    pollMilliseconds: 5,
  });
  assert.equal(available.status, 'available');
  const timeout = await api.waitForTurn({
    cwd: root,
    dir: options.dir,
    actor: 'reviewer-agent',
    timeoutSeconds: 0.02,
    pollMilliseconds: 5,
  });
  assert.equal(timeout.status, 'timeout');
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
  await assert.rejects(
    api.waitForTurn({
      cwd: root,
      dir: options.dir,
      actor: 'owner-agent',
      timeoutSeconds: 61,
    }),
    /co-review:timeout/
  );
});

test('CLI routes claim and maps bounded wait timeout to exit code 3', () => {
  const { root, artifact } = repositoryFixture();
  assert.equal(
    runCli(
      [
        'init',
        '--dir',
        '.tmp/review',
        '--artifact',
        artifact,
        '--owner',
        'owner-agent',
        '--reviewer',
        'reviewer-agent',
        '--max-turns',
        '6',
      ],
      { cwd: root }
    ).status,
    0
  );
  const waiting = runCli(
    ['wait', '--dir', '.tmp/review', '--actor', 'reviewer-agent', '--timeout', '0'],
    { cwd: root }
  );
  assert.equal(waiting.status, 3, waiting.stderr);
  assert.match(waiting.stdout, /"status": "timeout"/);
  const claimed = runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], {
    cwd: root,
  });
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(JSON.parse(claimed.stdout).turnState, 'claimed');
});

test('first owner handoff transfers a committed artifact plus immutable response', async () => {
  const { api, root, options, initialCommit } = await initializedProtocol();
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const response = `${options.dir}/r1-owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nInitial artifact ready.\n');
  const state = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'initial artifact ready',
  });
  assert.deepEqual(
    {
      currentRole: state.currentRole,
      turnState: state.turnState,
      round: state.round,
    },
    { currentRole: 'reviewer', turnState: 'available', round: 2 }
  );
  assert.equal(state.lastHandoff.commit, initialCommit);
  assert.match(state.lastHandoff.artifacts.response.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(state.reviewTurnsUsed, 0);
});

test('owner answers every imported finding with one supported disposition', async () => {
  const { api, root, options } = await initializedProtocol({ imported: true });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const commit = commitArtifact(root, '# Artifact\n\nTerminal acceptance is explicit.\n');
  const response = `${options.dir}/r2-owner-response.md`;
  writeFileSync(
    path.join(root, response),
    [
      '# Owner response',
      '',
      '[finding:F-001] [disposition:accepted-with-modification]',
      'Revised section: Terminal acceptance.',
      '',
    ].join('\n')
  );
  const state = api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit,
    answers: options.importReview,
    message: 'R2 response and revision ready',
  });
  assert.equal(state.currentRole, 'reviewer');
  assert.equal(state.round, 3);
  assert.equal(state.artifact.commit, commit);
  assert.equal(state.lastHandoff.artifacts.answeredReview.path, options.importReview);
});

test('owner handoff rejects incomplete, invented, rejected, or deferred dispositions', async () => {
  const cases = [
    {
      body: '# Response\n',
      expected: /co-review:missing-disposition:F-001/,
    },
    {
      body: '[finding:F-001] [disposition:accepted]\n[finding:F-999] [disposition:accepted]\n',
      expected: /co-review:unknown-finding:F-999/,
    },
    {
      body: '[finding:F-001] [disposition:rejected]\nNo citation.\n',
      expected: /co-review:rejected-without-evidence:F-001/,
    },
    {
      body: '[finding:F-001] [disposition:deferred]\n[follow-up:#1300]\n',
      expected: /co-review:deferred-without-boundary:F-001/,
    },
  ];
  for (const { body, expected } of cases) {
    const { api, root, options } = await initializedProtocol({ imported: true });
    api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
    const commit = commitArtifact(root, '# Artifact\n\nRevision.\n');
    const response = `${options.dir}/response.md`;
    writeFileSync(path.join(root, response), body);
    const before = snapshotProtocol(root, options.dir);
    assert.throws(
      () =>
        api.handoffOwner({
          cwd: root,
          dir: options.dir,
          actor: 'owner-agent',
          response,
          artifact: options.artifact,
          commit,
          answers: options.importReview,
          message: 'attempt',
        }),
      expected
    );
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('owner handoff refuses wrong path, stale commit, and artifact/index drift', async () => {
  for (const mutate of [
    ({ call }) => ({ ...call, artifact: '.gitignore' }),
    ({ call, initialCommit }) => ({ ...call, commit: initialCommit }),
    ({ call, root }) => {
      writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n\nDirty after commit.\n');
      return call;
    },
  ]) {
    const initialized = await initializedProtocol({ imported: true });
    const { api, root, options, initialCommit } = initialized;
    api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
    const commit = commitArtifact(root, '# Artifact\n\nRevision.\n');
    const response = `${options.dir}/response.md`;
    writeFileSync(path.join(root, response), '[finding:F-001] [disposition:accepted]\nRevised.\n');
    const call = {
      cwd: root,
      dir: options.dir,
      actor: 'owner-agent',
      response,
      artifact: options.artifact,
      commit,
      answers: options.importReview,
      message: 'attempt',
    };
    const before = snapshotProtocol(root, options.dir);
    assert.throws(() => api.handoffOwner(mutate({ call, root, initialCommit })), /co-review:/);
    assert.deepEqual(snapshotProtocol(root, options.dir), before);
  }
});

test('CLI routes the owner handoff and rejects reviewer-only flags', () => {
  const { root, artifact, initialCommit } = repositoryFixture();
  assert.equal(
    runCli(
      [
        'init',
        '--dir',
        '.tmp/review',
        '--artifact',
        artifact,
        '--owner',
        'owner-agent',
        '--reviewer',
        'reviewer-agent',
        '--max-turns',
        '6',
      ],
      { cwd: root }
    ).status,
    0
  );
  assert.equal(
    runCli(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], { cwd: root }).status,
    0
  );
  writeFileSync(path.join(root, '.tmp/review/response.md'), '# Response\n');
  const handoff = runCli(
    [
      'handoff',
      '--dir',
      '.tmp/review',
      '--actor',
      'owner-agent',
      '--response',
      '.tmp/review/response.md',
      '--artifact',
      artifact,
      '--commit',
      initialCommit,
      '--message',
      'ready',
    ],
    { cwd: root }
  );
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.equal(JSON.parse(handoff.stdout).currentRole, 'reviewer');

  const invalid = runCli(
    ['handoff', '--dir', '.tmp/review', '--actor', 'owner-agent', '--review', 'review.md'],
    { cwd: root }
  );
  assert.equal(invalid.status, 2, invalid.stderr);
});
