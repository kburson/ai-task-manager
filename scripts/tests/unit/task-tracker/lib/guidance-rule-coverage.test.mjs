// @story #1676

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { resolveDocumentationReference } from '../../../../../guidance/documentation.mjs';
import { parseGuidanceSource } from '../../../../../guidance/parse.mjs';
import { validateGuidance } from '../../../../../guidance/validate.mjs';
import { GUIDANCE_PACKAGE_ROOT } from '../../../helpers/guidance-fixtures.mjs';

const ROOT = GUIDANCE_PACKAGE_ROOT;
const MAP_PATH = 'scripts/tests/fixtures/1558/rule-guidance-map.json';
const CATALOG_PATH = 'instructions/aitm-guidance.yml';
const REQUIRED_OBLIGATIONS = Object.freeze([
  'session.timer',
  'session.pause',
  'session.preferences',
  'session.compaction',
  'binding.identity',
  'binding.drift',
  'pickup.deep-dive',
  'pickup.per-ac',
  'state.contiguous',
  'state.exceptions',
  'state.plan-approval',
  'test.exact-receipt',
  'review.reuse',
  'review.approval',
  'delivery.envelope',
  'delivery.no-shell',
  'delivery.reconcile',
  'close.approval',
  'close.dirty',
  'commit.trace',
]);

function readTracked(relativePath) {
  assert.equal(path.isAbsolute(relativePath), false, relativePath);
  assert.equal(relativePath.includes('..'), false, relativePath);
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function coverageErrors(map, entries) {
  const errors = [];
  const ids = new Set();
  for (const row of map.rows ?? []) {
    if (ids.has(row.id)) errors.push(`duplicate-row:${row.id}`);
    ids.add(row.id);
    if (
      !row.sourcePath ||
      !row.sourceAnchor ||
      !readTracked(row.sourcePath).includes(row.sourceAnchor)
    ) {
      errors.push(`source-clause:${row.id}`);
    }
    if (Boolean(row.enforcementPath) === Boolean(row.retainedProtocolRule)) {
      errors.push(`authority-kind:${row.id}`);
    } else if (row.enforcementPath) {
      readTracked(row.enforcementPath);
    } else if (!readTracked(row.retainedProtocolRule).includes(row.protocolAnchor ?? '')) {
      errors.push(`retained-protocol:${row.id}`);
    }
    const entry = entries.find(({ id }) => id === row.guidanceId);
    if (!entry) {
      errors.push(`catalog-entry:${row.id}`);
      continue;
    }
    if (row.actionId && !entry.binds?.action_ids?.includes(row.actionId)) {
      errors.push(`action-binding:${row.id}`);
    }
    if (row.guardId && !entry.binds?.guard_ids?.includes(row.guardId)) {
      errors.push(`guard-binding:${row.id}`);
    }
    const human = entry.human ?? {};
    for (const field of ['summary', 'explanation']) {
      if (!human[field]?.trim()) errors.push(`human-${field}:${row.id}`);
    }
    for (const field of ['triggered_when', 'execution', 'examples', 'documentation']) {
      if (!Array.isArray(human[field]) || human[field].length === 0) {
        errors.push(`human-${field}:${row.id}`);
      }
    }
    if (
      !human.documentation?.some(
        (ref) => ref.path === row.documentation.path && ref.anchor === row.documentation.anchor
      )
    ) {
      errors.push(`catalog-documentation:${row.id}`);
    }
    const resolved = resolveDocumentationReference(row.documentation, { packageRoot: ROOT });
    if (!resolved.ok) errors.push(`documentation-anchor:${row.id}`);
  }
  for (const id of REQUIRED_OBLIGATIONS) {
    if (!ids.has(id)) errors.push(`unmapped-obligation:${id}`);
  }
  return errors;
}

const map = JSON.parse(readTracked(MAP_PATH));
const source = readTracked(CATALOG_PATH);
const parsed = parseGuidanceSource(source);
assert.deepEqual(parsed.diagnostics, []);
const entries = parsed.value.entries;

test('each migrating obligation has source, authority, catalog binding, and shipped human guidance', () => {
  assert.equal(map.schema, 'aitm.rule-guidance-map/v1');
  assert.deepEqual(coverageErrors(map, entries), []);
  assert.equal(validateGuidance({ source, packageRoot: ROOT }).valid, true);
});

test('coverage rejects a deleted row rather than trusting the remaining map', () => {
  const missing = { ...map, rows: map.rows.filter(({ id }) => id !== 'delivery.envelope') };
  assert.ok(coverageErrors(missing, entries).includes('unmapped-obligation:delivery.envelope'));
});

test('coverage rejects a removed catalog entry and an erased action binding', () => {
  assert.ok(
    coverageErrors(
      map,
      entries.filter(({ id }) => id !== 'action.bind')
    ).includes('catalog-entry:binding.identity')
  );
  const changed = structuredClone(entries);
  changed.find(({ id }) => id === 'action.deliver').binds.action_ids = [];
  assert.ok(coverageErrors(map, changed).includes('action-binding:delivery.envelope'));
});

test('coverage rejects a broken shipped-document anchor', () => {
  const changed = structuredClone(map);
  changed.rows.find(({ id }) => id === 'delivery.envelope').documentation.anchor = 'does-not-exist';
  assert.ok(coverageErrors(changed, entries).includes('documentation-anchor:delivery.envelope'));
});
