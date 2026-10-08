// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import * as fields from '../../../../task-tracker/project-fields.mjs';

test('native event field loader shares actual local and fallback selection with original source data', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-native-fields-'));
  try {
    const directory = path.join(root, '.ai-task-manager');
    mkdirSync(directory);
    const file = path.join(directory, 'project-field-events.json');
    const fallback = new URL(
      '../../../../../config/project-field-events.default.json',
      import.meta.url
    );
    const defaults = JSON.parse(readFileSync(fallback, 'utf8'));
    const absent = fields.loadProjectFieldEvents(root);
    assert.deepEqual(absent, defaults);
    const absentSource = fields.readProjectFieldSourceData(absent);
    assert.equal(absentSource.kind, 'events');
    assert.equal(absentSource.directory, root);
    assert.deepEqual(absentSource.reads[0], {
      path: file,
      exists: false,
      bytes: null,
      error: null,
    });
    assert.equal(absentSource.reads[1].bytes, readFileSync(fallback, 'utf8'));
    const bytes = '{"moveToTest":[{"fieldKey":"startTime","mode":7}]}\n';
    writeFileSync(file, bytes);
    const selected = fields.loadProjectFieldEvents(root);
    assert.deepEqual(selected, { moveToTest: [{ fieldKey: 'startTime', mode: 7 }] });
    const original = fields.readProjectFieldSourceData(selected);
    assert.deepEqual(original.reads, [{ path: file, exists: true, bytes, error: null }]);
    assert.equal(fields.readProjectFieldSourceData(structuredClone(selected)), null);
    assert.ok(Object.isFrozen(original.reads[0]));
    selected.moveToTest.push({ fieldKey: 'estimate' });
    assert.equal(fields.readProjectFieldSourceData(selected).reads[0].bytes, bytes);
    writeFileSync(file, '{malformed');
    const recovered = fields.loadProjectFieldEvents(root);
    assert.deepEqual(recovered, defaults, 'ordinary malformed local still falls back');
    assert.equal(fields.readProjectFieldSourceData(recovered).reads[0].bytes, '{malformed');
    assert.equal(typeof fields.readProjectFieldSourceData(recovered).reads[0].error, 'string');
    writeFileSync(file, 'null');
    assert.equal(
      fields.loadProjectFieldEvents(root),
      null,
      'ordinary permissive parsed scalar remains unchanged'
    );
    assert.equal(fields.readProjectFieldSourceData(null), null);
    const defsFile = path.join(directory, 'project-fields.json');
    writeFileSync(defsFile, '[{"key":"estimate","type":"number"}]');
    const defs = fields.loadProjectFieldDefs(root);
    assert.deepEqual(defs, [{ key: 'estimate', type: 'number' }]);
    assert.equal(fields.readProjectFieldSourceData(defs).kind, 'definitions');
    assert.equal(fields.readProjectFieldSourceData(defs).reads[0].path, defsFile);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
