#!/usr/bin/env node
// @story #555
// Empty-catch audit. `no-empty` is configured with `allowEmptyCatch: true`
// (eslint.config.mjs), so the linter does NOT flag bare `catch {}` swallows.
// This test is the enforcement mechanism instead: it walks the runtime scope
// and fails if any empty catch block lacks an inline justification comment.
// Silence becomes opt-in and reviewed — a newly-introduced unjustified swallow
// fails here until its author justifies it or converts it to surface the error.
// See docs/guides/fail-open-policy.md.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dir, '..', '..', '..', '..');

const ROOTS = ['bin', 'scripts'];
const EXCLUDE_DIR = /(^|\/)(tests?|node_modules|maintenance|migrate)(\/|$)/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (EXCLUDE_DIR.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (extname(p) === '.mjs') out.push(p);
  }
  return out;
}

// Match any catch block — `catch {`, `catch (e) {` — capturing its body up to
// the first `}`. Empty catches contain no nested braces, so a non-greedy match
// to the next `}` captures the whole body without false splits.
const CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g;

// A body is "empty" (needs justification) when stripping comments and
// whitespace leaves nothing. A body that still has a comment is justified.
function bodyNeedsJustification(body) {
  const hasComment = /\/\/|\/\*/.test(body);
  if (hasComment) return false;
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  return stripped === '';
}

test('every empty catch in runtime scope carries a justification comment', () => {
  const offenders = [];
  for (const root of ROOTS) {
    const abs = join(REPO, root);
    let files;
    try {
      files = walk(abs);
    } catch {
      // root may be absent in a partial checkout; skip it rather than fail.
      continue;
    }
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      let m;
      CATCH_RE.lastIndex = 0;
      while ((m = CATCH_RE.exec(src))) {
        if (!bodyNeedsJustification(m[1])) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file.slice(REPO.length + 1)}:${line}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Unjustified empty catch blocks found. Add an inline ` +
      `/* best-effort: <reason> */ comment or convert to surface the error:\n` +
      offenders.join('\n')
  );
});
