import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';

const RECORD_ID = 'record-incident';
const TEMPLATE = '<kind>/<date>-<name>-<review-id>';

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture(t) {
  const scratch = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(scratch, { recursive: true });
  const parent = mkdtempSync(path.join(scratch, 'review-record-integration-'));
  const root = path.join(parent, 'repository');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore', shell: false });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Review Record Test'], { cwd: root });
  writeFileSync(path.join(root, 'docs', 'artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, '.git', 'info', 'exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/artifact.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return { root };
}

function identity(role, session, joinedAt) {
  return participantIdentity({
    role,
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt,
  });
}

function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  assert.match(text, pattern);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

function completeReviewer(file, decision, { finding = false } = {}) {
  replaceSection(file, 'Summary', decision === 'accepted' ? 'Accepted.' : 'One repair remains.');
  replaceSection(file, 'Findings', finding ? '### R1-F001 — Repair\n\nFix the artifact.' : 'None.');
  replaceSection(file, 'Required changes', finding ? '- Address R1-F001.' : 'None.');
  replaceSection(file, 'Optional suggestions', 'None.');
  replaceSection(file, 'Decision', decision);
}

function completeAuthor(file) {
  replaceSection(file, 'Summary', 'Disposition complete.');
  replaceSection(file, 'Finding dispositions', '- R1-F001: addressed');
  replaceSection(file, 'Changes made', 'Updated the artifact or supplied rationale.');
  replaceSection(file, 'Declined changes and rationale', 'None.');
  replaceSection(file, 'Verification', 'Reviewed exact bytes.');
}

async function startAndJoin(root, reviewId, minute) {
  const at = `2026-09-08T12:${String(minute).padStart(2, '0')}:00.000Z`;
  const author = identity('author', `${reviewId}-author`, at);
  const reviewer = identity('reviewer', `${reviewId}-reviewer`, at);
  const started = await api.startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId,
    recordId: RECORD_ID,
    reviewPathTemplate: TEMPLATE,
    now: at,
  });
  const joined = await api.joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: at,
  });
  return { author, reviewer, started, joined };
}

async function revisionAttempt(root, reviewId, minute, { changeArtifact }) {
  const review = await startAndJoin(root, reviewId, minute);
  completeReviewer(review.joined.paths.response, 'revisions-requested', { finding: true });
  const handoff = await api.submitReviewTurn({
    cwd: root,
    workspace: review.started.paths.workspace,
    identity: review.reviewer,
    decision: 'revisions-requested',
    now: `2026-09-08T12:${String(minute + 1).padStart(2, '0')}:00.000Z`,
  });
  completeAuthor(handoff.paths.response);
  if (changeArtifact) {
    writeFileSync(path.join(root, 'docs', 'artifact.md'), `# Artifact revision ${reviewId}\n`);
  }
  const submitted = await api.submitAuthorTurn({
    cwd: root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    noArtifactChange: !changeArtifact,
    reason: changeArtifact ? undefined : 'The second attempt documents the existing repair.',
    now: `2026-09-08T12:${String(minute + 2).padStart(2, '0')}:00.000Z`,
  });
  return { ...review, submitted };
}

test('three recovery attempts consolidate into one truthful terminal review record', async (t) => {
  const { root } = fixture(t);

  const first = await revisionAttempt(root, 'review-incident-01', 0, { changeArtifact: true });
  completeReviewer(first.submitted.paths.response, 'accepted');
  const unsubmittedBytes = readFileSync(first.submitted.paths.response);
  await api.supersedeReview({
    workspace: first.started.paths.workspace,
    identity: first.reviewer,
    reason: 'Capture-ref churn prevented submission.',
    successorReviewId: 'review-incident-02',
    now: '2026-09-08T12:03:00.000Z',
  });

  const second = await revisionAttempt(root, 'review-incident-02', 4, { changeArtifact: false });
  const incompleteBytes = readFileSync(second.submitted.paths.response);
  assert.match(incompleteBytes.toString('utf8'), /<!-- Write the review summary\. -->/);
  await api.supersedeReview({
    workspace: second.started.paths.workspace,
    identity: second.reviewer,
    reason: 'Replacement inspection was not completed.',
    successorReviewId: 'review-incident-03',
    now: '2026-09-08T12:07:00.000Z',
  });

  const third = await startAndJoin(root, 'review-incident-03', 8);
  completeReviewer(third.joined.paths.response, 'accepted');
  await api.submitReviewTurn({
    cwd: root,
    workspace: third.started.paths.workspace,
    identity: third.reviewer,
    decision: 'accepted',
    now: '2026-09-08T12:09:00.000Z',
  });
  const finalized = await api.finalizeReview({
    cwd: root,
    workspace: third.started.paths.workspace,
    identity: third.author,
    now: '2026-09-08T12:10:00.000Z',
  });
  assert.equal(finalized.state, 'accepted');

  const args = [
    'consolidate',
    first.started.paths.workspace,
    second.started.paths.workspace,
    third.started.paths.workspace,
    '--destination',
    'docs/peer-reviews/spec/record-incident',
  ];
  const dryOut = [];
  const dryErr = [];
  assert.equal(
    await api.run([...args, '--dry-run', '--json'], {
      cwd: root,
      env: {},
      now: new Date('2026-09-08T12:11:00.000Z'),
      stdout: { write: (value) => dryOut.push(String(value)) },
      stderr: { write: (value) => dryErr.push(String(value)) },
    }),
    0,
    dryErr.join('')
  );
  const dryRun = JSON.parse(dryOut.join(''));
  const sourceBytes = new Map(
    dryRun.mappings.map(({ source }) => [source, readFileSync(path.join(root, source))])
  );
  assert.equal(
    dryRun.mappings.every(({ collision }) => collision === 'none'),
    true
  );
  assert.equal(
    dryRun.mappings.every(
      ({ source, digest: expected }) => digest(sourceBytes.get(source)) === expected
    ),
    true
  );

  const applyOut = [];
  const applyErr = [];
  assert.equal(
    await api.run([...args, '--apply', '--json'], {
      cwd: root,
      env: {},
      now: new Date('2026-09-08T12:11:00.000Z'),
      stdout: { write: (value) => applyOut.push(String(value)) },
      stderr: { write: (value) => applyErr.push(String(value)) },
    }),
    0,
    applyErr.join('')
  );
  const applied = JSON.parse(applyOut.join(''));
  assert.match(applied.review.commit, /^[0-9a-f]{40,64}$/);
  for (const mapping of applied.mappings) {
    assert.deepEqual(
      readFileSync(path.join(root, mapping.destination)),
      sourceBytes.get(mapping.source)
    );
    assert.equal(existsSync(path.join(root, mapping.source)), false);
  }
  assert.deepEqual(
    readFileSync(
      path.join(
        root,
        applied.mappings.find(({ source }) => source.endsWith('reviewer-response-2.md')).destination
      )
    ),
    unsubmittedBytes
  );
  assert.equal(
    [...sourceBytes.values()].some((bytes) => bytes.equals(incompleteBytes)),
    true
  );
  const history = readFileSync(path.join(root, applied.paths.history), 'utf8');
  assert.match(
    history,
    /review-incident-01[\s\S]*not-submitted[\s\S]*review-incident-02[\s\S]*incomplete[\s\S]*review-incident-03[\s\S]*accepted/
  );
  const receipt = JSON.parse(readFileSync(path.join(root, applied.receipt), 'utf8'));
  assert.equal(receipt.attempts.filter(({ state }) => state === 'accepted').length, 1);
  assert.equal(
    receipt.mappings.every(({ digest: expected }) => /^sha256:[0-9a-f]{64}$/.test(expected)),
    true
  );
});
