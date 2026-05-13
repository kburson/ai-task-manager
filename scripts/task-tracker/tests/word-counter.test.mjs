#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  currentSessionId,
  countWords,
  loadMarker,
  projectKey,
  saveMarker,
} from '../word-counter.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-wc-'));
const jsonlPath = path.join(tmp, 'session.jsonl');
const markerPath = path.join(tmp, 'session.word-marker');

// Write a fake JSONL transcript
const lines = [
  JSON.stringify({ type: 'user', message: { content: 'hello world from user' } }), // 4 words
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'hi there friend' }] },
  }), // 3 words
  JSON.stringify({ type: 'tool_result', message: { content: 'ignored' } }), // not counted
  JSON.stringify({ type: 'user', message: { content: 'another message here' } }), // 3 words
];
writeFileSync(jsonlPath, lines.join('\n') + '\n');

// Test 1: count all from line 0
let result = countWords(jsonlPath, 0);
assert.equal(result.count, 10, 'should count 4+3+3 = 10 words');
assert.equal(result.totalLines, 4);

// Test 2: count from line 2
result = countWords(jsonlPath, 2);
assert.equal(result.count, 3, 'should only count last user message');

// Test 3: marker round-trip
saveMarker(markerPath, 5, 1000);
const m = loadMarker(markerPath);
assert.equal(m.line, 5);
assert.equal(m.words, 1000);

// Test 4: missing marker returns zeros
const m2 = loadMarker(path.join(tmp, 'nope.marker'));
assert.equal(m2.line, 0);
assert.equal(m2.words, 0);

// Test 5: injection filter — system-reminders, skill bodies, command tags, meta entries not counted
const injJsonl = path.join(tmp, 'inject.jsonl');
const injLines = [
  // Real user chat (4 words)
  JSON.stringify({ type: 'user', message: { content: 'please fix the bug' } }),
  // system-reminder string injection — must be excluded
  JSON.stringify({
    type: 'user',
    message: {
      content:
        '<system-reminder>\nyou have superpowers and many rules to follow here\n</system-reminder>',
    },
  }),
  // Skill body text block injection — must be excluded
  JSON.stringify({
    type: 'user',
    message: {
      content: [
        {
          type: 'text',
          text: 'Base directory for this skill: /path/to/skill\n\nLots of skill instructions here many words long',
        },
      ],
    },
  }),
  // Command-name tag — excluded
  JSON.stringify({
    type: 'user',
    message: { content: '<command-name>/task</command-name><command-args>status</command-args>' },
  }),
  // Local command stdout — excluded
  JSON.stringify({
    type: 'user',
    message: {
      content: '<local-command-stdout>tons of piped output words here</local-command-stdout>',
    },
  }),
  // Meta entry — excluded
  JSON.stringify({
    type: 'user',
    isMeta: true,
    message: { content: 'meta chatter should not count at all' },
  }),
  // Sidechain — excluded
  JSON.stringify({
    type: 'assistant',
    isSidechain: true,
    message: { content: [{ type: 'text', text: 'subagent output ignored' }] },
  }),
  // tool_use / tool_result blocks in a user message — excluded (not type:text)
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', content: 'search results many words' }] },
  }),
  // Real assistant text (3 words)
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'okay will do' }] },
  }),
];
writeFileSync(injJsonl, injLines.join('\n') + '\n');
const injResult = countWords(injJsonl, 0);
assert.equal(injResult.count, 7, `injection filter: expected 4+3=7 words, got ${injResult.count}`);

// Test 6: projectKey() cross-platform separator flattening (#14)
// Uses CLAUDE_PROJECT_DIR override so the test is identical on POSIX & Windows.
const origProjectDir = process.env.CLAUDE_PROJECT_DIR;
try {
  process.env.CLAUDE_PROJECT_DIR = '/Users/foo/bar';
  assert.equal(projectKey(), '-Users-foo-bar', 'POSIX path should flatten forward slashes');

  process.env.CLAUDE_PROJECT_DIR = 'C:\\Users\\foo\\bar';
  assert.equal(
    projectKey(),
    'C--Users-foo-bar',
    'Windows path should flatten backslashes and drive colon'
  );

  process.env.CLAUDE_PROJECT_DIR = 'C:\\Users/foo\\bar/baz';
  assert.equal(
    projectKey(),
    'C--Users-foo-bar-baz',
    'mixed separators should all flatten to single dashes'
  );
} finally {
  if (origProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = origProjectDir;
}

// Test 7: currentSessionId() — env-first with mtime fallback (#15)
// Redirect $HOME and $CLAUDE_PROJECT_DIR so sessionDir() points inside a tmp
// scratch tree we control, then exercise all three return paths.
const origHome = process.env.HOME;
const origUserprofile = process.env.USERPROFILE;
const origSid = process.env.CLAUDE_SESSION_ID;
const origProjectDir2 = process.env.CLAUDE_PROJECT_DIR;
const sidTmp = mkdtempSync(path.join(tmpdir(), 'tt-wc-sid-'));
try {
  process.env.HOME = sidTmp;
  process.env.USERPROFILE = sidTmp;
  process.env.CLAUDE_PROJECT_DIR = '/proj/test';
  const expectedKey = '-proj-test';
  const sessionDir = path.join(sidTmp, '.claude', 'projects', expectedKey);
  mkdirSync(sessionDir, { recursive: true });

  // Path 1: env var set → returns env value verbatim, mtime not consulted.
  process.env.CLAUDE_SESSION_ID = 'env-sid-xyz';
  assert.equal(
    currentSessionId(),
    'env-sid-xyz',
    'env var should win even when no jsonl files exist'
  );

  // Path 2: env unset, files present → newest mtime wins.
  delete process.env.CLAUDE_SESSION_ID;
  const oldFile = path.join(sessionDir, 'old-session.jsonl');
  const newFile = path.join(sessionDir, 'new-session.jsonl');
  writeFileSync(oldFile, '{}\n');
  writeFileSync(newFile, '{}\n');
  const oldT = new Date(Date.now() - 60_000);
  const newT = new Date();
  utimesSync(oldFile, oldT, oldT);
  utimesSync(newFile, newT, newT);
  assert.equal(currentSessionId(), 'new-session', 'newest mtime file should win when env unset');

  // Path 2b: empty env string treated as unset.
  process.env.CLAUDE_SESSION_ID = '';
  assert.equal(currentSessionId(), 'new-session', 'empty env string should fall back to mtime');
  delete process.env.CLAUDE_SESSION_ID;

  // Path 3: env unset, no files → null.
  rmSync(oldFile);
  rmSync(newFile);
  assert.equal(currentSessionId(), null, 'should return null when env unset and no jsonl files');
} finally {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  if (origUserprofile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = origUserprofile;
  if (origSid === undefined) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = origSid;
  if (origProjectDir2 === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = origProjectDir2;
  rmSync(sidTmp, { recursive: true, force: true });
}

rmSync(tmp, { recursive: true });
console.log('word-counter.test.mjs: all passed');
