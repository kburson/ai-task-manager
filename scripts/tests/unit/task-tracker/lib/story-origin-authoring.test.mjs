// @story #892
// Creation captures Story Origin while Plan Metadata remains optional and
// empty until planning.

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildShapeFlags } from '../../../../gh/create-issue.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.resolve(HERE, '../../../../task-tracker/preflight-issue.mjs');

function fixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-story-origin-'));
  const scope = path.join(dir, 'scope.md');
  const ac = path.join(dir, 'ac.md');
  const origin = path.join(dir, 'origin.md');
  const plan = path.join(dir, 'plan.md');
  writeFileSync(scope, 'Render the split metadata shape.\n', 'utf8');
  writeFileSync(ac, '- [ ] Split shape renders. <!-- aitm-non-demonstrable -->\n', 'utf8');
  writeFileSync(origin, '- kind: code\n- discovered-during: #883\n', 'utf8');
  writeFileSync(plan, '- size: S\n- estimate: 2\n', 'utf8');
  return { dir, scope, ac, origin, plan };
}

async function preflight(args) {
  try {
    const { stdout, stderr } = await pexec('node', [PREFLIGHT, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
    };
  }
}

function sectionBody(body, heading) {
  const lines = String(body).split('\n');
  const start = lines.findIndex((line) => line === `## ${heading}`);
  assert.notEqual(start, -1, `missing ## ${heading}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

describe('preflight Story Origin authoring (#892)', () => {
  it('renders a solo shape without plan metadata input', async () => {
    const fx = fixture();
    try {
      const result = await preflight([
        '--shape',
        'solo',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
      ]);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(
        sectionBody(result.stdout, 'Story Origin'),
        '- **kind**: code\n- **discovered-during**: #883'
      );
      assert.equal(sectionBody(result.stdout, 'Plan Metadata'), '');
      assert.ok(
        result.stdout.indexOf('## Story Origin') < result.stdout.indexOf('## Plan Metadata')
      );
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('preserves optional early planning input', async () => {
    const fx = fixture();
    try {
      const result = await preflight([
        '--shape',
        'solo',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
        '--plan-metadata-file',
        fx.plan,
      ]);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(sectionBody(result.stdout, 'Plan Metadata'), '- **size**: S\n- **estimate**: 2');
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('rejects empty and prose-only Story Origin fragments', async () => {
    const fx = fixture();
    try {
      for (const value of ['', 'origin will be decided later\n']) {
        writeFileSync(fx.origin, value, 'utf8');
        const result = await preflight([
          '--shape',
          'solo',
          '--scope-file',
          fx.scope,
          '--ac-file',
          fx.ac,
          '--story-origin-file',
          fx.origin,
        ]);
        assert.equal(result.code, 2, result.stderr);
        assert.match(result.stderr, /Story Origin.*metadata field/i);
      }
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('renders a populated stub origin and an empty plan section', async () => {
    const result = await preflight(['--shape', 'stub']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(sectionBody(result.stdout, 'Story Origin'), '- **kind**: code');
    assert.equal(sectionBody(result.stdout, 'Plan Metadata'), '');
    assert.doesNotMatch(result.stdout, /set Size, Estimate, Priority, and Rank at Refine/);
  });

  it('uses the resolved issue kind in a stub origin', async () => {
    const result = await preflight(['--shape', 'stub', '--kind', 'research']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(sectionBody(result.stdout, 'Story Origin'), '- **kind**: research');
  });

  it('derives a non-stub render kind from Story Origin', async () => {
    const fx = fixture();
    try {
      writeFileSync(fx.origin, '- kind: research\n', 'utf8');
      const result = await preflight([
        '--shape',
        'solo',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
      ]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /<!-- aitm-issue-kind kind="research" -->/);
      assert.doesNotMatch(result.stdout, /All automated tests pass/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('rejects an explicit kind that conflicts with Story Origin', async () => {
    const fx = fixture();
    try {
      writeFileSync(fx.origin, '- kind: research\n', 'utf8');
      const result = await preflight([
        '--shape',
        'solo',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
        '--kind',
        'code',
      ]);
      assert.equal(result.code, 2, result.stderr);
      assert.match(result.stderr, /kind.*conflict/i);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('records a sub-issue parent inside Story Origin', async () => {
    const fx = fixture();
    try {
      const result = await preflight([
        '--shape',
        'sub-issue',
        '--parent',
        '883',
        '--scope-file',
        fx.scope,
        '--ac-file',
        fx.ac,
        '--story-origin-file',
        fx.origin,
      ]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(sectionBody(result.stdout, 'Story Origin'), /- \*\*parent\*\*: #883/);
      assert.doesNotMatch(result.stdout, /\*\*Parent epic:\*\*/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

describe('create-issue shaped flag forwarding (#892)', () => {
  it('forwards Story Origin and omits absent Plan Metadata', () => {
    const flags = buildShapeFlags({
      shape: 'solo',
      'scope-file': 'scope.md',
      'ac-file': 'ac.md',
      'story-origin-file': 'origin.md',
    });
    assert.deepEqual(flags, [
      '--shape',
      'solo',
      '--scope-file',
      'scope.md',
      '--ac-file',
      'ac.md',
      '--story-origin-file',
      'origin.md',
    ]);
  });

  it('still forwards optional early Plan Metadata', () => {
    const flags = buildShapeFlags({
      shape: 'solo',
      'scope-file': 'scope.md',
      'ac-file': 'ac.md',
      'story-origin-file': 'origin.md',
      'plan-metadata-file': 'plan.md',
    });
    assert.ok(flags.includes('--story-origin-file'));
    assert.ok(flags.includes('--plan-metadata-file'));
  });

  it('forwards optional exact verification commands', () => {
    const flags = buildShapeFlags({
      shape: 'solo',
      'scope-file': 'scope.md',
      'ac-file': 'ac.md',
      'story-origin-file': 'origin.md',
      'verification-commands-file': 'verification.txt',
    });
    assert.deepEqual(flags.slice(-2), ['--verification-commands-file', 'verification.txt']);
  });
});
