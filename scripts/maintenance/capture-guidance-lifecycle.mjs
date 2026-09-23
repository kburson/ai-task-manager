#!/usr/bin/env node
// @story #1765
// A new actual-CLI fixture; #1675's capture runner and artifact stay historical.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureProposedStatic } from './capture-guidance-explain.mjs';
import { configPath, SHARED_DIR, statePath } from '../task-tracker/paths.mjs';
import { mkdtempProjectIsolated } from '../task-tracker/lib/scratch-dir.mjs';
import { readyForPlanMigrationJournalPath } from '../task-tracker/lib/ready-for-plan-migration-freeze.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = path.join(root, 'bin/aitm.mjs');
const issue = 2100;
const fixedGitEnv = {
  GIT_AUTHOR_DATE: '2026-09-22T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-09-22T00:00:00Z',
};
const requiredNames = Object.freeze([
  'ready-first-load',
  'matching-receipt',
  'compaction-reset',
  'blocked-migration-freeze',
  'diagnostic',
  'refusal-remediation',
  'agent-change',
  'source-only-change',
  'lifecycle-resume',
  'lifecycle-promote',
  'lifecycle-test',
  'lifecycle-review',
  'lifecycle-deliver',
  'external-approval',
  'external-merge',
  'lifecycle-close',
  'post-close-state',
]);
const expectedStates = Object.freeze({
  'lifecycle-resume': 'plan',
  'lifecycle-promote': 'plan',
  'lifecycle-test': 'develop',
  'lifecycle-review': 'test',
  'lifecycle-deliver': 'review',
  'lifecycle-close': 'review',
  'post-close-state': 'done',
});

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fileIdentity = (relativePath) => ({
  path: relativePath,
  sha256: sha256(readFileSync(path.join(root, relativePath))),
});
const snapshotIdentity = (snapshot) => ({
  revision: snapshot.revision,
  state: snapshot.state,
  sha256: sha256(JSON.stringify(snapshot)),
});
const commandText = (event) =>
  `${event.argv.join(' ')}\n${event.stdin}${event.stdout}${event.stderr}`;

function measureText(text) {
  return {
    characters: text.length,
    bytes: Buffer.byteLength(text),
    proxyUnits: text.length / 4,
  };
}

export function measureLifecycleTraffic(events) {
  const categories = { query: '', diagnostic: '', external: '' };
  let transcriptText = '';
  for (const event of events) {
    if (event.kind === 'transition') continue;
    const category =
      event.kind === 'external' ? 'external' : event.name === 'diagnostic' ? 'diagnostic' : 'query';
    const text = commandText(event);
    transcriptText += text;
    categories[category] += text;
  }
  return {
    ...measureText(transcriptText),
    proxyTokens: Math.ceil(transcriptText.length / 4),
    categories: Object.fromEntries(
      Object.entries(categories).map(([name, value]) => [name, measureText(value)])
    ),
  };
}

export function validateLifecycleTranscript(capture) {
  if (!Array.isArray(capture?.events)) throw new Error('lifecycle:events');
  const names = capture.events.filter(({ kind }) => kind !== 'transition').map(({ name }) => name);
  for (const name of requiredNames) {
    if (!names.includes(name)) throw new Error(`lifecycle:required:${name}`);
  }
  if (
    names.length !== requiredNames.length ||
    names.some((name, index) => name !== requiredNames[index])
  )
    throw new Error('lifecycle:query-order');
  let current = null;
  const transitionStates = [];
  for (const event of capture.events) {
    if (event.kind === 'transition') {
      if (
        !current ||
        event.from.revision !== current.revision ||
        event.from.state !== current.state ||
        event.from.sha256 !== current.sha256 ||
        event.from.bodySha256 !== current.bodySha256 ||
        event.to.revision !== current.revision + 1 ||
        event.to.bodySha256 === current.bodySha256 ||
        !Array.isArray(event.evidenceAdded) ||
        event.evidenceAdded.length === 0
      )
        throw new Error('lifecycle:transition-chain');
      if (event.source !== 'fixture-injection' || event.executedAction !== null)
        throw new Error('lifecycle:transition-provenance');
      current = event.to;
      transitionStates.push(current.state);
      continue;
    }
    if (!['query', 'external'].includes(event.kind)) throw new Error('lifecycle:event-kind');
    if (
      !Array.isArray(event.argv) ||
      event.argv.length === 0 ||
      typeof event.stdin !== 'string' ||
      typeof event.stdout !== 'string' ||
      typeof event.stderr !== 'string'
    )
      throw new Error('lifecycle:command-traffic');
    const identity = {
      revision: event.stateRevision,
      state: event.state,
      sha256: event.snapshotSha256,
      bodySha256: event.authorityBodySha256,
    };
    if (!current) {
      if (identity.revision !== 0 || identity.state !== 'plan')
        throw new Error('lifecycle:initial-state');
      current = identity;
    } else if (
      identity.revision !== current.revision ||
      identity.state !== current.state ||
      identity.sha256 !== current.sha256 ||
      identity.bodySha256 !== current.bodySha256
    )
      throw new Error('lifecycle:disconnected-query');
    if (expectedStates[event.name] && event.state !== expectedStates[event.name])
      throw new Error(`lifecycle:action-state:${event.name}`);
  }
  if (transitionStates.join(',') !== 'plan,plan,develop,test,review,review,done')
    throw new Error('lifecycle:state-sequence');
  const actual = measureLifecycleTraffic(capture.events);
  if (JSON.stringify(capture.measurement?.traffic) !== JSON.stringify(actual))
    throw new Error('lifecycle:traffic-accounting');
  return true;
}

function git(args, cwd = root) {
  const result = spawnSync('git', args, {
    cwd,
    env: { ...process.env, ...fixedGitEnv },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function issueBody(snapshot) {
  const evidence = snapshot.evidence.map((name) => `- ${name}`).join('\n') || '- none';
  return `## User Story\nAs a delivery operator\nI want a complete capture\nSo that feasibility is truthful\n\n## Scope\nCapture read-only lifecycle guidance.\n\n## Acceptance Criteria\n- [ ] Capture all traffic.\n\n## Fixture Evidence (simulation only)\n${evidence}\n\n<!-- aitm-last-known-state state="${snapshot.state}" ts="2026-09-22T00:00:00Z" -->`;
}

function fakeGhSource() {
  return `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
const snapshot = JSON.parse(readFileSync(process.env.CAPTURE_SNAPSHOT_PATH, 'utf8'));
const body = ${issueBody.toString()}(snapshot);
appendFileSync(process.env.CAPTURE_AUTHORITY_LOG, JSON.stringify({ args, revision: snapshot.revision }) + '\\n');
if (args[0] === 'issue' && args[1] === 'view') {
  process.stdout.write(args.includes('--jq') ? body : JSON.stringify({ number: ${issue}, body, state: snapshot.state === 'done' ? 'CLOSED' : 'OPEN', stateReason: null, labels: [] }));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({ number: 2101, reviewDecision: snapshot.external.approval, mergedAt: snapshot.external.merge === 'merged' ? '2026-09-22T00:00:00Z' : null }) + '\\n');
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
          name: snapshot.state.replace(/(^|-)\\w/g, (m) => m.toUpperCase())
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

export function captureGuidanceLifecycle() {
  const fixtureDir = mkdtempProjectIsolated('aitm-guidance-lifecycle-');
  const config = {
    repo: 'example/project',
    projectId: 'P1',
    preferences: { gateAssigneeMatch: false },
  };
  const authorityLog = path.join(fixtureDir, 'authority.jsonl');
  const snapshotPath = path.join(fixtureDir, 'snapshot.json');
  const fakeGh = fakeGhSource();
  const snapshot = {
    revision: 0,
    state: 'plan',
    evidence: [],
    external: { approval: 'REVIEW_REQUIRED', merge: 'open' },
  };
  const events = [];
  const writeSnapshot = () => writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`);
  try {
    mkdirSync(path.join(fixtureDir, SHARED_DIR), { recursive: true });
    mkdirSync(path.dirname(statePath(fixtureDir)), { recursive: true });
    mkdirSync(path.join(fixtureDir, 'fake-bin'), { recursive: true });
    writeFileSync(configPath(fixtureDir), `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(statePath(fixtureDir), '{}\n');
    writeSnapshot();
    copyFileSync(
      path.join(root, 'instructions/aitm-guidance.yml'),
      path.join(fixtureDir, SHARED_DIR, 'aitm-guidance.yml')
    );
    writeFileSync(path.join(fixtureDir, 'fake-bin/gh'), fakeGh);
    chmodSync(path.join(fixtureDir, 'fake-bin/gh'), 0o755);
    git(['add', '-f', `${SHARED_DIR}/aitm-guidance.yml`], fixtureDir);
    git(['commit', '-qm', 'baseline fixture'], fixtureDir);
    const baseEnv = {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: fixtureDir,
      PATH: `${path.join(fixtureDir, 'fake-bin')}${path.delimiter}${process.env.PATH}`,
      TT_FULL_AUTO: '1',
      CAPTURE_AUTHORITY_LOG: authorityLog,
      CAPTURE_SNAPSHOT_PATH: snapshotPath,
    };
    const run = (kind, name, argv) => {
      writeFileSync(authorityLog, '');
      const result = spawnSync(argv[0], argv.slice(1), {
        cwd: fixtureDir,
        env: baseEnv,
        encoding: 'utf8',
        timeout: 30_000,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`capture:${name}:exit\n${result.stderr}`);
      const parsed = JSON.parse(result.stdout);
      const event = {
        kind,
        name,
        ...{
          stateRevision: snapshot.revision,
          state: snapshot.state,
          snapshotSha256: snapshotIdentity(snapshot).sha256,
          authorityBodySha256: sha256(issueBody(snapshot)),
        },
        argv,
        stdin: '',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
        remoteAuthorityReads: readFileSync(authorityLog, 'utf8').split('\n').filter(Boolean).length,
        ...(kind === 'query'
          ? {
              typed: {
                schema: parsed.schema,
                status: parsed.result.status,
                actionId: parsed.result.actionId,
                guidanceStatuses: parsed.guidance.map(({ status }) => status),
                sourceReceipt: parsed.sourceReceipt ?? null,
              },
            }
          : {}),
      };
      events.push(event);
      return parsed;
    };
    const query = (name, actionId, extra = []) =>
      run('query', name, [
        process.execPath,
        bin,
        'explain',
        String(issue),
        '--action',
        actionId,
        ...extra,
        '--json',
      ]);
    const transition = (name, state, evidenceAdded, external = {}) => {
      const from = { ...snapshotIdentity(snapshot), bodySha256: sha256(issueBody(snapshot)) };
      snapshot.revision += 1;
      snapshot.state = state;
      snapshot.evidence.push(...evidenceAdded);
      Object.assign(snapshot.external, external);
      writeSnapshot();
      events.push({
        kind: 'transition',
        name,
        source: 'fixture-injection',
        executedAction: null,
        from,
        to: { ...snapshotIdentity(snapshot), bodySha256: sha256(issueBody(snapshot)) },
        evidenceAdded,
        agentVisible: false,
      });
    };
    const first = query('ready-first-load', 'bind');
    const firstGuidance = first.guidance[0];
    const firstReceipt = `${firstGuidance.id}@${firstGuidance.digest}`;
    query('matching-receipt', 'bind', ['--known', firstReceipt]);
    query('compaction-reset', 'bind');
    const migrationJournal = readyForPlanMigrationJournalPath(fixtureDir);
    mkdirSync(path.dirname(migrationJournal), { recursive: true });
    writeFileSync(migrationJournal, '{"phase":"active-capture"}\n');
    query('blocked-migration-freeze', 'bind');
    query('diagnostic', 'bind', ['--diagnostic']);
    unlinkSync(migrationJournal);
    transition('clear-freeze', 'plan', ['freeze-cleared']);
    query('refusal-remediation', 'bind');
    transition('approve-plan', 'plan', ['plan-approval']);
    const catalogPath = path.join(fixtureDir, SHARED_DIR, 'aitm-guidance.yml');
    const originalCatalog = readFileSync(catalogPath, 'utf8');
    const changedCatalog = originalCatalog.replace(
      '        - never: bypass_guard\n        - execution_revalidates: true',
      '        - never: bypass_guard\n        - never: reuse_stale_decision\n        - execution_revalidates: true'
    );
    if (changedCatalog === originalCatalog) throw new Error('capture:agent-change-anchor');
    writeFileSync(catalogPath, changedCatalog);
    git(['add', '-f', `${SHARED_DIR}/aitm-guidance.yml`], fixtureDir);
    git(['commit', '-qm', 'agent guidance change'], fixtureDir);
    const changed = query('agent-change', 'bind', ['--known', firstReceipt]);
    const changedGuidance = changed.guidance[0];
    const changedReceipt = `${changedGuidance.id}@${changedGuidance.digest}`;
    appendFileSync(catalogPath, '\n# source-only capture change\n');
    query('source-only-change', 'bind', ['--known', changedReceipt]);
    query('lifecycle-resume', 'resume');
    query('lifecycle-promote', 'promote');
    transition('enter-develop', 'develop', ['plan-transition']);
    query('lifecycle-test', 'test');
    transition('enter-test', 'test', ['test-receipt']);
    query('lifecycle-review', 'review');
    transition('enter-review', 'review', ['review-transition']);
    query('lifecycle-deliver', 'deliver');
    transition('external-authority', 'review', ['review-approval', 'merge-evidence'], {
      approval: 'APPROVED',
      merge: 'merged',
    });
    run('external', 'external-approval', ['gh', 'pr', 'view', '2101', '--json', 'reviewDecision']);
    run('external', 'external-merge', ['gh', 'pr', 'view', '2101', '--json', 'mergedAt']);
    query('lifecycle-close', 'close');
    transition('enter-done', 'done', ['close-transition']);
    run('external', 'post-close-state', ['gh', 'issue', 'view', String(issue), '--json', 'state']);
    const traffic = measureLifecycleTraffic(events);
    const proposedStatic = Object.fromEntries(
      ['claude', 'codex'].map((adapter) => [adapter, measureProposedStatic(adapter)])
    );
    const comparison = JSON.parse(
      readFileSync(path.join(root, 'scripts/tests/fixtures/1558/context-comparison.json'))
    );
    const currentFullStaticProxyTokens = Object.fromEntries(
      ['claude', 'codex'].map((adapter) => [
        adapter,
        comparison.adapters[adapter].legacy.static.totals.proxyTokens,
      ])
    );
    const modeledProposedTotals = Object.fromEntries(
      ['claude', 'codex'].map((adapter) => [
        adapter,
        proposedStatic[adapter].totals.proxyTokens + traffic.proxyTokens,
      ])
    );
    const budgets = {
      routerPlusPickupWorking: 4000,
      fullLifecycleWorking: 5600,
      cleanResponseWorking: 240,
      blockedResponseWorking: 400,
    };
    const capture = {
      schema: 'aitm.guidance-lifecycle-capture/v1',
      captureKind: 'actual-public-cli-with-deterministic-authority',
      authority: 'deterministic-fixture',
      limitation:
        'Fixture state and evidence transitions are injected between read-only CLI queries; no lifecycle action, approval, or merge was executed. Action readiness is reported exactly as observed and does not authorize a delivery GO.',
      capturedAt: new Date().toISOString(),
      identity: {
        sourceCommit: git(['rev-parse', 'HEAD']),
        implementationFiles: [
          fileIdentity('bin/aitm.mjs'),
          fileIdentity('scripts/task-tracker/verbs/explain.mjs'),
          fileIdentity('scripts/maintenance/capture-guidance-lifecycle.mjs'),
          fileIdentity('instructions/aitm-guidance.yml'),
        ],
        scenarioManifestSha256: sha256(JSON.stringify(requiredNames)),
        initialFixtureSha256: events[0].snapshotSha256,
        initialBodySha256: events[0].authorityBodySha256,
        configSha256: sha256(`${JSON.stringify(config, null, 2)}\n`),
        fakeGhSha256: sha256(fakeGh),
        transcriptSha256: sha256(JSON.stringify(events)),
      },
      events,
      measurement: {
        proxyRule: 'ceil(concatenated agent-visible UTF-16 characters / 4)',
        traffic,
        currentFullStaticSource: 'scripts/tests/fixtures/1558/context-comparison.json',
        currentFullStaticProxyTokens,
        modeledProposedStatic: proposedStatic,
        modeledProposedTotals,
        budgets,
        verdicts: {
          routerPlusPickup: Object.fromEntries(
            ['claude', 'codex'].map((adapter) => [
              adapter,
              proposedStatic[adapter].totals.proxyTokens <= budgets.routerPlusPickupWorking,
            ])
          ),
          fullLifecycle: Object.fromEntries(
            ['claude', 'codex'].map((adapter) => [
              adapter,
              modeledProposedTotals[adapter] <= budgets.fullLifecycleWorking,
            ])
          ),
          cleanResponse:
            Math.ceil(
              Buffer.byteLength(events.find(({ name }) => name === 'ready-first-load').stdout) / 4
            ) <= budgets.cleanResponseWorking,
          blockedResponse:
            Math.ceil(
              Buffer.byteLength(
                events.find(({ name }) => name === 'blocked-migration-freeze').stdout
              ) / 4
            ) <= budgets.blockedResponseWorking,
        },
      },
    };
    validateLifecycleTranscript(capture);
    return capture;
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(captureGuidanceLifecycle(), null, 2)}\n`);
}
