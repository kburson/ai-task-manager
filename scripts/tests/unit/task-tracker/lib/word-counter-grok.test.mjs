#!/usr/bin/env node
// @story #1324

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { normalizeTranscriptRecord } from '../../../../providers/transcript-normalizer.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { countWords, jsonlPath } from '../../../../task-tracker/word-counter.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-grok-'));
const sid = 'grok-session-1';

try {
  assert.deepEqual(normalizeTranscriptRecord({ type: 'user', content: 'one two' }), {
    events: [{ kind: 'text', text: 'one two' }],
    recognized: true,
    schema: 'grok-chat-v1',
  });
  assert.deepEqual(
    normalizeTranscriptRecord({
      type: 'assistant',
      content: [{ type: 'text', text: 'three four' }],
      tool_calls: [
        { name: 'Bash', arguments: { description: 'Checked status', command: 'git status' } },
      ],
    }),
    {
      events: [
        { kind: 'text', text: 'three four' },
        {
          kind: 'tool-call',
          name: 'Bash',
          chip: 'Checked status',
          input: { description: 'Checked status', command: 'git status' },
        },
      ],
      recognized: true,
      schema: 'grok-chat-v1',
    }
  );
  assert.deepEqual(normalizeTranscriptRecord({ type: 'tool_result', content: 'done now' }), {
    events: [{ kind: 'tool-result', text: 'done now' }],
    recognized: true,
    schema: 'grok-chat-v1',
  });
  for (const type of ['reasoning', 'system']) {
    assert.deepEqual(normalizeTranscriptRecord({ type, encrypted_content: 'never count me' }), {
      events: [],
      recognized: true,
      schema: 'grok-chat-v1',
    });
  }
  assert.deepEqual(normalizeTranscriptRecord({ type: 'unknown', content: 'ignore me' }), {
    events: [],
    recognized: false,
    schema: null,
  });
  assert.deepEqual(normalizeTranscriptRecord(null), {
    events: [],
    recognized: false,
    schema: null,
  });

  const transcript = path.join(tmp, 'chat_history.jsonl');
  writeFileSync(
    transcript,
    [
      { type: 'user', content: 'one two' },
      {
        type: 'assistant',
        content: [{ type: 'text', text: 'three four' }],
        tool_calls: [
          { name: 'Bash', arguments: { description: 'Checked status', command: 'git status' } },
        ],
      },
      { type: 'tool_result', content: 'done now' },
      { type: 'reasoning', encrypted_content: 'private words' },
      { type: 'system', content: 'system words' },
    ]
      .map(JSON.stringify)
      .join('\n') + '\n',
    'utf8'
  );
  assert.deepEqual(countWords(transcript, 0, { provider: 'grok', sid }), {
    count: 6,
    totalLines: 5,
    fullExpansion: 12,
    status: 'ok',
    diagnosticCode: null,
  });

  const cwd = path.join(tmp, 'Project With Spaces');
  const grokHome = path.join(tmp, 'grok-home');
  const nativeTranscript = path.join(
    grokHome,
    'sessions',
    encodeURIComponent(cwd),
    sid,
    'chat_history.jsonl'
  );
  mkdirSync(path.dirname(nativeTranscript), { recursive: true });
  writeFileSync(nativeTranscript, '{"type":"user","content":"native words"}\n', 'utf8');
  const prior = {
    app: process.env.AI_TASK_MANAGER_APP_NAME,
    project: process.env.AI_TASK_MANAGER_PROJECT_DIR,
    home: process.env.GROK_HOME,
  };
  try {
    process.env.AI_TASK_MANAGER_APP_NAME = 'grok';
    process.env.AI_TASK_MANAGER_PROJECT_DIR = cwd;
    process.env.GROK_HOME = grokHome;
    assert.equal(jsonlPath(sid), nativeTranscript);
  } finally {
    if (prior.app === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
    else process.env.AI_TASK_MANAGER_APP_NAME = prior.app;
    if (prior.project === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = prior.project;
    if (prior.home === undefined) delete process.env.GROK_HOME;
    else process.env.GROK_HOME = prior.home;
  }

  assert.deepEqual(countWords('', 0, { provider: 'grok', sid }), {
    count: 0,
    totalLines: 0,
    fullExpansion: 0,
    status: 'ok',
    diagnosticCode: null,
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('word-counter-grok.test.mjs: all passed');
