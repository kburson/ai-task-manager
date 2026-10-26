// @story #2040
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';

const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2039,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
const unedited = () => ({
  id: 'IC_test',
  lastEditedAt: null,
  includesCreatedEdit: false,
  userContentEdits: { totalCount: 0, nodes: [] },
});
// cspell:disable-next-line -- retained opaque provider identifier
const latestId = 'UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuR7UQ';
const edited = () => ({
  id: 'IC_test',
  lastEditedAt: '2026-10-20T01:59:21Z',
  includesCreatedEdit: true,
  userContentEdits: {
    totalCount: 3,
    nodes: [
      {
        id: latestId,
        editedAt: '2026-10-20T01:59:21Z',
        deletedAt: null,
      },
    ],
  },
});
const observe = (node, body = 'A', target = identity) =>
  observeContent({ identity: target, node, body });
const unavailable = (fn) => assert.throws(fn, { code: 'STORY_OBSERVATION_UNAVAILABLE' });

test('complete zero-edit seed yields an explicit unedited comment and exact body digest', () => {
  const result = observe(unedited());
  assert.equal(result.key, 'comment:IC_test');
  assert.equal(result.body, 'A');
  assert.equal(result.digest, '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd');
  assert.deepEqual(result.revision, {
    mode: 'unedited',
    editId: null,
    editedAt: null,
    lastEditedAt: null,
    deletedAt: null,
  });
  assert.deepEqual(result.identity, identity);
  assert.equal(result.ownership, 'read-only');
  assert.equal(result.provenance.source, 'github-current');
  assert.equal(result.provenance.complete, true);
  assert.ok(Number.isFinite(Date.parse(result.provenance.observedAt)));
});

test('issue body uses its own resource key and canonical target identity', () => {
  const result = observe({ ...unedited(), id: identity.issueNodeId }, '', {
    ...identity,
    host: 'GitHub.COM',
    repository: 'Owner/Repo',
  });
  assert.equal(result.key, 'issue:I_test');
  assert.equal(result.kind, 'issue');
  assert.equal(result.identity.host, 'github.com');
  assert.equal(result.identity.repository, 'owner/repo');
  assert.equal(result.digest, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('latest opaque edit survives creation counts and older-history redaction', () => {
  const node = edited();
  node.userContentEdits.pageInfo = { hasNextPage: true, endCursor: 'older-history' };
  const result = observe(node, 'Current C');
  assert.deepEqual(result.revision, {
    mode: 'edited',
    editId: latestId,
    editedAt: node.lastEditedAt,
    lastEditedAt: node.lastEditedAt,
    deletedAt: null,
  });
  assert.equal(result.kind, 'comment');
  assert.equal(result.body, 'Current C');
  node.userContentEdits.totalCount = 99;
  assert.deepEqual(observe(node, 'Current C').revision, result.revision);
});

test('body bytes remain independent of an unchanged native edit identity', () => {
  const a = observe(edited(), 'é\n');
  const b = observe(edited(), 'é\n');
  const c = observe(edited(), 'é');
  assert.deepEqual(a.revision, b.revision);
  assert.notEqual(a.digest, b.digest);
  assert.notEqual(a.digest, c.digest);
  assert.equal(a.body, 'é\n');
});

for (const [name, change] of [
  [
    'missing connection',
    (n) => {
      delete n.userContentEdits;
    },
  ],
  [
    'null connection',
    (n) => {
      n.userContentEdits = null;
    },
  ],
  [
    'missing count',
    (n) => {
      delete n.userContentEdits.totalCount;
    },
  ],
  [
    'negative count',
    (n) => {
      n.userContentEdits.totalCount = -1;
    },
  ],
  [
    'fractional count',
    (n) => {
      n.userContentEdits.totalCount = 0.5;
    },
  ],
  [
    'missing nodes',
    (n) => {
      delete n.userContentEdits.nodes;
    },
  ],
  [
    'null nodes',
    (n) => {
      n.userContentEdits.nodes = null;
    },
  ],
  [
    'missing last-edited metadata',
    (n) => {
      delete n.lastEditedAt;
    },
  ],
  [
    'missing creation metadata',
    (n) => {
      delete n.includesCreatedEdit;
    },
  ],
  [
    'creation with zero history',
    (n) => {
      n.includesCreatedEdit = true;
    },
  ],
  [
    'edited timestamp with empty history',
    (n) => {
      n.lastEditedAt = '2026-10-20T01:59:21Z';
    },
  ],
  [
    'positive count with no latest node',
    (n) => {
      n.userContentEdits.totalCount = 2;
    },
  ],
]) {
  test(`incomplete unedited history refuses: ${name}`, () => {
    const node = unedited();
    change(node);
    unavailable(() => observe(node));
  });
}

for (const [name, change] of [
  [
    'missing latest id',
    (n) => {
      delete n.userContentEdits.nodes[0].id;
    },
  ],
  [
    'empty latest id',
    (n) => {
      n.userContentEdits.nodes[0].id = '';
    },
  ],
  [
    'missing edited timestamp',
    (n) => {
      delete n.userContentEdits.nodes[0].editedAt;
    },
  ],
  [
    'invalid edited timestamp',
    (n) => {
      n.userContentEdits.nodes[0].editedAt = 'not-a-date';
    },
  ],
  [
    'inconsistent latest timestamp',
    (n) => {
      n.lastEditedAt = '2026-10-20T01:58:55Z';
    },
  ],
  [
    'null last-edited timestamp',
    (n) => {
      n.lastEditedAt = null;
    },
  ],
  [
    'missing deletion metadata',
    (n) => {
      delete n.userContentEdits.nodes[0].deletedAt;
    },
  ],
  [
    'latest tombstone',
    (n) => {
      n.userContentEdits.nodes[0].deletedAt = '2026-10-20T02:08:31Z';
    },
  ],
  [
    'null latest node',
    (n) => {
      n.userContentEdits.nodes = [null];
    },
  ],
  [
    'ambiguous latest ordering',
    (n) => {
      n.userContentEdits.nodes.push({ id: 'older-B' });
    },
  ],
]) {
  test(`unsupported latest edit refuses without fallback: ${name}`, () => {
    const node = edited();
    change(node);
    unavailable(() => observe(node));
  });
}

for (const [name, target] of [
  ['missing identity', null],
  ['wrong host shape', { ...identity, host: 'https://github.com' }],
  ['wrong repository shape', { ...identity, repository: '../owner/repo' }],
  ['missing project item', { ...identity, projectItemId: undefined }],
  ['invalid issue number', { ...identity, issueNumber: 0 }],
]) {
  test(`unverifiable target identity refuses: ${name}`, () =>
    unavailable(() => observe(unedited(), 'A', target)));
}

test('missing node, missing content and mismatched resource kinds refuse', () => {
  unavailable(() => observe(null));
  unavailable(() => observe(unedited(), null));
  unavailable(() => observe({ ...unedited(), id: '' }));
  unavailable(() => observe({ ...unedited(), __typename: 'Issue' }));
  unavailable(() => observe({ ...unedited(), __typename: 'Discussion' }));
  unavailable(() => observe({ ...unedited(), body: 'different' }, 'A'));
});

test('returned baseline cannot be rewritten by mutating caller input', () => {
  const target = { ...identity };
  const node = edited();
  const result = observe(node, 'A', target);
  target.repository = 'other/repo';
  node.userContentEdits.nodes[0].id = 'different';
  assert.equal(result.identity.repository, 'owner/repo');
  assert.equal(result.revision.editId, latestId);
});

for (const [name, pageInfo] of [
  ['contradictory continuation', { hasNextPage: true }],
  ['unreadable page metadata', null],
  ['missing continuation metadata', {}],
]) {
  test(`explicit partial empty history refuses: ${name}`, () => {
    const node = unedited();
    node.userContentEdits.pageInfo = pageInfo;
    unavailable(() => observe(node));
  });
}

for (const [count, hasNextPage] of [
  [1, true],
  [3, false],
]) {
  test(`edited history refuses contradictory continuation: count=${count}, next=${hasNextPage}`, () => {
    const node = edited();
    node.userContentEdits.totalCount = count;
    node.userContentEdits.pageInfo = { hasNextPage };
    unavailable(() => observe(node));
  });
}
