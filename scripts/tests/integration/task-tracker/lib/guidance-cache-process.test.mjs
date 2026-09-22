// @story #1674
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { loadGuidance } from '../../../../../guidance/cache.mjs';
import { observeCacheIdentity } from '../../../../../guidance/cache-identity.mjs';
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
