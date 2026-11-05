import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';
import { createGitRepository } from '../../src/git/repository.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import { createGitSpy } from '../helpers/git-spy.mjs';

const NOW = '2026-09-09T06:00:00.000Z';

function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, ...options });
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-no-commit-'));
  git(root, ['init', '-b', 'trunk'], { stdio: 'ignore' });
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, 'staged.txt'), 'base staged\n');
  writeFileSync(path.join(root, 'unstaged.txt'), 'base unstaged\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  git(root, ['add', 'docs/artifact.md', 'staged.txt', 'unstaged.txt']);
  git(root, ['commit', '-m', 'fixture'], { stdio: 'ignore' });
  writeFileSync(path.join(root, 'staged.txt'), 'preserve staged\n');
  git(root, ['add', 'staged.txt']);
  writeFileSync(path.join(root, 'unstaged.txt'), 'preserve unstaged\n');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function identity(role, session) {
  return participantIdentity({
    role,
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: NOW,
  });
}

function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  assert.match(text, pattern);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

function repositoryBytes(root) {
  return Object.freeze({
    head: git(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    index: git(root, ['ls-files', '--stage', '-z']),
    staged: readFileSync(path.join(root, 'staged.txt')),
    unstaged: readFileSync(path.join(root, 'unstaged.txt')),
  });
}

test('sealNoCommitHandoff returns one immutable event-ready snapshot seal', () => {
  assert.equal(typeof api.sealNoCommitHandoff, 'function');
  const bytes = Buffer.from('# Snapshot\n');
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const review = {
    protocol: {
      review_id: 'no-commit-seal',
      sequence: 7,
      commit_mode: 'no-commit',
      startup: { no_commit_baseline: { head: 'a'.repeat(40), index_digest: digest } },
    },
  };
  let asserted = false;
  const sealed = api.sealNoCommitHandoff({
    review,
    artifactBytes: bytes,
    responses: [{ digest: `sha256:${'b'.repeat(64)}` }],
    store: {
      assertBaseline(value) {
        assert.equal(value, review);
        asserted = true;
      },
      writeExclusiveSnapshot(reviewId, sequence, value) {
        assert.deepEqual([reviewId, sequence, value], ['no-commit-seal', 8, bytes]);
        return { relative: 'artifacts/turn-1.md', digest };
      },
    },
  });
  assert.equal(asserted, true);
  assert.deepEqual(sealed, {
    artifact_digest: digest,
    snapshot_path: 'artifacts/turn-1.md',
    snapshot_digest: digest,
    response_digests: [`sha256:${'b'.repeat(64)}`],
  });
  assert.equal(Object.isFrozen(sealed), true);
  assert.equal(Object.isFrozen(sealed.response_digests), true);
  assert.throws(
    () =>
      api.sealNoCommitHandoff({
        review: { protocol: { ...review.protocol, commit_mode: 'normal' } },
        artifactBytes: bytes,
        responses: [{ digest: `sha256:${'b'.repeat(64)}` }],
        store: { assertBaseline() {}, writeExclusiveSnapshot() {} },
      }),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
});

test('no-commit human and manifest templates carry the explicit mode assurance', () => {
  const mode_banner = '> **NO-COMMIT TEST MODE** — authority assurance: `unverified-test`';
  const human = api.hydrateTemplate('human-decision', {
    frontmatter: '---\nschema: "ai-peer-review.human-decision/v1"\n---',
    mode_banner,
    human_rationale: 'Explain the protected decision.',
  });
  const manifest = api.hydrateTemplate('review-manifest', {
    mode_banner,
    manifest_body: 'final_commit: null\nauthority_assurance: unverified-test',
  });
  for (const rendered of [human, manifest]) {
    assert.match(rendered.toString(), /NO-COMMIT TEST MODE/);
    assert.match(rendered.toString(), /unverified-test/);
  }
  assert.match(manifest.toString(), /final_commit: null/);
});

test('no-commit dialogue is visibly labeled and never invokes a mutating Git command', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const before = repositoryBytes(fx.root);
  const assertRepositoryPreserved = () => assert.deepEqual(repositoryBytes(fx.root), before);
  const spy = createGitSpy();
  const repository = createGitRepository({ execFileSync: spy.execFileSync });
  const transactionRepository = api.createGitTransactionRepository(fx.root, {
    execFileSync: spy.execFileSync,
  });
  const author = identity('author', 'no-commit-author');
  const reviewer = identity('reviewer', 'no-commit-reviewer');
  const started = await api.startReview(
    {
      cwd: fx.root,
      artifact: 'docs/artifact.md',
      artifactKind: 'spec',
      identity: author,
      reviewId: 'no-commit-dialogue',
      noCommit: true,
      testHumanAuthority: 'no-commit-authority',
      now: NOW,
    },
    { repository }
  );
  assert.match(readFileSync(started.paths.author_startup, 'utf8'), /NO-COMMIT TEST MODE/);
  assert.match(readFileSync(started.paths.author_startup, 'utf8'), /unverified-test/);
  assert.match(readFileSync(started.paths.reviewer_invitation, 'utf8'), /NO-COMMIT TEST MODE/);
  assert.deepEqual(
    started.review.no_commit_baseline.changed_paths.map(
      ({ path: changedPath, status, digest }) => ({
        path: changedPath,
        status,
        digest,
      })
    ),
    [
      {
        path: 'staged.txt',
        status: 'M ',
        digest: `sha256:${createHash('sha256').update(before.staged).digest('hex')}`,
      },
      {
        path: 'unstaged.txt',
        status: ' M',
        digest: `sha256:${createHash('sha256').update(before.unstaged).digest('hex')}`,
      },
    ]
  );
  assertRepositoryPreserved();

  const joined = await api.joinReview(
    {
      cwd: fx.root,
      invitation: started.paths.reviewer_invitation,
      identity: reviewer,
      now: NOW,
    },
    { repository }
  );
  const reviewerDraft = readFileSync(joined.paths.response, 'utf8');
  assert.match(reviewerDraft, /NO-COMMIT TEST MODE/);
  assert.match(reviewerDraft, /authority_assurance: "unverified-test"/);
  assertRepositoryPreserved();
  replaceSection(joined.paths.response, 'Summary', 'One repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  const handoff = await api.submitReviewTurn(
    {
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: reviewer,
      decision: 'revisions-requested',
      now: '2026-09-09T06:01:00.000Z',
    },
    { repository }
  );
  assertRepositoryPreserved();
  assert.match(readFileSync(handoff.paths.response, 'utf8'), /NO-COMMIT TEST MODE/);
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Repaired artifact\n');
  replaceSection(handoff.paths.response, 'Summary', 'Repaired.');
  replaceSection(handoff.paths.response, 'Finding dispositions', '- R1-F001: fixed.');
  replaceSection(handoff.paths.response, 'Changes made', 'Updated artifact.');
  replaceSection(handoff.paths.response, 'Declined changes and rationale', 'None.');
  replaceSection(handoff.paths.response, 'Verification', 'No-commit fixture.');
  writeFileSync(path.join(fx.root, 'unstaged.txt'), 'mutated unrelated bytes\n');
  const preexistingMutationEvents = readFileSync(started.paths.events);
  await assert.rejects(
    api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T06:02:00.000Z',
    }),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  assert.deepEqual(readFileSync(started.paths.events), preexistingMutationEvents);
  writeFileSync(path.join(fx.root, 'unstaged.txt'), before.unstaged);
  writeFileSync(path.join(fx.root, 'foreign.txt'), 'new unrelated path\n');
  await assert.rejects(
    api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T06:02:00.000Z',
    }),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  assert.deepEqual(readFileSync(started.paths.events), preexistingMutationEvents);
  rmSync(path.join(fx.root, 'foreign.txt'));
  const submitted = await api.submitAuthorTurn(
    {
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T06:02:00.000Z',
    },
    { repository, transactionRepository }
  );
  assertRepositoryPreserved();
  replaceSection(submitted.paths.response, 'Summary', 'The repair is complete.');
  replaceSection(submitted.paths.response, 'Findings', 'None.');
  replaceSection(submitted.paths.response, 'Required changes', 'None.');
  replaceSection(submitted.paths.response, 'Optional suggestions', 'None.');
  replaceSection(submitted.paths.response, 'Decision', 'accepted');
  const snapshotBytes = readFileSync(submitted.review.snapshot.path);
  writeFileSync(submitted.review.snapshot.path, 'tampered before reviewer submit\n');
  await assert.rejects(
    api.submitReviewTurn(
      {
        cwd: fx.root,
        workspace: started.paths.workspace,
        identity: reviewer,
        decision: 'accepted',
        now: '2026-09-09T06:03:00.000Z',
      },
      { repository }
    ),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  unlinkSync(submitted.review.snapshot.path);
  await assert.rejects(
    api.submitReviewTurn(
      {
        cwd: fx.root,
        workspace: started.paths.workspace,
        identity: reviewer,
        decision: 'accepted',
        now: '2026-09-09T06:03:00.000Z',
      },
      { repository }
    ),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  writeFileSync(submitted.review.snapshot.path, snapshotBytes);
  const accepted = await api.submitReviewTurn(
    {
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: reviewer,
      decision: 'accepted',
      now: '2026-09-09T06:03:00.000Z',
    },
    { repository }
  );
  assert.equal(accepted.state, 'acceptance-pending');
  assertRepositoryPreserved();
  const status = api.statusReview(started.paths.workspace);
  assert.equal(status.review.commit_mode, 'no-commit');
  assert.equal(status.review.authority_assurance, 'unverified-test');
  assert.match(status.review.mode_notice, /NO-COMMIT TEST MODE/);
  assert.equal(
    status.review.owned_paths.some((file) => file.endsWith('/collateral-reservation.json')),
    true
  );
  assert.equal(
    status.review.owned_paths.some((file) => file.endsWith('/artifacts/turn-1.md')),
    true
  );
  assert.equal(
    status.review.owned_paths.some((file) =>
      file.endsWith('/no-commit-dialogue-reviewer-response-2.md')
    ),
    true
  );
  assert.equal(submitted.review.commit, null);
  assertRepositoryPreserved();
  spy.assertReadOnly();
});

test('no-commit mode is start-owned and test authority cannot escape it', async (t) => {
  assert.throws(
    () => api.parseCommand(['submit', 'workspace', '--no-commit']),
    (error) => error.code === 'APR_USAGE'
  );
  const fx = fixture();
  t.after(fx.cleanup);
  await assert.rejects(
    api.startReview({
      cwd: fx.root,
      artifact: 'docs/artifact.md',
      artifactKind: 'spec',
      identity: identity('author', 'normal-author'),
      reviewId: 'normal-test-authority',
      testHumanAuthority: 'forbidden-normal-authority',
      now: NOW,
    }),
    (error) => error.code === 'APR_AUTHORITY_POLICY'
  );
});

test('changed no-commit snapshot blocks exact handoff retry without changing events', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const author = identity('author', 'snapshot-author');
  const reviewer = identity('reviewer', 'snapshot-reviewer');
  const started = await api.startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId: 'snapshot-tamper',
    noCommit: true,
    testHumanAuthority: 'snapshot-authority',
    now: NOW,
  });
  const joined = await api.joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  replaceSection(joined.paths.response, 'Summary', 'Repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  const handoff = await api.submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T06:01:00.000Z',
  });
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Repaired artifact\n');
  replaceSection(handoff.paths.response, 'Summary', 'Repaired.');
  replaceSection(handoff.paths.response, 'Finding dispositions', '- R1-F001: fixed.');
  replaceSection(handoff.paths.response, 'Changes made', 'Updated artifact.');
  replaceSection(handoff.paths.response, 'Declined changes and rationale', 'None.');
  replaceSection(handoff.paths.response, 'Verification', 'No-commit fixture.');
  const submitted = await api.submitAuthorTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: author,
    now: '2026-09-09T06:02:00.000Z',
  });
  writeFileSync(submitted.review.snapshot.path, 'tampered snapshot\n');
  const eventBytes = readFileSync(started.paths.events);
  await assert.rejects(
    api.submitAuthorTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      now: '2026-09-09T06:02:00.000Z',
    }),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  assert.deepEqual(readFileSync(started.paths.events), eventBytes);
});
