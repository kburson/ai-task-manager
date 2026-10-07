// @story #1855
// Actual bounded scanner/count data only; no stage execution or fixture authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import * as scanner from '../../../../task-tracker/lib/jsonl-line-scanner.mjs';
import * as counter from '../../../../task-tracker/word-counter.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const message = text => JSON.stringify({ type: 'response_item', payload: {
  type: 'message', role: 'user', content: [{ type: 'input_text', text }],
} });
function fixture(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'native-word-source-'));
  try { return fn(path.join(dir, 'transcript.jsonl')); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('scanner source digest covers original consumed bytes across decoder and malformed line boundaries', () => fixture(file => {
  assert.equal(typeof scanner.scanJsonlRecordsWithSource, 'function');
  const bytes = Buffer.from('\n{"value":"split-🙂-utf8"}\r\n{ malformed json\n\n{"value":"tail"}');
  writeFileSync(file, bytes);
  const records = [], malformed = [];
  const result = scanner.scanJsonlRecordsWithSource(file, { chunkSize: 1,
    onRecord: (record, line) => records.push({ record, line }),
    onMalformed: (raw, line) => malformed.push({ raw, line }),
  });
  assert.deepEqual(result, { totalLines: 3, byteLength: bytes.length, sha256: digest(bytes) });
  assert.deepEqual(records, [{ record: { value: 'split-🙂-utf8' }, line: 0 }, { record: { value: 'tail' }, line: 2 }]);
  assert.deepEqual(malformed, [{ raw: '{ malformed json', line: 1 }]);
  assert.equal(scanner.scanJsonlRecords(file), 3, 'ordinary numeric scanner contract remains');
}));

test('scanner source is the stream actually consumed rather than a later whole-file reread', () => fixture(file => {
  assert.equal(typeof scanner.scanJsonlRecordsWithSource, 'function');
  const original = Buffer.from('{"original":true}');
  writeFileSync(file, original);
  // Tail visit occurs after the actual EOF read. A subsequent whole-file read
  // would wrongly include these later bytes that were never decoded or counted.
  const result = scanner.scanJsonlRecordsWithSource(file, { onRecord() { appendFileSync(file, '\n{"later":true}\n'); } });
  assert.deepEqual(result, { totalLines: 1, byteLength: original.length, sha256: digest(original) });
  const later = scanner.scanJsonlRecordsWithSource(file);
  assert.equal(later.totalLines, 2);
  assert.ok(later.byteLength > result.byteLength);
  assert.notEqual(later.sha256, result.sha256);
}));

test('native word count capture is attached only to its exact result and preserves the original consumed prefix', () => fixture(file => {
  assert.equal(typeof counter.readWordCountSourceData, 'function');
  const original = Buffer.from(message('prior words') + '\n' + message('current three words') + '\n');
  writeFileSync(file, original);
  const result = counter.countWords(file, 1, { provider: 'codex', sid: 'native-source-fixture' });
  assert.deepEqual(result, { count: 3, totalLines: 2, fullExpansion: 3, status: 'ok', diagnosticCode: null });
  const capture = counter.readWordCountSourceData(result);
  assert.deepEqual(capture, { path: file, provider: 'codex', sid: 'native-source-fixture', fromLine: 1,
    byteLength: original.length, sha256: digest(original), totalLines: 2, status: 'ok', count: 3, fullExpansion: 3 });
  assert.ok(Object.isFrozen(capture));
  assert.equal(counter.readWordCountSourceData({ ...result }), null);
  assert.equal(counter.readWordCountSourceData(null), null);
  appendFileSync(file, message('later append') + '\n');
  assert.deepEqual(counter.readWordCountSourceData(result), capture);
  assert.equal(counter.countWords(file, 2, { provider: 'codex', sid: 'native-source-fixture' }).count, 2);
}));


test('unavailable and missing word sources never gain complete passive capture', () => fixture(file => {
  const diagnostics = [];
  for (const options of [{}, { provider: 'codex', sid: 'missing-source', onDiagnostic: d => diagnostics.push(d) },
    { provider: 'codex', sid: 'default-session', onDiagnostic: d => diagnostics.push(d) }]) {
    assert.equal(counter.readWordCountSourceData(counter.countWords(file, 0, options)), null);
  }
  writeFileSync(file, '{"not":"a supported codex event"}\n');
  const unrecognized = counter.countWords(file, 0, { provider: 'codex', sid: 'unknown-schema', onDiagnostic: d => diagnostics.push(d) });
  assert.equal(unrecognized.status, 'unavailable');
  assert.equal(unrecognized.diagnosticCode, 'codex-schema-unrecognized');
  assert.equal(counter.readWordCountSourceData(unrecognized), null);
  assert.equal(diagnostics.length, 3);
}));

test('source scanner preserves ordinary validation callback receiver and thrown error behavior', () => fixture(file => {
  writeFileSync(file, '{"value":1}\n{ malformed\n');
  for (const scan of [scanner.scanJsonlRecords, scanner.scanJsonlRecordsWithSource]) {
    assert.throws(() => scan(file, { chunkSize: 0 }), RangeError);
    assert.throws(() => scan(file, { onRecord: null }), TypeError);
    assert.throws(() => scan(file, null), TypeError);
    const calls = [], failure = new Error('original callback failure');
    assert.throws(() => scan(file, {
      onRecord(record, line) { assert.equal(this, undefined); calls.push([record, line]); },
      onMalformed(raw, line) { assert.equal(this, undefined); calls.push([raw, line]); throw failure; },
    }), error => error === failure);
    assert.deepEqual(calls, [[{ value: 1 }, 0], ['{ malformed', 1]]);
    assert.throws(() => scan(file + '.missing'), { code: 'ENOENT' });
  }
}));

test('source digest includes later bytes when the original scanner actually consumes them', () => fixture(file => {
  const original = '{"first":true}\n', appended = '{"second":true}\n';
  writeFileSync(file, original);
  const seen = [];
  const result = scanner.scanJsonlRecordsWithSource(file, { chunkSize: 1, onRecord(record) {
    seen.push(record);
    if (record.first) appendFileSync(file, appended);
  } });
  assert.deepEqual(seen, [{ first: true }, { second: true }]);
  assert.deepEqual(result, { totalLines: 2, byteLength: Buffer.byteLength(original + appended), sha256: digest(original + appended) });
}));
