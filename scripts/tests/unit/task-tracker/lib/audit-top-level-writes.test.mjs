// @story #723
// Runs lintEntrypointGuard against every real script directly under
// scripts/task-tracker/*.mjs (the one-off/backfill/heal CLI layer named in
// #723's scope — not lib/ or verbs/, which are imported modules with no
// top-level invocation of their own) and asserts zero violations.
//
// Audit findings (2026-07-07), read directly file-by-file, not inferred:
//   - backfill-plan-metadata.mjs, backfill-vc-sections.mjs: fixed in #722,
//     guarded via `import.meta.url === \`file://${process.argv[1]}\``.
//   - heal-backlog.mjs, heal-functional-dod.mjs, heal-vc-refs.mjs,
//     migrate-plan-approved.mjs: already guarded via the fileURLToPath/
//     path.resolve `_isMain` form — a prior grep for the literal
//     `import.meta.url === \`file://` string missed these because they use
//     the normalized form; confirmed clean by direct inspection.
//   - preflight-issue.mjs, verify-sweep-comment.mjs: call `main()`
//     unconditionally with no guard, but neither has any write capability —
//     both are read-only (`gh issue view` + stdout emission). No fix needed.
//   - bash-guard.mjs: matched the original grep on the literal string
//     "gh issue edit" only inside a comment describing the #361 hard-refusal
//     it enforces; performs no write itself.
//   - runtime.mjs: calls `mutateIssueBody` inside an exported function body,
//     never at module scope or via an unconditional `main()` — it's a
//     library imported by verbs, not a CLI entry point.
// This test locks in that clean result and catches future regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintEntrypointGuard } from '../../../../task-tracker/lib/entrypoint-guard-lint.mjs';

const TRACKER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../task-tracker'
);

function trackerScripts() {
  return readdirSync(TRACKER_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .sort();
}

test('audit: no scripts/task-tracker/*.mjs file has an unguarded top-level GitHub write', () => {
  const offenders = [];
  for (const file of trackerScripts()) {
    const source = readFileSync(path.join(TRACKER_DIR, file), 'utf8');
    const result = lintEntrypointGuard(source);
    if (result.violation) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('audit: sanity — the scan actually inspected the known write-capable scripts', () => {
  const files = trackerScripts();
  for (const expected of [
    'backfill-plan-metadata.mjs',
    'backfill-vc-sections.mjs',
    'heal-backlog.mjs',
    'heal-functional-dod.mjs',
    'heal-vc-refs.mjs',
    'migrate-plan-approved.mjs',
  ]) {
    assert.ok(files.includes(expected), `expected ${expected} in scan set`);
  }
});

console.log('audit-top-level-writes.test.mjs: ok');
