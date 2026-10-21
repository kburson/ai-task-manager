// @story #2041
// Integrity validation only: never a freshness, ownership or publication capability.
import { createHash } from 'node:crypto';
import { observeContent } from './native-observation.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const identifier = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
function fail(reason) {
  throw Object.assign(new Error(`Story manifest invalid: ${reason}`), {
    code: 'STORY_MANIFEST_INVALID',
    reason,
  });
}
function exact(value, keys, optional = []) {
  if (
    !object(value) ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => !keys.includes(k) && !optional.includes(k))
  )
    fail('record-shape');
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function clone(value) {
  return JSON.parse(canonicalRecordJson(value));
}
function identityOf(value) {
  exact(value, ['host', 'repository', 'issueNumber', 'issueNodeId', 'projectId', 'projectItemId']);
  return observeContent({
    identity: value,
    node: {
      id: value.issueNodeId,
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: '',
  }).identity;
}
/** Fixed v1 identity preimage; unrelated provenance never changes the cache key. */
export function storyIdentityKey(identity) {
  try {
    return hash(canonicalRecordJson(identityOf(clone(identity))));
  } catch (error) {
    if (error.code === 'STORY_MANIFEST_INVALID') throw error;
    fail('identity');
  }
}
function relativePath(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) ||
    value.split('/').some((p) => p === '.' || p === '..')
  )
    fail('payload-path');
  return value;
}
function sortedUnique(values, check) {
  if (
    !Array.isArray(values) ||
    values.some((v) => !check(v)) ||
    values.some((v, i) => i > 0 && values[i - 1] >= v)
  )
    fail('inventory');
}
function resourceKind(key, identity, currentOnly = false) {
  if (key === `issue:${identity.issueNodeId}`) return 'issue';
  if (typeof key !== 'string') fail('resource-key');
  if (key.startsWith('comment:new:')) {
    if (currentOnly || !identifier(key.slice(12))) fail('resource-key');
    return 'comment';
  }
  if (
    key.startsWith('comment:') &&
    identifier(key.slice(8)) &&
    key.slice(8) !== identity.issueNodeId
  )
    return 'comment';
  if (
    !currentOnly &&
    key.startsWith(`project-field:${identity.projectItemId}:`) &&
    identifier(key.slice(`project-field:${identity.projectItemId}:`.length))
  )
    return 'project-field';
  fail('resource-key');
}
function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    return false;
  const parsed = Date.parse(value);
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, part = '') => `.${part.padEnd(3, '0')}Z`
  );
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === normalized;
}
function fieldValue(row) {
  const value = row.value;
  if (value === null) return;
  if (object(value) && same(value, { state: 'absent' })) return;
  if (row.type === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('field-value');
    return;
  }
  if (row.type === 'SINGLE_SELECT') {
    exact(value, ['optionId', 'name']);
    if (!identifier(value.optionId) || typeof value.name !== 'string') fail('field-value');
    return;
  }
  if (typeof value !== 'string' || !value.isWellFormed()) fail('field-value');
  if (row.type === 'ITERATION' && !identifier(value)) fail('field-value');
  if (
    row.type === 'DATE' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    fail('field-value');
}
function snapshot(snapshot, identity, load) {
  exact(snapshot, [
    'identity',
    'title',
    'titleDigest',
    'resources',
    'inventory',
    'assignees',
    'fields',
    'fieldsDigest',
    'complete',
    'coverage',
  ]);
  if (
    !same(snapshot.identity, identity) ||
    snapshot.complete !== true ||
    !object(snapshot.coverage)
  )
    fail('snapshot');
  if (
    typeof snapshot.title !== 'string' ||
    !snapshot.title.isWellFormed() ||
    hash(snapshot.title) !== snapshot.titleDigest
  )
    fail('title-digest');
  if (
    !object(snapshot.resources) ||
    !Object.hasOwn(snapshot.resources, `issue:${identity.issueNodeId}`)
  )
    fail('body-missing');
  exact(snapshot.coverage, ['dispatches', 'bytes', 'measurement', 'atomic']);
  if (
    !integer(snapshot.coverage.dispatches) ||
    snapshot.coverage.dispatches < 1 ||
    snapshot.coverage.dispatches > 10 ||
    !integer(snapshot.coverage.bytes) ||
    snapshot.coverage.bytes < 1 ||
    snapshot.coverage.bytes > 4194304 ||
    snapshot.coverage.atomic !== false ||
    snapshot.coverage.measurement !== 'returned-utf8-json'
  )
    fail('coverage');
  const inventory = [];
  for (const [key, resource] of Object.entries(snapshot.resources)) {
    exact(
      resource,
      ['identity', 'key', 'kind', 'digest', 'revision', 'ownership', 'provenance', 'payloadPath'],
      ['source']
    );
    const kind = resourceKind(key, identity, true);
    if (
      resource.key !== key ||
      resource.kind !== kind ||
      !same(resource.identity, identity) ||
      !['owned', 'read-only'].includes(resource.ownership)
    )
      fail('resource-identity');
    if (
      !object(resource.provenance) ||
      resource.provenance.source !== 'github-current' ||
      resource.provenance.complete !== true ||
      !timestamp(resource.provenance.observedAt)
    )
      fail('provenance');
    const body = load(resource.payloadPath, resource.digest);
    const revision = resource.revision;
    exact(revision, ['mode', 'editId', 'editedAt', 'lastEditedAt', 'deletedAt']);
    if (!['unedited', 'edited'].includes(revision.mode)) fail('revision-mode');
    const node = {
      id: kind === 'issue' ? identity.issueNodeId : key.slice(8),
      lastEditedAt: revision.lastEditedAt,
      includesCreatedEdit: false,
      userContentEdits:
        revision.mode === 'unedited'
          ? { totalCount: 0, nodes: [] }
          : {
              totalCount: 1,
              nodes: [
                { id: revision.editId, editedAt: revision.editedAt, deletedAt: revision.deletedAt },
              ],
            },
    };
    const observed = observeContent({ identity, node, body });
    if (!same(observed.revision, revision) || observed.digest !== resource.digest) fail('revision');
    if (kind === 'comment') inventory.push(key.slice(8));
  }
  sortedUnique(snapshot.inventory, identifier);
  if (!same(snapshot.inventory, inventory.sort())) fail('comment-inventory');
  sortedUnique(snapshot.assignees, (v) => identifier(v) && v === v.toLowerCase());
  if (!Array.isArray(snapshot.fields)) fail('fields');
  const fieldIds = [];
  for (const row of snapshot.fields) {
    exact(row, ['itemId', 'fieldId', 'type', 'value']);
    if (
      row.itemId !== identity.projectItemId ||
      !identifier(row.fieldId) ||
      !['NUMBER', 'TEXT', 'DATE', 'SINGLE_SELECT', 'ITERATION'].includes(row.type)
    )
      fail('field-identity');
    fieldValue(row);
    fieldIds.push(row.fieldId);
  }
  sortedUnique(fieldIds, identifier);
  if (
    hash(
      canonicalRecordJson({
        canonicalizationVersion: 'aitm.canonical-json/v1',
        fields: snapshot.fields,
      })
    ) !== snapshot.fieldsDigest
  )
    fail('fields-digest');
}
/** No filesystem access: the store must enforce real root/no-follow containment first. */
export function validateManifest(manifest, { identity, payloads } = {}) {
  try {
    const subject = identityOf(clone(identity));
    const record = clone(manifest);
    exact(record, [
      'schema',
      'identity',
      'identityKey',
      'generation',
      'payloadPath',
      'payloadDigest',
      'previousGeneration',
      'claimId',
    ]);
    if (
      record.schema !== 'aitm.story-cache-manifest/v1' ||
      !same(record.identity, subject) ||
      record.identityKey !== storyIdentityKey(subject) ||
      !identifier(record.claimId)
    )
      fail('manifest-identity');
    if (
      !integer(record.generation) ||
      record.generation < 1 ||
      (record.generation === 1
        ? record.previousGeneration !== null
        : record.previousGeneration !== record.generation - 1)
    )
      fail('generation-pointer');
    if (!(payloads instanceof Map)) fail('payload-map');
    const verified = new Map();
    const load = (path, expectedDigest) => {
      relativePath(path);
      if (!digest(expectedDigest)) fail('payload-digest');
      const previous = verified.get(path);
      if (previous) {
        if (previous.digest !== expectedDigest) fail('conflicting-payload-reference');
        return previous.text;
      }
      const value = Map.prototype.get.call(payloads, path);
      let bytes;
      if (typeof value === 'string' && value.isWellFormed()) bytes = Buffer.from(value, 'utf8');
      else if (Buffer.isBuffer(value)) bytes = Buffer.from(value);
      else fail('payload-missing');
      if (hash(bytes) !== expectedDigest) fail('payload-checksum');
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        fail('payload-utf8');
      }
      verified.set(path, { digest: expectedDigest, text });
      return text;
    };
    const raw = load(record.payloadPath, record.payloadDigest);
    let generation;
    try {
      generation = JSON.parse(raw);
    } catch {
      fail('generation-json');
    }
    if (canonicalRecordJson(generation) !== raw) fail('generation-canonical-json');
    exact(generation, [
      'schema',
      'identity',
      'generation',
      'publicationGeneration',
      'baseSnapshot',
      'working',
      'dirtyKeys',
      'timing',
      'batch',
      'conflicts',
    ]);
    if (
      generation.schema !== 'aitm.story-cache-generation/v1' ||
      !same(generation.identity, subject) ||
      generation.generation !== record.generation
    )
      fail('generation-identity');
    if (
      !integer(generation.publicationGeneration) ||
      generation.publicationGeneration > generation.generation
    )
      fail('publication-counter');
    if (
      generation.batch !== null &&
      (!object(generation.batch) ||
        generation.batch.schema !== 'aitm.story-publication-batch/v1' ||
        generation.publicationGeneration === 0 ||
        generation.batch.publicationGeneration !== generation.publicationGeneration)
    )
      fail('batch-counter');
    snapshot(generation.baseSnapshot, subject, load);
    if (!object(generation.working)) fail('working');
    for (const [key, entry] of Object.entries(generation.working)) {
      exact(entry, ['payloadPath', 'digest', 'kind', 'capabilityRef']);
      if (
        entry.kind !== resourceKind(key, subject) ||
        !(entry.capabilityRef === null || identifier(entry.capabilityRef))
      )
        fail('working-reference');
      load(entry.payloadPath, entry.digest);
    }
    sortedUnique(
      generation.dirtyKeys,
      (v) => identifier(v) && Object.hasOwn(generation.working, v)
    );
    exact(generation.timing, [
      'events',
      'ingestedCursor',
      'publishedCursor',
      'canonicalCommentKey',
    ]);
    if (!Array.isArray(generation.timing.events) || !Array.isArray(generation.conflicts))
      fail('generation-collections');
    // Validate all declared references, including those in retained recovery records.
    const references = (value) => {
      if (!value || typeof value !== 'object') return;
      if (Object.hasOwn(value, 'payloadPath')) load(value.payloadPath, value.digest);
      for (const child of Object.values(value)) references(child);
    };
    references(generation);
    return freeze({ manifest: record, generation });
  } catch (error) {
    if (error.code === 'STORY_MANIFEST_INVALID') throw error;
    throw Object.assign(new Error('Story manifest invalid: data', { cause: error }), {
      code: 'STORY_MANIFEST_INVALID',
      reason: 'data',
    });
  }
}
