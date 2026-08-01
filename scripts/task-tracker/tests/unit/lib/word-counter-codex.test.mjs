#!/usr/bin/env node
// @story #1092
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { countWords } from '../../../word-counter.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-codex-'));

function responseMessage(role, content) {
  return { type: 'response_item', payload: { type: 'message', role, content } };
}

function writeJsonl(name, records, trailing = []) {
  const filePath = path.join(tmp, name);
  writeFileSync(filePath, [...records.map(JSON.stringify), ...trailing].join('\n') + '\n');
  return filePath;
}

try {
  const prosePath = writeJsonl(
    'prose.jsonl',
    [
      responseMessage('user', [{ type: 'input_text', text: 'real user words' }]),
      responseMessage('assistant', [{ type: 'output_text', text: 'visible answer' }]),
      responseMessage('developer', [{ type: 'input_text', text: 'hidden developer words' }]),
      responseMessage('user', [
        { type: 'input_text', text: '<recommended_plugins> hidden plugin catalog words' },
      ]),
      responseMessage('user', [
        { type: 'input_text', text: '# AGENTS.md instructions hidden workspace policy words' },
      ]),
      responseMessage('user', [
        { type: 'input_text', text: '<environment_context> hidden environment words' },
      ]),
      { type: 'event_msg', payload: { type: 'agent_message', message: 'visible answer' } },
      { type: 'response_item', payload: { type: 'reasoning', summary: ['private thought'] } },
    ],
    ['{ malformed json']
  );

  const prose = countWords(prosePath);
  assert.equal(prose.count, 5, 'Codex counts visible user and assistant prose exactly once');
  assert.equal(prose.fullExpansion, 5, 'excluded records stay out of every tier');
  assert.equal(prose.totalLines, 9, 'cursor includes malformed physical JSONL lines');
  const available = countWords(prosePath, 0, { provider: 'codex', sid: 'thread-prose' });
  assert.equal(available.status, 'ok');
  assert.equal(available.diagnosticCode, null);

  const toolsPath = writeJsonl('tools.jsonl', [
    responseMessage('assistant', [{ type: 'output_text', text: 'working now' }]),
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'custom-1',
        input: 'run the focused tests',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'custom-1',
        output: [{ type: 'input_text', text: 'all tests passed' }],
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'Read',
        call_id: 'function-1',
        arguments: JSON.stringify({ file_path: '/tmp/a file' }),
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'function-1',
        output: [{ type: 'input_text', text: 'file output here' }],
      },
    },
  ]);

  const tools = countWords(toolsPath);
  assert.equal(tools.count, 6, 'stay-abreast counts prose and compact Codex tool chips');
  assert.equal(tools.fullExpansion, 18, 'full expansion adds Codex tool inputs and outputs');

  const malformedToolPath = writeJsonl('malformed-tool.jsonl', [
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'wait',
        call_id: 'function-bad',
        arguments: '{bad json',
      },
    },
  ]);
  assert.doesNotThrow(() => countWords(malformedToolPath), 'malformed tool JSON is best effort');

  const cursorPath = writeJsonl('cursor.jsonl', [
    responseMessage('user', [{ type: 'input_text', text: 'first user words' }]),
    responseMessage('assistant', [{ type: 'output_text', text: 'later answer' }]),
  ]);
  assert.equal(countWords(cursorPath, 1).count, 2, 'fromLine skips prior Codex records');

  const diagnostics = [];
  const onDiagnostic = (line) => diagnostics.push(line);
  const noSession = countWords('', 0, { provider: 'codex', sid: '', onDiagnostic });
  assert.equal(noSession.status, 'unavailable');
  assert.equal(noSession.diagnosticCode, 'codex-session-unresolved');

  const noTranscript = countWords('', 0, {
    provider: 'codex',
    sid: 'thread-no-transcript',
    onDiagnostic,
  });
  assert.equal(noTranscript.status, 'unavailable');
  assert.equal(noTranscript.diagnosticCode, 'codex-transcript-unresolved');

  const unknownPath = writeJsonl('unknown-schema.jsonl', [
    { type: 'session_meta', payload: { id: 'thread-unknown-schema' } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'mirror only' } },
  ]);
  const noSchema = countWords(unknownPath, 0, {
    provider: 'codex',
    sid: 'thread-unknown-schema',
    onDiagnostic,
  });
  assert.equal(noSchema.status, 'unavailable');
  assert.equal(noSchema.diagnosticCode, 'codex-schema-unrecognized');

  countWords(unknownPath, 0, {
    provider: 'codex',
    sid: 'thread-unknown-schema',
    onDiagnostic,
  });
  assert.deepEqual(
    diagnostics,
    [
      '⚠ [aitm:word-measurement] codex-session-unresolved sid=',
      '⚠ [aitm:word-measurement] codex-transcript-unresolved sid=thread-no-transcript',
      '⚠ [aitm:word-measurement] codex-schema-unrecognized sid=thread-unknown-schema',
    ],
    'Codex diagnostics are structured, distinct, and deduplicated'
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('word-counter-codex.test.mjs: all passed');
