// #236 — Wiring test for preflight-issue.mjs.
//
// Asserts that when `--shape sub-issue` is given user-supplied AC content
// containing a forbidden compound CLI command (e.g. `&&`) inside an
// `aitm-verified-by:` marker, preflight refuses with exit 12 and the
// deterministic stderr tag `preflight-issue: checklist-forbidden-command`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'preflight-issue.mjs');

function makeFixture(acBody) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-preflight-test-'));
  const ac = path.join(dir, 'ac.md');
  const scope = path.join(dir, 'scope.md');
  const meta = path.join(dir, 'meta.md');
  writeFileSync(ac, acBody, 'utf8');
  writeFileSync(scope, 'Scope.\n', 'utf8');
  writeFileSync(meta, 'Metadata.\n', 'utf8');
  return { dir, ac, scope, meta };
}

async function runPreflight(args) {
  try {
    const { stdout, stderr } = await pexec('node', [SCRIPT, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('preflight-issue --shape lint wiring', () => {
  it('rejects && in an AC aitm-verified-by marker with exit 12', async () => {
    const acBody = '- [ ] Bad. <!-- aitm-verified-by: `npm run lint && npm test` -->\n';
    const fx = makeFixture(acBody);
    try {
      const r = await runPreflight([
        '--shape',
        'sub-issue',
        '--parent',
        '1',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 12, `stderr: ${r.stderr}`);
      assert.match(r.stderr, /preflight-issue: checklist-forbidden-command/);
      assert.match(r.stderr, /forbidden logical-and/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('accepts a clean AC with separate backtick-quoted commands', async () => {
    const acBody = '- [ ] Good. <!-- aitm-verified-by: `npm run lint` `npm test` -->\n';
    const fx = makeFixture(acBody);
    try {
      const r = await runPreflight([
        '--shape',
        'sub-issue',
        '--parent',
        '1',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /aitm-verified-by/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});
