import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const file = new URL('../../skills/peer-review/SKILL.md', import.meta.url);

test('installable skill states the complete provider-neutral operating contract', () => {
  const text = readFileSync(file, 'utf8');
  for (const phrase of [
    'peer-review setup',
    'peer-review doctor',
    'peer-review help',
    'absolute paths',
    'Reviewer Git boundary',
    'Author Git boundary',
    'NO-COMMIT TEST MODE',
    'relay only the reviewer invitation',
    'manual recovery',
    'automatic-required',
    'wait_for_handoff',
    'peer-review coordinator run',
    'status <workspace> --next',
    'resident lease',
    'refs/codex/turn-diffs/checkpoints/',
    'every other ref',
    '0.2.1',
    'preserve the existing review workspace',
    'draft evidence',
  ]) {
    assert.match(text, new RegExp(phrase, 'i'), phrase);
  }
  const normalized = text.replace(/\s+/g, ' ');
  for (const phrase of [
    'Communication policy (v1)',
    'all later turns, resumes, handoffs, and finalization',
    'do not rely on a chat summary',
    'unless the human explicitly requests it',
  ]) {
    assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
  assert.doesNotMatch(text, /\baitm\b|\/task\b/i);
  assert.match(normalized, /coordinator.*do not (?:poll|repeat).*wait/i);
  for (const phrase of [
    'peer-review launch-reviewer',
    'permission-mode dontAsk',
    'double leading slash',
    'do not construct Edit or Write rules by hand',
    'same recorded Claude session',
    'provider exit is not submission',
    'permission-blocked',
  ]) {
    assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
});
