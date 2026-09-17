// @story #1653
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'espree';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
const actionPath = path.join(fixtureRoot, 'action-observation-inventory.json');
const flagPath = path.join(fixtureRoot, 'behavioral-flags.json');
const authorityPath = path.join(fixtureRoot, 'authority-baseline.json');
const ACTION_IDS = Object.freeze([
  'bind',
  'resume',
  'promote',
  'test',
  'review',
  'deliver',
  'close',
]);
const PRODUCTION_ROOTS = Object.freeze(['scripts/task-tracker', 'scripts/gh', 'bin']);

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function loadJson(file) {
  assert.equal(
    existsSync(file),
    true,
    `missing inventory fixture: ${path.relative(projectRoot, file)}`
  );
  return JSON.parse(readFileSync(file, 'utf8'));
}

function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object') return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, node);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit, node);
    }
  }
}

function isProcessEnv(node) {
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'process' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'env'
  );
}

function memberName(node, constants = new Map()) {
  if (node?.type !== 'MemberExpression') return null;
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  if (node.computed && node.property?.type === 'Literal') return String(node.property.value);
  if (node.computed && node.property?.type === 'Identifier') {
    return constants.get(node.property.name) ?? null;
  }
  return null;
}

function isWriteOnly(node, parent) {
  return (
    (parent?.type === 'AssignmentExpression' && parent.left === node) ||
    (parent?.type === 'UnaryExpression' && parent.operator === 'delete') ||
    parent?.type === 'UpdateExpression'
  );
}

function collectEnvironmentReads() {
  const reads = new Set();
  for (const root of PRODUCTION_ROOTS) {
    const files = [];
    const pending = [path.join(projectRoot, root)];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory() && entry.name !== 'tests') pending.push(absolute);
        if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(absolute);
      }
    }

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true });
      const aliases = new Set(['env']);
      const constants = new Map();
      walk(ast, (node) => {
        if (
          node.type === 'VariableDeclarator' &&
          node.id?.type === 'Identifier' &&
          node.init?.type === 'Literal' &&
          /^(?:TT|AITM)_[A-Z0-9_]+$/.test(String(node.init.value))
        ) {
          constants.set(node.id.name, String(node.init.value));
        }
      });
      let changed = true;
      while (changed) {
        changed = false;
        walk(ast, (node) => {
          if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier') return;
          const initializer = node.init?.type === 'LogicalExpression' ? node.init.right : node.init;
          const isAlias =
            isProcessEnv(initializer) ||
            (initializer?.type === 'Identifier' && aliases.has(initializer.name));
          if (isAlias && !aliases.has(node.id.name)) {
            aliases.add(node.id.name);
            changed = true;
          }
        });
      }
      walk(ast, (node, parent) => {
        if (
          node.type === 'VariableDeclarator' &&
          node.id?.type === 'ObjectPattern' &&
          (isProcessEnv(node.init) ||
            (node.init?.type === 'Identifier' && aliases.has(node.init.name)))
        ) {
          for (const property of node.id.properties) {
            const flag = property.key?.name ?? property.key?.value;
            if (/^(?:TT|AITM)_[A-Z0-9_]+$/.test(flag || '')) {
              reads.add(`${path.relative(projectRoot, file)}::${flag}`);
            }
          }
        }
        if (node.type !== 'MemberExpression' || isWriteOnly(node, parent)) return;
        const flag = memberName(node, constants);
        if (!/^(?:TT|AITM)_[A-Z0-9_]+$/.test(flag || '')) return;
        if (
          !isProcessEnv(node.object) &&
          !(node.object?.type === 'Identifier' && aliases.has(node.object.name))
        ) {
          return;
        }
        reads.add(`${path.relative(projectRoot, file)}::${flag}`);
      });
    }
  }
  return [...reads].sort();
}

function validateSource(source) {
  assert.equal(typeof source.path, 'string');
  assert.equal(typeof source.symbol, 'string');
  assert.equal(typeof source.excerpt, 'string');
  assert.match(source.fingerprint, /^sha256:[0-9a-f]{64}$/);
  const text = readFileSync(path.join(projectRoot, source.path), 'utf8');
  assert.equal(
    text.includes(source.excerpt),
    true,
    `${source.path}:${source.symbol} excerpt changed`
  );
  assert.equal(
    source.fingerprint,
    digest(source.excerpt),
    `${source.path}:${source.symbol} fingerprint changed`
  );
}

function validateActions(inventory, authorities) {
  assert.equal(inventory.schema, 'aitm.guidance-legacy-action-observation-inventory/v1');
  assert.deepEqual(inventory.actions.map(({ id }) => id).sort(), [...ACTION_IDS].sort());
  const authorityIds = new Set(authorities.resources.map(({ id }) => id));
  for (const action of inventory.actions) {
    assert.ok(action.observations.length > 0, `${action.id} has no observations`);
    for (const observation of action.observations) {
      validateSource(observation.source);
      assert.ok(
        ['pure', 'read-only-network', 'ref-mutating', 'effectful'].includes(observation.helperClass)
      );
      assert.ok(observation.predicates.length > 0, `${observation.id} has no predicates`);
      assert.ok(observation.firstEffects.length > 0, `${observation.id} has no first effects`);
      for (const resource of observation.resources) {
        assert.equal(
          authorityIds.has(resource),
          true,
          `${observation.id} references unknown ${resource}`
        );
      }
      for (const key of ['refusals', 'warnings', 'humanObligations', 'locks']) {
        assert.ok(Array.isArray(observation[key]), `${observation.id}.${key} must be an array`);
      }
    }
  }
}

function validateFlags(inventory) {
  assert.equal(inventory.schema, 'aitm.guidance-legacy-behavioral-flags/v1');
  const seen = new Set();
  const coveredReads = new Set();
  for (const row of inventory.flags) {
    assert.match(row.flag, /^(?:TT|AITM)_[A-Z0-9_]+$/);
    assert.equal(seen.has(row.flag), false, `duplicate flag row: ${row.flag}`);
    seen.add(row.flag);
    assert.ok(row.reads.length > 0, `${row.flag} has no source reads`);
    for (const read of row.reads) {
      validateSource(read);
      coveredReads.add(`${read.path}::${row.flag}`);
    }
    assert.equal(typeof row.defaultBehavior, 'string');
    assert.equal(typeof row.nondefaultBehavior, 'string');
    assert.equal(typeof row.changes.predicate, 'boolean');
    assert.equal(typeof row.changes.effect, 'boolean');
    assert.ok(
      ['operator-control', 'test-fixture', 'fault-fixture', 'internal-protocol'].includes(
        row.purpose
      )
    );
    assert.ok(['retain', 'relocate', 'retire'].includes(row.disposition));
    assert.equal(typeof row.rationale, 'string');
    assert.equal(typeof row.ownerTask, 'string');
    assert.equal(typeof row.verifier, 'string');
  }
  for (const discovered of collectEnvironmentReads()) {
    assert.equal(coveredReads.has(discovered), true, `unclassified behavioral read: ${discovered}`);
  }
}

test('legacy guidance inventory freezes all seven actions, authority resources, and behavioral reads', () => {
  const actions = loadJson(actionPath);
  const flags = loadJson(flagPath);
  const authorities = loadJson(authorityPath);
  assert.equal(authorities.schema, 'aitm.guidance-legacy-authority-baseline/v1');
  assert.ok(authorities.resources.length > 0);
  validateActions(actions, authorities);
  validateFlags(flags);
});

test('inventory completeness rejects a removed action observation or behavioral flag row', () => {
  const actions = structuredClone(loadJson(actionPath));
  const flags = structuredClone(loadJson(flagPath));
  const authorities = loadJson(authorityPath);
  actions.actions.find(({ id }) => id === 'promote').observations.length = 0;
  assert.throws(() => validateActions(actions, authorities), /promote has no observations/);
  flags.flags.splice(0, 1);
  assert.throws(() => validateFlags(flags));
});
