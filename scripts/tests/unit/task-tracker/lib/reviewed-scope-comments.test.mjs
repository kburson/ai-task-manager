// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRecord,
  requestDigest,
  lineageDigest,
  encodeRecord,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';
import {
  readCurrentRecord,
  ensureRecordComment,
} from '../../../../task-tracker/lib/reviewed-scope/comments.mjs';
function fixture() {
  const manifest = {
    schema: 'aitm.reviewed-scope-evidence/v1',
    repository: 'owner/repo',
    issue: 1859,
    worktree: '/bound',
    branch: 'codex/1859',
    head: 'a'.repeat(40),
    label: 'Inspect output',
    provenance: { kind: 'operator-inspection' },
    rationale: 'Inspected attached bytes.',
    artifacts: [{ path: 'evidence.txt', sha256: 'b'.repeat(64) }],
  };
  const targetDigest = 'c'.repeat(64);
  const record = makeRecord({
    manifest,
    targetDigest,
    requestDigest: requestDigest({ manifest, targetDigest }),
    lineage: lineageDigest({
      repository: manifest.repository,
      issue: manifest.issue,
      targetDigest,
    }),
    predecessor: null,
    actor: { id: '42', login: 'owner' },
    recordedAt: '2026-10-01T12:00:00.000Z',
  });
  const encoded = encodeRecord(record);
  const pointer = { commentId: '99', sha256: encoded.sha256, lineage: record.lineage };
  const comments = new Map();
  let creates = 0;
  let lists = 0;
  const comment = {
    id: '99',
    body: encoded.commentBody,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/1859',
    user: { id: '42', login: 'renamed' },
  };
  const deps = {
    readComment: async ({ commentId }) => {
      if (!comments.has(commentId)) throw Object.assign(new Error('deleted'), { status: 404 });
      return comments.get(commentId);
    },
    listComments: async () => {
      lists++;
      return [...comments.values()];
    },
    createComment: async ({ body }) => {
      creates++;
      assert.equal(body, encoded.commentBody);
      comments.set('99', { ...comment, body });
      return comments.get('99');
    },
  };
  return {
    repository: 'owner/repo',
    issue: 1859,
    record,
    expectedPredecessor: null,
    pointer,
    comment,
    comments,
    deps,
    writes: () => creates,
    scans: () => lists,
  };
}
test('current record requires exact pointer, same issue and stable author ID', async () => {
  const f = fixture();
  f.comments.set('99', f.comment);
  assert.deepEqual(await readCurrentRecord(f), f.record);
});
for (const [name, change, code] of [
  [
    'wrong issue',
    (f) => {
      f.comment.issue_url = 'https://api.github.com/repos/owner/repo/issues/1';
    },
    'reviewed-scope-comment-issue',
  ],
  [
    'wrong author',
    (f) => {
      f.comment.user.id = '43';
    },
    'reviewed-scope-comment-author',
  ],
  [
    'edited comment',
    (f) => {
      f.comment.body += '\n';
    },
    'reviewed-scope-comment-invalid',
  ],
  [
    'wrong digest',
    (f) => {
      f.pointer.sha256 = 'd'.repeat(64);
    },
    'reviewed-scope-comment-digest',
  ],
  [
    'wrong lineage',
    (f) => {
      f.pointer.lineage = 'd'.repeat(64);
    },
    'reviewed-scope-comment-lineage',
  ],
])
  test(`current record refuses ${name}`, async () => {
    const f = fixture();
    change(f);
    f.comments.set('99', f.comment);
    await assert.rejects(() => readCurrentRecord(f), { code });
    assert.equal(f.writes(), 0);
  });
test('empty complete scan creates one immutable comment with exact readback', async () => {
  const f = fixture();
  assert.deepEqual(await ensureRecordComment(f), { ...f.pointer, reused: false });
  assert.equal(f.writes(), 1);
});
test('matching current record is reused before orphan scan', async () => {
  const f = fixture();
  f.comments.set('99', f.comment);
  f.deps.currentPointer = f.pointer;
  assert.deepEqual(await ensureRecordComment(f), { ...f.pointer, reused: true });
  assert.equal(f.scans(), 0);
  assert.equal(f.writes(), 0);
});
test('timeout after persistence has descriptor and retry reuses orphan', async () => {
  const f = fixture();
  const create = f.deps.createComment;
  f.deps.createComment = async (args) => {
    await create(args);
    throw new Error('timeout');
  };
  await assert.rejects(
    () => ensureRecordComment(f),
    (error) =>
      error.code === 'reviewed-scope-comment-uncertain' &&
      error.descriptor.requestDigest === f.record.requestDigest
  );
  assert.deepEqual(await ensureRecordComment(f), { ...f.pointer, reused: true });
  assert.equal(f.writes(), 1);
});
test('duplicate matching orphans refuse without writes', async () => {
  const f = fixture();
  f.comments.set('99', f.comment);
  f.comments.set('100', { ...f.comment, id: '100' });
  await assert.rejects(() => ensureRecordComment(f), { code: 'reviewed-scope-comment-uncertain' });
  assert.equal(f.writes(), 0);
});
test('rate errors and full pagination exhaustion never authorize creation', async () => {
  for (const mode of ['rate', 'exhaustion', 'repeated-id']) {
    const f = fixture();
    f.deps.listComments = async ({ page }) => {
      if (mode === 'rate') throw new Error('rate limited');
      return Array.from({ length: 100 }, (_, index) => ({
        ...f.comment,
        id: String(mode === 'repeated-id' ? index + 1 : (page - 1) * 100 + index + 1),
        body: 'ordinary comment',
      }));
    };
    await assert.rejects(() => ensureRecordComment(f), {
      code: 'reviewed-scope-comment-uncertain',
    });
    assert.equal(f.writes(), 0);
  }
});
test('matching orphan is read again and edited readback refuses', async () => {
  const f = fixture();
  f.comments.set('99', f.comment);
  f.deps.readComment = async () => ({ ...f.comment, body: 'edited' });
  await assert.rejects(() => ensureRecordComment(f), { code: 'reviewed-scope-comment-uncertain' });
  assert.equal(f.writes(), 0);
});
test('REST transport uses argument arrays, JSON stdin, issue membership and exact readback', async () => {
  const f = fixture();
  let persisted;
  let reads = 0;
  const deps = {
    pexec: (file, args, opts) => {
      assert.equal(file, 'gh');
      assert.equal(args[0], 'api');
      if (args.includes('POST')) {
        assert.equal(args[1], 'repos/owner/repo/issues/1859/comments');
        assert.equal(JSON.parse(opts.input).body, f.comment.body);
        const pending = Promise.resolve({ stdout: JSON.stringify(f.comment) });
        pending.child = {
          stdin: {
            end: (input) => {
              persisted = JSON.parse(input).body;
            },
          },
        };
        return pending;
      }
      if (args[1].includes('issues/comments/99')) {
        reads++;
        assert.equal(persisted, f.comment.body);
        return Promise.resolve({ stdout: JSON.stringify(f.comment) });
      }
      assert.equal(args[1], 'repos/owner/repo/issues/1859/comments?per_page=100&page=1');
      return Promise.resolve({ stdout: '[]' });
    },
  };
  assert.deepEqual(await ensureRecordComment({ ...f, deps }), { ...f.pointer, reused: false });
  assert.equal(reads, 1);
});
test('superseding a deleted current payload preserves its predecessor and lineage', async () => {
  const f = fixture();
  const predecessor = { commentId: '88', sha256: 'e'.repeat(64) };
  f.record = makeRecord({ ...f.record, predecessor });
  f.comment.body = encodeRecord(f.record).commentBody;
  f.pointer.sha256 = encodeRecord(f.record).sha256;
  f.expectedPredecessor = predecessor;
  f.deps.currentPointer = { ...predecessor, lineage: f.record.lineage };
  f.deps.createComment = async ({ body }) => {
    f.comments.set('99', { ...f.comment, body });
    return f.comments.get('99');
  };
  assert.deepEqual(await ensureRecordComment(f), { ...f.pointer, reused: false });
});
test('orphan with a different history or actor is not reused', async () => {
  for (const change of ['actor', 'lineage', 'predecessor']) {
    const f = fixture();
    const old = makeRecord({
      ...f.record,
      ...(change === 'actor'
        ? { actor: { id: '43', login: 'other' } }
        : change === 'lineage'
          ? { lineage: 'd'.repeat(64) }
          : { predecessor: { commentId: '88', sha256: 'e'.repeat(64) } }),
    });
    f.comments.set('88', {
      ...f.comment,
      id: '88',
      body: encodeRecord(old).commentBody,
      user: { id: old.actor.id },
    });
    const result = await ensureRecordComment(f);
    assert.equal(result.reused, false);
    assert.equal(f.writes(), 1);
  }
});
test('current read rate failure is uncertain and cannot create a replacement', async () => {
  const f = fixture();
  f.deps.currentPointer = f.pointer;
  f.deps.readComment = async () => {
    throw Object.assign(new Error('rate limited'), { status: 403 });
  };
  await assert.rejects(() => ensureRecordComment(f), { code: 'reviewed-scope-comment-uncertain' });
  assert.equal(f.writes(), 0);
});
test('tampered unrelated historical comments remain audit data during fresh recording', async () => {
  const f = fixture();
  f.comments.set('88', {
    ...f.comment,
    id: '88',
    body: '<!-- aitm-reviewed-scope-record:v1 tampered -->',
  });
  assert.deepEqual(await ensureRecordComment(f), { ...f.pointer, reused: false });
  assert.equal(f.writes(), 1);
});
test('matching orphan with wrong-issue membership is refused without creation', async () => {
  const f = fixture();
  f.comments.set('99', {
    ...f.comment,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
  });
  await assert.rejects(() => ensureRecordComment(f), { code: 'reviewed-scope-comment-uncertain' });
  assert.equal(f.writes(), 0);
});
