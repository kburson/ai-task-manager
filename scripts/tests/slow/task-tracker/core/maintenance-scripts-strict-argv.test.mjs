// @story #878
// #878 — every maintenance script that accepts `--apply` must refuse an
// unrecognized flag instead of silently ignoring it.
//
// Each script is spawned with a bogus flag and asserted to exit non-zero with
// usage text on stderr. This is safe to run offline: strict-argv refusal happens
// before any config load or `gh` call, so no network I/O occurs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const pexec = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)) + '/..', '../../../..');

// The manifest is exported so the drift test below can prove it is complete:
// any future `--apply` script that forgets to adopt strict argv fails by omission.
export const APPLY_SCRIPTS = [
  'scripts/migrate/assigned-to-ready-for-plan.mjs',
  'scripts/migrate/rename-on-deck-to-assigned.mjs',
  'scripts/task-tracker/backfill-disposition.mjs',
  'scripts/task-tracker/backfill-vc-sections.mjs',
  'scripts/task-tracker/backfill-plan-metadata.mjs',
  'scripts/task-tracker/backfill-timing-logs.mjs',
  'scripts/task-tracker/heal-backlog.mjs',
  'scripts/task-tracker/heal-entry-markers.mjs',
  'scripts/task-tracker/heal-functional-dod.mjs',
  'scripts/task-tracker/heal-lifecycle-dod.mjs',
  'scripts/task-tracker/heal-refine-entry-marker.mjs',
  'scripts/task-tracker/heal-timing-departure.mjs',
  'scripts/task-tracker/heal-timing-interval.mjs',
  'scripts/task-tracker/heal-timing-log.mjs',
  'scripts/task-tracker/heal-timing-starts.mjs',
  'scripts/task-tracker/heal-vc-refs.mjs',
  'scripts/maintenance/heal-full-auto-footnote.mjs',
  'scripts/maintenance/heal-stage-rollups.mjs',
  'scripts/maintenance/graduate-frozen-test-retirements.mjs',
  'scripts/maintenance/migrate-non-demonstrable-tag-position.mjs',
  'scripts/maintenance/repair-child-outcome-records.mjs',
  'scripts/reports/heal-backlog-attribution.mjs',
];

const BOGUS = '--definitely-not-a-flag';

for (const rel of APPLY_SCRIPTS) {
  test(`${rel} refuses an unknown flag`, async () => {
    const result = await pexec('node', [path.join(REPO_ROOT, rel), BOGUS], {
      cwd: REPO_ROOT,
      timeout: 30_000,
    }).then(
      (ok) => ({ code: 0, ...ok }),
      (e) => ({ code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' })
    );

    assert.notEqual(result.code, 0, `${rel} exited 0 on an unknown flag`);

    const output = `${result.stderr}\n${result.stdout}`;
    assert.match(
      output,
      /unrecognized argument|unknown flag/i,
      `${rel} did not name the offending token`
    );
    assert.match(output, /Usage/i, `${rel} did not print usage on refusal`);
  });
}

// Drift guard: walk the tree for `--apply` consumers and assert the manifest
// covers all of them. A new maintenance script that accepts --apply must be
// added here, which forces the author to confirm it refuses unknown flags.
test('the manifest covers every --apply script in the tree', () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.endsWith('.mjs')) continue;
      if (abs.includes(`${path.sep}tests${path.sep}`)) continue;
      const src = readFileSync(abs, 'utf8');
      if (/['"]--apply['"]/.test(src)) found.push(path.relative(REPO_ROOT, abs));
    }
  };
  walk(path.join(REPO_ROOT, './scripts'));

  const declared = new Set(APPLY_SCRIPTS);
  // Library modules that merely reference the string are not entry points; only
  // files with a direct-invocation footer are.
  const entryPoints = found.filter((rel) => {
    const src = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    return /process\.argv\[1\]|process\.argv\.slice\(2\)/.test(src);
  });

  const missing = entryPoints.filter((rel) => !declared.has(rel));
  assert.deepEqual(missing, [], `--apply entry points missing from APPLY_SCRIPTS: ${missing}`);
});
