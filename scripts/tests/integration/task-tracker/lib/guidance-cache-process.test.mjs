// @story #1674
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { checkCacheBudgets } from '../../../../maintenance/benchmark-guidance-cache.mjs';
import { classifyGuidanceRoute } from '../../../../../guidance/admission.mjs';
import { loadGuidance } from '../../../../../guidance/cache.mjs';
import {
  observeCacheIdentity,
  observeFileIdentity,
  observeGitIndexIdentity,
} from '../../../../../guidance/cache-identity.mjs';
import { observeGuidanceSource, resolveGuidanceSource } from '../../../../../guidance/source.mjs';
const sourceUrl = new URL('../../../../../guidance/source.mjs', import.meta.url).href;
const identityUrl = new URL('../../../../../guidance/cache-identity.mjs', import.meta.url).href;

function inspectInProcess(root) {
  const script = `
    import { observeGuidanceSource } from ${JSON.stringify(sourceUrl)};
    import { observeCacheIdentity } from ${JSON.stringify(identityUrl)};
    const selected = observeGuidanceSource({ projectRoot: process.cwd() });
    process.stdout.write(JSON.stringify(observeCacheIdentity({
      selected, projectRoot: process.cwd(), profile: 'active-project'
    })));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
    })
  );
}

function loadWithParserTraps(root, need) {
  const trap = path.join(root, 'guidance-trap.mjs');
  writeFileSync(
    trap,
    `import { registerHooks } from 'node:module';
     registerHooks({ load(url, context, nextLoad) {
       if (url.endsWith('/guidance/validate.mjs')) return {
         format: 'module', shortCircuit: true,
         source: 'export function validateGuidance() { throw Error("validator-called-on-warm-path"); }'
       };
       if (url.endsWith('/guidance/parse.mjs')) return {
         format: 'module', shortCircuit: true,
         source: 'export function parseGuidanceSource() { throw Error("parser-called-on-warm-path"); }'
       };
       return nextLoad(url, context);
     }});
    `
  );
  const cacheUrl = new URL('../../../../../guidance/cache.mjs', import.meta.url).href;
  const script = `
    import { loadGuidance } from ${JSON.stringify(cacheUrl)};
    const result = loadGuidance({ projectRoot: process.cwd(), need: ${JSON.stringify(need)} });
    process.stderr.write(JSON.stringify({
      valid: result.valid,
      found: Boolean(result.agentIndex?.byId?.['action.bind']),
      human: Boolean(result.humanCatalog),
      errors: result.errors?.length ?? null,
    }));
  `;
  return spawnSync(process.execPath, ['--import', trap, '--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('fresh processes reject an old identity after a tracked override enters the index', () => {
  const root = mkdtempProjectIsolated('aitm-1674-process-');
  try {
    execFileSync('git', ['init', '-q', root]);
    mkdirSync(path.join(root, '.ai-task-manager'));
    const override = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    writeFileSync(override, 'invalid: true\n');
    const untracked = inspectInProcess(root);
    execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    const tracked = inspectInProcess(root);
    assert.notDeepEqual(tracked.identity, untracked.identity);
    assert.equal(untracked.identity.tracked, false);
    assert.equal(tracked.identity.tracked, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cold compile and fresh-process agent load do not require human artifact', () => {
  const root = mkdtempProjectIsolated('aitm-1674-warm-agent-');
  try {
    const cold = loadGuidance({ projectRoot: root, need: 'manifest' });
    assert.equal(cold.valid, true);
    const cacheDir = path.join(root, '.tmp/aitm/guidance-cache');
    assert.equal(existsSync(path.join(cacheDir, 'manifest.v1.json')), true);
    writeFileSync(path.join(cacheDir, 'human-catalog.v1.json'), '{corrupt');
    const warm = loadWithParserTraps(root, 'agent');
    assert.equal(warm.status, 0, warm.stderr);
    assert.equal(warm.stdout, '');
    assert.deepEqual(JSON.parse(warm.stderr), {
      valid: true,
      found: true,
      human: false,
      errors: null,
    });
    assert.equal(readFileSync(path.join(cacheDir, 'human-catalog.v1.json'), 'utf8'), '{corrupt');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fresh manifest and human loads skip parser and validator calls', () => {
  const root = mkdtempProjectIsolated('aitm-1674-warm-human-');
  try {
    assert.equal(loadGuidance({ projectRoot: root }).valid, true);
    for (const need of ['manifest', 'human']) {
      const warm = loadWithParserTraps(root, need);
      assert.equal(warm.status, 0, warm.stderr);
      assert.equal(warm.stdout, '');
      const result = JSON.parse(warm.stderr);
      assert.equal(result.valid, true);
      assert.equal(result.human, need === 'human');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid ordinary load is manifest-only while explicit diagnostics load remains warm', () => {
  const root = mkdtempProjectIsolated('aitm-1674-invalid-');
  try {
    const override = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, 'schema: invalid\n');
    execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    const before = observeCacheIdentity({
      selected: observeGuidanceSource({ projectRoot: root }),
      projectRoot: root,
      profile: 'active-project',
    });
    resolveGuidanceSource({ projectRoot: root });
    const after = observeCacheIdentity({
      selected: observeGuidanceSource({ projectRoot: root }),
      projectRoot: root,
      profile: 'active-project',
    });
    assert.deepEqual(after.identity, before.identity);
    const cold = loadGuidance({ projectRoot: root });
    assert.equal(cold.valid, false);
    assert.equal(
      existsSync(path.join(root, '.tmp/aitm/guidance-cache/manifest.v1.json')),
      true,
      cold.code
    );
    const diagnostics = loadWithParserTraps(root, 'diagnostics');
    assert.equal(diagnostics.status, 0, diagnostics.stderr);
    assert.equal(diagnostics.stdout, '');
    assert.ok(JSON.parse(diagnostics.stderr).errors > 0);
    const diagnosticFile = path.join(root, '.tmp/aitm/guidance-cache/diagnostics.v1.json');
    writeFileSync(diagnosticFile, '{corrupt');
    const ordinary = loadWithParserTraps(root, 'manifest');
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.equal(ordinary.stdout, '');
    assert.equal(JSON.parse(ordinary.stderr).valid, false);
    assert.equal(readFileSync(diagnosticFile, 'utf8'), '{corrupt');
    const repaired = loadGuidance({ projectRoot: root, need: 'diagnostics' });
    assert.ok(repaired.errors.length > 0);
    assert.equal(
      JSON.parse(readFileSync(diagnosticFile, 'utf8')).schema,
      'aitm.guidance-diagnostics/v1'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing, corrupt, schema-mismatched, and digest-mismatched artifacts rebuild', () => {
  const root = mkdtempProjectIsolated('aitm-1674-corruption-');
  try {
    assert.equal(loadGuidance({ projectRoot: root }).valid, true);
    const cacheDir = path.join(root, '.tmp/aitm/guidance-cache');
    const manifestPath = path.join(cacheDir, 'manifest.v1.json');
    const agentPath = path.join(cacheDir, 'agent-index.v1.json');
    const assertRebuilt = () => {
      const loaded = loadGuidance({ projectRoot: root, need: 'agent' });
      assert.equal(loaded.valid, true);
      assert.ok(loaded.agentIndex.byId['action.bind']);
      assert.equal(
        JSON.parse(readFileSync(agentPath, 'utf8')).schema,
        'aitm.guidance-agent-index/v1'
      );
    };
    writeFileSync(agentPath, '{broken');
    assertRebuilt();
    rmSync(agentPath);
    assertRebuilt();
    const schemaMutation = JSON.parse(readFileSync(agentPath, 'utf8'));
    schemaMutation.schema = 'unexpected';
    const changedBytes = JSON.stringify(schemaMutation);
    writeFileSync(agentPath, changedBytes);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.artifacts.agent.digest = `sha256:${createHash('sha256').update(changedBytes).digest('hex')}`;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assertRebuilt();
    const badDigest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    badDigest.artifacts.agent.digest = `sha256:${'0'.repeat(64)}`;
    writeFileSync(manifestPath, JSON.stringify(badDigest));
    assertRebuilt();
    writeFileSync(manifestPath, '{broken');
    assertRebuilt();
    rmSync(manifestPath);
    assertRebuilt();
    const badSchema = JSON.parse(readFileSync(manifestPath, 'utf8'));
    badSchema.schema = 'unexpected';
    writeFileSync(manifestPath, JSON.stringify(badSchema));
    assertRebuilt();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an artifact changed just after manifest publication cannot be accepted as a mixed generation', () => {
  const root = mkdtempProjectIsolated('aitm-1674-race-');
  try {
    const cacheDir = path.join(root, '.tmp/aitm/guidance-cache');
    const preload = path.join(root, 'publish-race.mjs');
    writeFileSync(
      preload,
      `import fs from 'node:fs';
       import { syncBuiltinESMExports } from 'node:module';
       const realRename = fs.renameSync;
       let injected = false;
       fs.renameSync = (source, target) => {
         realRename(source, target);
         if (!injected && String(target).endsWith('manifest.v1.json')) {
           injected = true;
           fs.writeFileSync(${JSON.stringify(path.join(cacheDir, 'agent-index.v1.json'))}, '{mixed');
         }
       };
       syncBuiltinESMExports();
      `
    );
    const cacheUrl = new URL('../../../../../guidance/cache.mjs', import.meta.url).href;
    const script = `
      import { loadGuidance } from ${JSON.stringify(cacheUrl)};
      const result = loadGuidance({ projectRoot: process.cwd(), need: 'agent' });
      process.stderr.write(JSON.stringify({ valid: result.valid, found: Boolean(result.agentIndex?.byId?.['action.bind']) }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--import', preload, '--input-type=module', '-e', script],
      {
        cwd: root,
        encoding: 'utf8',
      }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '');
    assert.deepEqual(JSON.parse(child.stderr), { valid: true, found: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a source changed on both cold read attempts refuses indeterminate without publishing', () => {
  const root = mkdtempProjectIsolated('aitm-1674-source-change-');
  try {
    const override = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, 'schema: invalid\n');
    execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    const preload = path.join(root, 'source-race.mjs');
    writeFileSync(
      preload,
      `import fs from 'node:fs';
       import { syncBuiltinESMExports } from 'node:module';
       const realRead = fs.readFileSync;
       let changes = 0;
       fs.readFileSync = (file, ...args) => {
         const bytes = realRead(file, ...args);
         if (String(file) === ${JSON.stringify(override)}) {
           changes += 1;
           fs.writeFileSync(file, 'schema: invalid\\n# change ' + changes + '\\n');
         }
         return bytes;
       };
       syncBuiltinESMExports();
      `
    );
    const cacheUrl = new URL('../../../../../guidance/cache.mjs', import.meta.url).href;
    const script = `
      import { loadGuidance } from ${JSON.stringify(cacheUrl)};
      const result = loadGuidance({ projectRoot: process.cwd() });
      process.stderr.write(JSON.stringify({ valid: result.valid, code: result.code }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--import', preload, '--input-type=module', '-e', script],
      {
        cwd: root,
        encoding: 'utf8',
      }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '');
    assert.deepEqual(JSON.parse(child.stderr), {
      valid: false,
      code: 'guidance-source-changed-during-read',
    });
    assert.equal(existsSync(path.join(root, '.tmp/aitm/guidance-cache/manifest.v1.json')), false);
    const admissionUrl = new URL('../../../../../guidance/admission.mjs', import.meta.url).href;
    const admissionScript = `
      import { admitGuidance } from ${JSON.stringify(admissionUrl)};
      let effects = 0;
      const result = admitGuidance({ projectRoot: process.cwd(), argv: ['promote'],
        onAdmitted: () => { effects += 1; } });
      process.stderr.write(JSON.stringify({
        admitted: result.admitted, detailCode: result.detailCode, effects,
      }));
    `;
    const admission = spawnSync(
      process.execPath,
      ['--import', preload, '--input-type=module', '-e', admissionScript],
      { cwd: root, encoding: 'utf8' }
    );
    assert.equal(admission.status, 0, admission.stderr);
    assert.equal(admission.stdout, '');
    assert.deepEqual(JSON.parse(admission.stderr), {
      admitted: false,
      detailCode: 'guidance-source-changed-during-read',
      effects: 0,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('operational admission uses a warm manifest without validator calls', () => {
  const root = mkdtempProjectIsolated('aitm-1674-admission-');
  try {
    assert.equal(loadGuidance({ projectRoot: root }).valid, true);
    const warm = loadWithParserTraps(root, 'manifest');
    assert.equal(warm.status, 0, warm.stderr);
    const admissionUrl = new URL('../../../../../guidance/admission.mjs', import.meta.url).href;
    const script = `
      import { admitGuidance } from ${JSON.stringify(admissionUrl)};
      let effects = 0;
      const result = admitGuidance({
        projectRoot: process.cwd(), argv: ['promote'],
        onAdmitted: () => { effects += 1; },
      });
      process.stderr.write(JSON.stringify({ admitted: result.admitted, effects }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--import', path.join(root, 'guidance-trap.mjs'), '--input-type=module', '-e', script],
      { cwd: root, encoding: 'utf8' }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '');
    assert.deepEqual(JSON.parse(child.stderr), { admitted: true, effects: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit validation loads warm diagnostics without invoking the validator', () => {
  const root = mkdtempProjectIsolated('aitm-1674-validation-');
  try {
    assert.equal(loadGuidance({ projectRoot: root, need: 'diagnostics' }).valid, true);
    assert.equal(loadWithParserTraps(root, 'manifest').status, 0);
    const cliUrl = new URL('../../../../task-tracker/guidance.mjs', import.meta.url).href;
    const script = `
      import { runGuidanceCli } from ${JSON.stringify(cliUrl)};
      let output = '';
      const status = runGuidanceCli(['validate', '--json'], {
        cwd: process.cwd(), projectRoot: process.cwd(),
        stdout: { write(value) { output += value; } },
        stderr: { write(value) { throw Error(value); } },
      });
      process.stderr.write(JSON.stringify({ status, valid: JSON.parse(output).valid }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--import', path.join(root, 'guidance-trap.mjs'), '--input-type=module', '-e', script],
      { cwd: root, encoding: 'utf8' }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '');
    assert.deepEqual(JSON.parse(child.stderr), { status: 0, valid: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit refresh bypasses a warm manifest and parses exactly once', () => {
  const root = mkdtempProjectIsolated('aitm-1674-refresh-');
  try {
    assert.equal(loadGuidance({ projectRoot: root }).valid, true);
    const preload = path.join(root, 'parse-count.mjs');
    writeFileSync(
      preload,
      `import { registerHooks } from 'node:module';
       registerHooks({ load(url, context, nextLoad) {
         const loaded = nextLoad(url, context);
         if (!url.endsWith('/guidance/parse.mjs')) return loaded;
         const original = String(loaded.source);
         const anchor = 'export function parseGuidanceSource(input) {';
         if (!original.includes(anchor)) throw Error('parse instrumentation anchor missing');
         return {
           ...loaded,
           source: original.replace(anchor,
             anchor + ' globalThis.__aitmParseCalls = (globalThis.__aitmParseCalls ?? 0) + 1;'),
         };
       }});
      `
    );
    const cliUrl = new URL('../../../../task-tracker/guidance.mjs', import.meta.url).href;
    const script = `
      import { runGuidanceCli } from ${JSON.stringify(cliUrl)};
      let output = '';
      const status = runGuidanceCli(['validate', '--json', '--refresh'], {
        cwd: process.cwd(), projectRoot: process.cwd(),
        stdout: { write(value) { output += value; } },
        stderr: { write(value) { throw Error(value); } },
      });
      process.stderr.write(JSON.stringify({
        status, valid: JSON.parse(output).valid,
        parserCalls: globalThis.__aitmParseCalls ?? 0,
      }));
    `;
    const child = spawnSync(
      process.execPath,
      ['--import', preload, '--input-type=module', '-e', script],
      {
        cwd: root,
        encoding: 'utf8',
      }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '');
    assert.deepEqual(JSON.parse(child.stderr), { status: 0, valid: true, parserCalls: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source replacement with preserved mtime changes the cache identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-identity-');
  try {
    const source = path.join(root, 'guidance.yml');
    const replacement = path.join(root, 'replacement.yml');
    writeFileSync(source, 'first\n');
    const before = observeFileIdentity(source);
    writeFileSync(replacement, 'other\n');
    const originalTime = statSync(source).mtime;
    utimesSync(replacement, originalTime, originalTime);
    renameSync(replacement, source);
    assert.equal(readFileSync(source, 'utf8'), 'other\n');
    assert.notDeepEqual(observeFileIdentity(source), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chmod changes source ctime even when catalog bytes are unchanged', () => {
  const root = mkdtempProjectIsolated('aitm-1674-ctime-');
  try {
    const source = path.join(root, 'guidance.yml');
    writeFileSync(source, 'same bytes\n');
    const before = observeFileIdentity(source);
    chmodSync(source, 0o600);
    const after = observeFileIdentity(source);
    assert.notDeepEqual(after, before);
    assert.equal(after.mtimeNs, before.mtimeNs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source observation detects project override adoption without reading YAML', () => {
  const root = mkdtempProjectIsolated('aitm-1674-source-');
  try {
    const before = observeGuidanceSource({ projectRoot: root });
    assert.equal(before.sourceType, 'package');
    assert.equal(Object.hasOwn(before, 'source'), false);
    const override = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, 'invalid: true\n');
    execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    const after = observeGuidanceSource({ projectRoot: root });
    assert.equal(after.sourceType, 'project');
    assert.equal(after.tracked, true);
    assert.equal(Object.hasOwn(after, 'source'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an explicitly selected Git index cannot reuse the default index identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-index-');
  try {
    writeFileSync(path.join(root, 'guidance.yml'), 'first\n');
    execFileSync('git', ['add', '-f', 'guidance.yml'], { cwd: root });
    const regular = observeGitIndexIdentity(root);
    const selectedIndex = path.join(root, 'selected.index');
    execFileSync('git', ['read-tree', '--empty'], {
      cwd: root,
      env: { ...process.env, GIT_INDEX_FILE: selectedIndex },
    });
    const alternate = observeGitIndexIdentity(root, { gitIndexFile: selectedIndex });
    assert.equal(regular.decision, 'stat');
    assert.equal(alternate.decision, 'stat');
    assert.notDeepEqual(alternate, regular);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a linked .git file resolves its own effective worktree index', () => {
  const root = mkdtempProjectIsolated('aitm-1674-linked-index-');
  const linked = path.join(root, 'linked');
  try {
    execFileSync('git', ['worktree', 'add', '-q', '--detach', linked, 'HEAD'], { cwd: root });
    assert.match(readFileSync(path.join(linked, '.git'), 'utf8'), /^gitdir: /);
    const primary = observeGitIndexIdentity(root);
    const before = observeGitIndexIdentity(linked);
    assert.equal(before.decision, 'stat');
    assert.notEqual(before.indexPath, primary.indexPath);
    writeFileSync(path.join(linked, 'new-guidance.yml'), 'first\n');
    execFileSync('git', ['add', '-f', 'new-guidance.yml'], { cwd: linked });
    assert.notDeepEqual(observeGitIndexIdentity(linked), before);
  } finally {
    if (existsSync(linked)) {
      execFileSync('git', ['worktree', 'remove', '--force', linked], { cwd: root });
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('a split-index shared file change invalidates the worktree index identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-split-index-');
  try {
    execFileSync('git', ['update-index', '--split-index'], { cwd: root });
    const gitDir = path.resolve(
      root,
      execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' }).trim()
    );
    const shared = readdirSync(gitDir).find((name) => name.startsWith('sharedindex.'));
    assert.ok(shared, 'Git must create the split-index dependency');
    const before = observeGitIndexIdentity(root);
    const changed = new Date(Date.now() + 5000);
    utimesSync(path.join(gitDir, shared), changed, changed);
    assert.notDeepEqual(observeGitIndexIdentity(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('candidate validation identity never equals active-project validation identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-profile-');
  try {
    const selected = observeGuidanceSource({ projectRoot: root });
    const active = observeCacheIdentity({ selected, projectRoot: root, profile: 'active-project' });
    const candidatePath = path.join(root, 'candidate.yml');
    writeFileSync(candidatePath, 'invalid: true\n');
    const candidate = observeCacheIdentity({
      selected,
      projectRoot: root,
      profile: 'candidate',
      candidatePath,
    });
    assert.notEqual(active.decision, 'indeterminate');
    assert.notEqual(candidate.decision, 'indeterminate');
    assert.notDeepEqual(active, candidate);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runtime and published-digest changes invalidate an otherwise identical source', () => {
  const root = mkdtempProjectIsolated('aitm-1674-runtime-');
  try {
    const selected = observeGuidanceSource({ projectRoot: root });
    const options = { selected, projectRoot: root, profile: 'published' };
    const before = observeCacheIdentity(options);
    const changedVersion = observeCacheIdentity({
      ...options,
      selected: { ...selected, packageVersion: 'changed-version' },
    });
    const changedDigest = observeCacheIdentity({
      ...options,
      selected: { ...selected, publishedCatalogFileDigest: 'sha256:changed' },
    });
    assert.notEqual(before.decision, 'indeterminate');
    assert.notDeepEqual(changedVersion.identity, before.identity);
    assert.notDeepEqual(changedDigest.identity, before.identity);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a candidate path cannot reuse active package validation', () => {
  const root = mkdtempProjectIsolated('aitm-1674-candidate-');
  try {
    const candidatePath = path.join(root, 'candidate.yml');
    writeFileSync(candidatePath, 'schema: invalid\n');
    const candidate = loadGuidance({
      projectRoot: root,
      profile: 'candidate',
      candidatePath,
      need: 'diagnostics',
    });
    assert.equal(candidate.valid, false);
    assert.ok(candidate.errors.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CI cache budgets reject a timing that consumes the reserved headroom', () => {
  const measured = {
    cases: {
      cold: { medianMs: 200, p95Ms: 208 },
      warmManifest: { medianMs: 140, p95Ms: 157 },
      warmAgent: { medianMs: 145, p95Ms: 158 },
      human: { medianMs: 150, p95Ms: 160 },
      invalidDiagnostics: { medianMs: 155, p95Ms: 163 },
    },
  };
  assert.equal(checkCacheBudgets(measured), true);
  measured.cases.warmManifest.p95Ms = 257;
  assert.throws(() => checkCacheBudgets(measured), /exceeds 80% working ceiling/);
});

test('nested package preferences help is a recovery route before cache admission', () => {
  assert.equal(classifyGuidanceRoute(['configure', 'preferences', '--help']), 'recovery');
});

test('concurrent cold writers leave one digest-consistent warm generation', async () => {
  const root = mkdtempProjectIsolated('aitm-1674-concurrent-');
  try {
    const cacheUrl = new URL('../../../../../guidance/cache.mjs', import.meta.url).href;
    const script = `
      import { loadGuidance } from ${JSON.stringify(cacheUrl)};
      const result = loadGuidance({ projectRoot: process.cwd(), need: 'agent' });
      if (!result.valid || !result.agentIndex?.byId?.['action.bind']) process.exitCode = 2;
    `;
    const launch = () =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, stdout, stderr }));
      });
    const results = await Promise.all([launch(), launch()]);
    for (const result of results) {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout, '');
    }
    const warm = loadWithParserTraps(root, 'agent');
    assert.equal(warm.status, 0, warm.stderr);
    assert.equal(warm.stdout, '');
    const cacheDir = path.join(root, '.tmp/aitm/guidance-cache');
    assert.equal(
      readdirSync(cacheDir).some((name) => name.endsWith('.tmp')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
