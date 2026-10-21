// @story #2053
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createStoryFixture } from '../../../../helpers/story-cache-fixtures.mjs';
import {
  readStorySnapshot,
  createStoryReadBudget,
} from '../../../../../task-tracker/lib/story-cache/snapshot-reader.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { validateManifest } from '../../../../../task-tracker/lib/story-cache/manifest.mjs';
import { compareSnapshots } from '../../../../../task-tracker/lib/story-cache/snapshot-compare.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function snapshot(input = {}, change = () => {}) {
  const f = createStoryFixture(input);
  change(f);
  return structuredClone(
    await readStorySnapshot({
      identity: f.identity,
      transport: f.transport,
      budget: createStoryReadBudget(),
    })
  );
}
const edited =
  (id = 'Edit_A', body = 'A') =>
  (f) => {
    Object.assign(f.data.issue, {
      body,
      lastEditedAt: '2026-10-20T01:59:21Z',
      includesCreatedEdit: true,
      userContentEdits: {
        totalCount: 3,
        nodes: [{ id, editedAt: '2026-10-20T01:59:21Z', deletedAt: null }],
        pageInfo: { hasNextPage: true },
      },
    });
  };
const refuses = (base, current) =>
  assert.throws(() => compareSnapshots(base, current), { code: 'STORY_SNAPSHOT_UNAVAILABLE' });

test('equal complete unedited vectors have no changes despite observation clocks', async () => {
  const base = await snapshot({ comments: [{ id: 'IC_A', body: 'foreign' }] });
  const current = structuredClone(base);
  for (const resource of Object.values(current.resources))
    resource.provenance.observedAt = '2026-10-21T12:00:00Z';
  current.coverage.bytes++;
  current.resources['comment:IC_A'].ownership = 'owned';
  assert.deepEqual(compareSnapshots(base, current), { equal: true, changes: [] });
});

test('equal native edit token with different exact body bytes remains drift', async () => {
  const base = await snapshot({}, edited('Edit_A', 'A'));
  const current = await snapshot({}, edited('Edit_A', 'B'));
  const result = compareSnapshots(base, current);
  assert.equal(result.equal, false);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].kind, 'resource');
  assert.equal(result.changes[0].key, 'issue:I_test');
  assert.equal(result.changes[0].before.revision.editId, 'Edit_A');
  assert.equal(result.changes[0].after.revision.editId, 'Edit_A');
  assert.notEqual(result.changes[0].before.digest, result.changes[0].after.digest);
});

test('different native edit token with unchanged body bytes remains drift', async () => {
  const a = await snapshot({}, edited('Edit_A'));
  const b = await snapshot({}, edited('Edit_C'));
  const result = compareSnapshots(a, b);
  assert.equal(result.equal, false);
  assert.equal(result.changes[0].before.digest, result.changes[0].after.digest);
  assert.notEqual(
    result.changes[0].before.revision.editId,
    result.changes[0].after.revision.editId
  );
});

test('equal timestamp instants and changed historical counts are not newer content', async () => {
  const base = await snapshot({}, edited());
  const current = await snapshot({}, (f) => {
    edited()(f);
    f.data.issue.userContentEdits.totalCount = 99;
  });
  current.resources['issue:I_test'].revision.editedAt = '2026-10-20T01:59:21.000Z';
  current.resources['issue:I_test'].revision.lastEditedAt = '2026-10-20T01:59:21.000Z';
  assert.equal(compareSnapshots(base, current).equal, true);
});

for (const [name, before, after] of [
  ['addition', [], [{ id: 'IC_A', body: 'foreign' }]],
  ['deletion', [{ id: 'IC_A', body: 'foreign' }], []],
  ['equal-count replacement', [{ id: 'IC_A', body: 'foreign' }], [{ id: 'IC_B', body: 'foreign' }]],
  ['nondirty foreign edit', [{ id: 'IC_A', body: 'old' }], [{ id: 'IC_A', body: 'new' }]],
])
  test(`full comment census detects ${name}`, async () => {
    const base = await snapshot({ comments: before });
    const current = await snapshot({ comments: after });
    const result = compareSnapshots(base, current);
    assert.equal(result.equal, false);
    assert.ok(result.changes.some((c) => c.kind === 'resource' && c.key.startsWith('comment:')));
    if (name !== 'nondirty foreign edit')
      assert.ok(result.changes.some((c) => c.kind === 'inventory'));
  });

test('title and assignment drift are retained separately from an unchanged body', async () => {
  const base = await snapshot({ assignees: ['alice'] });
  const current = await snapshot({ assignees: ['bob'] }, (f) => {
    f.data.issue.title = 'New title';
  });
  const changes = compareSnapshots(base, current).changes;
  assert.deepEqual(
    changes.map((c) => c.kind),
    ['assignees', 'title']
  );
  assert.deepEqual(changes.find((c) => c.kind === 'assignees').before, ['alice']);
  assert.equal(changes.find((c) => c.kind === 'title').after, 'New title');
});

test('configured field absent versus observed null produces an exact field change', async () => {
  const configure = (f) => {
    f.transport.fields = [{ fieldId: 'F_A', type: 'NUMBER' }];
  };
  const base = await snapshot({}, configure);
  const current = await snapshot(
    {
      fields: [
        {
          __typename: 'ProjectV2ItemFieldNumberValue',
          id: 'FV_A',
          number: null,
          field: { id: 'F_A', dataType: 'NUMBER', project: { id: 'P_test' } },
        },
      ],
    },
    configure
  );
  const result = compareSnapshots(base, current);
  assert.equal(result.equal, false);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].kind, 'field');
  assert.equal(result.changes[0].key, 'project-field:PI_test:F_A');
  assert.deepEqual(result.changes[0].before.value, { state: 'absent' });
  assert.equal(result.changes[0].after.value, null);
});

test('field inventory additions and removals are detected independently of counts', async () => {
  const base = await snapshot({}, (f) => {
    f.transport.fields = [{ fieldId: 'F_A', type: 'TEXT' }];
  });
  const current = await snapshot({}, (f) => {
    f.transport.fields = [{ fieldId: 'F_B', type: 'TEXT' }];
  });
  const result = compareSnapshots(base, current);
  assert.deepEqual(
    result.changes.map((c) => c.key),
    ['project-field:PI_test:F_A', 'project-field:PI_test:F_B']
  );
  assert.equal(result.changes[0].after, null);
  assert.equal(result.changes[1].before, null);
});

for (const [name, change] of [
  [
    'partial census',
    (s) => {
      s.complete = false;
    },
  ],
  [
    'wrong host',
    (s) => {
      s.identity.host = 'example.com';
    },
  ],
  [
    'wrong repository',
    (s) => {
      s.identity.repository = 'other/repo';
    },
  ],
  [
    'wrong item',
    (s) => {
      s.identity.projectItemId = 'PI_other';
    },
  ],
  [
    'missing body',
    (s) => {
      delete s.resources['issue:I_test'];
    },
  ],
  [
    'missing native revision',
    (s) => {
      delete s.resources['issue:I_test'].revision;
    },
  ],
  [
    'unsupported native mode',
    (s) => {
      s.resources['issue:I_test'].revision.mode = 'digest-only';
    },
  ],
  [
    'tombstone',
    (s) => {
      s.resources['issue:I_test'].revision.deletedAt = '2026-10-21T00:00:00Z';
    },
  ],
  [
    'false body digest',
    (s) => {
      s.resources['issue:I_test'].body = 'B';
    },
  ],
  [
    'false title digest',
    (s) => {
      s.title = 'B';
    },
  ],
  [
    'false field digest',
    (s) => {
      s.fieldsDigest = '0'.repeat(64);
    },
  ],
  [
    'inventory disagreement',
    (s) => {
      s.inventory = ['IC_missing'];
    },
  ],
  [
    'duplicate inventory',
    (s) => {
      s.inventory = ['IC_A', 'IC_A'];
    },
  ],
  [
    'duplicate assignees',
    (s) => {
      s.assignees = ['alice', 'alice'];
    },
  ],
  [
    'missing coverage',
    (s) => {
      delete s.coverage;
    },
  ],
  [
    'missing provenance',
    (s) => {
      delete s.resources['issue:I_test'].provenance;
    },
  ],
  [
    'resource subject mismatch',
    (s) => {
      s.resources['issue:I_test'].identity.issueNumber = 1;
    },
  ],
  [
    'unknown resource kind',
    (s) => {
      s.resources['issue:I_test'].kind = 'comment';
    },
  ],
])
  test(`incomplete comparison refuses ${name}`, async () => {
    const base = await snapshot();
    const current = structuredClone(base);
    change(current);
    refuses(base, current);
    refuses(current, base);
  });

test('validated persisted references compare equal to their inline reader view', async () => {
  const current = await snapshot({ comments: [{ id: 'IC_A', body: 'foreign' }] });
  const base = structuredClone(current);
  const payloads = new Map();
  for (const [key, resource] of Object.entries(base.resources)) {
    const path = `base/${hash(key)}.md`;
    payloads.set(path, resource.body);
    delete resource.body;
    resource.payloadPath = path;
  }
  const generation = {
    schema: 'aitm.story-cache-generation/v1',
    identity: base.identity,
    generation: 1,
    publicationGeneration: 0,
    baseSnapshot: base,
    working: {},
    dirtyKeys: [],
    timing: { events: [], ingestedCursor: null, publishedCursor: null, canonicalCommentKey: null },
    batch: null,
    conflicts: [],
  };
  const raw = canonicalRecordJson(generation);
  payloads.set('generations/1.json', raw);
  const manifest = {
    schema: 'aitm.story-cache-manifest/v1',
    identity: base.identity,
    identityKey: hash(canonicalRecordJson(base.identity)),
    generation: 1,
    payloadPath: 'generations/1.json',
    payloadDigest: hash(raw),
    previousGeneration: null,
    claimId: 'claim-A',
  };
  const persisted = validateManifest(manifest, { identity: base.identity, payloads }).generation
    .baseSnapshot;
  assert.deepEqual(compareSnapshots(persisted, current), { equal: true, changes: [] });
});

test('comparison output is detached and deeply frozen', async () => {
  const base = await snapshot({ assignees: ['alice'] });
  const current = await snapshot({ assignees: ['bob'] });
  const result = compareSnapshots(base, current);
  current.assignees[0] = 'changed';
  assert.deepEqual(result.changes[0].after, ['bob']);
  assert.ok(Object.isFrozen(result.changes[0].after));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.changes));
});

for (const [name, change] of [
  [
    'empty transport coverage',
    (s) => {
      s.coverage = {};
    },
  ],
  [
    'impossible observation calendar',
    (s) => {
      s.resources['issue:I_test'].provenance.observedAt = '2026-02-31T00:00:00Z';
    },
  ],
])
  test(`required observation metadata refuses ${name}`, async () => {
    const base = await snapshot();
    const current = structuredClone(base);
    change(current);
    refuses(base, current);
  });
