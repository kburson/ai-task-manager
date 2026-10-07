// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as words from '../../../../task-tracker/word-counter.mjs';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';

test('recorded actor cursor validates actual native sticky bytes without returning a writer or record', () => {
  const s = createSandbox();
  try {
    const file = path.join(s.context.sourceRoot, 'cursor.json');
    const identity = { provider: 'codex', sid: 'native-cursor-fixture' };
    const beforeBytes = JSON.stringify({ legacyNote: 'keep', wordCount: { line: 2, words: 4, sticky: 'retain' } });
    fs.writeFileSync(file, beforeBytes);
    assert.equal(words.saveMarker(file, 3, 8, '#1855', 12, { identity }), undefined, 'ordinary native call stays synchronous');
    const afterBytes = fs.readFileSync(file, 'utf8'), parsed = JSON.parse(afterBytes);
    assert.equal(parsed.legacyNote, 'keep'); assert.equal(parsed.wordCount.sticky, 'retain');
    assert.equal(parsed.wordCount.line, 3); assert.equal(parsed.wordCount.wordsFull, 12);
    const input = { beforeBytes, afterBytes, identity, line: 3, words: 8, wordsFull: 12, task: '#1855', ts: parsed.wordCount.ts };
    assert.equal(words.assertRecordedStageActorCursor(input), undefined);
    for (const change of [
      value => { value.afterBytes += ' '; },
      value => { value.line++; },
      value => { value.identity = { ...identity, sid: 'foreign' }; },
      value => { value.ready = true; },
      value => { value.beforeBytes = '{broken'; },
      value => { value.ts = 'not-time'; },
    ]) { const bad = structuredClone(input); change(bad); assert.throws(() => words.assertRecordedStageActorCursor(bad)); }
    assert.equal(fs.readFileSync(file, 'utf8'), afterBytes, 'historical data validation has no file effect');
  } finally { s.dispose(); }
});


import { withMemoryStageEffectQuarantine } from '../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';
for (const kind of ['empty', 'forged', 'copy', 'foreign']) test(`public memory cursor helper refuses ${kind} invocation before filesystem effect`, async () => {
  const s = createSandbox();
  try {
    const file = path.join(s.context.sourceRoot, 'cursor.json');
    fs.writeFileSync(file, 'original untouched fixture bytes');
    const base = { markerPath: file, statePath: path.join(s.context.sourceRoot, 'state.json'),
      identity: { provider: 'codex', sid: 'fixture' }, payload: { issue: '#1855', cursor: { after: { line: 2, words: 3, wordsFull: 4 } } } };
    const input = kind === 'empty' ? {} : kind === 'copy' ? structuredClone(base) : kind === 'foreign'
      ? { ...base, identity: { provider: 'codex', sid: 'foreign' } } : base;
    const capture = () => fs.readdirSync(s.context.sourceRoot, { recursive: true }).sort().map(name => {
      const target = path.join(s.context.sourceRoot, name);
      return [name, fs.statSync(target).isFile() ? fs.readFileSync(target).toString('hex') : 'directory'];
    });
    const before = capture();
    await assert.rejects(withMemoryStageEffectQuarantine(() => words.saveNativeStageActorMarker(input)),
      error => error.code === 'revision-authority-unavailable');
    assert.deepEqual(capture(), before);
    assert.throws(() => withMemoryStageEffectQuarantine(() => words.saveMarker(file, 2, 3)),
      error => error.code === 'revision-authority-unavailable');
    assert.deepEqual(capture(), before);
  } finally { s.dispose(); }
});
