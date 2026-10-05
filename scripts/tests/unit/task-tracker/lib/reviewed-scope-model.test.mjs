// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  parseManifest,
  requestDigest,
  makeRecord,
  encodeRecord,
  parseRecordComment,
  parsePointer,
  serializePointer,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';
const hash = 'a'.repeat(64);
const manifest = () => ({
  schema: 'aitm.reviewed-scope-evidence/v1',
  repository: 'owner/repo',
  issue: 1859,
  worktree: '/bound/checkout',
  branch: 'codex/1859',
  head: 'b'.repeat(40),
  label: 'Inspect output',
  provenance: { kind: 'operator-inspection' },
  rationale: 'Inspect the saved output; this does not prove execution.',
  artifacts: [{ path: '.scratch/output.txt', sha256: hash }],
});
const bytes = (value) => Buffer.from(canonicalRecordJson(value) + '\n');
test('canonical manifest retains attributed inspection without inventing execution', () =>
  assert.deepEqual(parseManifest(bytes(manifest())), manifest()));
test('ambiguous/noncanonical JSON cannot become a manifest', () => {
  for (const input of [
    '{"issue":1,"issue":2}',
    JSON.stringify(manifest()),
    canonicalRecordJson(manifest()) + '\n\n',
  ])
    assert.throws(() => parseManifest(Buffer.from(input)));
});
test('strict manifests reject foreign fields, unsafe paths and malformed binding', () => {
  for (const patch of [
    { actor: 'spoof' },
    { issue: 0 },
    { head: 'abc' },
    { worktree: 'relative' },
    { branch: 'HEAD' },
    { repository: 'bad' },
    { rationale: '' },
    { artifacts: [] },
    { artifacts: [{ path: '../escape', sha256: hash }] },
    { artifacts: [{ path: 'a', sha256: 'bad' }] },
  ])
    assert.throws(() => parseManifest(bytes({ ...manifest(), ...patch })));
});
test('manifest byte, count and text bounds refuse instead of truncating', () => {
  assert.throws(() => parseManifest(Buffer.alloc(8193, 32)));
  assert.throws(() => parseManifest(bytes({ ...manifest(), rationale: 'x'.repeat(2049) })));
  assert.throws(() =>
    parseManifest(
      bytes({
        ...manifest(),
        artifacts: Array.from({ length: 17 }, (_, n) => ({
          path: `a${String(n).padStart(2, '0')}`,
          sha256: hash,
        })),
      })
    )
  );
});
test('historical provenance requires explicit unknown-commit explanation', () => {
  const provenance = {
    kind: 'historical-command-output',
    command: 'npm test',
    executedAt: '2026-10-01T00:00:00.000Z',
    sourceRepository: 'owner/repo',
    sourceIssue: 132,
    sourceCommit: null,
    unknownCommitReason: 'Commit absent from the historical log.',
    reportedOutcome: 'Operator log reports success.',
  };
  assert.deepEqual(parseManifest(bytes({ ...manifest(), provenance })).provenance, provenance);
  assert.throws(() =>
    parseManifest(bytes({ ...manifest(), provenance: { ...provenance, unknownCommitReason: '' } }))
  );
});
test('record envelope authenticates canonical payload and refuses tampering', () => {
  const m = manifest(),
    targetDigest = hash,
    request = requestDigest({ manifest: m, targetDigest });
  const record = makeRecord({
    manifest: m,
    targetDigest,
    requestDigest: request,
    lineage: hash,
    predecessor: null,
    actor: { id: '12345678901234567890', login: 'owner' },
    recordedAt: '2026-10-01T00:00:00.000Z',
  });
  const encoded = encodeRecord(record);
  assert.deepEqual(parseRecordComment(encoded.commentBody), { record, sha256: encoded.sha256 });
  assert.throws(() =>
    parseRecordComment(encoded.commentBody.replace(encoded.sha256, 'f'.repeat(64)))
  );
  assert.throws(() => parseRecordComment(encoded.commentBody + ' extra'));
  assert.throws(() => encodeRecord({ ...record, actor: { id: '0', login: 'owner' } }));
});
test('pointer preserves decimal IDs without Number precision and rejects malformed prefixes', () => {
  const pointer = { commentId: '12345678901234567890', sha256: hash, lineage: 'b'.repeat(64) };
  const serialized = serializePointer(pointer);
  assert.deepEqual(parsePointer('- [x] Inspect output ' + serialized), pointer);
  assert.equal(parsePointer('- [ ] Ordinary step'), null);
  for (const bad of [
    serialized + serialized,
    serialized.replace('comment=', 'unknown='),
    '<!-- aitm-reviewed-scope-evidence broken -->',
  ])
    assert.throws(() => parsePointer(bad));
  assert.throws(() => serializePointer({ ...pointer, commentId: '1'.repeat(21) }));
});

test('ordinary pointer-name prose is not a malformed evidence claim', () =>
  assert.equal(
    parsePointer('The `aitm-reviewed-scope-evidence` marker is documented elsewhere.'),
    null
  ));
test('ill-formed UTF-8 and NUL-bearing fields cannot become evidence', () => {
  assert.throws(() => parseManifest(Buffer.from([255])));
  assert.throws(() => parseManifest(bytes({ ...manifest(), rationale: 'bad\u0000text' })));
});
test('rationale limit accepts the boundary and refuses one extra byte', () => {
  assert.equal(
    parseManifest(bytes({ ...manifest(), rationale: 'x'.repeat(2048) })).rationale.length,
    2048
  );
  assert.throws(() => parseManifest(bytes({ ...manifest(), rationale: 'x'.repeat(2049) })));
});
