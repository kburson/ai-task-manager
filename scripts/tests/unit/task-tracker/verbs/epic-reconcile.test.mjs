// @story #1182
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasDeliverableMarker,
  hasEpicAcReconciledMarker,
  setDeliverablePosted,
} from '../../../../task-tracker/lib/issue-kind.mjs';
import {
  parseEpicReconcileArgs,
  validateEpicDeliverableComment,
  verbEpicReconcile,
} from '../../../../task-tracker/verbs/epic-reconcile.mjs';

const EPIC = [
  '## AITM Progress Markers',
  '',
  '<!-- aitm-issue-kind kind="epic" -->',
  '',
  '## Acceptance Criteria',
  '',
  '- [x] delivered',
  '',
].join('\n');

const URL = 'https://github.com/kburson/ai-task-manager/issues/1067#issuecomment-5227079541';

test('setDeliverablePosted inserts one URL-bearing marker and retries byte-identically', () => {
  const once = setDeliverablePosted(EPIC, {
    url: URL,
    ts: '2026-08-08T17:00:00.000Z',
  });
  const twice = setDeliverablePosted(once, {
    url: URL,
    ts: '2026-08-08T18:00:00.000Z',
  });

  assert.equal(hasDeliverableMarker(once), true);
  assert.equal(twice, once);
  assert.equal((once.match(/aitm-deliverable-posted/g) ?? []).length, 1);
  assert.match(
    once,
    /url="https:\/\/github\.com\/kburson\/ai-task-manager\/issues\/1067#issuecomment-5227079541"/
  );
});

test('setDeliverablePosted refuses to replace a different or provenance-free marker', () => {
  const existing = setDeliverablePosted(EPIC, {
    url: URL,
    ts: '2026-08-08T17:00:00.000Z',
  });
  assert.throws(
    () =>
      setDeliverablePosted(existing, {
        url: 'https://github.com/kburson/ai-task-manager/issues/1067#issuecomment-1',
      }),
    /deliverable-marker-conflict/
  );
  const provenanceFree = EPIC.replace(
    '<!-- aitm-issue-kind kind="epic" -->',
    '<!-- aitm-issue-kind kind="epic" -->\n<!-- aitm-deliverable-posted -->'
  );
  assert.throws(
    () => setDeliverablePosted(provenanceFree, { url: URL }),
    /deliverable-marker-conflict/
  );
});

test('validateEpicDeliverableComment accepts only a non-empty comment on the target issue', () => {
  assert.deepEqual(
    validateEpicDeliverableComment({
      repository: 'kburson/ai-task-manager',
      issueNumber: 1067,
      commentId: '5227079541',
      comment: { body: '## Epic delivery\n\nAll children are Done.', html_url: URL },
    }),
    { body: '## Epic delivery\n\nAll children are Done.', url: URL }
  );

  for (const [category, comment] of [
    ['empty', { body: '  ', html_url: URL }],
    [
      'repository',
      {
        body: 'delivery',
        html_url: 'https://github.com/other/repo/issues/1067#issuecomment-5227079541',
      },
    ],
    [
      'issue',
      {
        body: 'delivery',
        html_url: 'https://github.com/kburson/ai-task-manager/issues/1#issuecomment-5227079541',
      },
    ],
    ['url', { body: 'delivery', html_url: 'https://example.com/comment/1' }],
    [
      'id',
      {
        body: 'delivery',
        html_url: 'https://github.com/kburson/ai-task-manager/issues/1067#issuecomment-1',
      },
    ],
  ]) {
    assert.throws(
      () =>
        validateEpicDeliverableComment({
          repository: 'kburson/ai-task-manager',
          issueNumber: 1067,
          commentId: '5227079541',
          comment,
        }),
      new RegExp(`epic-deliverable-comment:${category}`)
    );
  }
});

test('parseEpicReconcileArgs supports explicit and active targets and rejects malformed flags', () => {
  assert.deepEqual(parseEpicReconcileArgs(['1067', '--deliverable-comment', URL]), {
    target: '1067',
    deliverableComment: URL,
  });
  assert.deepEqual(parseEpicReconcileArgs(['--deliverable-comment=123'], { active: '#1067' }), {
    target: '1067',
    deliverableComment: '123',
  });
  assert.throws(() => parseEpicReconcileArgs(['1067', '--unknown']), /epic-reconcile:unknown/);
  assert.throws(
    () => parseEpicReconcileArgs(['1067', '--deliverable-comment']),
    /epic-reconcile:deliverable-comment/
  );
});

test('verbEpicReconcile validates the comment before one combined versioned mutation', async () => {
  let nextBody = EPIC;
  let mutationCalls = 0;
  let fetchCalls = 0;
  await verbEpicReconcile({
    cfg: { repo: 'kburson/ai-task-manager' },
    rest: ['1067', '--deliverable-comment', '5227079541'],
    pexec: async () => ({ stdout: '' }),
    deps: {
      fetchDeliverableComment: async ({ repository, commentId }) => {
        fetchCalls += 1;
        assert.equal(repository, 'kburson/ai-task-manager');
        assert.equal(commentId, '5227079541');
        return { body: '## Epic delivery', html_url: URL };
      },
      mutateIssueBody: async ({ mutate }) => {
        mutationCalls += 1;
        nextBody = mutate(nextBody);
        return { status: 'updated' };
      },
      fetchEpicChildren: async () => [],
      now: () => '2026-08-08T17:00:00.000Z',
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(mutationCalls, 1);
  assert.equal(hasDeliverableMarker(nextBody), true);
  assert.equal(hasEpicAcReconciledMarker(nextBody), true);
});

test('foreign deliverable fails before body mutation', async () => {
  let mutationCalls = 0;
  await assert.rejects(
    verbEpicReconcile({
      cfg: { repo: 'kburson/ai-task-manager' },
      rest: ['1067', '--deliverable-comment=5227079541'],
      deps: {
        fetchDeliverableComment: async () => ({
          body: 'delivery',
          html_url: 'https://github.com/other/repo/issues/1067#issuecomment-5227079541',
        }),
        mutateIssueBody: async () => {
          mutationCalls += 1;
        },
      },
    }),
    /epic-deliverable-comment:repository/
  );
  assert.equal(mutationCalls, 0);
});

test('production comment fetch reads the exact REST comment endpoint', async () => {
  let nextBody = EPIC;
  const calls = [];
  await verbEpicReconcile({
    cfg: { repo: 'kburson/ai-task-manager' },
    rest: ['1067', '--deliverable-comment=5227079541'],
    pexec: async (command, args) => {
      calls.push({ command, args });
      return { stdout: JSON.stringify({ body: 'delivery', html_url: URL }) };
    },
    deps: {
      mutateIssueBody: async ({ mutate }) => {
        nextBody = mutate(nextBody);
        return { status: 'updated' };
      },
      fetchEpicChildren: async () => [],
      now: () => '2026-08-08T17:00:00.000Z',
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'gh');
  assert.deepEqual(calls[0].args.slice(0, 2), [
    'api',
    'repos/kburson/ai-task-manager/issues/comments/5227079541',
  ]);
  assert.equal(hasDeliverableMarker(nextBody), true);
});

test('no deliverable flag preserves reconciliation-only compatibility', async () => {
  let nextBody = EPIC;
  await verbEpicReconcile({
    cfg: { repo: 'kburson/ai-task-manager' },
    rest: ['1067'],
    pexec: async () => ({ stdout: '' }),
    deps: {
      fetchDeliverableComment: async () => assert.fail('must not fetch without the flag'),
      mutateIssueBody: async ({ mutate }) => {
        nextBody = mutate(nextBody);
        return { status: 'updated' };
      },
      fetchEpicChildren: async () => [],
      now: () => '2026-08-08T17:00:00.000Z',
    },
  });
  assert.equal(hasEpicAcReconciledMarker(nextBody), true);
  assert.equal(hasDeliverableMarker(nextBody), false);
});
