// @story #1674
// Publisher-only B2 proof. Execute the package under test from a production-only tarball.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';

const PACKAGE = '@kburson/ai-task-manager';
const RUNTIME = ['guidance/cache.mjs', 'guidance/cache-identity.mjs', 'guidance/compile.mjs'];

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `guidance-b2-certification-failed: ${command} ${args.join(' ')}: ` +
        `${result.error?.message ?? result.stderr ?? result.stdout}`
    );
  }
  return result;
}

function executeLoader({ installedRoot, consumerDir, need, trap = null }) {
  const moduleUrl = pathToFileURL(path.join(installedRoot, 'guidance/cache.mjs')).href;
  const script = `
    import { loadGuidance } from ${JSON.stringify(moduleUrl)};
    const result = loadGuidance({ projectRoot: process.cwd(), need: ${JSON.stringify(need)} });
    process.stderr.write(JSON.stringify({
      valid: result.valid,
      code: result.code,
      agent: Boolean(result.agentIndex?.byId?.['action.bind']),
      human: Boolean(result.humanCatalog?.byId?.['action.bind']),
      errors: result.errors?.length ?? null,
    }));
  `;
  const args = [...(trap ? ['--import', trap] : []), '--input-type=module', '-e', script];
  const result = run(process.execPath, args, consumerDir);
  if (result.stdout !== '')
    throw new Error('guidance-b2-certification-failed: loader was not silent');
  try {
    return JSON.parse(result.stderr);
  } catch {
    throw new Error('guidance-b2-certification-failed: loader result was not structured');
  }
}

function assertResult(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(
        `guidance-b2-certification-failed: ${label}.${key} expected ${JSON.stringify(value)}, ` +
          `got ${JSON.stringify(actual[key])}`
      );
    }
  }
}

export function certifyGuidanceCache(packageRoot) {
  for (const relative of RUNTIME) {
    if (!existsSync(path.join(packageRoot, relative))) {
      throw new Error(`guidance-b2-certification-absent: ${relative}`);
    }
  }
  const sandbox = mkdtempSync(path.join(projectScratchDir('test', packageRoot), 'guidance-cert-'));
  const packDir = path.join(sandbox, 'pack');
  const consumerDir = path.join(sandbox, 'consumer');
  mkdirSync(packDir);
  mkdirSync(consumerDir);
  try {
    run('git', ['init', '-q', '-b', 'trunk'], consumerDir);
    writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'aitm-guidance-cert-consumer',
        version: '1.0.0',
        private: true,
        type: 'module',
      })
    );
    if (run('npm', ['prefix'], consumerDir).stdout.trim() !== consumerDir) {
      throw new Error('guidance-b2-certification-failed: npm consumer prefix escaped');
    }
    const packed = run(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir],
      packageRoot
    );
    const parsedReport = JSON.parse(packed.stdout);
    const report = Array.isArray(parsedReport)
      ? parsedReport[0]
      : (parsedReport[PACKAGE] ?? Object.values(parsedReport)[0]);
    if (report.name !== PACKAGE || !report.filename) {
      throw new Error('guidance-b2-certification-failed: tarball identity mismatch');
    }
    run(
      'npm',
      [
        'install',
        '--prefix',
        consumerDir,
        '--omit=dev',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--silent',
        path.join(packDir, report.filename),
      ],
      consumerDir
    );
    const installedRoot = path.join(consumerDir, 'node_modules', PACKAGE);
    for (const relative of RUNTIME) {
      if (!existsSync(path.join(installedRoot, relative))) {
        throw new Error(`guidance-b2-certification-failed: packed runtime missing ${relative}`);
      }
    }
    if (
      existsSync(path.join(installedRoot, 'scripts/tests')) ||
      existsSync(path.join(installedRoot, 'scripts/maintenance'))
    ) {
      throw new Error('guidance-b2-certification-failed: development tooling packed');
    }
    assertResult(
      executeLoader({ installedRoot, consumerDir, need: 'manifest' }),
      { valid: true },
      'cold'
    );
    const trap = path.join(sandbox, 'parser-trap.mjs');
    writeFileSync(
      trap,
      `import { registerHooks } from 'node:module';
       registerHooks({ load(url, context, nextLoad) {
         if (url.startsWith(${JSON.stringify(pathToFileURL(installedRoot).href)}) && url.endsWith('/guidance/validate.mjs'))
           return { format: 'module', shortCircuit: true,
             source: 'export function validateGuidance() { throw Error("warm-validator-call"); }' };
         if (url.startsWith(${JSON.stringify(pathToFileURL(installedRoot).href)}) && url.endsWith('/guidance/parse.mjs'))
           return { format: 'module', shortCircuit: true,
             source: 'export function parseGuidanceSource() { throw Error("warm-parser-call"); }' };
         return nextLoad(url, context);
       }});
      `
    );
    assertResult(
      executeLoader({ installedRoot, consumerDir, need: 'manifest', trap }),
      { valid: true },
      'warm-manifest'
    );
    assertResult(
      executeLoader({ installedRoot, consumerDir, need: 'agent', trap }),
      { valid: true, agent: true, human: false },
      'warm-agent'
    );
    assertResult(
      executeLoader({ installedRoot, consumerDir, need: 'human', trap }),
      { valid: true, human: true },
      'warm-human'
    );
    const override = path.join(consumerDir, '.ai-task-manager', 'aitm-guidance.yml');
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, 'schema: invalid\n');
    run('git', ['add', '.ai-task-manager/aitm-guidance.yml'], consumerDir);
    assertResult(
      executeLoader({ installedRoot, consumerDir, need: 'manifest' }),
      { valid: false },
      'invalid-cold'
    );
    assertResult(
      executeLoader({ installedRoot, consumerDir, need: 'manifest', trap }),
      { valid: false },
      'invalid-warm'
    );
    const diagnostic = executeLoader({ installedRoot, consumerDir, need: 'diagnostics', trap });
    if (diagnostic.valid !== false || !(diagnostic.errors > 0)) {
      throw new Error('guidance-b2-certification-failed: invalid diagnostics unavailable');
    }
    const diagnosticPath = path.join(consumerDir, '.tmp/aitm/guidance-cache/diagnostics.v1.json');
    writeFileSync(diagnosticPath, '{corrupt');
    const repaired = executeLoader({ installedRoot, consumerDir, need: 'diagnostics' });
    if (
      !(repaired.errors > 0) ||
      JSON.parse(readFileSync(diagnosticPath, 'utf8')).schema !== 'aitm.guidance-diagnostics/v1'
    ) {
      throw new Error('guidance-b2-certification-failed: corrupt diagnostics did not rebuild');
    }
    return { ok: true, package: PACKAGE, cases: 7 };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
