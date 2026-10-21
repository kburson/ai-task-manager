// @story #2039 #2057
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handoffBundle, hash } from '../../../../helpers/story-handoff-fixture.mjs';
import {
  validateStoryHandoffBundle,
  transferStoryWriter,
} from '../../../../../task-tracker/lib/story-cache/writer-handoff.mjs';
const refuses = (fn) => assert.throws(fn, { code: 'STORY_HANDOFF_UNAVAILABLE' });
test('an exact offline bundle retains its complete named owner and independent byte digest', () => {
  const b = handoffBundle();
  const result = validateStoryHandoffBundle(b);
  assert.equal(
    result.bundleDigest,
    '41fe8b1ee8d65c8f753c20289045207999765788ad19d4f287acbe435d1868c2'
  );
  assert.deepEqual(result.manifest, b.manifest);
  assert.deepEqual([...result.payloads], [...b.payloads]);
  assert.equal(Object.isFrozen(result.manifest), true);
  b.payloads.get('payloads/pending.txt').fill(0);
  assert.equal(result.payloads.get('payloads/pending.txt').toString(), 'pending work');
});
for (const field of [
  'schema',
  'transferId',
  'identity',
  'registryId',
  'sourceClaim',
  'target',
  'directories',
  'files',
])
  test(`missing required ${field} refuses without reconstructing authority`, () => {
    const b = handoffBundle();
    delete b.manifest[field];
    refuses(() => validateStoryHandoffBundle(b));
  });
for (const field of ['authority', 'cloudGrant', 'verified', 'publicationApproved'])
  test(`an export cannot invent ${field}`, () => {
    const b = handoffBundle();
    b.manifest[field] = true;
    refuses(() => validateStoryHandoffBundle(b));
  });
for (const [field, value] of [
  ['schema', 'future/v2'],
  ['transferId', 'bad id'],
  ['registryId', ''],
  ['identity', {}],
  ['sourceClaim', {}],
  ['target', {}],
  ['directories', []],
  ['files', {}],
])
  test(`malformed ${field} refuses`, () => {
    const b = handoffBundle();
    b.manifest[field] = value;
    refuses(() => validateStoryHandoffBundle(b));
  });
for (const [field, value] of [
  ['claimId', ''],
  ['identityKey', 'f'.repeat(64)],
  ['registryKey', 'f'.repeat(64)],
  ['status', 'released'],
  ['transfer', {}],
  ['cachePath', '/other/cache'],
  ['authority', 'invented'],
])
  test(`invalid retained claim ${field} refuses`, () => {
    const b = handoffBundle();
    b.manifest.sourceClaim[field] = value;
    refuses(() => validateStoryHandoffBundle(b));
  });
for (const [field, value] of [
  ['human', 'bad_user'],
  ['sessionId', ''],
  ['worktree', 'relative'],
  ['cachePath', '/other/cache'],
  ['verified', true],
])
  test(`invalid recipient ${field} refuses`, () => {
    const b = handoffBundle();
    b.manifest.target[field] = value;
    refuses(() => validateStoryHandoffBundle(b));
  });
for (const name of [
  'bytes',
  'size',
  'digest',
  'missing',
  'extra',
  'duplicate',
  'directory-order',
  'missing-parent',
])
  test(`corrupt ${name} evidence refuses`, () => {
    const b = handoffBundle();
    if (name === 'bytes') b.payloads.set('payloads/pending.txt', Buffer.from('changed work'));
    if (name === 'size') b.manifest.files[0].size = 13;
    if (name === 'digest') b.manifest.files[0].digest = 'e'.repeat(64);
    if (name === 'missing') b.payloads.clear();
    if (name === 'extra') b.payloads.set('payloads/extra.txt', Buffer.from('extra'));
    if (name === 'duplicate') b.manifest.files.push({ ...b.manifest.files[0] });
    if (name === 'directory-order') b.manifest.directories.reverse();
    if (name === 'missing-parent') b.manifest.directories = ['generations', 'manifests'];
    refuses(() => validateStoryHandoffBundle(b));
  });
for (const file of [
  '../escape',
  '/absolute',
  'write.lock',
  '.writer-handoff/ack.json',
  'payloads/../escape',
])
  test(`unsafe or protocol-owned path ${file} refuses`, () => {
    const b = handoffBundle();
    b.manifest.files[0].path = file;
    b.payloads = new Map([[file, Buffer.from('pending work')]]);
    refuses(() => validateStoryHandoffBundle(b));
  });
test('a new empty cache remains transferable without inventing pending bytes', () => {
  const b = handoffBundle();
  b.manifest.files = [];
  b.payloads.clear();
  assert.equal(validateStoryHandoffBundle(b).payloads.size, 0);
});
test('all retained payloads, including opaque journals, affect the export digest', () => {
  const b = handoffBundle();
  const raw = Buffer.from('uncertain publication; retain me');
  b.manifest.directories.push('publication');
  b.manifest.files.push({ path: 'publication/journal.json', digest: hash(raw), size: raw.length });
  b.payloads.set('publication/journal.json', raw);
  const result = validateStoryHandoffBundle(b);
  assert.notEqual(
    result.bundleDigest,
    '41fe8b1ee8d65c8f753c20289045207999765788ad19d4f287acbe435d1868c2'
  );
  assert.equal(
    result.payloads.get('publication/journal.json').toString(),
    'uncertain publication; retain me'
  );
});
test('an arbitrary registry object cannot authorize a transfer or invoke the recipient', async () => {
  const b = handoffBundle();
  let called = false;
  await assert.rejects(
    transferStoryWriter({
      claim: b.manifest.sourceClaim,
      target: {
        ...b.manifest.target,
        assignment: ['tester'],
        acknowledge: () => {
          called = true;
        },
      },
      store: { cachePath: b.manifest.sourceClaim.cachePath },
      registry: { path: '/forged' },
    })
  );
  assert.equal(called, false);
});

for (const human of [null, 1, true])
  test(`recipient human ${JSON.stringify(human)} cannot pass through string coercion`, () => {
    const b = handoffBundle();
    b.manifest.target.human = human;
    refuses(() => validateStoryHandoffBundle(b));
  });

for (const transferId of ['../escape', 'a/b', '.'])
  test(`transfer locator ${transferId} cannot escape its protocol directory`, () => {
    const b = handoffBundle();
    b.manifest.transferId = transferId;
    refuses(() => validateStoryHandoffBundle(b));
  });
