// @story #662
// Unit tests for lib/user-story-author.mjs (#662) and its CLI registration.
//
// Pins the four acceptance criteria declared on #662:
//   AC1 setUserStory writes three non-placeholder Connextra lines.
//   AC2 author-from-absent inserts `## User Story` as the FIRST `## ` heading,
//       and validateUserStory then returns ok.
//   AC3 replace-in-place on an existing/placeholder User Story is idempotent
//       (no heading duplication; identical-input re-run reproduces the bytes).
//   AC4 the CLI knows `user-story` (and the `story` alias) — manifest entry
//       present and dispatch `case` label present (parity-test contract).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { setUserStory, buildUserStoryLines } from '../../lib/user-story-author.mjs';
import { validateUserStory, PLACEHOLDERS } from '../../lib/user-story-guard.mjs';
import { MANIFEST_INDEX, resolveVerb } from '../../command-manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORY = {
  asA: 'maintainer',
  iWant: 'repair the User Story section in-workflow',
  soThat: 'a refine→plan transition is no longer wedged on hand-editing',
};

// ---------------------------------------------------------------------------
// AC1 — three non-placeholder Connextra lines
// ---------------------------------------------------------------------------

test('AC1: buildUserStoryLines composes three prefixed, non-placeholder lines', () => {
  const lines = buildUserStoryLines(STORY);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^As a maintainer\b/);
  assert.match(lines[1], /^I want to repair\b/);
  assert.match(lines[2], /^So that a refine/);
  for (const line of lines) assert.ok(!PLACEHOLDERS.has(line), `not a placeholder: ${line}`);
});

test('AC1: existing Connextra lead-in is kept verbatim, not double-prefixed', () => {
  const lines = buildUserStoryLines({
    asA: 'As an operator',
    iWant: 'I want to drive the gate',
    soThat: 'So that work flows',
  });
  assert.deepEqual(lines, ['As an operator', 'I want to drive the gate', 'So that work flows']);
});

test('AC1: empty or placeholder input is rejected', () => {
  assert.throws(() => buildUserStoryLines({ asA: '', iWant: 'x', soThat: 'y' }), /asA/);
  assert.throws(
    () =>
      buildUserStoryLines({
        asA: '[who wants to accomplish something]',
        iWant: '[what they want to accomplish]',
        soThat: '[why they want to accomplish that thing]',
      }),
    /placeholder/
  );
});

// ---------------------------------------------------------------------------
// AC2 — author-from-absent inserts User Story as the FIRST `## ` heading
// ---------------------------------------------------------------------------

test('AC2: inserts `## User Story` ahead of an existing leading section', () => {
  const body = '## Scope\n\nsome scope text\n\n## Definition of Done\n\n- [ ] thing\n';
  const out = setUserStory(body, STORY);
  // First `## ` heading is now User Story.
  assert.match(out, /^## User Story$/m);
  const firstH2 = out.match(/^## (.+)$/m)[1].trim();
  assert.equal(firstH2, 'User Story');
  // Pre-existing sections survive.
  assert.match(out, /^## Scope$/m);
  assert.match(out, /^## Definition of Done$/m);
  // The guard that blocks refine→plan now passes.
  assert.equal(validateUserStory(out).ok, true);
});

test('AC2: markers above the first heading are preserved', () => {
  const body =
    '<!-- aitm-refine-complete -->\n<!-- aitm-entered-refine: 2026-06-29 -->\n\n## Scope\n\ntext\n';
  const out = setUserStory(body, STORY);
  assert.match(out, /<!-- aitm-refine-complete -->/);
  assert.match(out, /<!-- aitm-entered-refine: 2026-06-29 -->/);
  // Markers stay above User Story (they precede the first `## `).
  assert.ok(out.indexOf('aitm-refine-complete') < out.indexOf('## User Story'));
  assert.equal(validateUserStory(out).ok, true);
});

test('AC2: empty body produces a valid, leading User Story section', () => {
  const out = setUserStory('', STORY);
  assert.match(out, /^## User Story$/m);
  assert.equal(validateUserStory(out).ok, true);
});

// ---------------------------------------------------------------------------
// AC3 — replace-in-place is idempotent; no heading duplication
// ---------------------------------------------------------------------------

test('AC3: replaces a placeholder User Story in place without duplicating the heading', () => {
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
    '',
  ].join('\n');
  assert.equal(validateUserStory(body).ok, false); // placeholder → blocked
  const out = setUserStory(body, STORY);
  assert.equal((out.match(/^## User Story$/gm) || []).length, 1, 'exactly one heading');
  assert.equal(validateUserStory(out).ok, true);
  assert.match(out, /^## Scope$/m); // trailing section intact
});

test('AC3: re-running with identical input reproduces the same bytes', () => {
  const once = setUserStory('## Scope\n\ntext\n', STORY);
  const twice = setUserStory(once, STORY);
  assert.equal(twice, once, 'idempotent: second pass is byte-identical');
});

test('AC3: markers inside the section are preserved on replace', () => {
  const body = [
    '## User Story',
    '',
    'As a [who wants to accomplish something]',
    'I want to [what they want to accomplish]',
    'So that [why they want to accomplish that thing]',
    '<!-- aitm-user-story-verified -->',
    '',
    '## Scope',
    '',
    'text',
    '',
  ].join('\n');
  const out = setUserStory(body, STORY);
  assert.match(out, /<!-- aitm-user-story-verified -->/);
  assert.equal(validateUserStory(out).ok, true);
});

// ---------------------------------------------------------------------------
// AC4 — CLI dispatch routes `user-story` / `story`
// ---------------------------------------------------------------------------

test('AC4: manifest registers `user-story` with the `story` alias', () => {
  assert.equal(resolveVerb('user-story'), 'user-story');
  assert.equal(resolveVerb('story'), 'user-story');
  const entry = MANIFEST_INDEX.get('user-story');
  assert.ok(entry, 'manifest entry present');
  assert.equal(entry.dispatch, 'verbs/user-story.mjs');
});

test('AC4: dispatch switch has matching `user-story` and `story` case labels', () => {
  const hub = readFileSync(path.join(HERE, '../../task-tracker.mjs'), 'utf8');
  assert.match(hub, /case 'user-story':/);
  assert.match(hub, /case 'story':/);
});
