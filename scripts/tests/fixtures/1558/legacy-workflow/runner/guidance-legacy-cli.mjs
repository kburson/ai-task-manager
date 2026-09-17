// @story #1654
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectTmpDir } from '../../task-tracker/paths.mjs';
import { attachLegacyAuthorityCapture } from './guidance-legacy-authority.mjs';
import { readJsonLines, reconcileTransportLedger } from './guidance-legacy-transport.mjs';

const helperRoot = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(helperRoot, 'guidance-legacy-preload.mjs');
const projectRoot = path.resolve(helperRoot, '../../..');
const flagInventoryPath = path.join(
  projectRoot,
  'scripts/tests/fixtures/1558/behavioral-flags.json'
);

function sanitizedEnvironment(extra = {}) {
  const retained = ['HOME', 'PATH', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM'];
  const env = Object.fromEntries(
    retained.filter((key) => process.env[key]).map((key) => [key, process.env[key]])
  );
  Object.assign(env, extra);
  const inventory = JSON.parse(readFileSync(flagInventoryPath, 'utf8'));
  for (const entry of inventory.flags) {
    if (
      entry.baselinePolicy === 'remove-from-characterization-environment' ||
      /(?:BYPASS|FAKE|FAULT|SKIP)/.test(entry.flag)
    ) {
      delete env[entry.flag];
    }
  }
  return env;
}

export function captureLegacyWorkflow({
  sourceCommit,
  adapter,
  scenario,
  authorityFixture,
  scratchRoot,
}) {
  if (!scenario?.entrypoint) throw new Error('scenario.entrypoint is required');
  if (!path.isAbsolute(scratchRoot))
    throw new Error('scratchRoot must be an absolute isolated path');
  mkdirSync(scratchRoot, { recursive: true });
  const workspace = mkdtempSync(path.join(scratchRoot, 'legacy-workflow-'));
  const temporaryDirectory = projectTmpDir(workspace);
  execFileSync('git', ['init', '--quiet', workspace]);
  const configPath = path.join(workspace, 'transport-config.json');
  const ledgerPath = path.join(workspace, 'transport-ledger.jsonl');
  const escapePath = path.join(workspace, 'transport-escapes.jsonl');
  writeFileSync(
    configPath,
    `${JSON.stringify({ requests: scenario.requests ?? [], ledgerPath, escapePath }, null, 2)}\n`
  );

  const env = sanitizedEnvironment({
    ...(scenario.env ?? {}),
    AITM_GUIDANCE_LEGACY_TRANSPORT_CONFIG: configPath,
    AITM_GUIDANCE_LEGACY_SOURCE_COMMIT: sourceCommit,
    AITM_GUIDANCE_LEGACY_ADAPTER: adapter,
    AITM_GUIDANCE_LEGACY_AUTHORITY_FIXTURE: authorityFixture ?? '',
    GIT_CONFIG_GLOBAL: path.join(workspace, 'absent-global-gitconfig'),
    // cspell:disable-next-line
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: workspace,
    NODE_OPTIONS: `--import=${preloadPath}`,
    TMPDIR: temporaryDirectory,
    XDG_CACHE_HOME: path.join(workspace, '.cache'),
    XDG_CONFIG_HOME: path.join(workspace, '.config'),
    XDG_DATA_HOME: path.join(workspace, '.local/share'),
  });
  const result = spawnSync(process.execPath, [scenario.entrypoint, ...(scenario.args ?? [])], {
    cwd: workspace,
    env,
    encoding: 'utf8',
  });
  const transportLedger = readJsonLines(ledgerPath);
  const transportEscapes = readJsonLines(escapePath);
  const capture = {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    workspace,
    runtime: process.version,
    sourceCommit,
    adapter,
    transportLedger,
    transportEscapes,
    environmentKeys: Object.keys(env).sort(),
  };
  if (transportEscapes.length > 0) {
    const error = new Error(
      `legacy workflow attempted ${transportEscapes.length} undeclared physical transport call(s)`
    );
    error.capture = capture;
    throw error;
  }
  capture.reconciliation = reconcileTransportLedger(scenario.requests ?? [], transportLedger);
  const fixture = scenario.authorityScenario
    ? typeof authorityFixture === 'string' && authorityFixture
      ? JSON.parse(readFileSync(authorityFixture, 'utf8'))
      : authorityFixture
    : null;
  return attachLegacyAuthorityCapture({
    capture,
    fixture,
    authorityScenario: scenario.authorityScenario,
    requestDeclarations: scenario.requests ?? [],
  });
}
