#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countWords, loadMarker, saveMarker } from '../word-counter.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-wc-'));
const jsonlPath = path.join(tmp, 'session.jsonl');
const markerPath = path.join(tmp, 'session.word-marker');

// Write a fake JSONL transcript
const lines = [
  JSON.stringify({ type: 'user', message: { content: 'hello world from user' } }),          // 4 words
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi there friend' }] } }), // 3 words
  JSON.stringify({ type: 'tool_result', message: { content: 'ignored' } }),                  // not counted
  JSON.stringify({ type: 'user', message: { content: 'another message here' } }),            // 3 words
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
  JSON.stringify({ type: 'user', message: { content: '<system-reminder>\nyou have superpowers and many rules to follow here\n</system-reminder>' } }),
  // Skill body text block injection — must be excluded
  JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Base directory for this skill: /path/to/skill\n\nLots of skill instructions here many words long' }] } }),
  // Command-name tag — excluded
  JSON.stringify({ type: 'user', message: { content: '<command-name>/task</command-name><command-args>status</command-args>' } }),
  // Local command stdout — excluded
  JSON.stringify({ type: 'user', message: { content: '<local-command-stdout>tons of piped output words here</local-command-stdout>' } }),
  // Meta entry — excluded
  JSON.stringify({ type: 'user', isMeta: true, message: { content: 'meta chatter should not count at all' } }),
  // Sidechain — excluded
  JSON.stringify({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent output ignored' }] } }),
  // tool_use / tool_result blocks in a user message — excluded (not type:text)
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'search results many words' }] } }),
  // Real assistant text (3 words)
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'okay will do' }] } }),
];
writeFileSync(injJsonl, injLines.join('\n') + '\n');
const injResult = countWords(injJsonl, 0);
assert.equal(injResult.count, 7, `injection filter: expected 4+3=7 words, got ${injResult.count}`);

rmSync(tmp, { recursive: true });
console.log('word-counter.test.mjs: all passed');
