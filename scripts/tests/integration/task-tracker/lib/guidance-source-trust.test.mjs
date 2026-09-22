// @story #1672
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { resolveGuidanceSource, loadSelectedGuidance } from '../../../../../guidance/source.mjs';
import { admitGuidance, classifyGuidanceRoute } from '../../../../../guidance/admission.mjs';
import { runGuidanceCli } from '../../../../task-tracker/guidance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const source = readFileSync(path.join(root, 'instructions/aitm-guidance.yml'));
const manifest = readFileSync(path.join(root, 'instructions/aitm-guidance.release.json'));

function fixture() {
  const dir = mkdtempProjectIsolated('guidance-trust-');
  const packageRoot = path.join(dir, 'relocated', '@kburson', 'ai-task-manager');
  mkdirSync(path.join(packageRoot, 'guidance'), { recursive: true });
  mkdirSync(path.join(packageRoot, 'instructions'), { recursive: true });
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@kburson/ai-task-manager',
      version: '0.1.0',
      dependencies: { 'js-yaml': '5.4.2' },
    })
  );
  writeFileSync(path.join(packageRoot, 'guidance/source.mjs'), '// fixture module\n');
  writeFileSync(path.join(packageRoot, 'instructions/aitm-guidance.yml'), source);
  writeFileSync(path.join(packageRoot, 'instructions/aitm-guidance.release.json'), manifest);
  for (const doc of ['workflow.md', 'guard-architecture.md']) {
    mkdirSync(path.join(packageRoot, 'docs/guides'), { recursive: true });
    copyFileSync(path.join(root, 'docs/guides', doc), path.join(packageRoot, 'docs/guides', doc));
  }
  return {
    dir,
    packageRoot,
    moduleUrl: pathToFileURL(path.join(packageRoot, 'guidance/source.mjs')).href,
    projectPath: path.join(dir, '.ai-task-manager', 'aitm-guidance.yml'),
  };
}

function adopt(f, content = source) {
  mkdirSync(path.dirname(f.projectPath), { recursive: true });
  writeFileSync(f.projectPath, content);
  execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: f.dir });
}

test('module-relative package source ignores project node_modules and ignored root catalog', () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.dir, 'node_modules', '@kburson', 'ai-task-manager', 'instructions'), {
      recursive: true,
    });
    writeFileSync(path.join(f.dir, 'aitm-guidance.yml'), 'invalid: root\n');
    writeFileSync(
      path.join(f.dir, 'node_modules/@kburson/ai-task-manager/instructions/aitm-guidance.yml'),
      'invalid: wrong-package\n'
    );
    const selected = resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl });
    assert.equal(selected.sourceType, 'package');
    assert.equal(selected.trust, 'published');
    assert.equal(selected.path, path.join(f.packageRoot, 'instructions/aitm-guidance.yml'));
    assert.equal(loadSelectedGuidance(selected).valid, true);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('tracked project catalog wholly shadows package, including modified and invalid content', () => {
  const f = fixture();
  try {
    adopt(f);
    let selected = resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl });
    assert.equal(selected.trust, 'project-owned-current');
    assert.deepEqual(selected.warnings, ['guidance-project-source-uncommitted']);
    assert.equal(loadSelectedGuidance(selected).valid, true);
    writeFileSync(f.projectPath, `${source.toString('utf8')}\n# local comment\n`);
    selected = resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl });
    assert.equal(selected.trust, 'project-owned-diverged');
    assert.deepEqual(selected.warnings, ['guidance-project-source-uncommitted']);
    assert.equal(loadSelectedGuidance(selected).valid, true);
    writeFileSync(f.projectPath, 'schema: invalid\n');
    selected = resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl });
    assert.equal(selected.sourceType, 'project');
    assert.equal(loadSelectedGuidance(selected).valid, false);
    assert.equal(
      admitGuidance({ projectRoot: f.dir, moduleUrl: f.moduleUrl, argv: ['promote'] }).code,
      'guidance-catalog-invalid'
    );
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('untracked project source and tampered package fail without fallback', () => {
  const f = fixture();
  try {
    mkdirSync(path.dirname(f.projectPath), { recursive: true });
    writeFileSync(f.projectPath, source);
    assert.equal(
      resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl }).trust,
      'project-untracked'
    );
    assert.equal(
      admitGuidance({ projectRoot: f.dir, moduleUrl: f.moduleUrl, argv: ['promote'] }).code,
      'guidance-catalog-invalid'
    );
    rmSync(f.projectPath);
    writeFileSync(
      path.join(f.packageRoot, 'instructions/aitm-guidance.yml'),
      `${source}\n# tampered\n`
    );
    assert.equal(
      resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl }).trust,
      'published-tampered'
    );
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('recovery classification is closed and admission does not call effects', () => {
  assert.equal(classifyGuidanceRoute(['guidance', 'validate']), 'recovery');
  assert.equal(classifyGuidanceRoute(['guidance', 'source']), 'recovery');
  assert.equal(classifyGuidanceRoute(['help', 'promote']), 'recovery');
  assert.equal(classifyGuidanceRoute(['promote', '--help']), 'recovery');
  assert.equal(classifyGuidanceRoute(['--version']), 'recovery');
  assert.equal(classifyGuidanceRoute(['guidance', 'explain', 'action.promote']), 'operational');
  assert.equal(classifyGuidanceRoute(['promote', '--skip-network']), 'operational');
  const f = fixture();
  try {
    writeFileSync(path.join(f.packageRoot, 'instructions/aitm-guidance.yml'), 'invalid: true\n');
    let effects = 0;
    const result = admitGuidance({
      projectRoot: f.dir,
      moduleUrl: f.moduleUrl,
      argv: ['promote', '--skip-network'],
      onAdmitted: () => {
        effects += 1;
      },
    });
    assert.equal(result.code, 'guidance-catalog-invalid');
    assert.equal(effects, 0);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('missing package identity is a named indeterminate failure', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.packageRoot, 'package.json'), '{"name":"wrong"}');
    const result = resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl });
    assert.equal(result.trust, 'indeterminate');
    assert.equal(result.code, 'guidance-package-identity-invalid');
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('offline recovery source and validate inspect selected, candidate, and published profiles', () => {
  const f = fixture();
  try {
    adopt(f);
    writeFileSync(f.projectPath, 'schema: invalid\n');
    const output = [];
    const errors = [];
    const options = {
      projectRoot: f.dir,
      moduleUrl: f.moduleUrl,
      stdout: { write: (value) => output.push(value) },
      stderr: { write: (value) => errors.push(value) },
    };
    assert.equal(runGuidanceCli(['source', '--json'], options), 0);
    assert.equal(JSON.parse(output.pop()).trust, 'project-owned-diverged');
    assert.equal(runGuidanceCli(['validate', '--json', '--refresh'], options), 1);
    assert.equal(JSON.parse(output.pop()).valid, false);
    assert.equal(runGuidanceCli(['validate', '--published', '--json'], options), 0);
    assert.equal(JSON.parse(output.pop()).sourceType, 'package');
    assert.equal(
      runGuidanceCli(
        [
          'validate',
          '--file',
          path.join(f.packageRoot, 'instructions/aitm-guidance.yml'),
          '--json',
        ],
        options
      ),
      0
    );
    assert.equal(JSON.parse(output.pop()).sourceType, 'candidate');
    assert.equal(runGuidanceCli(['explain', 'action.promote'], options), 2);
    assert.match(errors.join(''), /unknown command explain/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('missing release manifest and non-regular override are named failures', () => {
  const f = fixture();
  try {
    rmSync(path.join(f.packageRoot, 'instructions/aitm-guidance.release.json'));
    assert.equal(
      resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl }).code,
      'guidance-release-manifest-unavailable'
    );
    writeFileSync(path.join(f.packageRoot, 'instructions/aitm-guidance.release.json'), manifest);
    mkdirSync(f.projectPath, { recursive: true });
    assert.equal(
      resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl }).code,
      'guidance-project-source-invalid-type'
    );
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('symlinked package and unsupported virtual or missing source resolve by name', () => {
  const f = fixture();
  try {
    const linked = path.join(f.dir, 'linked-package');
    symlinkSync(f.packageRoot, linked, 'dir');
    const linkedUrl = pathToFileURL(path.join(linked, 'guidance/source.mjs')).href;
    const selected = resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: linkedUrl });
    assert.equal(selected.trust, 'published');
    assert.equal(selected.path, path.join(f.packageRoot, 'instructions/aitm-guidance.yml'));
    assert.equal(
      resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: 'virtual:source' }).code,
      'guidance-package-resolution-unsupported'
    );
    rmSync(path.join(f.packageRoot, 'instructions/aitm-guidance.yml'));
    assert.equal(
      resolveGuidanceSource({ projectRoot: f.dir, moduleUrl: f.moduleUrl }).code,
      'guidance-package-source-unavailable'
    );
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('a project file outside the asserted Git root is indeterminate, never published', () => {
  const f = fixture();
  try {
    const nested = path.join(f.dir, 'not-the-root');
    const candidate = path.join(nested, '.ai-task-manager/aitm-guidance.yml');
    mkdirSync(path.dirname(candidate), { recursive: true });
    writeFileSync(candidate, source);
    const selected = resolveGuidanceSource({ projectRoot: nested, moduleUrl: f.moduleUrl });
    assert.equal(selected.trust, 'indeterminate');
    assert.equal(selected.code, 'guidance-project-root-indeterminate');
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('actual recovery CLI finds a tracked override from a nested Git directory', () => {
  const f = fixture();
  try {
    adopt(f);
    const nested = path.join(f.dir, 'src', 'nested');
    mkdirSync(nested, { recursive: true });
    const cli = path.join(root, 'scripts/task-tracker/guidance.mjs');
    const report = JSON.parse(
      execFileSync(process.execPath, [cli, 'source', '--json'], {
        cwd: nested,
        encoding: 'utf8',
      })
    );
    assert.equal(report.sourceType, 'project');
    assert.equal(report.trust, 'project-owned-current');
    assert.equal(report.path, f.projectPath);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('failed Git-root discovery from a nested directory is indeterminate, not package fallback', () => {
  const f = fixture();
  try {
    adopt(f);
    const nested = path.join(f.dir, 'src', 'nested');
    mkdirSync(nested, { recursive: true });
    const cli = path.join(root, 'scripts/task-tracker/guidance.mjs');
    const result = spawnSync(process.execPath, [cli, 'source', '--json'], {
      cwd: nested,
      encoding: 'utf8',
      env: { ...process.env, GIT_CEILING_DIRECTORIES: f.dir },
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.trust, 'indeterminate');
    assert.equal(report.code, 'guidance-project-root-indeterminate');
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
