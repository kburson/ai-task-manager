#!/usr/bin/env node
// @story #1675
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = path.join(root, 'bin/aitm.mjs');
const issue = 2100;
const body = `## User Story
As an operator
I want deterministic explanation capture
So that feasibility evidence is reproducible

## Scope
Capture read-only bind guidance.

## Acceptance Criteria
- [ ] Bind is explainable.

<!-- aitm-last-known-state state="plan" ts="2026-09-22T00:00:00Z" -->`;
const fixedGitEnv = {
  GIT_AUTHOR_DATE: '2026-09-22T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-09-22T00:00:00Z',
};

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fileIdentity(relativePath) {
  const bytes = readFileSync(path.join(root, relativePath));
  return { path: relativePath, sha256: sha256(bytes) };
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...fixedGitEnv },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

export function measureProposedStatic(adapter) {
  const planPath = 'docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md';
  const plan = readFileSync(path.join(root, planPath), 'utf8');
  const extract = (pattern, id) => {
    const match = pattern.exec(plan);
    if (!match) throw new Error(`capture:missing-static-section:${id}`);
    return match[1];
  };
  const files = [
    {
      id: 'shim',
      sourcePath: 'skill/SKILL.md',
      sourceSection: 'complete-file',
      text: readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8'),
    },
    {
      id: 'router-proposal',
      sourcePath: planPath,
      sourceSection: 'Appendix A.1 router',
      text: extract(/const router = `([\s\S]*?)`;/, 'router'),
    },
    {
      id: 'pickup-proposal',
      sourcePath: planPath,
      sourceSection: 'Appendix A.1 pickup',
      text: extract(/const pickup = `([\s\S]*?)`;/, 'pickup'),
    },
    {
      id: 'adapter-proposal',
      sourcePath: planPath,
      sourceSection: `Appendix A.1 adapter.${adapter}`,
      text: extract(new RegExp(adapter + ': `([\\s\\S]*?)`,'), `adapter-${adapter}`),
    },
  ].map(({ text, ...entry }) => ({
    ...entry,
    characters: text.length,
    bytes: Buffer.byteLength(text),
    proxyTokens: Math.ceil(text.length / 4),
    sha256: sha256(text),
  }));
  return {
    files,
    totals: {
      characters: files.reduce((sum, file) => sum + file.characters, 0),
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      proxyTokens: files.reduce((sum, file) => sum + file.proxyTokens, 0),
    },
  };
}

function fakeGhSource() {
  return `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
const body = ${JSON.stringify(body)};
appendFileSync(process.env.CAPTURE_AUTHORITY_LOG, JSON.stringify({ args }) + '\\n');
if (args[0] === 'issue' && args[1] === 'view') {
  process.stdout.write(body);
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    const query = JSON.parse(input).query;
    if (query.includes('projectItems')) {
      process.stdout.write(JSON.stringify({ data: { repository: { issue: {
        assignees: { nodes: [] },
        projectItems: { nodes: [{ id: 'I1', project: { id: 'P1' }, fieldValueByName: {
          name: process.env.CAPTURE_BOARD_STATE || 'Plan'
        } }], pageInfo: { hasNextPage: false, endCursor: null } }
      } } } }));
    } else {
      process.stdout.write(JSON.stringify({ data: { repository: { issue: { body } } } }));
    }
  });
} else {
  process.stderr.write('unsupported fake gh call: ' + args.join(' '));
  process.exit(2);
}
`;
}

function commandText(argv) {
  return `${argv.join(' ')}\n`;
}

export function captureGuidanceExplain() {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'aitm-guidance-capture-'));
  const config = {
    repo: 'example/project',
    projectId: 'P1',
    preferences: { gateAssigneeMatch: false },
  };
  const authorityLog = path.join(fixtureDir, 'authority.jsonl');
  const fakeGh = fakeGhSource();
  try {
    mkdirSync(path.join(fixtureDir, '.ai-task-manager'), { recursive: true });
    mkdirSync(path.join(fixtureDir, '.tmp/aitm/state'), { recursive: true });
    mkdirSync(path.join(fixtureDir, 'fake-bin'), { recursive: true });
    writeFileSync(
      path.join(fixtureDir, '.ai-task-manager/task-tracker.json'),
      `${JSON.stringify(config, null, 2)}\n`
    );
    writeFileSync(path.join(fixtureDir, '.tmp/aitm/state/task-tracker-state.json'), '{}\n');
    copyFileSync(
      path.join(root, 'instructions/aitm-guidance.yml'),
      path.join(fixtureDir, '.ai-task-manager/aitm-guidance.yml')
    );
    writeFileSync(path.join(fixtureDir, 'fake-bin/gh'), fakeGh);
    chmodSync(path.join(fixtureDir, 'fake-bin/gh'), 0o755);
    git(['init', '-q'], { cwd: fixtureDir });
    git(['config', 'user.email', 'capture@example.com'], { cwd: fixtureDir });
    git(['config', 'user.name', 'Capture Fixture'], { cwd: fixtureDir });
    git(['add', '.'], { cwd: fixtureDir });
    git(['commit', '-qm', 'baseline fixture'], { cwd: fixtureDir });

    const baseEnv = {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: fixtureDir,
      PATH: `${path.join(fixtureDir, 'fake-bin')}${path.delimiter}${process.env.PATH}`,
      TT_FULL_AUTO: '1',
      CAPTURE_AUTHORITY_LOG: authorityLog,
    };
    const run = (name, args, extraEnv = {}) => {
      writeFileSync(authorityLog, '');
      const argv = [process.execPath, bin, ...args];
      const result = spawnSync(argv[0], argv.slice(1), {
        cwd: fixtureDir,
        env: { ...baseEnv, ...extraEnv },
        encoding: 'utf8',
        timeout: 30_000,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr || `capture:${name}:exit`);
      const parsed = JSON.parse(result.stdout);
      const remoteAuthorityReads = readFileSync(authorityLog, 'utf8')
        .split('\n')
        .filter(Boolean).length;
      return {
        name,
        argv,
        stdin: '',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
        remoteAuthorityReads,
        typed: {
          schema: parsed.schema,
          status: parsed.result.status,
          actionId: parsed.result.actionId,
          guidanceIds: parsed.guidance.map(({ id }) => id),
          guidanceStatuses: parsed.guidance.map(({ status }) => status),
          sourceReceipt: parsed.sourceReceipt ?? null,
        },
        proxyTokens: Math.ceil(Buffer.byteLength(result.stdout) / 4),
      };
    };
    const args = ['explain', String(issue), '--action', 'bind'];
    const first = run('ready-first-load', [...args, '--json']);
    const firstGuidance = JSON.parse(first.stdout).guidance[0];
    const firstReceipt = `${firstGuidance.id}@${firstGuidance.digest}`;
    const scenarios = [
      first,
      run('matching-receipt', [...args, '--known', firstReceipt, '--json']),
      run('compaction-reset', [...args, '--json']),
      run('blocked-authority-drift', [...args, '--json'], { CAPTURE_BOARD_STATE: 'Develop' }),
      run('diagnostic', [...args, '--diagnostic', '--json']),
    ];

    const catalogPath = path.join(fixtureDir, '.ai-task-manager/aitm-guidance.yml');
    const originalCatalog = readFileSync(catalogPath, 'utf8');
    const changedCatalog = originalCatalog.replace(
      '          { never: bypass_guard },\n          { execution_revalidates: true },',
      '          { never: bypass_guard },\n          { never: reuse_stale_decision },\n          { execution_revalidates: true },'
    );
    if (changedCatalog === originalCatalog) throw new Error('capture:agent-change-anchor');
    writeFileSync(catalogPath, changedCatalog);
    git(['add', '.ai-task-manager/aitm-guidance.yml'], { cwd: fixtureDir });
    git(['commit', '-qm', 'agent guidance change'], { cwd: fixtureDir });
    const agentChange = run('agent-change', [...args, '--known', firstReceipt, '--json']);
    scenarios.push(agentChange);
    const agentGuidance = JSON.parse(agentChange.stdout).guidance[0];
    const agentReceipt = `${agentGuidance.id}@${agentGuidance.digest}`;
    appendFileSync(catalogPath, '\n# source-only capture change\n');
    scenarios.push(run('source-only-change', [...args, '--known', agentReceipt, '--json']));

    const trafficText = scenarios
      .map((scenario) => commandText(scenario.argv) + scenario.stdout + scenario.stderr)
      .join('');
    const actualTraffic = {
      characters: trafficText.length,
      bytes: Buffer.byteLength(trafficText),
      proxyTokens: Math.ceil(trafficText.length / 4),
    };
    const staticModels = {
      claude: measureProposedStatic('claude'),
      codex: measureProposedStatic('codex'),
    };
    const comparison = JSON.parse(
      readFileSync(path.join(root, 'scripts/tests/fixtures/1558/context-comparison.json'))
    );
    const currentFull = Object.fromEntries(
      ['claude', 'codex'].map((adapter) => [
        adapter,
        comparison.adapters[adapter].legacy.static.totals.proxyTokens,
      ])
    );
    const totals = Object.fromEntries(
      ['claude', 'codex'].map((adapter) => [
        adapter,
        staticModels[adapter].totals.proxyTokens + actualTraffic.proxyTokens,
      ])
    );
    const budgets = {
      routerPlusPickupWorking: 4000,
      fullLifecycleWorking: 5600,
      cleanResponseWorking: 240,
      blockedResponseWorking: 400,
    };
    const clean = scenarios.find(({ name }) => name === 'ready-first-load');
    const blocked = scenarios.find(({ name }) => name === 'blocked-authority-drift');
    return {
      schema: 'aitm.guidance-actual-cli-capture/v2',
      captureKind: 'actual-public-cli-subprocess',
      capturedAt: new Date().toISOString(),
      identity: {
        sourceCommit: git(['rev-parse', 'HEAD']),
        implementationFiles: [
          fileIdentity('bin/aitm.mjs'),
          fileIdentity('scripts/task-tracker/verbs/explain.mjs'),
          fileIdentity('scripts/task-tracker/lib/action-decision/evaluate.mjs'),
          fileIdentity('instructions/aitm-guidance.yml'),
          fileIdentity('scripts/maintenance/capture-guidance-explain.mjs'),
        ],
        fixture: {
          bodySha256: sha256(body),
          configSha256: sha256(`${JSON.stringify(config, null, 2)}\n`),
          fakeGhSha256: sha256(fakeGh),
          baselineGuidanceSha256: sha256(
            readFileSync(path.join(root, 'instructions/aitm-guidance.yml'))
          ),
        },
      },
      scenarios,
      measurement: {
        proxyRule: 'ceil(concatenated UTF-16 characters / 4)',
        actualTraffic,
        currentFullStaticSource: 'scripts/tests/fixtures/1558/context-comparison.json',
        currentFullStaticProxyTokens: currentFull,
        modeledProposedStatic: staticModels,
        modeledTotalsWithActualTraffic: totals,
        budgets,
        verdicts: {
          routerPlusPickup: Object.fromEntries(
            ['claude', 'codex'].map((adapter) => [
              adapter,
              staticModels[adapter].totals.proxyTokens <= budgets.routerPlusPickupWorking,
            ])
          ),
          fullLifecycle: Object.fromEntries(
            ['claude', 'codex'].map((adapter) => [
              adapter,
              totals[adapter] <= budgets.fullLifecycleWorking,
            ])
          ),
          cleanResponse: clean.proxyTokens <= budgets.cleanResponseWorking,
          blockedResponse: blocked.proxyTokens <= budgets.blockedResponseWorking,
          improvesCurrentFull: Object.fromEntries(
            ['claude', 'codex'].map((adapter) => [adapter, totals[adapter] < currentFull[adapter]])
          ),
        },
      },
    };
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(captureGuidanceExplain(), null, 2)}\n`);
}
