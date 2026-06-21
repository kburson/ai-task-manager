// @story #236
// #236 — Wiring test for preflight-issue.mjs.
//
// Asserts that when `--shape sub-issue` is given user-supplied AC content
// containing a forbidden compound CLI command (e.g. `&&`) inside an
// `aitm-verified cmd="..."` marker, preflight refuses with exit 12 and the
// deterministic stderr tag `preflight-issue: checklist-forbidden-command`.
// (#468 retired the legacy `aitm-verified-by:` form; fixtures updated.)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { normalizePlanMetadata } from '../../preflight-issue.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEvidenceMarkers } from '../../lib/evidence-markers.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', '..', 'preflight-issue.mjs');

function makeFixture(acBody) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-preflight-test-'));
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
  it('rejects && in an AC aitm-verified cmd marker with exit 12', async () => {
    const acBody = '- [ ] Bad. <!-- aitm-verified cmd="`npm run lint && npm test`" -->\n';
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

  it('accepts a clean AC with a single backtick-quoted command', async () => {
    const acBody = '- [ ] Good. <!-- aitm-verified cmd="`npm run lint`" -->\n';
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
      // #419 — the preflight-emitted Functional DoD tail carries the
      // consolidated declaration form; #468 retired the legacy reader.
      assert.match(r.stdout, /aitm-verified cmd=/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

describe('preflight-issue --shape stub (#426)', () => {
  it('renders without scope/ac/plan-metadata files, using placeholders', async () => {
    const r = await runPreflight(['--shape', 'stub']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /^## Scope\b/m);
    assert.match(r.stdout, /^## Acceptance Criteria\b/m);
    assert.match(r.stdout, /^## Plan Metadata\b/m);
    assert.match(r.stdout, /Stub — describe the work at Refine\./);
    assert.match(r.stdout, /TBD — define acceptance criteria at Refine\./);
    assert.match(r.stdout, /TBD — set Size, Estimate, Priority, and Rank at Refine\./);
    // Tail still appended.
    assert.match(r.stdout, /^## Definition of Done\b/m);
    assert.match(r.stdout, /^## Pickup Directive\b/m);
    assert.match(r.stdout, /^## Verification Commands\s*$/m);
  });

  it('seeds the Scope section from --idea-file', async () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-stub-idea-'));
    const idea = path.join(dir, 'idea.md');
    writeFileSync(idea, 'Capture the gist of the idea here.\n', 'utf8');
    try {
      const r = await runPreflight(['--shape', 'stub', '--idea-file', idea]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Capture the gist of the idea here\./);
      assert.doesNotMatch(r.stdout, /Stub — describe the work at Refine\./);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('preflight-issue --shape Verification Commands seeding (#410)', () => {
  it('seeds a ## Verification Commands section that makes the body a fixed point of the evidence audit', async () => {
    const fx = makeFixture('- [ ] Some AC.\n');
    try {
      const r = await runPreflight([
        '--shape',
        'solo',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);

      // (a) H2 Verification Commands heading present.
      assert.match(r.stdout, /^## Verification Commands\s*$/m);

      // (b) the four DoD Functional commands each seeded as a checkbox line.
      for (const cmd of [
        'npm run test:all',
        'npm run lint',
        'npm run format:check',
        'git log --oneline -1',
      ]) {
        assert.match(
          r.stdout,
          new RegExp(`^- \\[ \\] \`${cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`\\s*$`, 'm'),
          `missing seeded command: ${cmd}`
        );
      }

      // (c) section lands before the Pickup Directive.
      const vcIdx = r.stdout.indexOf('## Verification Commands');
      const pickupIdx = r.stdout.indexOf('## Pickup Directive');
      assert.ok(
        vcIdx !== -1 && pickupIdx !== -1 && vcIdx < pickupIdx,
        'VC must precede Pickup Directive'
      );

      // (d) fixed point — audit reports nothing missing from the rendered body.
      assert.deepEqual(auditEvidenceMarkers(r.stdout).missingVerificationCommands, []);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

describe('normalizePlanMetadata (#416)', () => {
  it('bolds a simple word label', () => {
    assert.equal(normalizePlanMetadata('origin: foo'), '**origin**: foo');
  });

  it('bolds a hyphenated label', () => {
    assert.equal(normalizePlanMetadata('root-cause: bar'), '**root-cause**: bar');
  });

  it('is idempotent on already-bold labels', () => {
    assert.equal(normalizePlanMetadata('**origin**: foo'), '**origin**: foo');
  });

  it('leaves non-label lines unchanged', () => {
    assert.equal(normalizePlanMetadata('Some free text here.'), 'Some free text here.');
  });

  it('handles multi-line input, bolding only label lines', () => {
    const input = 'origin: foo\nroot-cause: bar\nSome prose.\n**impact**: baz';
    const expected = '**origin**: foo\n**root-cause**: bar\nSome prose.\n**impact**: baz';
    assert.equal(normalizePlanMetadata(input), expected);
  });

  // #488 — the bulleted list form is the form templates and issues actually use;
  // #416 never matched it (regex anchored at `^label:`), so the fix was a no-op.
  it('bolds a bulleted word label, preserving the bullet (#488)', () => {
    assert.equal(normalizePlanMetadata('- domain: x'), '- **domain**: x');
  });

  it('bolds a bulleted hyphenated label, colon outside the span (#488)', () => {
    assert.equal(normalizePlanMetadata('- root-cause: y'), '- **root-cause**: y');
  });

  it('is idempotent on an already-bold bulleted label (#488)', () => {
    assert.equal(normalizePlanMetadata('- **domain**: x'), '- **domain**: x');
  });

  it('bolds a realistic bulleted metadata block, leaving prose untouched (#488)', () => {
    const input = '- domain: tooling\n- root-cause: regex\n- **risk**: low\nfree prose';
    const expected = '- **domain**: tooling\n- **root-cause**: regex\n- **risk**: low\nfree prose';
    assert.equal(normalizePlanMetadata(input), expected);
  });
});
