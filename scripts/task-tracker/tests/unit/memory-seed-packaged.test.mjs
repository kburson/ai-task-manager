// @story #728
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve the repo root from this test file's location so the check is
// path-independent (dev tree or isolated worktree).
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');

test('package.json files[] ships docs/ai-memory but excludes archive/', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = manifest.files ?? [];
  assert.ok(
    files.includes('docs/ai-memory/'),
    'files[] must include docs/ai-memory/ so the durable memory seed ships'
  );
  assert.ok(
    files.includes('!docs/ai-memory/archive/**'),
    'files[] must exclude docs/ai-memory/archive/** — the archive corpus never ships'
  );
});

test('npm pack tarball contains the seed index + durable facts, no archive', () => {
  // `npm pack --dry-run --json` resolves the real published file list offline
  // (no tarball written, no registry contact) and reports it as JSON.
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
  const report = JSON.parse(raw);
  const entries = (report[0]?.files ?? []).map((f) => f.path);

  assert.ok(
    entries.includes('docs/ai-memory/MEMORY.md'),
    'the packed tarball must contain the MEMORY.md index'
  );
  const durable = entries.filter(
    (p) =>
      p.startsWith('docs/ai-memory/') &&
      p.endsWith('.md') &&
      !p.startsWith('docs/ai-memory/archive/') &&
      p !== 'docs/ai-memory/MEMORY.md'
  );
  assert.ok(
    durable.length > 0,
    'the packed tarball must contain at least one durable memory-fact file'
  );
  const archived = entries.filter((p) => p.startsWith('docs/ai-memory/archive/'));
  assert.deepEqual(
    archived,
    [],
    `no docs/ai-memory/archive/ file may ship; found: ${archived.join(', ')}`
  );
});
