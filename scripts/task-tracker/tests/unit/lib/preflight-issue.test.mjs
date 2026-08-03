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
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { normalizePlanMetadata } from '../../../preflight-issue.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEvidenceMarkers } from '../../../lib/evidence-markers.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SCRIPT = path.resolve(HERE, '..', '..', 'preflight-issue.mjs');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

function makeFixture(acBody) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-preflight-test-'));
  const ac = path.join(dir, 'ac.md');
  const scope = path.join(dir, 'scope.md');
  const origin = path.join(dir, 'origin.md');
  const meta = path.join(dir, 'meta.md');
  writeFileSync(ac, acBody, 'utf8');
  writeFileSync(scope, 'Scope.\n', 'utf8');
  writeFileSync(origin, '- kind: code\n', 'utf8');
  writeFileSync(meta, 'Metadata.\n', 'utf8');
  return { dir, ac, scope, origin, meta };
}

async function runPreflight(args, options = {}) {
  try {
    const { stdout, stderr } = await pexec('node', [SCRIPT, ...args], options);
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
        '--story-origin-file',
        fx.origin,
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
        '--story-origin-file',
        fx.origin,
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

describe('preflight-issue --shape Story Origin flat-section validation (#892)', () => {
  it('rejects a Story Origin fragment containing an embedded heading', async () => {
    const fx = makeFixture('- [ ] Works\n');
    writeFileSync(
      fx.origin,
      '- kind: code\n\n## Injected Section\n\nUnexpected content.\n',
      'utf8'
    );

    const r = await runPreflight([
      '--shape',
      'solo',
      '--scope-file',
      fx.scope,
      '--ac-file',
      fx.ac,
      '--story-origin-file',
      fx.origin,
      '--plan-metadata-file',
      fx.meta,
    ]);

    assert.equal(r.code, 2);
    assert.match(r.stderr, /must be a flat metadata fragment without headings/);
  });

  it('still accepts a single leading Story Origin heading for compatibility', async () => {
    const fx = makeFixture('- [ ] Works\n');
    writeFileSync(fx.origin, '## Story Origin\n\n- kind: code\n', 'utf8');

    const r = await runPreflight([
      '--shape',
      'solo',
      '--scope-file',
      fx.scope,
      '--ac-file',
      fx.ac,
      '--story-origin-file',
      fx.origin,
      '--plan-metadata-file',
      fx.meta,
    ]);

    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout.match(/^## Story Origin$/gm)?.length, 1);
  });

  it('rejects a stale project template override that drops Story Origin', async () => {
    const fx = makeFixture('- [ ] Works\n');
    try {
      const templatesDir = path.join(fx.dir, '.ai-task-manager', 'templates');
      mkdirSync(templatesDir, { recursive: true });
      await pexec('git', ['init', '--quiet'], { cwd: fx.dir });
      copyFileSync(
        path.join(REPO_ROOT, '.ai-task-manager', 'templates', 'pickup-directive.md'),
        path.join(templatesDir, 'pickup-directive.md')
      );
      copyFileSync(
        path.join(REPO_ROOT, '.ai-task-manager', 'templates', 'definition-of-done.md'),
        path.join(templatesDir, 'definition-of-done.md')
      );
      const staleOverride = readFileSync(
        path.join(REPO_ROOT, 'templates', 'solo-issue-body.md'),
        'utf8'
      ).replace(/\n## Story Origin\n\n\{\{story_origin\}\}\n/, '');
      writeFileSync(
        path.join(fx.dir, '.ai-task-manager', 'solo-issue-body.md'),
        staleOverride,
        'utf8'
      );

      const r = await runPreflight(
        [
          '--shape',
          'solo',
          '--scope-file',
          fx.scope,
          '--ac-file',
          fx.ac,
          '--story-origin-file',
          fx.origin,
          '--plan-metadata-file',
          fx.meta,
        ],
        { cwd: fx.dir }
      );

      assert.equal(r.code, 2);
      assert.match(r.stderr, /rendered solo body failed canonical verification:.*Story Origin/);
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
    assert.match(r.stdout, /^## Story Origin\b/m);
    assert.match(r.stdout, /^## Acceptance Criteria\b/m);
    assert.match(r.stdout, /^## Plan Metadata\b/m);
    assert.match(r.stdout, /Stub — describe the work at Refine\./);
    assert.match(r.stdout, /TBD — define acceptance criteria at Refine\./);
    assert.doesNotMatch(r.stdout, /TBD — set Size, Estimate, Priority, and Rank at Refine\./);
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
        '--story-origin-file',
        fx.origin,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);

      // (a) H2 Verification Commands heading present.
      assert.match(r.stdout, /^## Verification Commands\s*$/m);

      // (b) the DoD Functional commands each seeded as a checkbox line,
      // now carrying a stable hidden `<!-- id=N -->` marker (#772). #934 split
      // the single `npm run test:all` into the two-lane `npm test` + `test:slow`.
      for (const cmd of [
        'npm test',
        'npm run test:slow',
        'npm run lint',
        'npm run format:check',
        'git log --oneline -1',
      ]) {
        assert.match(
          r.stdout,
          new RegExp(
            `^- \\[ \\] \`${cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` <!-- id=\\d+ -->\\s*$`,
            'm'
          ),
          `missing seeded command: ${cmd}`
        );
      }

      // (c) section lands before Definition of Done. #700 moved Pickup
      // Directive up to right after Plan Metadata, so VC (seeded just
      // before DoD) now follows Pickup instead of preceding it.
      const vcIdx = r.stdout.indexOf('## Verification Commands');
      const pickupIdx = r.stdout.indexOf('## Pickup Directive');
      const dodIdx = r.stdout.indexOf('## Definition of Done');
      assert.ok(
        pickupIdx !== -1 && vcIdx !== -1 && dodIdx !== -1 && pickupIdx < vcIdx && vcIdx < dodIdx,
        'Pickup Directive must precede Verification Commands, which must precede Definition of Done'
      );

      // (d) fixed point — audit reports nothing missing from the rendered body.
      assert.deepEqual(auditEvidenceMarkers(r.stdout).missingVerificationCommands, []);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

// #865 / #923 — `docs-only` is commit-bearing but its `tests` DoD item is
// diff-conditional: "the kind declares, the diff decides". The kind alone never
// drops the suite (a `docs-only` issue can quietly touch code) — the drop fires
// ONLY when a supplied `--changed-paths-file` proves the diff is
// documentation-only. Default-deny: no diff file, or any diff touching a non-doc
// path, keeps the item.
describe('preflight-issue --kind docs-only render (#865 diff-decides / #923)', () => {
  function writeChangedPaths(dir, paths) {
    const p = path.join(dir, 'changed.txt');
    writeFileSync(p, paths.join('\n') + '\n', 'utf8');
    return p;
  }

  it('default-deny: docs-only with NO --changed-paths-file KEEPS the tests DoD item', async () => {
    const fx = makeFixture('- [ ] Some AC.\n');
    try {
      const r = await runPreflight([
        '--shape',
        'solo',
        '--kind',
        'docs-only',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);

      // Stamped as docs-only...
      assert.match(r.stdout, /<!-- aitm-issue-kind kind="docs-only" -->/);
      // ...but mislabelling alone must NOT launder the suite away.
      assert.match(
        r.stdout,
        /<!-- dod:functional:tests -->/,
        'docs-only with no diff proof must keep the tests DoD item (default-deny)'
      );
      assert.deepEqual(auditEvidenceMarkers(r.stdout).missingVerificationCommands, []);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('docs-only + provably documentation-only diff DROPS the tests item + its VC seeds', async () => {
    const fx = makeFixture('- [ ] Some AC.\n');
    const cp = writeChangedPaths(fx.dir, ['docs/guides/workflow.md', 'README.md']);
    try {
      const r = await runPreflight([
        '--shape',
        'solo',
        '--kind',
        'docs-only',
        '--changed-paths-file',
        cp,
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);

      assert.match(r.stdout, /<!-- aitm-issue-kind kind="docs-only" -->/);
      // The `tests` DoD item is filtered out.
      assert.doesNotMatch(r.stdout, /<!-- dod:functional:tests -->/);
      // ...and its derived suite VC seeds drop with it.
      assert.doesNotMatch(
        r.stdout,
        /^- \[ \] `npm run test:slow` <!-- id=\d+ -->\s*$/m,
        'docs-only docs-diff must not seed the test:slow verification command'
      );
      assert.doesNotMatch(
        r.stdout,
        /^- \[ \] `npm test` <!-- id=\d+ -->\s*$/m,
        'docs-only docs-diff must not seed the npm test verification command'
      );

      // The commits DoD item (excluded only for epic) still renders.
      assert.match(r.stdout, /<!-- dod:functional:commits -->/);
      assert.match(
        r.stdout,
        /^- \[ \] `git log --oneline -1` <!-- id=\d+ -->\s*$/m,
        'docs-only must keep the git-log commits verification command'
      );

      // The body is still a fixed point of the evidence audit.
      assert.deepEqual(auditEvidenceMarkers(r.stdout).missingVerificationCommands, []);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('docs-only + a diff that touches code KEEPS the tests item (default-deny)', async () => {
    const fx = makeFixture('- [ ] Some AC.\n');
    const cp = writeChangedPaths(fx.dir, [
      'docs/guides/workflow.md',
      'scripts/task-tracker/lib/foo.mjs',
    ]);
    try {
      const r = await runPreflight([
        '--shape',
        'solo',
        '--kind',
        'docs-only',
        '--changed-paths-file',
        cp,
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
        '--plan-metadata-file',
        fx.meta,
      ]);
      assert.equal(r.code, 0, `stderr: ${r.stderr}`);

      // A docs-only-labelled issue whose diff edits code must still carry the
      // suite — the diff, not the label, decides.
      assert.match(
        r.stdout,
        /<!-- dod:functional:tests -->/,
        'a docs-only issue that edits code must still carry the tests DoD item'
      );
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
