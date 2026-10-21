// @story #2052
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createStoryFixture } from '../../../../helpers/story-cache-fixtures.mjs';
import {
  readStorySnapshot,
  createStoryReadBudget,
} from '../../../../../task-tracker/lib/story-cache/snapshot-reader.mjs';
const read = (f, budget = createStoryReadBudget()) =>
  readStorySnapshot({ identity: f.identity, transport: f.transport, budget });
const refuses = (promise) => assert.rejects(promise, { code: 'STORY_SNAPSHOT_UNAVAILABLE' });

test('complete current census retains foreign comments, exact hashes and canonical assignment', async () => {
  const f = createStoryFixture({
    comments: [
      { id: 'IC_B', body: 'é\n' },
      { id: 'IC_A', body: '' },
    ],
    assignees: ['zoe', 'alice'],
  });
  const s = await read(f);
  assert.equal(s.complete, true);
  assert.equal(s.title, 'Current story');
  assert.deepEqual(s.inventory, ['IC_A', 'IC_B']);
  assert.deepEqual(s.assignees, ['alice', 'zoe']);
  assert.equal(
    s.resources['issue:I_test'].digest,
    '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd'
  );
  assert.equal(
    s.resources['comment:IC_B'].digest,
    createHash('sha256').update('é\n').digest('hex')
  );
  assert.equal(s.resources['comment:IC_B'].ownership, 'read-only');
  assert.equal(s.resources['comment:IC_B'].source.author.login, 'foreign');
  assert.equal(s.coverage.dispatches, 1);
  assert.ok(Object.isFrozen(s.resources));
  assert.equal(f.dispatches.length, 1);
  assert.equal(f.dispatches[0].variables.issue, 'I_test');
  assert.equal(f.dispatches[0].variables.item, 'PI_test');
  assert.doesNotMatch(f.dispatches[0].document, /historyDiff|subIssues|issues\(/);
});

for (const [name, change] of [
  [
    'wrong host',
    (f) => {
      f.identity.host = 'example.com';
    },
  ],
  [
    'wrong repository',
    (f) => {
      f.data.issue.repository.nameWithOwner = 'other/repo';
    },
  ],
  [
    'wrong item',
    (f) => {
      f.data.item.id = 'PI_other';
    },
  ],
  [
    'wrong project',
    (f) => {
      f.data.item.project.id = 'P_other';
    },
  ],
  [
    'wrong membership',
    (f) => {
      f.data.item.content.id = 'I_other';
    },
  ],
  [
    'archived item',
    (f) => {
      f.data.item.isArchived = true;
    },
  ],
  [
    'missing current history',
    (f) => {
      delete f.data.issue.userContentEdits;
    },
  ],
  [
    'missing connection',
    (f) => {
      delete f.data.issue.comments;
    },
  ],
  [
    'missing pagination',
    (f) => {
      delete f.data.issue.comments.pageInfo;
    },
  ],
  [
    'unreadable comment',
    (f) => {
      f.data.issue.comments = f.connection([null]);
    },
  ],
  [
    'wrong comment parent',
    (f) => {
      f.data.issue.comments = f.connection([f.content({ issue: { id: 'I_other' } }, 0)]);
    },
  ],
  [
    'duplicate comments',
    (f) => {
      f.data.issue.comments = f.connection([f.content({}, 0), f.content({}, 0)]);
    },
  ],
  [
    'duplicate assignees',
    (f) => {
      f.data.issue.assignees = f.connection([
        { id: 'U_A', login: 'a' },
        { id: 'U_A', login: 'a' },
      ]);
    },
  ],
  [
    'truncated inventory',
    (f) => {
      f.data.issue.comments.totalCount = 1;
    },
  ],
  [
    'missing next cursor',
    (f) => {
      f.data.issue.comments.pageInfo.hasNextPage = true;
      f.data.issue.comments.totalCount = 2;
    },
  ],
])
  test(`whole snapshot refuses ${name}`, async () => {
    const f = createStoryFixture();
    change(f);
    await refuses(read(f));
  });

test('GraphQL partial errors never become an empty complete snapshot', async () => {
  const f = createStoryFixture();
  f.transport.query = async () =>
    JSON.stringify({ data: f.data, errors: [{ message: 'forbidden' }] });
  await refuses(read(f));
});

test('sequential continuation requests only the pending connection and observes all comments', async () => {
  const f = createStoryFixture();
  let active = 0;
  f.transport.query = async (request) => {
    assert.equal(active++, 0);
    f.dispatches.push(request);
    await Promise.resolve();
    active--;
    const data = structuredClone(f.data);
    if (!request.variables.commentsAfter) {
      data.issue.comments = {
        totalCount: 2,
        nodes: [f.content({ id: 'IC_A' }, 0)],
        pageInfo: { hasNextPage: true, endCursor: 'page-a' },
      };
    } else {
      assert.equal(request.variables.commentsAfter, 'page-a');
      assert.equal(request.variables.readAssignees, false);
      assert.equal(request.variables.readFields, false);
      data.issue.comments = {
        totalCount: 2,
        nodes: [f.content({ id: 'IC_B' }, 1)],
        pageInfo: { hasNextPage: false, endCursor: 'page-b' },
      };
    }
    return JSON.stringify({ data });
  };
  const s = await read(f);
  assert.deepEqual(s.inventory, ['IC_A', 'IC_B']);
  assert.equal(s.coverage.dispatches, 2);
});

for (const [name, change] of [
  [
    'title changed',
    (d) => {
      d.issue.title = 'Changed';
    },
  ],
  [
    'body changed without edit ID',
    (d) => {
      d.issue.body = 'B';
    },
  ],
  [
    'inventory count drift',
    (d) => {
      d.issue.comments.totalCount = 3;
    },
  ],
  [
    'duplicate across pages',
    (d) => {
      d.issue.comments.nodes[0].id = 'IC_A';
    },
  ],
  [
    'cursor loop',
    (d) => {
      d.issue.comments.pageInfo = { hasNextPage: true, endCursor: 'page-a' };
    },
  ],
])
  test(`pagination refuses ${name}`, async () => {
    const f = createStoryFixture();
    let n = 0;
    f.transport.query = async () => {
      const data = structuredClone(f.data);
      n++;
      data.issue.comments = {
        totalCount: 2,
        nodes: [f.content({ id: n === 1 ? 'IC_A' : 'IC_B' }, n)],
        pageInfo: { hasNextPage: n === 1, endCursor: n === 1 ? 'page-a' : 'page-b' },
      };
      if (n > 1) change(data);
      return JSON.stringify({ data });
    };
    await refuses(read(f));
  });

test('shared budget refuses dispatch eleven across repeated complete reads', async () => {
  const f = createStoryFixture();
  const budget = createStoryReadBudget();
  const first = await read(f, budget);
  for (let n = 1; n < 10; n++) await read(f, budget);
  await refuses(read(f, budget));
  assert.equal(f.dispatches.length, 10);
  assert.equal(first.coverage.dispatches, 1);
});

test('raw UTF-8 response bytes include whitespace and accumulate across reads', async () => {
  const f = createStoryFixture({ comments: [{ body: 'é' }] });
  const raw = JSON.stringify({ data: f.data }) + ' '.repeat(50);
  const bytes = Buffer.byteLength(raw, 'utf8');
  f.transport.query = async () => {
    f.dispatches.push({});
    return raw;
  };
  const budget = createStoryReadBudget({ maxBytes: bytes * 2 - 1 });
  const first = await read(f, budget);
  assert.equal(first.coverage.bytes, bytes);
  await refuses(read(f, budget));
  assert.equal(f.dispatches.length, 2);
});

test('missing and forged budgets cannot start another census', async () => {
  const f = createStoryFixture();
  await refuses(readStorySnapshot({ identity: f.identity, transport: f.transport }));
  await refuses(read(f, {}));
  assert.equal(f.dispatches.length, 0);
});

for (const limits of [
  { maxPages: 11 },
  { maxBytes: 4194305 },
  { maxPages: 0 },
  { maxBytes: 1.2 },
]) {
  test(`budget rejects unsafe limits ${JSON.stringify(limits)}`, () =>
    assert.throws(() => createStoryReadBudget(limits), { code: 'STORY_SNAPSHOT_UNAVAILABLE' }));
}

test('configured fields retain null versus absent and reject duplicate field identities', async () => {
  const f = createStoryFixture({
    fields: [
      {
        __typename: 'ProjectV2ItemFieldNumberValue',
        id: 'FV_A',
        number: null,
        field: { id: 'F_A', dataType: 'NUMBER', project: { id: 'P_test' } },
      },
    ],
  });
  f.transport.fields = [
    { fieldId: 'F_A', type: 'NUMBER' },
    { fieldId: 'F_B', type: 'TEXT' },
  ];
  const s = await read(f);
  assert.deepEqual(s.fields, [
    { itemId: 'PI_test', fieldId: 'F_A', type: 'NUMBER', value: null },
    { itemId: 'PI_test', fieldId: 'F_B', type: 'TEXT', value: { state: 'absent' } },
  ]);
  f.data.item.fieldValues = f.connection([
    f.data.item.fieldValues.nodes[0],
    { ...f.data.item.fieldValues.nodes[0], id: 'FV_B' },
  ]);
  await refuses(read(f));
});

test('current body and comment edits retain native tokens while tombstones refuse', async () => {
  const f = createStoryFixture({
    comments: [
      {
        body: 'C',
        lastEditedAt: '2026-10-20T01:59:21Z',
        includesCreatedEdit: true,
        userContentEdits: {
          totalCount: 3,
          nodes: [{ id: 'Edit_C', editedAt: '2026-10-20T01:59:21Z', deletedAt: null }],
          pageInfo: { hasNextPage: true },
        },
      },
    ],
  });
  const s = await read(f);
  assert.equal(s.resources['comment:IC_0'].revision.editId, 'Edit_C');
  f.data.issue.comments.nodes[0].userContentEdits.nodes[0].deletedAt = '2026-10-20T02:00:00Z';
  await refuses(read(f));
});

test('equal-sized comment replacement yields different current inventories', async () => {
  const f = createStoryFixture({ comments: [{ id: 'IC_A', body: 'A' }] });
  const a = await read(f);
  f.data.issue.comments.nodes[0].id = 'IC_B';
  const b = await read(f);
  assert.deepEqual(a.inventory, ['IC_A']);
  assert.deepEqual(b.inventory, ['IC_B']);
  assert.equal(a.resources['comment:IC_A'].digest, b.resources['comment:IC_B'].digest);
});

test('every configured field kind and unrelated computed fields survives a complete census', async () => {
  const rows = [
    ['NUMBER', 'Number', { number: 3.5 }, 3.5],
    ['TEXT', 'Text', { text: 'text' }, 'text'],
    ['DATE', 'Date', { date: '2026-10-20' }, '2026-10-20'],
    [
      'SINGLE_SELECT',
      'SingleSelect',
      { name: 'Develop', optionId: 'O_A' },
      { optionId: 'O_A', name: 'Develop' },
    ],
    ['ITERATION', 'Iteration', { iterationId: 'IT_A' }, 'IT_A'],
  ];
  const f = createStoryFixture({
    fields: rows.map(([type, suffix, value], i) => ({
      __typename: `ProjectV2ItemField${suffix}Value`,
      id: `FV_${i}`,
      field: { id: `F_${i}`, dataType: type, project: { id: 'P_test' } },
      ...value,
    })),
  });
  f.transport.fields = rows.map(([type], i) => ({ fieldId: `F_${i}`, type }));
  f.data.item.fieldValues.nodes.push({
    __typename: 'ProjectV2ItemFieldRepositoryValue',
    field: { id: 'F_computed', dataType: 'REPOSITORY', project: { id: 'P_test' } },
  });
  f.data.item.fieldValues.totalCount++;
  const s = await read(f);
  assert.deepEqual(
    s.fields.map((v) => v.value),
    rows.map((r) => r[3])
  );
  const empty = createStoryFixture();
  assert.notEqual(s.fieldsDigest, (await read(empty)).fieldsDigest);
});

for (const [name, change] of [
  [
    'wrong field project',
    (f) => {
      f.data.item.fieldValues.nodes[0].field.project.id = 'P_other';
    },
  ],
  [
    'wrong field type',
    (f) => {
      f.data.item.fieldValues.nodes[0].field.dataType = 'TEXT';
    },
  ],
  [
    'unsupported configured kind',
    (f) => {
      f.transport.fields[0].type = 'LABELS';
    },
  ],
  [
    'missing field value',
    (f) => {
      delete f.data.item.fieldValues.nodes[0].number;
    },
  ],
  [
    'invalid numeric value',
    (f) => {
      f.data.item.fieldValues.nodes[0].number = '3.5';
    },
  ],
  [
    'missing configuration',
    (f) => {
      delete f.transport.fields;
    },
  ],
])
  test(`field census refuses ${name}`, async () => {
    const f = createStoryFixture({
      fields: [
        {
          __typename: 'ProjectV2ItemFieldNumberValue',
          id: 'FV_A',
          number: 3.5,
          field: { id: 'F_A', dataType: 'NUMBER', project: { id: 'P_test' } },
        },
      ],
    });
    f.transport.fields = [{ fieldId: 'F_A', type: 'NUMBER' }];
    change(f);
    await refuses(read(f));
  });

test('one invocation budget cannot mix different subjects or configured inventories', async () => {
  const f = createStoryFixture();
  const budget = createStoryReadBudget();
  await read(f, budget);
  f.transport.fields = [{ fieldId: 'F_A', type: 'TEXT' }];
  await refuses(read(f, budget));
  assert.equal(f.dispatches.length, 1);
});

test('a failed transport consumes its attempt and prevents hidden replay', async () => {
  const f = createStoryFixture();
  let calls = 0;
  f.transport.query = async () => {
    calls++;
    throw new Error('response lost');
  };
  const budget = createStoryReadBudget();
  await refuses(read(f, budget));
  await refuses(read(f, budget));
  assert.equal(calls, 1);
});

test('concurrent census calls cannot interleave on one budget', async () => {
  const f = createStoryFixture();
  let release;
  f.transport.query = () =>
    new Promise((resolve) => {
      release = () => resolve(JSON.stringify({ data: f.data }));
    });
  const budget = createStoryReadBudget();
  const first = read(f, budget);
  await refuses(read(f, budget));
  release();
  assert.equal((await first).coverage.dispatches, 1);
});

for (const response of ['{', '{}', '{"data":null}', '[]'])
  test(`malformed response refuses ${response}`, async () => {
    const f = createStoryFixture();
    f.transport.query = async () => response;
    await refuses(read(f));
  });

test('configured inventory uses locale-independent code-unit order', async () => {
  const f = createStoryFixture();
  f.transport.fields = [
    { fieldId: 'F_a', type: 'TEXT' },
    { fieldId: 'F_B', type: 'TEXT' },
  ];
  const s = await read(f);
  assert.deepEqual(
    s.fields.map((row) => row.fieldId),
    ['F_B', 'F_a']
  );
});

for (const kind of ['issue', 'comment'])
  test(`requested current ${kind} history pagination cannot be omitted`, async () => {
    const f = createStoryFixture({ comments: [{}] });
    const node = kind === 'issue' ? f.data.issue : f.data.issue.comments.nodes[0];
    delete node.userContentEdits.pageInfo;
    await refuses(read(f));
  });

test('common field-value identity cannot be omitted from a complete response', async () => {
  const f = createStoryFixture({
    fields: [
      {
        __typename: 'ProjectV2ItemFieldNumberValue',
        number: 1,
        field: { id: 'F_A', dataType: 'NUMBER', project: { id: 'P_test' } },
      },
    ],
  });
  f.transport.fields = [{ fieldId: 'F_A', type: 'NUMBER' }];
  await refuses(read(f));
});

test('terminal page cannot reuse a previous cursor even with distinct IDs and matching counts', async () => {
  const f = createStoryFixture();
  let calls = 0;
  f.transport.query = async () => {
    calls++;
    const data = structuredClone(f.data);
    data.issue.comments = {
      totalCount: 2,
      nodes: [f.content({ id: calls === 1 ? 'IC_A' : 'IC_B' }, calls)],
      pageInfo: { hasNextPage: calls === 1, endCursor: 'same-cursor' },
    };
    return JSON.stringify({ data });
  };
  await refuses(read(f));
});
