// @story #2053
// Pure drift descriptions; equality is never provider atomicity or mutation authority.
import { createHash } from 'node:crypto';
import { observeContent, parseNativeContentTimestamp } from './native-observation.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const identifier = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const hash = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const clone = (v) => JSON.parse(canonicalRecordJson(v));
function fail(reason) {
  throw Object.assign(new Error(`Story snapshot unavailable: ${reason}`), {
    code: 'STORY_SNAPSHOT_UNAVAILABLE',
    reason,
  });
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function sorted(values, check = identifier) {
  if (
    !Array.isArray(values) ||
    values.some((v) => !check(v)) ||
    values.some((v, i) => i > 0 && values[i - 1] >= v)
  )
    fail('canonical-inventory');
}
function canonicalIdentity(identity) {
  if (!object(identity) || Object.keys(identity).length !== 6) fail('identity');
  const node = {
    id: identity.issueNodeId,
    lastEditedAt: null,
    includesCreatedEdit: false,
    userContentEdits: { totalCount: 0, nodes: [] },
  };
  const canonical = observeContent({ identity, node, body: '' }).identity;
  if (!equal(identity, canonical)) fail('canonical-identity');
  return canonical;
}
function path(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) ||
    value.split('/').some((p) => p === '.' || p === '..')
  )
    fail('payload-path');
}
function revision(value, nodeId, identity, body) {
  if (
    !object(value) ||
    !['unedited', 'edited'].includes(value.mode) ||
    !equal(Object.keys(value).sort(), ['deletedAt', 'editId', 'editedAt', 'lastEditedAt', 'mode'])
  )
    fail('revision');
  const node = {
    id: nodeId,
    lastEditedAt: value.lastEditedAt,
    includesCreatedEdit: false,
    userContentEdits:
      value.mode === 'unedited'
        ? { totalCount: 0, nodes: [] }
        : {
            totalCount: 1,
            nodes: [{ id: value.editId, editedAt: value.editedAt, deletedAt: value.deletedAt }],
          },
  };
  const observed = observeContent({ identity, node, body });
  if (!equal(observed.revision, value)) fail('revision');
  return {
    observed,
    normalized: {
      ...value,
      editedAt: value.editedAt === null ? null : new Date(value.editedAt).toISOString(),
      lastEditedAt: value.lastEditedAt === null ? null : new Date(value.lastEditedAt).toISOString(),
    },
  };
}
function resource(key, value, identity) {
  if (
    !object(value) ||
    value.key !== key ||
    !equal(value.identity, identity) ||
    !digest(value.digest) ||
    !['owned', 'read-only'].includes(value.ownership)
  )
    fail('resource');
  let kind, nodeId;
  if (key === `issue:${identity.issueNodeId}`) {
    kind = 'issue';
    nodeId = identity.issueNodeId;
  } else if (
    key.startsWith('comment:') &&
    !key.startsWith('comment:new:') &&
    identifier(key.slice(8)) &&
    key.slice(8) !== identity.issueNodeId
  ) {
    kind = 'comment';
    nodeId = key.slice(8);
  } else fail('resource-key');
  if (
    value.kind !== kind ||
    !object(value.provenance) ||
    value.provenance.source !== 'github-current' ||
    value.provenance.complete !== true ||
    parseNativeContentTimestamp(value.provenance.observedAt) === null
  )
    fail('resource-provenance');
  const inline = Object.hasOwn(value, 'body'),
    referenced = Object.hasOwn(value, 'payloadPath');
  if (inline === referenced) fail('resource-representation');
  if (referenced) path(value.payloadPath);
  const { observed, normalized } = revision(
    value.revision,
    nodeId,
    identity,
    inline ? value.body : ''
  );
  if (inline && observed.digest !== value.digest) fail('body-digest');
  return { kind, digest: value.digest, revision: normalized };
}
function field(row, identity) {
  if (
    !object(row) ||
    !equal(Object.keys(row).sort(), ['fieldId', 'itemId', 'type', 'value']) ||
    row.itemId !== identity.projectItemId ||
    !identifier(row.fieldId) ||
    !['NUMBER', 'TEXT', 'DATE', 'SINGLE_SELECT', 'ITERATION'].includes(row.type)
  )
    fail('field');
  const value = row.value;
  if (value === null || equal(value, { state: 'absent' })) return row;
  if (row.type === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('field-value');
  } else if (row.type === 'SINGLE_SELECT') {
    if (
      !object(value) ||
      !equal(Object.keys(value).sort(), ['name', 'optionId']) ||
      !identifier(value.optionId) ||
      typeof value.name !== 'string'
    )
      fail('field-value');
  } else {
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
  return row;
}
function vector(input) {
  const s = clone(input);
  if (!object(s) || s.complete !== true || !object(s.coverage) || !object(s.resources))
    fail('snapshot-incomplete');
  const coverage = s.coverage;
  if (
    !equal(Object.keys(coverage).sort(), ['atomic', 'bytes', 'dispatches', 'measurement']) ||
    !Number.isSafeInteger(coverage.dispatches) ||
    coverage.dispatches < 1 ||
    coverage.dispatches > 10 ||
    !Number.isSafeInteger(coverage.bytes) ||
    coverage.bytes < 1 ||
    coverage.bytes > 4194304 ||
    coverage.atomic !== false ||
    coverage.measurement !== 'returned-utf8-json'
  )
    fail('coverage');
  const identity = canonicalIdentity(s.identity);
  if (typeof s.title !== 'string' || !s.title.isWellFormed() || hash(s.title) !== s.titleDigest)
    fail('title-digest');
  sorted(s.inventory);
  sorted(s.assignees, (v) => identifier(v) && v === v.toLowerCase());
  const resources = {};
  const inventory = [];
  for (const key of Object.keys(s.resources).sort()) {
    resources[key] = resource(key, s.resources[key], identity);
    if (resources[key].kind === 'comment') inventory.push(key.slice(8));
  }
  if (!Object.hasOwn(resources, `issue:${identity.issueNodeId}`) || !equal(inventory, s.inventory))
    fail('resource-inventory');
  if (!Array.isArray(s.fields)) fail('field-inventory');
  const fields = s.fields.map((row) => field(row, identity));
  sorted(fields.map((row) => row.fieldId));
  if (
    !digest(s.fieldsDigest) ||
    hash(canonicalRecordJson({ canonicalizationVersion: 'aitm.canonical-json/v1', fields })) !==
      s.fieldsDigest
  )
    fail('fields-digest');
  return {
    identity,
    resources,
    title: s.title,
    inventory: s.inventory,
    assignees: s.assignees,
    fields,
  };
}
/** Both snapshots require complete native observations or independently validated stored references. */
export function compareSnapshots(base, current) {
  try {
    const before = vector(base),
      after = vector(current);
    if (!equal(before.identity, after.identity)) fail('snapshot-identity');
    const changes = [];
    const add = (kind, key, a, b) => {
      if (!equal(a, b)) changes.push({ kind, key, before: a, after: b });
    };
    const keys = [
      ...new Set([...Object.keys(before.resources), ...Object.keys(after.resources)]),
    ].sort();
    for (const key of keys)
      add('resource', key, before.resources[key] ?? null, after.resources[key] ?? null);
    const issueKey = `issue:${before.identity.issueNodeId}`;
    for (const kind of ['title', 'inventory', 'assignees'])
      add(kind, issueKey, before[kind], after[kind]);
    const fieldsBefore = new Map(before.fields.map((row) => [row.fieldId, row]));
    const fieldsAfter = new Map(after.fields.map((row) => [row.fieldId, row]));
    const ids = [...new Set([...fieldsBefore.keys(), ...fieldsAfter.keys()])].sort();
    for (const id of ids)
      add(
        'field',
        `project-field:${before.identity.projectItemId}:${id}`,
        fieldsBefore.get(id) ?? null,
        fieldsAfter.get(id) ?? null
      );
    changes.sort((a, b) => {
      const left = `${a.kind}:${a.key}`,
        right = `${b.kind}:${b.key}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
    return freeze({ equal: changes.length === 0, changes });
  } catch (error) {
    if (error.code === 'STORY_SNAPSHOT_UNAVAILABLE') throw error;
    throw Object.assign(
      new Error('Story snapshot unavailable: comparison-data', { cause: error }),
      { code: 'STORY_SNAPSHOT_UNAVAILABLE', reason: 'comparison-data' }
    );
  }
}
