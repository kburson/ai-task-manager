// @story #2039 #2057
// Native boundary algorithms, with external mutation adapters confined to fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, transfer, context } from '../../../../helpers/story-handoff-runtime-fixture.mjs';
import { releaseIssueBindings } from '../../../../../task-tracker/lib/worktree-binding-lifecycle.mjs';
import { enforceIssueWorktreeLocation } from '../../../../../task-tracker/lib/worktree-relocation-guard.mjs';
import {
  recordIssueWorktreeLocationOnChange,
  mostRecentIssueWorktreeLocation,
} from '../../../../../task-tracker/lib/issue-worktree-location.mjs';
const release = (f, root, sid, onMark) =>
  context(sid, root, () =>
    releaseIssueBindings({
      projectDir: root,
      issue: 2057,
      sessionId: sid,
      deps: {
        resolveMain: () => f.root,
        collectCandidates: () => [root],
        markClosedBinding: () => {
          onMark();
          return { schema: 1, sessions: {} };
        },
        compareAndClearActiveTask: () => ({ status: 'unchanged' }),
      },
    })
  );
function relocating(f, onWrite) {
  let body = recordIssueWorktreeLocationOnChange('## Fixture issue\n', {
    worktreePath: f.root,
    worktreeBranch: 'fixture-source',
    sessionId: 'author-A',
    ts: '2026-10-21T00:00:00Z',
  }).body;
  return {
    run: () =>
      context('author-B', f.recipient, () =>
        enforceIssueWorktreeLocation({
          verb: 'start',
          rest: ['2057'],
          cfg: { repo: 'owner/repo' },
          invokingDir: f.recipient,
          confirmRelocation: true,
          deps: {
            env: {},
            sessionId: () => 'author-B',
            resolveIdentity: () => ({
              worktreePath: f.recipient,
              worktreeBranch: 'fixture-target',
            }),
            fetchIssueBody: async () => body,
            mutateIssueBody: async ({ mutate }) => {
              body = mutate(body);
              onWrite();
            },
          },
        })
      ),
    body: () => body,
  };
}
test('dirty writer data refuses binding release before the terminal ledger is written', async (t) => {
  const f = await fixture(t);
  let marked = 0;
  await assert.rejects(release(f, f.root, 'author-A', () => marked++));
  assert.equal(marked, 0);
});
test('a verified clean cache keeps the ordinary binding release behavior', async (t) => {
  const f = await fixture(t, { clean: true });
  let marked = 0;
  await release(f, f.root, 'author-A', () => marked++);
  assert.equal(marked, 1);
});
test('confirmed relocation still refuses an untransferred dirty cache before any issue write', async (t) => {
  const f = await fixture(t);
  let writes = 0;
  const move = relocating(f, () => writes++);
  await assert.rejects(move.run());
  assert.equal(writes, 0);
  assert.equal(mostRecentIssueWorktreeLocation(move.body()).worktreePath, f.root);
});
test('verified handoff settles the old binding while protecting the new owner pending data', async (t) => {
  const f = await fixture(t);
  await transfer(f);
  let oldMarked = 0,
    newMarked = 0,
    writes = 0;
  await release(f, f.root, 'author-A', () => oldMarked++);
  assert.equal(oldMarked, 1);
  await assert.rejects(release(f, f.recipient, 'author-B', () => newMarked++));
  assert.equal(newMarked, 0);
  const move = relocating(f, () => writes++);
  await move.run();
  assert.equal(writes, 1);
  assert.equal(mostRecentIssueWorktreeLocation(move.body()).worktreePath, f.recipient);
});

for (const damage of [
  'missing-claim',
  'missing-registry-identity',
  'missing-current-generation',
  'opaque-journal',
  'unknown-write-lock',
])
  test(`${damage} preserves the binding and all retained cache evidence`, async (t) => {
    const f = await fixture(t, { clean: true });
    let marked = 0;
    if (damage === 'missing-claim')
      fs.unlinkSync(path.join(f.registry.path, f.claim.registryKey + '.json'));
    if (damage === 'missing-registry-identity') fs.unlinkSync(f.registry.identityPath);
    if (damage === 'missing-current-generation')
      fs.unlinkSync(path.join(f.claim.cachePath, 'manifest.json'));
    if (damage === 'opaque-journal')
      fs.writeFileSync(path.join(f.claim.cachePath, 'journal.json'), 'unknown result', {
        mode: 0o600,
      });
    if (damage === 'unknown-write-lock')
      fs.writeFileSync(path.join(f.claim.cachePath, 'write.lock'), 'unknown live writer', {
        mode: 0o600,
      });
    await assert.rejects(release(f, f.root, 'author-A', () => marked++));
    assert.equal(marked, 0);
    assert.equal(fs.existsSync(f.claim.cachePath), true);
  });
test('a fresh relocation mutation rechecks a newly observed dirty source before writing', async (t) => {
  const f = await fixture(t);
  let writes = 0;
  const clean = recordIssueWorktreeLocationOnChange('fixture', {
    worktreePath: f.recipient,
    worktreeBranch: 'first',
    sessionId: 'other',
    ts: '2026-10-21T00:00:00Z',
  }).body;
  const dirty = recordIssueWorktreeLocationOnChange('fixture', {
    worktreePath: f.root,
    worktreeBranch: 'dirty',
    sessionId: 'author-A',
    ts: '2026-10-21T00:00:00Z',
  }).body;
  await assert.rejects(
    context('author-B', f.recipient, () =>
      enforceIssueWorktreeLocation({
        verb: 'start',
        rest: ['2057'],
        cfg: { repo: 'owner/repo' },
        invokingDir: f.recipient,
        confirmRelocation: true,
        deps: {
          env: {},
          resolveIdentity: () => ({ worktreePath: f.recipient, worktreeBranch: 'new' }),
          fetchIssueBody: async () => clean,
          mutateIssueBody: async ({ mutate }) => {
            mutate(dirty);
            writes++;
          },
        },
      })
    )
  );
  assert.equal(writes, 0);
});
for (const damage of ['missing-git-metadata', 'missing-config-and-cache'])
  test(`${damage} cannot turn retained writer authority into a legacy release`, async (t) => {
    const f = await fixture(t);
    let marked = 0;
    if (damage === 'missing-git-metadata')
      fs.renameSync(path.join(f.root, '.git'), path.join(f.root, 'preserved-git'));
    else {
      fs.unlinkSync(path.join(f.root, '.ai-task-manager', 'task-tracker.json'));
      fs.renameSync(path.join(f.root, '.tmp'), path.join(f.root, 'preserved-cache'));
    }
    await assert.rejects(release(f, f.root, 'author-A', () => marked++));
    assert.equal(marked, 0);
  });

test('a completed handoff cannot settle later unexplained source evidence', async (t) => {
  const f = await fixture(t);
  await transfer(f);
  let marked = 0;
  fs.writeFileSync(
    path.join(f.claim.cachePath, 'later-journal.json'),
    'unacknowledged late result',
    { mode: 0o600 }
  );
  await assert.rejects(release(f, f.root, 'author-A', () => marked++));
  assert.equal(marked, 0);
  assert.equal(
    fs.readFileSync(path.join(f.claim.cachePath, 'later-journal.json'), 'utf8'),
    'unacknowledged late result'
  );
});

test('unrelated linked worktree without this session binding does not block clean owner release', async (t) => {
  const f = await fixture(t, { clean: true });
  let marked = 0;
  await context('author-A', f.root, () =>
    releaseIssueBindings({
      projectDir: f.root,
      issue: 2057,
      sessionId: 'author-A',
      deps: {
        resolveMain: () => f.root,
        collectCandidates: () => [f.root, f.recipient],
        markClosedBinding: () => {
          marked++;
          return { schema: 1, sessions: {} };
        },
        compareAndClearActiveTask: () => ({ status: 'unchanged' }),
      },
    })
  );
  assert.equal(marked, 1);
});
