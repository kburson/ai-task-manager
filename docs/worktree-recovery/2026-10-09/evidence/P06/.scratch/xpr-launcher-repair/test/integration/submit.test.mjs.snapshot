import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';

// cspell:ignore filemode

const NOW = '2026-09-09T02:00:00.000Z';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-submit-'));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/artifact.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function repositoryRelative(root, file) {
  const canonicalRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  return path.relative(canonicalRoot, file).split(path.sep).join('/');
}

function identity(role, session, overrides = {}) {
  return participantIdentity({
    role,
    host: 'codex',
    provider: 'openai',
    modelId: overrides.modelId ?? 'gpt-test',
    modelDisplay: overrides.modelDisplay ?? 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: overrides.joinedAt ?? NOW,
  });
}

function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  assert.match(text, pattern);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

async function joinedReview(root, reviewId, options = {}) {
  const author = identity('author', `${reviewId}-author`);
  const reviewer = identity('reviewer', `${reviewId}-reviewer`);
  const started = await api.startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId,
    now: NOW,
    ...options,
  });
  const joined = await api.joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    transportCapability: options.transportCapability,
    now: NOW,
  });
  return { author, reviewer, started, joined };
}

test('resume transport failure leaves a durable pending delivery and safe manual recovery', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await joinedReview(fx.root, 'resume-delivery-pending', {
    transportMode: 'resume-only',
    transportCapability: 'resume-only',
  });
  replaceSection(review.joined.paths.response, 'Summary', 'One repair.');
  replaceSection(review.joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(review.joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(review.joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(review.joined.paths.response, 'Decision', 'revisions-requested');
  const handleFile = path.join(review.started.paths.workspace, 'handoffs', 'author-resume.json');
  mkdirSync(path.dirname(handleFile), { recursive: true });
  writeFileSync(
    handleFile,
    '{"schema":"ai-peer-review.resume-handle/v1","host":"codex","handle":"author-session"}\n'
  );
  const transport = api.createResumeTransport({
    host: 'codex',
    command: ['codex', 'resume'],
    workspace: review.started.paths.workspace,
    scratchHandle: handleFile,
  });
  const submitted = await api.submitReviewTurn(
    {
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      identity: review.reviewer,
      decision: 'revisions-requested',
      now: NOW,
    },
    {
      transport,
      execFile: async () => {
        throw new Error('offline with secret details');
      },
    }
  );
  assert.equal(submitted.review.delivery.status, 'delivery-pending');
  assert.equal(submitted.review.delivery.reason, 'resume-command-failed');
  assert.doesNotMatch(JSON.stringify(submitted.review.delivery), /secret details/);
  assert.match(submitted.review.delivery.manual.command, /peer-review resume/);
  const events = readFileSync(review.started.paths.events, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(events.filter((event) => event.type === 'delivery-written').length, 1);
  assert.equal(events.filter((event) => event.type === 'delivery-acknowledged').length, 0);
  const retried = await api.submitReviewTurn(
    {
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      identity: review.reviewer,
      decision: 'revisions-requested',
      now: NOW,
    },
    { transport, execFile: async () => {} }
  );
  assert.equal(retried.review.delivery.status, 'delivered');
  const recoveredEvents = readFileSync(review.started.paths.events, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(recoveredEvents.filter((event) => event.type === 'delivery-written').length, 1);
  assert.equal(recoveredEvents.filter((event) => event.type === 'delivery-acknowledged').length, 1);
  let repeated = false;
  await api.submitReviewTurn(
    {
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      identity: review.reviewer,
      decision: 'revisions-requested',
      now: NOW,
    },
    {
      transport,
      execFile: async () => {
        repeated = true;
      },
    }
  );
  assert.equal(repeated, false);
});

for (const [label, command] of [
  ['missing handle', ['codex', 'resume']],
  ['unofficial command', ['sh', '-c']],
]) {
  test(`CLI seals the handoff before ${label} recovery`, async (t) => {
    const fx = fixture();
    t.after(fx.cleanup);
    const reviewId = `cli-${label.replace(' ', '-')}`;
    writeFileSync(
      path.join(fx.root, '.ai-peer-review.json'),
      `${JSON.stringify({
        schema: 'ai-peer-review.config/v1',
        hosts: { codex: { resume: { command } } },
      })}\n`
    );
    const review = await joinedReview(fx.root, reviewId, {
      transportMode: 'resume-only',
      transportCapability: 'resume-only',
    });
    replaceSection(review.joined.paths.response, 'Summary', 'One repair.');
    replaceSection(review.joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
    replaceSection(review.joined.paths.response, 'Required changes', '- Address R1-F001.');
    replaceSection(review.joined.paths.response, 'Optional suggestions', 'None.');
    replaceSection(review.joined.paths.response, 'Decision', 'revisions-requested');
    let output = '';
    let errorOutput = '';
    const code = await api.run(['submit', review.started.paths.workspace], {
      cwd: fx.root,
      env: {},
      now: new Date(NOW),
      identityContext: {
        adapter: 'codex',
        runtime: {
          sessionId: `${reviewId}-reviewer`,
          modelId: 'gpt-test',
          modelDisplay: 'GPT Test',
        },
      },
      stdout: { write: (value) => (output += value) },
      stderr: { write: (value) => (errorOutput += value) },
    });
    assert.equal(code, 0, errorOutput);
    assert.match(output, /Manual recovery: .*peer-review resume/);
    const events = readFileSync(review.started.paths.events, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.equal(events.filter((event) => event.type === 'delivery-written').length, 1);
    assert.equal(events.filter((event) => event.type === 'delivery-acknowledged').length, 0);
  });
}

test('submit rejects stale reviewer and author claims without sealing responses', async (t) => {
  const reviewerFx = fixture();
  t.after(reviewerFx.cleanup);
  const reviewerTurn = await joinedReview(reviewerFx.root, 'stale-reviewer', {
    claimTtlMs: 3_600_000,
  });
  replaceSection(reviewerTurn.joined.paths.response, 'Summary', 'Ready.');
  replaceSection(reviewerTurn.joined.paths.response, 'Findings', 'None.');
  replaceSection(reviewerTurn.joined.paths.response, 'Required changes', 'None.');
  replaceSection(reviewerTurn.joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(reviewerTurn.joined.paths.response, 'Decision', 'accepted');
  const reviewerResponse = readFileSync(reviewerTurn.joined.paths.response);
  await assert.rejects(
    api.submitReviewTurn({
      cwd: reviewerFx.root,
      workspace: reviewerTurn.started.paths.workspace,
      identity: reviewerTurn.reviewer,
      decision: 'accepted',
      now: '2026-09-09T03:00:00.000Z',
    }),
    (error) => error.code === 'APR_CLAIM_INVALID'
  );
  assert.deepEqual(readFileSync(reviewerTurn.joined.paths.response), reviewerResponse);

  const authorFx = fixture();
  t.after(authorFx.cleanup);
  const author = await authorTurn(authorFx.root, 'stale-author', { claimTtlMs: 3_600_000 });
  writeFileSync(path.join(authorFx.root, 'docs/artifact.md'), '# Stale author repair\n');
  const authorResponse = readFileSync(author.handoff.paths.response);
  await assert.rejects(
    api.submitAuthorTurn({
      cwd: authorFx.root,
      workspace: author.started.paths.workspace,
      identity: author.author,
      now: '2026-09-09T03:01:00.000Z',
    }),
    (error) => error.code === 'APR_CLAIM_INVALID'
  );
  assert.deepEqual(readFileSync(author.handoff.paths.response), authorResponse);
});

test('submit records same-session model refresh for reviewer and author', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await joinedReview(fx.root, 'identity-refresh');
  replaceSection(review.joined.paths.response, 'Summary', 'One repair.');
  replaceSection(review.joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(review.joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(review.joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(review.joined.paths.response, 'Decision', 'revisions-requested');
  const refreshedReviewer = identity('reviewer', 'identity-refresh-reviewer', {
    modelId: 'gpt-refreshed-reviewer',
    modelDisplay: 'GPT Refreshed Reviewer',
    joinedAt: '2026-09-09T02:01:00.000Z',
  });
  const handoff = await api.submitReviewTurn({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: refreshedReviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T02:01:00.000Z',
  });
  replaceSection(handoff.paths.response, 'Summary', 'Repaired.');
  replaceSection(handoff.paths.response, 'Finding dispositions', '- R1-F001: fixed');
  replaceSection(handoff.paths.response, 'Changes made', 'Updated artifact.');
  replaceSection(handoff.paths.response, 'Declined changes and rationale', 'None.');
  replaceSection(handoff.paths.response, 'Verification', 'Verified.');
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Refreshed author repair\n');
  const refreshedAuthor = identity('author', 'identity-refresh-author', {
    modelId: 'gpt-refreshed-author',
    modelDisplay: 'GPT Refreshed Author',
    joinedAt: '2026-09-09T02:02:00.000Z',
  });
  await api.submitAuthorTurn({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: refreshedAuthor,
    now: '2026-09-09T02:02:00.000Z',
  });
  const events = readFileSync(review.started.paths.events, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    events.filter((event) => event.type === 'identity-changed').map((event) => event.payload.role),
    ['reviewer', 'author']
  );
  assert.equal(
    events.find((event) => event.type === 'identity-changed' && event.payload.role === 'reviewer')
      .payload.identity.joined_at,
    NOW
  );
});

test('reviewer revisions submission seals, delivers, and prepares the author turn', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  assert.equal(typeof api.submitReviewTurn, 'function');
  const { author, reviewer, started, joined } = await joinedReview(fx.root, 'review-submit');
  replaceSection(joined.paths.response, 'Summary', 'One required repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix the artifact.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');

  const submitted = await api.submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T02:01:00.000Z',
  });

  assert.equal(submitted.state, 'author-revision');
  assert.equal(submitted.next_action, 'author-submit');
  assert.equal(submitted.review.response.finding_ids[0], 'R1-F001');
  assert.match(readFileSync(submitted.paths.response, 'utf8'), /role: "author"/);
  assert.match(readFileSync(submitted.paths.response, 'utf8'), /R1-F001/);
  const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(
    events.slice(-3).map((event) => event.type),
    ['reviewer-revisions-requested', 'turn-claimed', 'delivery-written']
  );
  assert.equal(events.at(-2).actor, author.session_fingerprint);
});

test('reviewer acceptance remains uncommitted and moves to acceptance pending', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { reviewer, started, joined } = await joinedReview(fx.root, 'review-accept');
  replaceSection(joined.paths.response, 'Summary', 'Ready.');
  replaceSection(joined.paths.response, 'Findings', 'None.');
  replaceSection(joined.paths.response, 'Required changes', 'None.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'accepted');

  const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fx.root,
    encoding: 'utf8',
  }).trim();
  const submitted = await api.submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'accepted',
    now: '2026-09-09T02:01:00.000Z',
  });
  assert.equal(submitted.state, 'acceptance-pending');
  assert.equal(submitted.next_action, 'finalize-acceptance');
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.root, encoding: 'utf8' }).trim(),
    beforeHead
  );
});

test('author revision commits the sealed triad before returning control to the reviewer', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  assert.equal(typeof api.submitAuthorTurn, 'function');
  const { author, reviewer, started, joined } = await joinedReview(fx.root, 'author-submit');
  replaceSection(joined.paths.response, 'Summary', 'One required repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix the artifact.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  const reviewerResult = await api.submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T02:01:00.000Z',
  });
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Artifact repaired\n');
  replaceSection(reviewerResult.paths.response, 'Summary', 'Repaired.');
  replaceSection(reviewerResult.paths.response, 'Finding dispositions', '- R1-F001: fixed');
  replaceSection(reviewerResult.paths.response, 'Changes made', 'Updated the artifact.');
  replaceSection(reviewerResult.paths.response, 'Declined changes and rationale', 'None.');
  replaceSection(reviewerResult.paths.response, 'Verification', 'Reviewed exact bytes.');
  const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fx.root,
    encoding: 'utf8',
  }).trim();

  const authorResult = await api.submitAuthorTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: author,
    now: '2026-09-09T02:02:00.000Z',
  });

  assert.equal(authorResult.state, 'reviewer-turn');
  assert.equal(authorResult.next_action, 'reviewer-submit');
  assert.notEqual(authorResult.review.commit.commit, beforeHead);
  assert.match(readFileSync(authorResult.paths.response, 'utf8'), /role: "reviewer"/);
  const changed = execFileSync(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', authorResult.review.commit.commit],
    { cwd: fx.root, encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .sort();
  assert.deepEqual(
    changed,
    [
      'docs/artifact.md',
      repositoryRelative(fx.root, reviewerResult.paths.response).replace(
        'author-response',
        'reviewer-response'
      ),
      repositoryRelative(fx.root, reviewerResult.paths.response),
    ].sort()
  );
  const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ['author-revision-committed', 'delivery-written']
  );
});

test('CLI submit resolves the current author and emits one closed result', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { started } = await authorTurn(fx.root, 'author-cli');
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# CLI repair\n');
  let stdout = '';
  let stderr = '';
  const exitCode = await api.run(['submit', started.paths.workspace], {
    cwd: fx.root,
    env: {
      CODEX_SESSION_ID: 'author-cli-author',
      CODEX_MODEL_ID: 'gpt-test',
      CODEX_MODEL_DISPLAY: 'GPT Test',
    },
    now: '2026-09-09T02:02:00.000Z',
    stdout: { write: (value) => (stdout += value) },
    stderr: { write: (value) => (stderr += value) },
  });
  assert.equal(exitCode, 0, stderr);
  assert.match(stdout, /^Review author-cli: reviewer-turn$/m);
  assert.equal(stderr, '');
});

async function authorTurn(root, reviewId, options = {}) {
  const author = identity('author', `${reviewId}-author`);
  const reviewer = identity('reviewer', `${reviewId}-reviewer`);
  const started = await api.startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId,
    now: NOW,
    ...options,
  });
  const joined = await api.joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  replaceSection(joined.paths.response, 'Summary', 'One required repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix the artifact.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  const handoff = await api.submitReviewTurn({
    cwd: root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T02:01:00.000Z',
  });
  replaceSection(handoff.paths.response, 'Summary', 'Disposition complete.');
  replaceSection(handoff.paths.response, 'Finding dispositions', '- R1-F001: addressed');
  replaceSection(handoff.paths.response, 'Changes made', 'See the artifact or rationale.');
  replaceSection(handoff.paths.response, 'Declined changes and rationale', '');
  replaceSection(handoff.paths.response, 'Verification', 'Reviewed exact bytes.');
  return { author, reviewer, started, handoff };
}

test('unchanged artifact requires and records an explicit rationale without mutating on refusal', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { author, started, handoff } = await authorTurn(fx.root, 'author-no-change');
  const responseBefore = readFileSync(handoff.paths.response);
  const eventsBefore = readFileSync(started.paths.events);
  await assert.rejects(
    api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T02:02:00.000Z',
    }),
    (error) => error.code === 'APR_ARTIFACT_UNCHANGED'
  );
  assert.deepEqual(readFileSync(handoff.paths.response), responseBefore);
  assert.deepEqual(readFileSync(started.paths.events), eventsBefore);

  const result = await api.submitAuthorTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: author,
    noArtifactChange: true,
    reason: 'The finding required explanation only.',
    now: '2026-09-09T02:02:00.000Z',
  });
  assert.match(
    readFileSync(handoff.paths.response, 'utf8'),
    /## Declined changes and rationale\n\nThe finding required explanation only\./
  );
  const changed = execFileSync(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', result.review.commit.commit],
    { cwd: fx.root, encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .sort();
  assert.deepEqual(
    changed,
    [
      repositoryRelative(fx.root, handoff.paths.response).replace(
        'author-response',
        'reviewer-response'
      ),
      repositoryRelative(fx.root, handoff.paths.response),
    ].sort()
  );
  assert.match(result.review.artifact.digest, /^sha256:[0-9a-f]{64}$/);
});

test('author submission refuses artifact mode drift before sealing or committing', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  if (
    execFileSync('git', ['config', '--bool', 'core.filemode'], {
      cwd: fx.root,
      encoding: 'utf8',
    }).trim() !== 'true'
  ) {
    t.skip('Git reports that file-mode tracking is disabled on this filesystem');
    return;
  }
  const { author, started, handoff } = await authorTurn(fx.root, 'author-mode-drift');
  const responseBefore = readFileSync(handoff.paths.response);
  const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fx.root,
    encoding: 'utf8',
  }).trim();
  chmodSync(path.join(fx.root, 'docs/artifact.md'), 0o755);
  await assert.rejects(
    api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      noArtifactChange: true,
      reason: 'No byte change.',
      now: '2026-09-09T02:02:00.000Z',
    }),
    (error) => error.code === 'APR_GIT_SEAL_MISMATCH'
  );
  assert.deepEqual(readFileSync(handoff.paths.response), responseBefore);
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.root, encoding: 'utf8' }).trim(),
    headBefore
  );
});

test('no-commit author submission snapshots the logical triad without Git mutation', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { author, started } = await authorTurn(fx.root, 'author-no-commit', {
    noCommit: true,
    testHumanAuthority: 'submit-fixture',
  });
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# No-commit repair\n');
  const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fx.root,
    encoding: 'utf8',
  }).trim();
  const indexBefore = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: fx.root });
  const result = await api.submitAuthorTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: author,
    now: '2026-09-09T02:02:00.000Z',
  });
  assert.equal(result.state, 'reviewer-turn');
  assert.equal(result.review.commit, null);
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.root, encoding: 'utf8' }).trim(),
    headBefore
  );
  assert.deepEqual(
    execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: fx.root }),
    indexBefore
  );
  assert.equal(readFileSync(result.review.snapshot.path).length > 0, true);
  const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-2).type, 'author-revision-sealed-no-commit');
  assert.equal(events.at(-2).payload.snapshot.digest, result.review.snapshot.digest);
});

test('reviewer submission resumes every interrupted handoff checkpoint exactly once', async (t) => {
  const checkpoints = [
    'response-sealed',
    'decision-appended',
    'author-claimed',
    'author-draft-created',
    'delivery-written',
  ];
  for (const checkpoint of checkpoints) {
    const fx = fixture();
    t.after(fx.cleanup);
    const reviewId = `review-retry-${checkpoint}`;
    const { reviewer, started, joined } = await joinedReview(fx.root, reviewId);
    replaceSection(joined.paths.response, 'Summary', 'One required repair.');
    replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
    replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
    replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
    replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
    let injected = false;
    await assert.rejects(
      api.submitReviewTurn(
        {
          cwd: fx.root,
          workspace: started.paths.workspace,
          identity: reviewer,
          decision: 'revisions-requested',
          now: '2026-09-09T02:01:00.000Z',
        },
        {
          checkpoint(name) {
            if (!injected && name === checkpoint) {
              injected = true;
              throw new Error(`injected after ${name}`);
            }
          },
        }
      ),
      new RegExp(`injected after ${checkpoint}`)
    );
    if (checkpoint === 'delivery-written') {
      rmSync(path.join(started.paths.workspace, 'deliveries/reviewer-turn-1-to-author.json'));
    }
    const recovered = await api.submitReviewTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: reviewer,
      decision: 'revisions-requested',
      now: '2026-09-09T02:01:00.000Z',
    });
    assert.equal(recovered.state, 'author-revision', checkpoint);
    const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(
      events.filter((event) => event.type === 'reviewer-revisions-requested').length,
      1,
      checkpoint
    );
    assert.equal(
      events.filter(
        (event) =>
          event.type === 'delivery-written' &&
          event.payload.delivery.delivery_id === 'reviewer-turn-1-to-author'
      ).length,
      1,
      checkpoint
    );
    assert.match(
      readFileSync(
        path.join(started.paths.workspace, 'deliveries/reviewer-turn-1-to-author.json'),
        'utf8'
      ),
      /reviewer-turn-1-to-author/,
      checkpoint
    );
  }
});

test('reviewer handoff recovery remains authorized after the original claim expires', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { reviewer, started, joined } = await joinedReview(fx.root, 'reviewer-expired-retry', {
    claimTtlMs: 3_600_000,
  });
  replaceSection(joined.paths.response, 'Summary', 'One required repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  await assert.rejects(
    api.submitReviewTurn(
      {
        cwd: fx.root,
        workspace: started.paths.workspace,
        identity: reviewer,
        decision: 'revisions-requested',
        now: '2026-09-09T02:01:00.000Z',
      },
      {
        checkpoint(name) {
          if (name === 'decision-appended') throw new Error('injected after decision-appended');
        },
      }
    ),
    /injected after decision-appended/
  );
  const recovered = await api.submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T04:00:00.000Z',
  });
  assert.equal(recovered.state, 'author-revision');
});

test('author submission resumes every interrupted commit handoff checkpoint exactly once', async (t) => {
  const checkpoints = [
    'response-sealed',
    'transaction-completed',
    'author-event-appended',
    'reviewer-draft-created',
    'delivery-written',
  ];
  for (const checkpoint of checkpoints) {
    const fx = fixture();
    t.after(fx.cleanup);
    const reviewId = `author-retry-${checkpoint}`;
    const { author, started, handoff } = await authorTurn(fx.root, reviewId);
    writeFileSync(path.join(fx.root, 'docs/artifact.md'), `# Repaired after ${checkpoint}\n`);
    let injected = false;
    await assert.rejects(
      api.submitAuthorTurn(
        {
          cwd: fx.root,
          workspace: started.paths.workspace,
          identity: author,
          now: '2026-09-09T02:02:00.000Z',
        },
        {
          checkpoint(name) {
            if (!injected && name === checkpoint) {
              injected = true;
              throw new Error(`injected after ${name}`);
            }
          },
        }
      ),
      new RegExp(`injected after ${checkpoint}`)
    );
    if (checkpoint === 'delivery-written') {
      rmSync(path.join(started.paths.workspace, 'deliveries/author-turn-1-to-reviewer.json'));
    }
    const recovered = await api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T02:02:00.000Z',
    });
    assert.equal(recovered.state, 'reviewer-turn', checkpoint);
    assert.deepEqual(recovered.review.response.answered_finding_ids, ['R1-F001'], checkpoint);
    const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(
      events.filter((event) => event.type === 'author-revision-committed').length,
      1,
      checkpoint
    );
    assert.equal(
      events.filter(
        (event) =>
          event.type === 'delivery-written' &&
          event.payload.delivery.delivery_id === 'author-turn-1-to-reviewer'
      ).length,
      1,
      checkpoint
    );
    assert.equal(
      execFileSync('git', ['log', '--format=%s', '--grep=^Peer review revision 1$'], {
        cwd: fx.root,
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean).length,
      1,
      checkpoint
    );
    assert.match(readFileSync(handoff.paths.response, 'utf8'), /submitted_at:/);
    assert.match(
      readFileSync(
        path.join(started.paths.workspace, 'deliveries/author-turn-1-to-reviewer.json'),
        'utf8'
      ),
      /author-turn-1-to-reviewer/,
      checkpoint
    );
  }
});

test('author handoff recovery remains authorized after the original claim expires', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { author, started } = await authorTurn(fx.root, 'author-expired-retry', {
    claimTtlMs: 3_600_000,
  });
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Delayed recovery repair\n');
  await assert.rejects(
    api.submitAuthorTurn(
      {
        cwd: fx.root,
        workspace: started.paths.workspace,
        identity: author,
        now: '2026-09-09T02:02:00.000Z',
      },
      {
        checkpoint(name) {
          if (name === 'author-event-appended') {
            throw new Error('injected after author-event-appended');
          }
        },
      }
    ),
    /injected after author-event-appended/
  );
  const recovered = await api.submitAuthorTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: author,
    now: '2026-09-09T04:00:00.000Z',
  });
  assert.equal(recovered.state, 'reviewer-turn');
});

test('no-commit author submission resumes without changing HEAD or index', async (t) => {
  const checkpoints = [
    'response-sealed',
    'artifact-snapshotted',
    'author-event-appended',
    'reviewer-draft-created',
    'delivery-written',
  ];
  for (const checkpoint of checkpoints) {
    const fx = fixture();
    t.after(fx.cleanup);
    const reviewId = `no-commit-retry-${checkpoint}`;
    const { author, started } = await authorTurn(fx.root, reviewId, {
      noCommit: true,
      testHumanAuthority: 'submit-recovery-fixture',
    });
    writeFileSync(path.join(fx.root, 'docs/artifact.md'), `# No-commit ${checkpoint}\n`);
    const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: fx.root,
      encoding: 'utf8',
    }).trim();
    const indexBefore = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: fx.root });
    let injected = false;
    await assert.rejects(
      api.submitAuthorTurn(
        {
          cwd: fx.root,
          workspace: started.paths.workspace,
          identity: author,
          now: '2026-09-09T02:02:00.000Z',
        },
        {
          checkpoint(name) {
            if (!injected && name === checkpoint) {
              injected = true;
              throw new Error(`injected after ${name}`);
            }
          },
        }
      ),
      new RegExp(`injected after ${checkpoint}`)
    );
    const recovered = await api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T02:02:00.000Z',
    });
    assert.equal(recovered.state, 'reviewer-turn', checkpoint);
    assert.equal(recovered.review.commit, null, checkpoint);
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.root, encoding: 'utf8' }).trim(),
      headBefore,
      checkpoint
    );
    assert.deepEqual(
      execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: fx.root }),
      indexBefore,
      checkpoint
    );
    const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(
      events.filter((event) => event.type === 'author-revision-sealed-no-commit').length,
      1,
      checkpoint
    );
  }
});

test('final author turn enters intervention in commit and no-commit modes', async (t) => {
  for (const noCommit of [false, true]) {
    const fx = fixture();
    t.after(fx.cleanup);
    const mode = noCommit ? 'no-commit' : 'commit';
    const { author, started } = await authorTurn(fx.root, `final-${mode}`, {
      maxTurns: 1,
      ...(noCommit ? { noCommit: true, testHumanAuthority: 'final-turn-fixture' } : {}),
    });
    writeFileSync(path.join(fx.root, 'docs/artifact.md'), `# Final ${mode} repair\n`);
    const result = await api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T02:02:00.000Z',
    });
    assert.equal(result.state, 'intervention-required', mode);
    assert.equal(result.next_action, 'human-intervention', mode);
    assert.equal(result.review.commit === null, noCommit, mode);
    const events = readFileSync(started.paths.events, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(
      events.at(-2).type,
      noCommit ? 'author-closing-round-sealed-no-commit' : 'author-closing-round-committed',
      mode
    );
    assert.equal(events.at(-2).payload.reason, 'turn-budget-exhausted', mode);
  }
});
