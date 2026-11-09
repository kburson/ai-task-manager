import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { joinReview, run, startReview, submitReviewTurn } from '../helpers/internal-api.mjs';
import { createGitRepository } from '../../src/git/repository.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import {
  buildClaudeReviewerLaunch,
  runClaudeReviewerLaunch,
} from '../../src/provider/claude-launch.mjs';
import { inspectReviewAuthority } from '../../src/protocol/service.mjs';

const NOW = '2026-09-09T02:00:00.000Z';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function identity(role, session, overrides = {}) {
  return participantIdentity({
    role,
    host: overrides.host ?? 'codex',
    provider: overrides.provider ?? 'openai',
    modelId: overrides.modelId ?? 'gpt-test',
    modelDisplay: overrides.modelDisplay ?? 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: NOW,
  });
}

function routingFromInvitation(file) {
  const text = readFileSync(file, 'utf8');
  const encoded = text.match(/^<!-- ai-peer-review-invitation data="([A-Za-z0-9_-]+)" -->$/m)?.[1];
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

test('reviewer repository capability exposes observations but no mutation methods', () => {
  const repository = createGitRepository();
  for (const method of ['add', 'commit', 'amend', 'switch', 'checkout', 'push']) {
    assert.equal(repository[method], undefined, method);
  }
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-reviewer-boundary-'));
  git(root, ['init', '-b', 'trunk']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, 'outside-working.txt'), 'before\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  git(root, ['add', 'docs/artifact.md', 'outside-working.txt']);
  git(root, ['commit', '-m', 'fixture']);
  writeFileSync(path.join(root, 'outside-staged.txt'), 'staged-before-review\n');
  git(root, ['add', 'outside-staged.txt']);
  writeFileSync(path.join(root, 'outside-working.txt'), 'working-before-review\n');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

async function prepare(root, reviewId) {
  const reviewer = identity('reviewer', `${reviewId}-reviewer`);
  const started = await startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: identity('author', `${reviewId}-author`),
    reviewId,
    now: NOW,
  });
  const joined = await joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  replaceSection(joined.paths.response, 'Summary', 'Ready.');
  replaceSection(joined.paths.response, 'Findings', 'None.');
  replaceSection(joined.paths.response, 'Required changes', 'None.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'accepted');
  return { reviewer, started, joined };
}

test('reviewer submit tolerates unchanged pre-existing staged and unstaged work', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { reviewer, started } = await prepare(fx.root, 'reviewer-preexisting');
  const staged = git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']);
  const working = readFileSync(path.join(fx.root, 'outside-working.txt'));
  const result = await submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'accepted',
    now: '2026-09-09T02:01:00.000Z',
  });
  assert.equal(result.state, 'acceptance-pending');
  assert.equal(git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']), staged);
  assert.deepEqual(readFileSync(path.join(fx.root, 'outside-working.txt')), working);
});

test('reviewer submit tolerates Codex checkpoint refs created after join', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { reviewer, started } = await prepare(fx.root, 'reviewer-codex-checkpoint');
  git(fx.root, [
    'update-ref',
    'refs/codex/turn-diffs/checkpoints/session/turn-1/checkpoint',
    'HEAD',
  ]);

  const result = await submitReviewTurn({
    cwd: fx.root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'accepted',
    now: '2026-09-09T02:01:00.000Z',
  });

  assert.equal(result.state, 'acceptance-pending');
  assert.equal(result.next_action, 'finalize-acceptance');
});

test('Claude permission recovery preserves reviewer and repository boundaries', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: identity('author', 'claude-boundary-author'),
    reviewId: 'claude-boundary-recovery',
    now: NOW,
  });
  const contract = buildClaudeReviewerLaunch({
    repositoryRoot: fx.root,
    invitation: started.paths.reviewer_invitation,
    routing: routingFromInvitation(started.paths.reviewer_invitation),
    model: 'claude-opus-5',
    effort: 'high',
  });
  const rawSession = 'claude-boundary-reviewer';
  const reviewer = identity('reviewer', rawSession, {
    host: 'claude-code',
    provider: 'anthropic',
    modelId: 'claude-opus-5',
    modelDisplay: 'Claude Opus 5',
  });
  const head = git(fx.root, ['rev-parse', 'HEAD']);
  const branch = git(fx.root, ['branch', '--show-current']);
  const index = git(fx.root, ['write-tree']);
  const refs = git(fx.root, ['for-each-ref', '--format=%(refname) %(objectname)']);
  const artifact = readFileSync(path.join(fx.root, 'docs/artifact.md'));
  const staged = git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']);
  const unstaged = readFileSync(path.join(fx.root, 'outside-working.txt'));
  let joined;
  const denied = await runClaudeReviewerLaunch({
    contract,
    execFile: async () => {
      joined = await joinReview({
        cwd: fx.root,
        invitation: started.paths.reviewer_invitation,
        identity: reviewer,
        now: NOW,
      });
      return {
        stdout: JSON.stringify({
          session_id: rawSession,
          permission_denials: [{ tool: 'Edit', path: contract.response }],
        }),
        stderr: '',
        exit_code: 1,
      };
    },
  });
  assert.equal(denied.status, 'permission-blocked');
  const beforeResume = inspectReviewAuthority(contract.workspace);
  const recovered = await runClaudeReviewerLaunch({
    contract,
    resume: true,
    execFile: async (_file, args) => {
      assert.deepEqual(args.slice(0, 2), ['--resume', rawSession]);
      replaceSection(joined.paths.response, 'Summary', 'Recovered without widening access.');
      replaceSection(joined.paths.response, 'Findings', 'None.');
      replaceSection(joined.paths.response, 'Required changes', 'None.');
      replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
      replaceSection(joined.paths.response, 'Decision', 'accepted');
      await submitReviewTurn({
        cwd: fx.root,
        workspace: contract.workspace,
        identity: reviewer,
        decision: 'accepted',
        now: '2026-09-09T02:01:00.000Z',
      });
      return {
        stdout: JSON.stringify({ session_id: rawSession, permission_denials: [] }),
        stderr: '',
      };
    },
  });
  const after = inspectReviewAuthority(contract.workspace);
  assert.equal(recovered.status, 'submitted');
  assert.equal(recovered.session_fingerprint, reviewer.session_fingerprint);
  assert.deepEqual(
    after.events.slice(beforeResume.events.length).map(({ type }) => type),
    ['reviewer-accepted', 'delivery-written']
  );
  assert.equal(git(fx.root, ['rev-parse', 'HEAD']), head);
  assert.equal(git(fx.root, ['branch', '--show-current']), branch);
  assert.equal(git(fx.root, ['write-tree']), index);
  assert.equal(git(fx.root, ['for-each-ref', '--format=%(refname) %(objectname)']), refs);
  assert.deepEqual(readFileSync(path.join(fx.root, 'docs/artifact.md')), artifact);
  assert.equal(git(fx.root, ['ls-files', '--stage', '--', 'outside-staged.txt']), staged);
  assert.deepEqual(readFileSync(path.join(fx.root, 'outside-working.txt')), unstaged);
  assert.equal(
    existsSync(path.join(path.dirname(contract.response), 'reviewer-response-2.md')),
    false
  );
});

test('reviewer submit rejects a retained ref and explains legacy restart without mutation', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { reviewer, started, joined } = await prepare(fx.root, 'reviewer-retained-ref-control');
  const eventsBefore = readFileSync(started.paths.events);
  const responseBefore = readFileSync(joined.paths.response);
  git(fx.root, ['update-ref', 'refs/heads/reviewer-boundary-control', 'HEAD']);

  await assert.rejects(
    submitReviewTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: reviewer,
      decision: 'accepted',
      now: '2026-09-09T02:01:00.000Z',
    }),
    (error) =>
      error.code === 'APR_REVIEWER_GIT_VIOLATION' &&
      /retained ref changed|legacy all-ref policy/i.test(error.recovery) &&
      /preserve.*workspace.*restart/i.test(error.recovery)
  );
  assert.deepEqual(readFileSync(started.paths.events), eventsBefore);
  assert.deepEqual(readFileSync(joined.paths.response), responseBefore);
});

test('reviewer submit rejects post-join index, branch, and protocol-path drift without mutation', async (t) => {
  const cases = [
    {
      name: 'index',
      mutate(root) {
        writeFileSync(path.join(root, 'outside-staged.txt'), 'reviewer-restaged\n');
        git(root, ['add', 'outside-staged.txt']);
      },
    },
    {
      name: 'branch',
      mutate(root) {
        git(root, ['switch', '-c', 'reviewer-branch']);
      },
    },
    {
      name: 'artifact',
      mutate(root) {
        writeFileSync(path.join(root, 'docs/artifact.md'), '# Reviewer changed artifact\n');
      },
    },
    {
      name: 'HEAD',
      mutate(root) {
        git(root, ['commit', '-m', 'reviewer mutation']);
      },
    },
    {
      name: 'protocol path',
      mutate(_root, joined) {
        writeFileSync(
          path.join(path.dirname(joined.paths.response), 'author-response-1.md'),
          'foreign\n'
        );
      },
    },
  ];
  for (const item of cases) {
    const fx = fixture();
    t.after(fx.cleanup);
    const { reviewer, started, joined } = await prepare(
      fx.root,
      `reviewer-${item.name.replace(' ', '-')}`
    );
    const eventsBefore = readFileSync(started.paths.events);
    const responseBefore = readFileSync(joined.paths.response);
    item.mutate(fx.root, joined);
    await assert.rejects(
      submitReviewTurn({
        cwd: fx.root,
        workspace: started.paths.workspace,
        identity: reviewer,
        decision: 'accepted',
        now: '2026-09-09T02:01:00.000Z',
      }),
      (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION',
      item.name
    );
    assert.deepEqual(readFileSync(started.paths.events), eventsBefore, item.name);
    assert.deepEqual(readFileSync(joined.paths.response), responseBefore, item.name);
  }
});

test('reviewer submit rejects a different physical worktree', async (t) => {
  const fx = fixture();
  const other = fixture();
  t.after(fx.cleanup);
  t.after(other.cleanup);
  const { reviewer, started, joined } = await prepare(fx.root, 'reviewer-other-worktree');
  const eventsBefore = readFileSync(started.paths.events);
  const responseBefore = readFileSync(joined.paths.response);
  await assert.rejects(
    submitReviewTurn({
      cwd: other.root,
      workspace: started.paths.workspace,
      identity: reviewer,
      decision: 'accepted',
      now: '2026-09-09T02:01:00.000Z',
    }),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  assert.deepEqual(readFileSync(started.paths.events), eventsBefore);
  assert.deepEqual(readFileSync(joined.paths.response), responseBefore);
});

test('reviewer submit rejects a push that changes observed remote refs', async (t) => {
  const fx = fixture();
  const remote = mkdtempSync(path.join(tmpdir(), 'apr-reviewer-remote-'));
  t.after(fx.cleanup);
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  git(remote, ['init', '--bare']);
  git(fx.root, ['remote', 'add', 'origin', remote]);
  git(fx.root, ['push', '--set-upstream', 'origin', 'trunk']);
  const { reviewer, started, joined } = await prepare(fx.root, 'reviewer-push');
  const eventsBefore = readFileSync(started.paths.events);
  const responseBefore = readFileSync(joined.paths.response);
  git(fx.root, ['push', 'origin', 'HEAD:refs/heads/reviewer-push']);
  await assert.rejects(
    submitReviewTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: reviewer,
      decision: 'accepted',
      now: '2026-09-09T02:01:00.000Z',
    }),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  assert.deepEqual(readFileSync(started.paths.events), eventsBefore);
  assert.deepEqual(readFileSync(joined.paths.response), responseBefore);
});

test('refreshed reviewer identity does not mutate authority before repository preflight', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { reviewer, started } = await prepare(fx.root, 'reviewer-refresh-preflight');
  const refreshed = identity('reviewer', 'reviewer-refresh-preflight-reviewer', {
    modelId: 'gpt-test-refresh',
    modelDisplay: 'GPT Test Refresh',
  });
  assert.equal(refreshed.session_fingerprint, reviewer.session_fingerprint);
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Reviewer changed artifact\n');
  const eventsBefore = readFileSync(started.paths.events);
  await assert.rejects(
    submitReviewTurn({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: refreshed,
      decision: 'accepted',
      now: '2026-09-09T02:01:00.000Z',
    }),
    (error) => error.code === 'APR_REVIEWER_GIT_VIOLATION'
  );
  assert.deepEqual(readFileSync(started.paths.events), eventsBefore);
});

test('CLI submit resolves the current reviewer and emits one closed result', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { started } = await prepare(fx.root, 'reviewer-cli');
  let stdout = '';
  let stderr = '';
  const exitCode = await run(['submit', started.paths.workspace, '--decision', 'accepted'], {
    cwd: fx.root,
    env: {
      CODEX_SESSION_ID: 'reviewer-cli-reviewer',
      CODEX_MODEL_ID: 'gpt-test',
      CODEX_MODEL_DISPLAY: 'GPT Test',
    },
    now: '2026-09-09T02:01:00.000Z',
    stdout: { write: (value) => (stdout += value) },
    stderr: { write: (value) => (stderr += value) },
  });
  assert.equal(exitCode, 0, stderr);
  assert.match(stdout, /^Review reviewer-cli: acceptance-pending$/m);
  assert.equal(stderr, '');
});
