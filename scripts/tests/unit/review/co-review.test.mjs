// @story #1266 #1322

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import '../../fixtures/co-review-budget-cases.mjs';
import '../../fixtures/co-review-consistency-cases.mjs';
import '../../fixtures/co-review-finalization-cases.mjs';
import '../../fixtures/co-review-handoff-cases.mjs';
import '../../fixtures/co-review-start-cases.mjs';
import '../../fixtures/co-review-supplement-cases.mjs';
import { COMMANDS, renderHelp } from '../../../review/lib/help.mjs';
import {
  cleanupTemporaryRoots,
  commitArtifact,
  initializedProtocol,
  memoryProtocol,
  memoryRepositoryFixture,
  processCallCounts,
  readEvents,
  runCliDirect,
  snapshotProtocol,
  temporaryRoot,
} from '../../fixtures/co-review-fixture.mjs';

test.afterEach(cleanupTemporaryRoots);

async function memoryApiFixture() {
  const fixture = memoryRepositoryFixture();
  return { ...fixture, api: await memoryProtocol(fixture.repository) };
}

test('top-level help is recovery-grade and safe before initialization', async () => {
  const emptyRoot = temporaryRoot();
  for (const args of [['help'], ['--help']]) {
    const result = await runCliDirect(args, { cwd: emptyRoot });
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
    for (const command of [
      'co-review handoff --dir <path> --actor <owner-identity>',
      'co-review handoff --dir <path> --actor <reviewer-identity>',
      'co-review continue --dir <path> --additional-turns <N>',
    ]) {
      assert.match(result.stdout, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.deepEqual(readdirSync(emptyRoot), []);
  }
});

test('structured help records are the lifecycle-ordered rendering authority', () => {
  const commandNames = [
    'start',
    'init',
    'status',
    'claim',
    'wait',
    'handoff',
    'set-max-turns',
    'supplement',
    'continue',
    'finalize',
  ];
  assert.deepEqual(Object.keys(COMMANDS), commandNames);
  const top = renderHelp();
  let priorOffset = -1;
  for (const [name, entry] of Object.entries(COMMANDS)) {
    assert.ok(entry.lifecycleStates.length > 0, name);
    assert.ok(entry.mutationBoundary.length > 0, name);
    const page = renderHelp(name);
    assert.match(
      page,
      new RegExp(entry.lifecycleStates.join(', ').replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    assert.match(
      page,
      new RegExp(entry.mutationBoundary.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    const summary = [
      `  ${name}`,
      `    Authorized caller: ${entry.caller}`,
      `    Lifecycle states: ${entry.lifecycleStates.join(', ')}`,
      `    Mutation boundary: ${entry.mutationBoundary}`,
      `    Usage: ${entry.usage}`,
    ].join('\n');
    assert.match(top, new RegExp(summary.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const offset = top.indexOf(`  ${name}`);
    assert.ok(offset > priorOffset, `${name}: lifecycle order`);
    priorOffset = offset;
  }
});

test('handoff and budget help preserve the mandatory closing owner turn', () => {
  assert.deepEqual(COMMANDS['set-max-turns'].lifecycleStates, ['active']);
  for (const page of [renderHelp(), renderHelp('handoff')]) {
    assert.match(page, /final changes-requested.*active closing owner/is);
    assert.match(page, /closing owner handoff.*intervention-required/is);
  }
  assert.doesNotMatch(renderHelp('set-max-turns'), /active or intervention-required/i);
  assert.match(COMMANDS['set-max-turns'].effects.join(' '), /subsequent owner handoff/i);
  assert.match(COMMANDS['set-max-turns'].transition, /lifecycle.*role.*claim.*unchanged/i);
  assert.doesNotMatch(renderHelp('set-max-turns'), /records.*reason/i);
});

test('continuation help derives the resumed role and its minimum authorized budget', () => {
  const continuation = COMMANDS.continue;
  assert.match(continuation.arguments.join(' '), /bare continuation.*minimum.*resumed role/i);
  assert.match(continuation.effects.join(' '), /last handoff.*owner.*reviewer/i);
  assert.match(continuation.effects.join(' '), /last handoff.*reviewer.*owner/i);
  assert.match(continuation.transition, /closing owner.*active reviewer/i);
  assert.match(continuation.transition, /exhausted reviewer.*active owner/i);

  const top = renderHelp();
  assert.doesNotMatch(top, /summary required on final requested-changes turn/i);
  assert.doesNotMatch(top, /reviewer supplies --summary and both agents stop/i);
  assert.doesNotMatch(top, /exhausted budget without summary/i);
  assert.match(top, /summary optional only on a final changes-requested review/i);

  const handoff = renderHelp('handoff');
  assert.doesNotMatch(handoff, /required interception summary/i);
  assert.doesNotMatch(handoff, /exhausted budget, stop and escalate/i);
  assert.match(handoff, /summary.*optional.*final changes-requested review/i);
  assert.match(handoff, /exhausted budget.*displayed next action.*closing owner/i);
});

test('top-level help covers the settled lifecycle, recovery, and governance surface', () => {
  const page = renderHelp();
  for (const fragment of [
    '--archive-dir',
    'set-max-turns',
    'supplement',
    '[supplement:S-001]',
    '--good-enough',
    'acceptance durable; archive publication pending',
    'gh auth login',
    'exact bytes',
    'host repository governance',
    'Response, review, supplement, and archive inputs are Markdown expected to satisfy host repository governance',
  ]) {
    assert.match(page, new RegExp(fragment.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('structured and top-level help explain archive collision prevention and recovery', () => {
  const prevention = 'New configured archive leaves must be absent before initialization.';
  const deterministic =
    'Legacy accepted collisions recover only at <configured>-recovery-<protocol-id>.';
  const eligibility =
    'The configured archive must validate as a complete different-protocol v1 archive.';
  const refusal = 'Arbitrary --archive-dir overrides and every overwrite remain refused.';

  assert.match(COMMANDS.start.validations.join(' '), new RegExp(prevention));
  assert.match(COMMANDS.init.validations.join(' '), new RegExp(prevention));
  assert.match(COMMANDS.status.validations.join(' '), new RegExp(eligibility));
  assert.match(COMMANDS.finalize.validations.join(' '), new RegExp(refusal));

  for (const page of [renderHelp(), renderHelp('finalize')]) {
    for (const statement of [prevention, deterministic, eligibility, refusal]) {
      assert.match(page, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('every command has standalone recovery help in both forms', async () => {
  const emptyRoot = temporaryRoot();
  for (const command of Object.keys(COMMANDS)) {
    const canonical = await runCliDirect(['help', command], { cwd: emptyRoot });
    const flag = await runCliDirect([command, '--help'], { cwd: emptyRoot });
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
      'Lifecycle states',
      'Mutation boundary',
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
  const { api, root, artifact } = await memoryApiFixture();
  const { initializeProtocol, STATE_SCHEMA } = api;
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
  const { api, root, artifact, initialCommit } = await memoryApiFixture();
  const { initializeProtocol } = api;
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

test('imported review refuses a budget already exhausted by imported turn one', async () => {
  const { api, root, artifact, initialCommit } = await memoryApiFixture();
  const { initializeProtocol } = api;
  mkdirSync(path.join(root, '.tmp/imported'), { recursive: true });
  writeFileSync(path.join(root, '.tmp/imported/r1-review.md'), '# Review\n');
  assert.throws(
    () =>
      initializeProtocol({
        cwd: root,
        dir: '.tmp/imported',
        artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 1,
        importReview: '.tmp/imported/r1-review.md',
        reviewOf: initialCommit,
      }),
    /co-review:import-exhausts-budget/
  );
  assert.equal(existsSync(path.join(root, '.tmp/imported/state.json')), false);
});

test('exact init retry is idempotent and changed configuration refuses', async () => {
  const { api, root, artifact } = await memoryApiFixture();
  const { initializeProtocol } = api;
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
  commitArtifact(root, '# Artifact\n\nRevision two.\n');
  assert.throws(() => initializeProtocol(options), /co-review:already-initialized/);
  assert.throws(
    () => initializeProtocol({ ...options, maxReviewTurns: 7 }),
    /co-review:already-initialized/
  );
  assert.equal(readFileSync(path.join(root, options.dir, 'state.json'), 'utf8'), beforeState);
  assert.equal(readFileSync(path.join(root, options.dir, 'events.jsonl'), 'utf8'), beforeEvents);
});

test('init fails closed on invalid roles, budget, import pair, or runtime path', async () => {
  for (const mutate of [
    (options) => ({ ...options, reviewer: options.owner }),
    (options) => ({ ...options, owner: ` ${options.reviewer} ` }),
    (options) => ({ ...options, maxReviewTurns: 0 }),
    (options) => ({ ...options, importReview: '.tmp/review/r1.md' }),
    (options) => ({ ...options, dir: 'review-state' }),
    (options) => ({ ...options, dir: '../outside' }),
  ]) {
    const { api, root, artifact } = await memoryApiFixture();
    const { initializeProtocol } = api;
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
  const dirty = await memoryApiFixture();
  const { initializeProtocol } = dirty.api;
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

  const imported = await memoryApiFixture();
  mkdirSync(path.join(imported.root, '.tmp/review'), { recursive: true });
  writeFileSync(path.join(imported.root, '.tmp/review/r1.md'), '# Review\n');
  assert.throws(
    () =>
      imported.api.initializeProtocol({
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

test('init refuses a runtime symlink that resolves outside the repository', async () => {
  const { api, root, artifact } = await memoryApiFixture();
  const { initializeProtocol } = api;
  const outside = temporaryRoot('aitm-co-review-outside-');
  mkdirSync(path.join(root, '.tmp'), { recursive: true });
  symlinkSync(outside, path.join(root, '.tmp/review'), 'dir');
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
    /co-review:path-outside-repository:dir/
  );
  assert.equal(existsSync(path.join(outside, 'state.json')), false);
});

test('surviving initialization mutex is reported and never stolen', async () => {
  const { api, root, artifact } = await memoryApiFixture();
  const { initializeProtocol } = api;
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

test('CLI initializes and reports human and JSON status', async () => {
  const { root, artifact } = memoryRepositoryFixture();
  const initialized = await runCliDirect(
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
  const initializedState = JSON.parse(initialized.stdout);
  assert.equal(initializedState.reviewTurnsUsed, 0);
  assert.match(initializedState.nextAction, /co-review claim.*owner-agent/);

  const human = await runCliDirect(['status', '--dir', '.tmp/review'], { cwd: root });
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Lifecycle: active/);
  assert.match(human.stdout, /Branch: trunk/);
  assert.match(human.stdout, /Claim: none/);
  assert.match(human.stdout, /Last handoff: none/);
  assert.match(human.stdout, /Budget: 0 used \/ 6 max \/ 6 remaining/);

  const json = await runCliDirect(['status', '--dir', '.tmp/review', '--json'], { cwd: root });
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).integrity.ok, true);
});

test('CLI rejects unknown or incomplete init flags before mutation', async () => {
  for (const args of [
    ['init', '--dir', '.tmp/review', '--unknown', 'value'],
    ['init', '--dir'],
  ]) {
    const { root } = memoryRepositoryFixture();
    const result = await runCliDirect(args, { cwd: root });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /co-review:usage/);
    assert.equal(existsSync(path.join(root, '.tmp/review/state.json')), false);
  }
});

test('CLI rejects unknown handoff flags before protocol discovery', async () => {
  const { root } = memoryRepositoryFixture();
  const result = await runCliDirect(
    ['handoff', '--dir', '.tmp/missing', '--actor', 'owner-agent', '--unknown', 'value'],
    { cwd: root }
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /option --unknown is not valid/);
  assert.equal(existsSync(path.join(root, '.tmp/missing')), false);
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

test('event revision drift is visible in status and blocks mutation', async () => {
  const { api, root, options } = await initializedProtocol();
  const eventsPath = path.join(root, options.dir, 'events.jsonl');
  const [event] = readEvents(root, options.dir);
  writeFileSync(eventsPath, `${JSON.stringify({ ...event, revision: 2 })}\n`);
  const status = api.statusProtocol({ cwd: root, dir: options.dir });
  assert.equal(status.integrity.ok, false);
  assert.match(status.integrity.errors.join('\n'), /event-revision.*expected 1.*actual 2/);
  const before = snapshotProtocol(root, options.dir);
  assert.throws(
    () => api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' }),
    /co-review:integrity/
  );
  assert.deepEqual(snapshotProtocol(root, options.dir), before);
});

test('malformed round state is rejected before status can direct an actor', async () => {
  const { api, root, options } = await initializedProtocol();
  const statePath = path.join(root, options.dir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${JSON.stringify({ ...state, round: 0 }, null, 2)}\n`);
  assert.throws(
    () => api.statusProtocol({ cwd: root, dir: options.dir }),
    /co-review:invalid-state:.*round/
  );
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

test('CLI routes claim and maps bounded wait timeout to exit code 3', async () => {
  const { root, artifact } = memoryRepositoryFixture();
  assert.equal(
    (
      await runCliDirect(
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
      )
    ).status,
    0
  );
  const waiting = await runCliDirect(
    ['wait', '--dir', '.tmp/review', '--actor', 'reviewer-agent', '--timeout', '0'],
    { cwd: root }
  );
  assert.equal(waiting.status, 3, waiting.stderr);
  assert.match(waiting.stdout, /"status": "timeout"/);
  const claimed = await runCliDirect(['claim', '--dir', '.tmp/review', '--actor', 'owner-agent'], {
    cwd: root,
  });
  assert.equal(claimed.status, 0, claimed.stderr);
  const claimedState = JSON.parse(claimed.stdout);
  assert.equal(claimedState.turnState, 'claimed');
  assert.match(claimedState.nextAction, /co-review help handoff/);
});

test('fast co-review corpus does not spawn Git or external Node', () => {
  assert.deepEqual(processCallCounts(), { git: 0, nodeCli: 0 });
});
