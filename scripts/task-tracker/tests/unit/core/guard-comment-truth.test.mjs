// @story #552
// Truth guard for the guard system's own documentation. guard-registry.mjs once
// carried a header claiming "Skeleton-only. No callers yet." while runGuards was
// in fact wired into move-state/promote/close/review and fires on every
// transition. In an AI-facing repo that false comment is dangerous: an agent
// could conclude the guard layer is inert and route around it.
//
// This test asserts that no comment in the guard-system source files claims the
// system is unimplemented/skeletal/uncalled, so the false statement cannot
// silently return. It proves an absence by scanning the actual source rather
// than a fragile shell grep, and it scopes to the guard source modules (never
// docs) so a doc that *warns about* the stale comment does not self-trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const libDir = join(here, '..', '..', 'lib');

// Guard-system source files whose comments describe the registry's status.
const GUARD_SOURCES = [
  join(libDir, 'guard-registry.mjs'),
  join(libDir, 'guard-bootstrap.mjs'),
  join(libDir, 'state-bootstrap.mjs'),
];

// Patterns that assert the guard system is NOT wired. Each must match a claim,
// not a mere mention — e.g. "no callers yet", "skeleton-only", "not yet wired".
const FALSE_CLAIM_PATTERNS = [
  /skeleton[- ]only/i,
  /no callers yet/i,
  /not yet wired/i,
  /\bguard(s| system| registry)?\b[^.\n]{0,40}\b(is|are)\b[^.\n]{0,20}\b(unimplemented|not implemented|inert)\b/i,
];

// Extract comment text from an .mjs file: full-line `//` comments, trailing
// `//` comments, and `/* ... */` blocks. Code (string literals etc.) is ignored
// so a regex source like /skeleton/ inside this very pattern set never trips.
function commentText(src) {
  const out = [];
  // Block comments.
  for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) out.push(m[0]);
  // Line comments (from `//` to end of line).
  for (const line of src.split('\n')) {
    const idx = line.indexOf('//');
    if (idx !== -1) out.push(line.slice(idx));
  }
  return out.join('\n');
}

for (const file of GUARD_SOURCES) {
  test(`guard-comment-truth: ${file.split('/').slice(-1)[0]} makes no "unimplemented" claim`, () => {
    const comments = commentText(readFileSync(file, 'utf8'));
    for (const pat of FALSE_CLAIM_PATTERNS) {
      const m = comments.match(pat);
      assert.ok(
        !m,
        `${file} contains a comment claiming the guard system is unimplemented: "${m && m[0]}". ` +
          `The guards ARE wired (runGuards fires on every transition) — fix the comment.`
      );
    }
  });
}

test('guard-comment-truth: guard-registry.mjs affirms it is wired', () => {
  const src = readFileSync(GUARD_SOURCES[0], 'utf8');
  assert.match(
    src,
    /runGuards/,
    'guard-registry.mjs should reference runGuards in its real-wiring description'
  );
});
