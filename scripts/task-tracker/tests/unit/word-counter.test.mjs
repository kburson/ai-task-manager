#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import {
  currentSessionId,
  countWords,
  jsonlPath,
  markerPathFor,
  loadMarker,
  projectKey,
  saveMarker,
} from '../../word-counter.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-'));
const sampleJsonlPath = path.join(tmp, 'session.jsonl');
const markerPath = path.join(tmp, 'session.json');

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
writeFileSync(sampleJsonlPath, lines.join('\n') + '\n');

// Test 1: count all from line 0
let result = countWords(sampleJsonlPath, 0);
assert.equal(result.count, 10, 'should count 4+3+3 = 10 words');
assert.equal(result.totalLines, 4);

// Test 2: count from line 2
result = countWords(sampleJsonlPath, 2);
assert.equal(result.count, 3, 'should only count last user message');

// Test 3: marker round-trip
saveMarker(markerPath, 5, 1000);
const m = loadMarker(markerPath);
assert.equal(m.line, 5);
assert.equal(m.words, 1000);
// #795 — a 3-arg save defaults the full-expansion cumulative to `words`.
assert.equal(m.wordsFull, 1000, 'wordsFull defaults to words for legacy 3-arg saveMarker');

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
const origAitmProjectDir6 = process.env.AI_TASK_MANAGER_PROJECT_DIR;
try {
  delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
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
  if (origAitmProjectDir6 === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  else process.env.AI_TASK_MANAGER_PROJECT_DIR = origAitmProjectDir6;
}

// Test 7: currentSessionId() — env-first with project-local mtime fallback (#15)
// Redirect project root so transcript lookup points inside a tmp scratch tree
// we control, then exercise all three return paths.
const origHome = process.env.HOME;
const origUserprofile = process.env.USERPROFILE;
const origSid = process.env.CLAUDE_SESSION_ID;
const origCodeSid = process.env.CLAUDE_CODE_SESSION_ID;
const origAitmSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const origAppName = process.env.AI_TASK_MANAGER_APP_NAME;
const origProjectDir2 = process.env.CLAUDE_PROJECT_DIR;
const origAitmProjectDir2 = process.env.AI_TASK_MANAGER_PROJECT_DIR;
const sidTmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-sid-'));
try {
  process.env.HOME = sidTmp;
  process.env.USERPROFILE = sidTmp;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = sidTmp;
  process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
  process.env.CLAUDE_PROJECT_DIR = '/ignored/claude/project';
  // #573: the codex provider stateDir moved to `.tmp/aitm/app/codex`.
  const sessionDir = path.join(sidTmp, '.tmp', 'aitm', 'app', 'codex', 'session-transcripts');
  mkdirSync(sessionDir, { recursive: true });

  // Path 1: env var set → returns env value verbatim, mtime not consulted.
  process.env.AI_TASK_MANAGER_SESSION_ID = 'env-sid-xyz';
  assert.equal(
    currentSessionId(),
    'env-sid-xyz',
    'env var should win even when no jsonl files exist'
  );

  // Path 2: env unset, files present → newest mtime wins.
  delete process.env.AI_TASK_MANAGER_SESSION_ID;
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.CLAUDE_CODE_SESSION_ID;
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
  process.env.AI_TASK_MANAGER_SESSION_ID = '';
  assert.equal(currentSessionId(), 'new-session', 'empty env string should fall back to mtime');
  delete process.env.AI_TASK_MANAGER_SESSION_ID;

  // Path 3: env unset, no files → fallback to 'default-session' (#273).
  // Pre-#273 this branch returned null and the writer at state.mjs used
  // 'default-session' anyway; the disagreement wedged sessions on bind.
  // Both writer and reader now go through the same resolver.
  rmSync(oldFile);
  rmSync(newFile);
  assert.equal(
    currentSessionId(),
    'default-session',
    "should fall back to 'default-session' (#273 — writer/reader convergence)"
  );
} finally {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  if (origUserprofile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = origUserprofile;
  if (origSid === undefined) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = origSid;
  if (origCodeSid === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
  else process.env.CLAUDE_CODE_SESSION_ID = origCodeSid;
  if (origAitmSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = origAitmSid;
  if (origAppName === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = origAppName;
  if (origProjectDir2 === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = origProjectDir2;
  if (origAitmProjectDir2 === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  else process.env.AI_TASK_MANAGER_PROJECT_DIR = origAitmProjectDir2;
  rmSync(sidTmp, { recursive: true, force: true });
}

// Test 8: session paths live under the project-local provider stateDir
// (`.tmp/aitm/app/codex` since #573), not ~/.claude.
const origAitmProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
const origClaudeProjectDir3 = process.env.CLAUDE_PROJECT_DIR;
const origAppName3 = process.env.AI_TASK_MANAGER_APP_NAME;
const origSid3 = process.env.CLAUDE_SESSION_ID;
const origCodeSid3 = process.env.CLAUDE_CODE_SESSION_ID;
const origAitmSid3 = process.env.AI_TASK_MANAGER_SESSION_ID;
const markerProject = mkdtempSync(path.join(projectScratchDir('test'), 'tt-wc-marker-project-'));
try {
  process.env.AI_TASK_MANAGER_PROJECT_DIR = markerProject;
  process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
  process.env.CLAUDE_PROJECT_DIR = '/ignored/claude/project';
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.CLAUDE_CODE_SESSION_ID;
  delete process.env.AI_TASK_MANAGER_SESSION_ID;
  assert.equal(
    markerPathFor('session-123'),
    path.join(
      markerProject,
      '.tmp',
      'aitm',
      'app',
      'codex',
      'session-tracking',
      'session-123.json'
    ),
    'session tracking file must live under the app-scoped project-local stateDir'
  );
  // When the AITM-managed local transcript file actually exists, jsonlPath
  // returns it for every provider (codex included) — this is the project-local
  // contract. Create it, then assert it is resolved.
  const managedDir = path.join(
    markerProject,
    '.tmp',
    'aitm',
    'app',
    'codex',
    'session-transcripts'
  );
  mkdirSync(managedDir, { recursive: true });
  const managedFile = path.join(managedDir, 'session-123.jsonl');
  writeFileSync(managedFile, '{}\n');
  assert.equal(
    jsonlPath('session-123'),
    managedFile,
    'transcript path must live under the app-scoped project-local stateDir'
  );
  // Remove it again so it does not pollute the resolveSessionId transcript scan
  // exercised by the currentSessionId assertion below.
  rmSync(managedFile, { force: true });
  // #477 — codex is date-bucketed: with NO managed file and no resolvable
  // homedir rollout, jsonlPath degrades to '' (sid-only session-ref) rather
  // than returning a deterministic-but-nonexistent placeholder path.
  assert.equal(
    jsonlPath('no-such-codex-session'),
    '',
    'codex jsonlPath degrades to empty string when no transcript can be resolved'
  );

  const oldHome = process.env.HOME;
  const fakeHome = path.join(markerProject, 'home');
  const legacyDir = path.join(fakeHome, '.claude', 'projects', '-ignored-claude-project');
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(path.join(legacyDir, 'legacy-only.jsonl'), '{}\n');
  process.env.HOME = fakeHome;
  // A legacy transcript sitting in ~/.claude/projects must never be used by a
  // codex session. With no managed file and no codex rollout, jsonlPath degrades
  // to '' — proving it does not leak to ~/.claude (#477 date-bucketed codex).
  assert.equal(jsonlPath('legacy-only'), '', 'jsonlPath must not fall back to ~/.claude/projects');
  // #273 — resolveSessionId no longer returns null; with no env keys and no
  // local transcripts, the last-resort fallback is the non-empty literal
  // 'default-session' (always a stable, non-empty string so the writer and
  // reader land on the same per-session active-task.json).
  assert.equal(
    currentSessionId(),
    'default-session',
    'currentSessionId must not scan ~/.claude/projects; falls back to default-session'
  );
  if (oldHome === undefined) delete process.env.HOME;
  else process.env.HOME = oldHome;
} finally {
  if (origAitmProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  else process.env.AI_TASK_MANAGER_PROJECT_DIR = origAitmProjectDir;
  if (origClaudeProjectDir3 === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = origClaudeProjectDir3;
  if (origAppName3 === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = origAppName3;
  if (origSid3 === undefined) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = origSid3;
  if (origCodeSid3 === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
  else process.env.CLAUDE_CODE_SESSION_ID = origCodeSid3;
  if (origAitmSid3 === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = origAitmSid3;
  rmSync(markerProject, { recursive: true, force: true });
}

// #795 three-tier metric (stay-abreast chips + full-expansion) tests live in
// the sibling file word-counter-full-expansion.test.mjs to stay under the
// 400-line per-file cap.

rmSync(tmp, { recursive: true });
console.log('word-counter.test.mjs: all passed');
