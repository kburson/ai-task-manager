// @story #2041
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  validateManifest,
  storyIdentityKey,
} from '../../../../../task-tracker/lib/story-cache/manifest.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2039,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
function fixture() {
  const { body: _body, ...observation } = observeContent({
    identity,
    node: {
      id: 'I_test',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: 'A',
  });
  const generation = {
    schema: 'aitm.story-cache-generation/v1',
    identity: { ...identity },
    generation: 1,
    publicationGeneration: 0,
    baseSnapshot: {
      identity: { ...identity },
      title: 'Title',
      titleDigest: hash('Title'),
      resources: {
        'issue:I_test': { ...structuredClone(observation), payloadPath: 'base/body.md' },
      },
      inventory: [],
      assignees: ['alice'],
      fields: [],
      fieldsDigest: hash(
        canonicalRecordJson({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: [] })
      ),
      complete: true,
      coverage: { dispatches: 1, bytes: 1, measurement: 'returned-utf8-json', atomic: false },
    },
    working: {},
    dirtyKeys: [],
    timing: { events: [], ingestedCursor: null, publishedCursor: null, canonicalCommentKey: null },
    batch: null,
    conflicts: [],
  };
  const manifest = {
    schema: 'aitm.story-cache-manifest/v1',
    identity: { ...identity },
    identityKey: hash(canonicalRecordJson(identity)),
    generation: 1,
    payloadPath: 'generations/1.json',
    payloadDigest: '',
    previousGeneration: null,
    claimId: 'claim-A',
  };
  const payloads = new Map([['base/body.md', Buffer.from('A')]]);
  const seal = () => {
    const raw = canonicalRecordJson(generation);
    payloads.set(manifest.payloadPath, raw);
    manifest.payloadDigest = hash(raw);
  };
  seal();
  return { manifest, generation, payloads, seal };
}
const validate = (f) => validateManifest(f.manifest, { identity, payloads: f.payloads });
const refuses = (f) => assert.throws(() => validate(f), { code: 'STORY_MANIFEST_INVALID' });

test('initial manifest authenticates detached generation and all current payloads', () => {
  const f = fixture();
  const result = validate(f);
  assert.equal(result.generation.generation, 1);
  assert.equal(result.generation.publicationGeneration, 0);
  assert.equal(
    result.generation.baseSnapshot.resources['issue:I_test'].digest,
    '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd'
  );
  assert.ok(Object.isFrozen(result.generation.baseSnapshot.resources));
  f.manifest.claimId = 'changed';
  f.generation.baseSnapshot.title = 'changed';
  assert.equal(result.manifest.claimId, 'claim-A');
  assert.equal(result.generation.baseSnapshot.title, 'Title');
});

test('storage advances independently of once-per-batch publication counter', () => {
  const f = fixture();
  f.manifest.generation = 4;
  f.manifest.previousGeneration = 3;
  f.generation.generation = 4;
  f.generation.publicationGeneration = 1;
  f.seal();
  assert.equal(validate(f).generation.publicationGeneration, 1);
});

for (const [name, change] of [
  [
    'schema',
    (f) => {
      f.manifest.schema = 'v9';
    },
  ],
  [
    'extra field',
    (f) => {
      f.manifest.extra = true;
    },
  ],
  [
    'missing claim',
    (f) => {
      delete f.manifest.claimId;
    },
  ],
  [
    'wrong checksum',
    (f) => {
      f.manifest.payloadDigest = '0'.repeat(64);
    },
  ],
  [
    'wrong identity key',
    (f) => {
      f.manifest.identityKey = '0'.repeat(64);
    },
  ],
  [
    'wrong host',
    (f) => {
      f.manifest.identity.host = 'example.com';
    },
  ],
  [
    'noncanonical identity',
    (f) => {
      f.manifest.identity.repository = 'Owner/Repo';
    },
  ],
  [
    'missing bytes',
    (f) => {
      f.payloads.delete(f.manifest.payloadPath);
    },
  ],
  [
    'corrupt body',
    (f) => {
      f.payloads.set('base/body.md', 'B');
    },
  ],
  [
    'missing body',
    (f) => {
      f.payloads.delete('base/body.md');
    },
  ],
  [
    'zero generation',
    (f) => {
      f.manifest.generation = 0;
    },
  ],
  [
    'initial previous',
    (f) => {
      f.manifest.previousGeneration = 0;
    },
  ],
  [
    'skipped previous',
    (f) => {
      f.manifest.generation = 4;
      f.manifest.previousGeneration = 2;
    },
  ],
])
  test(`manifest refuses ${name}`, () => {
    const f = fixture();
    change(f);
    refuses(f);
  });

for (const bad of [
  '../escape.md',
  '/absolute.md',
  'a/../b.md',
  'a//b.md',
  './a.md',
  'C:/a.md',
  'a\\b.md',
  'a/./b.md',
  'a/',
  'a\u0000b.md',
])
  test(`unsafe payload reference refuses ${JSON.stringify(bad)}`, () => {
    const f = fixture();
    f.generation.baseSnapshot.resources['issue:I_test'].payloadPath = bad;
    f.payloads.set(bad, 'A');
    f.seal();
    refuses(f);
  });

for (const [name, change] of [
  [
    'schema',
    (g) => {
      g.schema = 'v9';
    },
  ],
  [
    'extra field',
    (g) => {
      g.extra = true;
    },
  ],
  [
    'wrong identity',
    (g) => {
      g.identity.issueNumber = 1;
    },
  ],
  [
    'wrong generation',
    (g) => {
      g.generation = 2;
    },
  ],
  [
    'negative publication',
    (g) => {
      g.publicationGeneration = -1;
    },
  ],
  [
    'publication ahead',
    (g) => {
      g.publicationGeneration = 2;
    },
  ],
  [
    'fractional publication',
    (g) => {
      g.publicationGeneration = 0.5;
    },
  ],
  [
    'batch counter mismatch',
    (g) => {
      g.batch = { schema: 'aitm.story-publication-batch/v1', publicationGeneration: 1 };
    },
  ],
  [
    'incomplete snapshot',
    (g) => {
      g.baseSnapshot.complete = false;
    },
  ],
  [
    'wrong snapshot subject',
    (g) => {
      g.baseSnapshot.identity.issueNodeId = 'I_other';
    },
  ],
  [
    'title checksum',
    (g) => {
      g.baseSnapshot.title = 'Other';
    },
  ],
  [
    'field checksum',
    (g) => {
      g.baseSnapshot.fieldsDigest = '0'.repeat(64);
    },
  ],
  [
    'inventory mismatch',
    (g) => {
      g.baseSnapshot.inventory = ['IC_missing'];
    },
  ],
  [
    'duplicate assignees',
    (g) => {
      g.baseSnapshot.assignees = ['alice', 'alice'];
    },
  ],
  [
    'missing working entry',
    (g) => {
      g.dirtyKeys = ['issue:I_test'];
    },
  ],
  [
    'duplicate dirty keys',
    (g) => {
      g.dirtyKeys = ['issue:I_test', 'issue:I_test'];
    },
  ],
  [
    'missing timing',
    (g) => {
      delete g.timing;
    },
  ],
  [
    'missing cursor',
    (g) => {
      delete g.timing.ingestedCursor;
    },
  ],
  [
    'missing resource identity',
    (g) => {
      delete g.baseSnapshot.resources['issue:I_test'].identity;
    },
  ],
  [
    'wrong native revision',
    (g) => {
      g.baseSnapshot.resources['issue:I_test'].revision.editId = 'Edit_fake';
    },
  ],
  [
    'second inline body',
    (g) => {
      g.baseSnapshot.resources['issue:I_test'].body = 'B';
    },
  ],
])
  test(`generation refuses ${name}`, () => {
    const f = fixture();
    change(f.generation);
    f.seal();
    refuses(f);
  });

test('dirty working and nested conflict payloads are checksum protected', () => {
  const f = fixture();
  f.payloads.set('working/body.md', 'B');
  f.payloads.set('conflicts/diff.md', 'diff');
  f.generation.working['issue:I_test'] = {
    kind: 'issue',
    payloadPath: 'working/body.md',
    digest: hash('B'),
    capabilityRef: 'cap-A',
  };
  f.generation.dirtyKeys = ['issue:I_test'];
  f.generation.conflicts = [{ payloadPath: 'conflicts/diff.md', digest: hash('diff') }];
  f.seal();
  assert.deepEqual(validate(f).generation.dirtyKeys, ['issue:I_test']);
  f.payloads.set('conflicts/diff.md', 'tampered');
  refuses(f);
});

for (const raw of ['{}', '{', '{"schema":"old","schema":"aitm.story-cache-generation/v1"}'])
  test(`malformed generation bytes refuse ${raw}`, () => {
    const f = fixture();
    f.payloads.set(f.manifest.payloadPath, raw);
    f.manifest.payloadDigest = hash(raw);
    refuses(f);
  });
test('invalid UTF-8 cannot be acknowledged even with matching bytes checksum', () => {
  const f = fixture();
  const raw = Buffer.from([0xff]);
  f.payloads.set(f.manifest.payloadPath, raw);
  f.manifest.payloadDigest = hash(raw);
  refuses(f);
});
test('whitespace JSON is refused as noncanonical persisted generation', () => {
  const f = fixture();
  const raw = JSON.stringify(f.generation, null, 2);
  f.payloads.set(f.manifest.payloadPath, raw);
  f.manifest.payloadDigest = hash(raw);
  refuses(f);
});
test('identity key normalizes expected host and repository without incorporating provenance', () => {
  assert.equal(
    storyIdentityKey({ ...identity, host: 'GitHub.COM', repository: 'Owner/Repo' }),
    hash(canonicalRecordJson(identity))
  );
  assert.notEqual(
    storyIdentityKey({ ...identity, projectItemId: 'PI_other' }),
    storyIdentityKey(identity)
  );
});

for (const [name, change] of [
  [
    'missing transport coverage',
    (g) => {
      g.baseSnapshot.coverage = {};
    },
  ],
  [
    'unsupported field value',
    (g) => {
      g.baseSnapshot.fields = [{ itemId: 'PI_test', fieldId: 'F_A', type: 'NUMBER', value: '3.5' }];
      g.baseSnapshot.fieldsDigest = hash(
        canonicalRecordJson({
          canonicalizationVersion: 'aitm.canonical-json/v1',
          fields: g.baseSnapshot.fields,
        })
      );
    },
  ],
  [
    'invalid observed calendar',
    (g) => {
      g.baseSnapshot.resources['issue:I_test'].provenance.observedAt = '2026-02-31T00:00:00Z';
    },
  ],
])
  test(`complete snapshot metadata refuses ${name}`, () => {
    const f = fixture();
    change(f.generation);
    f.seal();
    refuses(f);
  });

test('persisted real snapshot reader output preserves foreign comments and every configured field kind', async () => {
  const { createStoryFixture } = await import('../../../../helpers/story-cache-fixtures.mjs');
  const { readStorySnapshot, createStoryReadBudget } =
    await import('../../../../../task-tracker/lib/story-cache/snapshot-reader.mjs');
  const rows = [
    ['NUMBER', 'Number', { number: 3.5 }],
    ['TEXT', 'Text', { text: 'text' }],
    ['DATE', 'Date', { date: '2026-10-20' }],
    ['SINGLE_SELECT', 'SingleSelect', { optionId: 'O_A', name: 'Develop' }],
    ['ITERATION', 'Iteration', { iterationId: 'IT_A' }],
  ];
  const provider = createStoryFixture({
    comments: [{ id: 'IC_A', body: 'foreign' }],
    assignees: ['alice'],
    fields: rows.map(([type, suffix, value], i) => ({
      __typename: `ProjectV2ItemField${suffix}Value`,
      id: `FV_${i}`,
      field: { id: `F_${i}`, dataType: type, project: { id: 'P_test' } },
      ...value,
    })),
  });
  provider.transport.fields = rows.map(([type], i) => ({ fieldId: `F_${i}`, type }));
  provider.transport.fields.push({ fieldId: 'F_absent', type: 'TEXT' });
  const observed = await readStorySnapshot({
    identity,
    transport: provider.transport,
    budget: createStoryReadBudget(),
  });
  const f = fixture();
  f.generation.baseSnapshot = structuredClone(observed);
  for (const [key, resource] of Object.entries(f.generation.baseSnapshot.resources)) {
    const path = `base/${hash(key)}.md`;
    f.payloads.set(path, resource.body);
    delete resource.body;
    resource.payloadPath = path;
  }
  f.seal();
  const result = validate(f);
  assert.deepEqual(result.generation.baseSnapshot.inventory, ['IC_A']);
  assert.equal(result.generation.baseSnapshot.resources['comment:IC_A'].ownership, 'read-only');
  assert.equal(
    result.generation.baseSnapshot.resources['comment:IC_A'].source.author.login,
    'foreign'
  );
  assert.deepEqual(
    result.generation.baseSnapshot.fields.map((row) => row.value),
    [3.5, 'text', '2026-10-20', { optionId: 'O_A', name: 'Develop' }, 'IT_A', { state: 'absent' }]
  );
});
