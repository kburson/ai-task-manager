#!/usr/bin/env node
// @story #1205
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { scanJsonlRecords } from '../../../lib/jsonl-line-scanner.mjs';

const targetBytes = 48 * 1024 * 1024;
const eventTimestamp = '2026-08-10T20:00:00.000Z';

function responseMessage(role, text) {
  return JSON.stringify({
    type: 'response_item',
    payload: { type: 'message', role, content: [{ type: 'input_text', text }] },
  });
}

function writeLargeTranscript(filePath) {
  const fd = openSync(filePath, 'w');
  const visible = `${responseMessage('user', 'visible reader words')}\n`;
  const activity = `${JSON.stringify({ type: 'user', timestamp: eventTimestamp })}\n`;
  const injected = `${responseMessage('user', `<environment_context> ${'x'.repeat(8 * 1024)}`)}\n`;
  let bytes = 0;
  let lines = 0;
  try {
    for (const chunk of [visible, activity]) {
      bytes += writeSync(fd, chunk);
      lines += 1;
    }
    while (bytes < targetBytes) {
      bytes += writeSync(fd, injected);
      lines += 1;
    }
  } finally {
    closeSync(fd);
  }
  return lines;
}

test('shared lifecycle transcript readers retain bounded memory and exact JSONL semantics', () => {
  const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-bounded-'));
  const transcriptPath = path.join(tmp, 'large-codex.jsonl');

  try {
    const boundaryPath = path.join(tmp, 'boundaries.jsonl');
    writeFileSync(
      boundaryPath,
      `\n${JSON.stringify({ value: 'split-🙂-utf8' })}\r\n{ malformed json\n\n${JSON.stringify({ value: 'unterminated-tail' })}`,
      'utf8'
    );
    const records = [];
    const malformed = [];
    const totalLines = scanJsonlRecords(boundaryPath, {
      chunkSize: 1,
      onRecord: (record, line) => records.push({ record, line }),
      onMalformed: (raw, line) => malformed.push({ raw, line }),
    });
    assert.equal(totalLines, 3, 'only non-empty physical lines advance the JSONL cursor');
    assert.deepEqual(records, [
      { record: { value: 'split-🙂-utf8' }, line: 0 },
      { record: { value: 'unterminated-tail' }, line: 2 },
    ]);
    assert.deepEqual(malformed, [{ raw: '{ malformed json', line: 1 }]);

    const expectedLines = writeLargeTranscript(transcriptPath);
    const wordCounterUrl = pathToFileURL(
      path.resolve('scripts/task-tracker/word-counter.mjs')
    ).href;
    const activeTimeUrl = pathToFileURL(path.resolve('scripts/task-tracker/active-time.mjs')).href;
    const childScript = `
      const { countWords } = await import(${JSON.stringify(wordCounterUrl)});
      const { collectEventTimestamps } = await import(${JSON.stringify(activeTimeUrl)});
      const filePath = process.argv[1];
      const words = countWords(filePath, 0, { provider: 'codex', sid: 'large-session' });
      const events = collectEventTimestamps(filePath, 0, Number.MAX_SAFE_INTEGER);
      console.log(JSON.stringify({ words, events }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--max-old-space-size=32', '--input-type=module', '-e', childScript, transcriptPath],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60_000 }
    );

    assert.equal(
      child.status,
      0,
      `shared transcript readers must complete with a 32 MiB heap; signal=${child.signal || 'none'}\n${child.stderr.slice(-2000)}`
    );
    const result = JSON.parse(child.stdout.trim());
    assert.deepEqual(result.words, {
      count: 3,
      totalLines: expectedLines,
      fullExpansion: 3,
      status: 'ok',
      diagnosticCode: null,
    });
    assert.deepEqual(result.events, [Date.parse(eventTimestamp)]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
