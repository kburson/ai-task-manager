import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReviewPaths } from '../../src/collateral/paths.mjs';
import { createResponseDraft } from '../../src/collateral/responses.mjs';
import { canonicalProjection } from '../../src/protocol/service.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import { run } from '../helpers/internal-api.mjs';
import { claim, FINGERPRINTS, sequence } from '../helpers/review-fixture.mjs';

async function recordModule() {
  try {
    return await import('../../src/collateral/review-record.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture(t) {
  const scratch = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(scratch, { recursive: true });
  const parent = mkdtempSync(path.join(scratch, 'review-record-'));
  const root = path.join(parent, 'repository');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore', shell: false });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  execFileSync('git', ['config', 'user.name', 'Review Record Test'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return { parent, root: realpathSync(root) };
}

function completedDraft(bytes, { submitted = false } = {}) {
  let text = bytes.toString('utf8');
  const replacements = [
    ['<!-- Write the review summary. -->', 'The artifact is ready.'],
    ['<!-- List numbered findings or write None. -->', 'None.'],
    ['<!-- List required changes or write None. -->', 'None.'],
    ['<!-- List numbered optional suggestions or write None. -->', 'None.'],
    ['<!-- Write revisions-requested or accepted. -->', 'accepted'],
  ];
  for (const [from, to] of replacements) text = text.replace(from, to);
  if (submitted) {
    text = text.replace('submitted_at: null', 'submitted_at: "2026-09-08T12:00:04.000Z"');
  }
  return Buffer.from(text);
}

function attemptFixture(root, reviewId, recordId, disposition, { draft = null } = {}) {
  const paths = resolveReviewPaths({
    root,
    reviewsRoot: 'docs/reviews',
    reviewPathTemplate: '<kind>/<date>-<name>-<review-id>',
    kind: 'spec',
    name: 'artifact',
    date: '2026-09-08',
    reviewId,
    recordId,
  });
  mkdirSync(paths.destination.absolute, { recursive: true });
  mkdirSync(paths.scratch.absolute, { recursive: true });

  const startupBytes = Buffer.from(`# Author startup for ${reviewId}\n`);
  const invitationBytes = Buffer.from(`# Reviewer invitation for ${reviewId}\n`);
  writeFileSync(paths.authorStartup.absolute, startupBytes);
  writeFileSync(paths.reviewerInvitation.absolute, invitationBytes);

  const terminalTypes =
    disposition === 'accepted'
      ? ['reviewer-accepted', 'finalization-started', 'acceptance-committed']
      : disposition === 'superseded'
        ? ['superseded']
        : [];
  let events = sequence(['review-created', 'reviewer-joined', 'turn-claimed', ...terminalTypes], {
    1: { actor: FINGERPRINTS.reviewer },
    2: {
      actor: FINGERPRINTS.reviewer,
      payload: { claim: claim('reviewer') },
    },
    3: { actor: FINGERPRINTS.reviewer },
  });
  const context = {
    ...events[0].payload.startup.context,
    review_id: reviewId,
    record_id: recordId,
    repository_root: root,
    artifact_kind: 'spec',
    artifact_name: 'artifact',
    review_date: '2026-09-08',
    reviews_root: 'docs/reviews',
    review_path_template: '<kind>/<date>-<name>-<review-id>',
  };
  events[0] = {
    ...events[0],
    review_id: reviewId,
    payload: {
      ...events[0].payload,
      startup: {
        ...events[0].payload.startup,
        context,
        context_digest: digest(Buffer.from(canonicalProjection(context))),
        destination: paths.destination.relative,
        author_startup_digest: digest(startupBytes),
        reviewer_invitation_digest: digest(invitationBytes),
      },
    },
  };
  events = events.map((item) => ({ ...item, review_id: reviewId }));
  if (disposition === 'superseded') {
    const index = events.length - 1;
    events[index] = {
      ...events[index],
      payload: {
        ...events[index].payload,
        successor_review_id: `${reviewId}-successor`,
      },
    };
  }

  if (draft !== null) {
    const preterminal = reduceEvents(events.slice(0, 3));
    const created = createResponseDraft({ ...preterminal, paths }, 'reviewer', 1);
    const bytes = draft === 'untouched' ? created.bytes : completedDraft(created.bytes, draft);
    writeFileSync(created.path, bytes);
    if (disposition === 'accepted') {
      events[3] = {
        ...events[3],
        payload: {
          ...events[3].payload,
          response: {
            path: path.relative(root, created.path).split(path.sep).join('/'),
            digest: digest(bytes),
          },
        },
      };
    }
  }

  writeFileSync(
    path.join(paths.scratch.absolute, 'events.jsonl'),
    `${events.map((item) => JSON.stringify(item)).join('\n')}\n`
  );
  reduceEvents(events);
  return { reviewId, recordId, paths, workspace: paths.scratch.absolute };
}

test('plans one immutable ordered record without promoting drafts to decisions', async (t) => {
  const { planReviewRecord, renderReviewHistory } = await recordModule();
  assert.equal(typeof planReviewRecord, 'function', 'planReviewRecord must be exported');
  assert.equal(typeof renderReviewHistory, 'function', 'renderReviewHistory must be exported');
  const { root } = fixture(t);
  const first = attemptFixture(root, 'review-01', 'record-01', 'superseded', {
    draft: { submitted: false },
  });
  const second = attemptFixture(root, 'review-02', 'record-01', 'superseded', {
    draft: 'untouched',
  });
  const third = attemptFixture(root, 'review-03', 'record-01', 'accepted', {
    draft: { submitted: true },
  });

  const plan = planReviewRecord({
    workspaces: [second.workspace, third.workspace, first.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
    now: new Date('2026-09-08T13:00:00.000Z'),
  });

  assert.equal(plan.schema, 'ai-peer-review.relocation-plan/v1');
  assert.equal(plan.record_id, 'record-01');
  assert.deepEqual(
    plan.attempts.map(({ review_id, state }) => [review_id, state]),
    [
      ['review-01', 'superseded'],
      ['review-02', 'superseded'],
      ['review-03', 'accepted'],
    ]
  );
  assert.deepEqual(
    plan.entries
      .filter(({ kind }) => kind === 'reviewer-response')
      .map(({ classification }) => classification),
    ['not-submitted', 'incomplete', 'submitted']
  );
  assert.equal(
    plan.mappings.every(({ collision }) => collision === 'none'),
    true
  );
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.mappings[0].source), true);
  const history = renderReviewHistory(plan);
  assert.match(history, /review-01[\s\S]*not-submitted[\s\S]*review-02[\s\S]*incomplete/);
  assert.match(history, /review-03[\s\S]*accepted/);
});

test('rejects attempts from different record identities', async (t) => {
  const { planReviewRecord } = await recordModule();
  assert.equal(typeof planReviewRecord, 'function', 'planReviewRecord must be exported');
  const { root } = fixture(t);
  const first = attemptFixture(root, 'review-01', 'record-01', 'superseded');
  const second = attemptFixture(root, 'review-02', 'record-02', 'accepted', {
    draft: { submitted: true },
  });
  assert.throws(
    () =>
      planReviewRecord({
        workspaces: [first.workspace, second.workspace],
        destination: 'docs/peer-reviews/spec/record-01',
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_MISMATCH'
  );
});

test('rejects more than one accepted attempt and any nonterminal predecessor', async (t) => {
  const { planReviewRecord } = await recordModule();
  assert.equal(typeof planReviewRecord, 'function', 'planReviewRecord must be exported');
  const { root } = fixture(t);
  const acceptedOne = attemptFixture(root, 'review-01', 'record-01', 'accepted', {
    draft: { submitted: true },
  });
  const acceptedTwo = attemptFixture(root, 'review-02', 'record-01', 'accepted', {
    draft: { submitted: true },
  });
  assert.throws(
    () =>
      planReviewRecord({
        workspaces: [acceptedOne.workspace, acceptedTwo.workspace],
        destination: 'docs/peer-reviews/spec/record-01',
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_AUTHORITY'
  );

  const pending = attemptFixture(root, 'review-03', 'record-01', 'pending');
  assert.throws(
    () =>
      planReviewRecord({
        workspaces: [acceptedOne.workspace, pending.workspace],
        destination: 'docs/peer-reviews/spec/record-01',
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_NONTERMINAL'
  );
});

test('rejects symlink collateral and destination path escape', async (t) => {
  const { planReviewRecord } = await recordModule();
  assert.equal(typeof planReviewRecord, 'function', 'planReviewRecord must be exported');
  const { parent, root } = fixture(t);
  const first = attemptFixture(root, 'review-01', 'record-01', 'superseded');
  const accepted = attemptFixture(root, 'review-02', 'record-01', 'accepted', {
    draft: { submitted: true },
  });
  const outside = path.join(parent, 'outside.md');
  writeFileSync(outside, 'outside\n');
  symlinkSync(outside, path.join(first.paths.destination.absolute, 'linked.md'));
  assert.throws(
    () =>
      planReviewRecord({
        workspaces: [first.workspace, accepted.workspace],
        destination: 'docs/peer-reviews/spec/record-01',
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_SOURCE'
  );
  assert.throws(
    () =>
      planReviewRecord({
        workspaces: [accepted.workspace, first.workspace],
        destination: '../outside-record',
      }),
    (error) => error.code === 'APR_PATH_OUTSIDE_REPOSITORY'
  );
  assert.equal(readFileSync(outside, 'utf8'), 'outside\n');
});

function acceptedRecord(t) {
  const { root } = fixture(t);
  const first = attemptFixture(root, 'review-01', 'record-01', 'superseded', {
    draft: { submitted: false },
  });
  const second = attemptFixture(root, 'review-02', 'record-01', 'accepted', {
    draft: { submitted: true },
  });
  return { root, first, second };
}

test('applies a byte-identical relocation only after every destination verifies', async (t) => {
  const { planReviewRecord, applyReviewRecord } = await recordModule();
  assert.equal(typeof applyReviewRecord, 'function', 'applyReviewRecord must be exported');
  const { root, first, second } = acceptedRecord(t);
  const unrelated = path.join(root, 'unrelated.txt');
  writeFileSync(unrelated, 'leave me alone\n');
  const plan = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
    now: new Date('2026-09-08T13:00:00.000Z'),
  });
  const sourceBytes = new Map(
    plan.mappings.map(({ source }) => [source.relative, readFileSync(source.absolute)])
  );

  const result = applyReviewRecord(plan, { mode: 'no-commit' });

  assert.equal(result.schema, 'ai-peer-review.relocation-result/v1');
  assert.equal(result.recovered, false);
  assert.equal(result.commit, null);
  for (const mapping of plan.mappings) {
    assert.deepEqual(
      readFileSync(mapping.destination.absolute),
      sourceBytes.get(mapping.source.relative)
    );
    assert.equal(existsSync(mapping.source.absolute), false);
  }
  assert.equal(existsSync(first.paths.destination.absolute), false);
  assert.equal(existsSync(second.paths.destination.absolute), false);
  assert.equal(readFileSync(unrelated, 'utf8'), 'leave me alone\n');
  const receipt = JSON.parse(readFileSync(plan.receipt.absolute, 'utf8'));
  assert.equal(receipt.schema, 'ai-peer-review.relocation-receipt/v1');
  assert.equal(receipt.record_id, 'record-01');
  assert.equal(receipt.mappings.length, plan.mappings.length);
  assert.match(readFileSync(plan.history.absolute, 'utf8'), /not-submitted[\s\S]*accepted/);

  const retry = applyReviewRecord(plan, { mode: 'no-commit' });
  assert.equal(retry.recovered, true);
  assert.equal(retry.receipt_digest, result.receipt_digest);
});

test('refuses a nonidentical occupied destination without changing any source', async (t) => {
  const { planReviewRecord, applyReviewRecord } = await recordModule();
  assert.equal(typeof applyReviewRecord, 'function', 'applyReviewRecord must be exported');
  const { first, second } = acceptedRecord(t);
  const plan = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
  });
  const target = plan.mappings[0].destination.absolute;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'conflict\n');
  const refreshed = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
  });
  assert.equal(refreshed.mappings[0].collision, 'conflict');

  assert.throws(
    () => applyReviewRecord(refreshed, { mode: 'no-commit' }),
    (error) => error.code === 'APR_REVIEW_RECORD_COLLISION'
  );
  assert.equal(existsSync(refreshed.mappings[0].source.absolute), true);
  assert.equal(readFileSync(target, 'utf8'), 'conflict\n');
  assert.equal(existsSync(refreshed.history.absolute), false);
});

test('rolls back created destinations and retains every source after a copy failure', async (t) => {
  const { planReviewRecord, applyReviewRecord } = await recordModule();
  assert.equal(typeof applyReviewRecord, 'function', 'applyReviewRecord must be exported');
  const { first, second } = acceptedRecord(t);
  const plan = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
  });
  let published = 0;
  assert.throws(
    () =>
      applyReviewRecord(plan, {
        mode: 'no-commit',
        checkpoint(phase) {
          if (phase === 'destination-published' && ++published === 2) {
            throw new Error('injected copy failure');
          }
        },
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_APPLY'
  );
  assert.equal(
    plan.mappings.every(({ source }) => existsSync(source.absolute)),
    true
  );
  assert.equal(
    plan.mappings.every(({ destination }) => !existsSync(destination.absolute)),
    true
  );
});

test('detects a destination digest mismatch before deleting any source', async (t) => {
  const { planReviewRecord, applyReviewRecord } = await recordModule();
  assert.equal(typeof applyReviewRecord, 'function', 'applyReviewRecord must be exported');
  const { first, second } = acceptedRecord(t);
  const plan = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
  });
  let corrupted = false;
  assert.throws(
    () =>
      applyReviewRecord(plan, {
        mode: 'no-commit',
        checkpoint(phase, details) {
          if (phase === 'all-destinations-published' && !corrupted) {
            corrupted = true;
            writeFileSync(details.mappings[0].destination.absolute, 'corrupt\n');
          }
        },
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_DIGEST'
  );
  assert.equal(
    plan.mappings.every(({ source }) => existsSync(source.absolute)),
    true
  );
  assert.equal(
    plan.mappings.every(({ destination }) => !existsSync(destination.absolute)),
    true
  );
});

test('normal mode commits only relocation paths and preserves unrelated staged bytes', async (t) => {
  const { planReviewRecord, applyReviewRecord } = await recordModule();
  const { root, first, second } = acceptedRecord(t);
  execFileSync('git', ['add', 'docs'], { cwd: root, stdio: 'ignore', shell: false });
  execFileSync('git', ['commit', '-m', 'fixture collateral'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  const unrelated = path.join(root, 'unrelated.txt');
  writeFileSync(unrelated, 'staged but unrelated\n');
  execFileSync('git', ['add', 'unrelated.txt'], { cwd: root, stdio: 'ignore', shell: false });
  const stagedBefore = execFileSync('git', ['show', ':unrelated.txt'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  const plan = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
    now: new Date('2026-09-08T13:00:00.000Z'),
  });

  const result = applyReviewRecord(plan, { mode: 'normal' });

  const committed = execFileSync(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', result.commit],
    { cwd: root, encoding: 'utf8', shell: false }
  )
    .trim()
    .split('\n')
    .sort();
  const expected = [
    ...plan.mappings.flatMap(({ source, destination }) => [source.relative, destination.relative]),
    plan.history.relative,
    plan.receipt.relative,
  ].sort();
  assert.deepEqual(committed, expected);
  assert.equal(
    execFileSync('git', ['show', ':unrelated.txt'], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    }),
    stagedBefore
  );
  assert.equal(
    execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    }).trim(),
    'unrelated.txt'
  );
});

test('normal mode exact retry commits a verified relocation interrupted after source cleanup', async (t) => {
  const { planReviewRecord, applyReviewRecord } = await recordModule();
  const { root, first, second } = acceptedRecord(t);
  execFileSync('git', ['add', 'docs'], { cwd: root, stdio: 'ignore', shell: false });
  execFileSync('git', ['commit', '-m', 'fixture collateral'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  const plan = planReviewRecord({
    workspaces: [first.workspace, second.workspace],
    destination: 'docs/peer-reviews/spec/record-01',
    now: new Date('2026-09-08T13:00:00.000Z'),
  });

  assert.throws(
    () =>
      applyReviewRecord(plan, {
        mode: 'normal',
        checkpoint(phase) {
          if (phase === 'sources-removed') throw new Error('injected interruption');
        },
      }),
    (error) => error.code === 'APR_REVIEW_RECORD_APPLY'
  );

  const result = applyReviewRecord(plan, { mode: 'normal' });

  assert.equal(result.recovered, true);
  assert.match(result.commit, /^[0-9a-f]{40}$/);
  const committed = execFileSync(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', result.commit],
    { cwd: root, encoding: 'utf8', shell: false }
  )
    .trim()
    .split('\n')
    .sort();
  const expected = [
    ...plan.mappings.flatMap(({ source, destination }) => [source.relative, destination.relative]),
    plan.history.relative,
    plan.receipt.relative,
  ].sort();
  assert.deepEqual(committed, expected);
});

test('consolidate dry-run renders a deterministic CLI result without mutation', async (t) => {
  const { root, first, second } = acceptedRecord(t);
  const stdout = [];
  const stderr = [];
  const destination = 'docs/peer-reviews/spec/record-01';
  const exitCode = await run(
    [
      'consolidate',
      path.relative(root, first.workspace),
      path.relative(root, second.workspace),
      '--destination',
      destination,
      '--dry-run',
      '--json',
    ],
    {
      cwd: root,
      env: {},
      now: new Date('2026-09-08T13:00:00.000Z'),
      stdout: { write: (value) => stdout.push(String(value)) },
      stderr: { write: (value) => stderr.push(String(value)) },
    }
  );

  assert.equal(exitCode, 0, stderr.join(''));
  const result = JSON.parse(stdout.join(''));
  assert.equal(result.schema, 'ai-peer-review.cli-result/v1');
  assert.equal(result.command, 'consolidate');
  assert.equal(result.record_id, 'record-01');
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.mappings.length > 0, true);
  assert.equal(
    result.mappings.every(({ collision }) => collision === 'none'),
    true
  );
  assert.equal(result.receipt, 'docs/peer-reviews/spec/record-01/relocation-receipt.json');
  assert.equal(existsSync(path.join(root, destination)), false);
  assert.equal(existsSync(first.paths.destination.absolute), true);
  assert.equal(existsSync(second.paths.destination.absolute), true);
});

test('consolidate apply recomputes authority and commits the exact relocation', async (t) => {
  const { root, first, second } = acceptedRecord(t);
  execFileSync('git', ['add', 'docs'], { cwd: root, stdio: 'ignore', shell: false });
  execFileSync('git', ['commit', '-m', 'fixture collateral'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  writeFileSync(path.join(root, 'unrelated.txt'), 'staged but unrelated\n');
  execFileSync('git', ['add', 'unrelated.txt'], { cwd: root, stdio: 'ignore', shell: false });
  const stdout = [];
  const stderr = [];
  const exitCode = await run(
    [
      'consolidate',
      path.relative(root, first.workspace),
      path.relative(root, second.workspace),
      '--destination',
      'docs/peer-reviews/spec/record-01',
      '--apply',
      '--json',
    ],
    {
      cwd: root,
      env: {},
      now: new Date('2026-09-08T13:00:00.000Z'),
      stdout: { write: (value) => stdout.push(String(value)) },
      stderr: { write: (value) => stderr.push(String(value)) },
    }
  );

  assert.equal(exitCode, 0, stderr.join(''));
  const result = JSON.parse(stdout.join(''));
  assert.equal(result.mode, 'apply');
  assert.match(result.review.commit, /^[0-9a-f]{40,64}$/);
  assert.equal(existsSync(path.join(root, result.receipt)), true);
  assert.equal(existsSync(first.paths.destination.absolute), false);
  assert.equal(existsSync(second.paths.destination.absolute), false);
  assert.equal(
    execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    }).trim(),
    'unrelated.txt'
  );
});
