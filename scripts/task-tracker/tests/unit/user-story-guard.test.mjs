// @story #432
// Unit tests for user-story-guard.mjs (#432).
// Covers: validateUserStory, userStoryWarnGuard, userStoryBlockGuard.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  validateUserStory,
  userStoryWarnGuard,
  userStoryBlockGuard,
  GUARD_ID_WARN,
  GUARD_ID_BLOCK,
} from '../../lib/user-story-guard.mjs';

// ---------------------------------------------------------------------------
// validateUserStory
// ---------------------------------------------------------------------------

test('validateUserStory: returns ok:false when section is missing', () => {
  const body = '## Scope\n\nsome scope text\n';
  const result = validateUserStory(body);
  assert.equal(result.ok, false);
  assert.ok(result.reason, 'should have a reason');
});

test('validateUserStory: returns ok:false when section has fewer than 3 non-empty lines', () => {
  const body = '## User Story\n\nAs a developer\n\n## Scope\n\ntext\n';
  const result = validateUserStory(body);
  assert.equal(result.ok, false);
});

test('validateUserStory: returns ok:false when any line is an unedited placeholder', () => {
  const body = [
    '## User Story',
    '',
    'As a [who wants to accomplish something]',
    'I want to build something real',
    'So that my users are happy',
    '',
    '## Scope',
    '',
    'text',
  ].join('\n');
  const result = validateUserStory(body);
  assert.equal(result.ok, false);
});

test('validateUserStory: returns ok:true for a complete, non-placeholder story', () => {
  const body = [
    '## User Story',
    '',
    'As a repo author',
    'I want issue bodies to start with a user story',
    'So that the value being delivered is always explicit',
    '',
    '## Scope',
    '',
    'text',
  ].join('\n');
  const result = validateUserStory(body);
  assert.deepEqual(result, { ok: true });
});

test('validateUserStory: ignores HTML comment lines within the section', () => {
  const body = [
    '## User Story',
    '',
    '<!-- aitm-note: stub -->',
    'As a developer',
    'I want something useful',
    'So that my team saves time',
    '',
    '## Scope',
    '',
    'text',
  ].join('\n');
  const result = validateUserStory(body);
  assert.deepEqual(result, { ok: true });
});

test('validateUserStory: section without a following ## heading is still parsed', () => {
  const body = [
    '## User Story',
    '',
    'As a developer',
    'I want something useful',
    'So that my team saves time',
  ].join('\n');
  const result = validateUserStory(body);
  assert.deepEqual(result, { ok: true });
});

test('validateUserStory: returns ok:false for non-string input', () => {
  assert.equal(validateUserStory(null).ok, false);
  assert.equal(validateUserStory(undefined).ok, false);
  assert.equal(validateUserStory(42).ok, false);
});

// ---------------------------------------------------------------------------
// userStoryWarnGuard
// ---------------------------------------------------------------------------

test('userStoryWarnGuard has correct id', () => {
  assert.equal(userStoryWarnGuard.id, GUARD_ID_WARN);
});

test('userStoryWarnGuard: returns ok:true regardless of body validity (non-blocking)', () => {
  const result = userStoryWarnGuard.run({ toState: 'refine', body: '## Scope\n\nno story here\n' });
  assert.deepEqual(result, { ok: true });
});

test('userStoryWarnGuard: returns ok:true when toState is not refine', () => {
  const result = userStoryWarnGuard.run({ toState: 'plan', body: '' });
  assert.deepEqual(result, { ok: true });
});

test('userStoryWarnGuard: returns ok:true for null ctx', () => {
  assert.deepEqual(userStoryWarnGuard.run(null), { ok: true });
});

test('userStoryWarnGuard: writes a warning to stderr when story is missing/incomplete', () => {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(chunk);
    return true;
  };
  try {
    userStoryWarnGuard.run({ toState: 'refine', body: '## Scope\n\nno story\n' });
  } finally {
    process.stderr.write = orig;
  }
  assert.ok(chunks.length > 0, 'should have written to stderr');
  assert.ok(
    chunks.some((c) => c.includes('user-story')),
    'stderr should mention user-story'
  );
});

test('userStoryWarnGuard: does NOT write to stderr when story is complete', () => {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(chunk);
    return true;
  };
  try {
    userStoryWarnGuard.run({
      toState: 'refine',
      body: [
        '## User Story',
        '',
        'As a developer',
        'I want something useful',
        'So that my team saves time',
        '',
        '## Scope',
        '',
        'text',
      ].join('\n'),
    });
  } finally {
    process.stderr.write = orig;
  }
  assert.equal(chunks.length, 0, 'should NOT have written to stderr');
});

// ---------------------------------------------------------------------------
// userStoryBlockGuard
// ---------------------------------------------------------------------------

test('userStoryBlockGuard has correct id', () => {
  assert.equal(userStoryBlockGuard.id, GUARD_ID_BLOCK);
});

test('userStoryBlockGuard: returns ok:true when toState is not plan', () => {
  const result = userStoryBlockGuard.run({ toState: 'refine', body: '' });
  assert.deepEqual(result, { ok: true });
});

test('userStoryBlockGuard: returns ok:true for null ctx', () => {
  assert.deepEqual(userStoryBlockGuard.run(null), { ok: true });
});

test('userStoryBlockGuard: returns ok:false when plan target + section missing', () => {
  const result = userStoryBlockGuard.run({ toState: 'plan', body: '## Scope\n\nno story\n' });
  assert.equal(result.ok, false);
  assert.ok(result.reason);
});

test('userStoryBlockGuard: returns ok:false when plan target + placeholder present', () => {
  const body = [
    '## User Story',
    '',
    'As a [who wants to accomplish something]',
    'I want to [what they want to accomplish]',
    'So that [why they want to accomplish that thing]',
    '',
    '## Scope',
    '',
    'text',
  ].join('\n');
  const result = userStoryBlockGuard.run({ toState: 'plan', body });
  assert.equal(result.ok, false);
});

test('userStoryBlockGuard: returns ok:true when plan target + story complete', () => {
  const body = [
    '## User Story',
    '',
    'As a repo author',
    'I want issue bodies to start with a user story',
    'So that the value being delivered is always explicit',
    '',
    '## Scope',
    '',
    'text',
  ].join('\n');
  const result = userStoryBlockGuard.run({ toState: 'plan', body });
  assert.deepEqual(result, { ok: true });
});
