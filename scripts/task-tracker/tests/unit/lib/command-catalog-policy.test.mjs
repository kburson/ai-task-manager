// @story #1011
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMAND_MANIFEST } from '../../../command-manifest.mjs';
import { COMMAND_CATALOG, commandByName } from '../../../lib/command-surface/catalog.mjs';
import { REQUIRED_HELP_FIELDS, validateHelpRecord } from '../../../lib/command-surface/schema.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../lib/command-surface/entrypoints.mjs';

const HELP_REQUIRED = new Set([
  'agent-callable-verb',
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
]);

test('every catalog record satisfies the normalized public help schema', () => {
  assert.ok(COMMAND_CATALOG.length > 0);
  for (const record of COMMAND_CATALOG) {
    assert.deepEqual(validateHelpRecord(record), [], record.name);
    for (const field of REQUIRED_HELP_FIELDS) {
      assert.ok(Object.hasOwn(record, field), `${record.name}: ${field}`);
    }
    assert.equal(Object.isFrozen(record), true, record.name);
  }
});

test('catalog names and aliases are globally unique and resolve canonically', () => {
  const seen = new Set();
  for (const record of COMMAND_CATALOG) {
    for (const name of [record.name, ...record.aliases]) {
      assert.equal(seen.has(name), false, `duplicate command or alias: ${name}`);
      seen.add(name);
      assert.equal(commandByName(name), record, name);
    }
  }
});

test('every help-required shipped entry point resolves to a catalog record', () => {
  for (const entry of EXECUTABLE_ENTRYPOINTS.filter((row) =>
    HELP_REQUIRED.has(row.classification)
  )) {
    const record = COMMAND_CATALOG.find((row) => row.path === entry.path);
    assert.ok(record, entry.path);
    assert.equal(record.classification, entry.classification, entry.path);
    if (entry.command) assert.equal(commandByName(entry.command), record, entry.command);
  }
});

test('every routed verb is represented in the aggregate agent catalog', () => {
  for (const entry of COMMAND_MANIFEST) {
    const record = commandByName(entry.verb);
    assert.ok(record, entry.verb);
    assert.equal(record.agentCallable, true, entry.verb);
    for (const alias of entry.aliases) assert.equal(commandByName(alias), record, alias);
  }
});
