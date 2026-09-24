#!/usr/bin/env node
// @story #1774
// @story #1765
// @story #1767
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
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureProposedStatic } from '../../maintenance/capture-guidance-explain.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../task-tracker/lib/delivery-records.mjs';
import { configPath, SHARED_DIR, statePath } from '../../task-tracker/paths.mjs';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';
import {
  FINAL_GUIDANCE_CONTEXT_BUDGETS,
  GUIDANCE_CONTEXT_BUDGETS,
} from '../../task-tracker/lib/context-budgets.mjs';
import { readyForPlanMigrationJournalPath } from '../../task-tracker/lib/ready-for-plan-migration-freeze.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bin = path.join(root, 'bin/aitm.mjs');
const issue = 2100;
const fixedGitEnv = {
  GIT_AUTHOR_DATE: '2026-09-22T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-09-22T00:00:00Z',
};
const fixedClockSource = `const NativeDate = Date;
const fixed = '2026-09-23T00:00:00.000Z';
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return NativeDate.parse(fixed); }
};
`;
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
function measureRecertificationStatic(adapter) {
  const files = [
    'skill/SKILL.md',
    ...['router', 'pickup', adapter].map(
      (name) => `scripts/tests/fixtures/1558/obligation-complete-static/${name}.md`
    ),
  ].map((sourcePath) => {
    const text = readFileSync(path.join(root, sourcePath), 'utf8');
    return {
      sourcePath,
      characters: text.length,
      bytes: Buffer.byteLength(text),
      proxyTokens: Math.ceil(text.length / 4),
      sha256: sha256(text),
    };
  });
  return {
    files,
    totals: {
      characters: files.reduce((sum, file) => sum + file.characters, 0),
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      proxyTokens: files.reduce((sum, file) => sum + file.proxyTokens, 0),
    },
  };
}
function measureInstalledStatic(adapter, installedRoot) {
  const files = [
    'skill/SKILL.md',
    'skill/shared/router.md',
    `skill/adapters/${adapter}/SKILL.md`,
    '.ai-task-manager/templates/pickup-directive.md',
  ].map((sourcePath) => {
    const packagePath = sourcePath.startsWith('.ai-task-manager/')
      ? 'templates/pickup-directive.md'
      : sourcePath;
    const text = readFileSync(path.join(installedRoot, packagePath), 'utf8');
    if (sha256(readFileSync(path.join(root, sourcePath))) !== sha256(text)) {
      throw new Error(`capture: installed source differs: ${sourcePath}`);
    }
    return {
      sourcePath,
      packagePath,
      characters: text.length,
      bytes: Buffer.byteLength(text),
      proxyTokens: Math.ceil(text.length / 4),
      sha256: sha256(text),
    };
  });
  return {
    files,
    totals: {
      characters: files.reduce((sum, file) => sum + file.characters, 0),
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      proxyTokens: files.reduce((sum, file) => sum + file.proxyTokens, 0),
    },
  };
}
function installProductionPackage(scratchDir) {
  const run = (command, args, cwd) => {
    const result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, npm_config_offline: 'true', npm_config_loglevel: 'silent' },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        `capture: package ${command} ${args.join(' ')}: ${result.error?.message ?? result.stderr}`
      );
    }
    return result.stdout;
  };
  const packResult = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratchDir], root)
  );
  const report = Array.isArray(packResult) ? packResult[0] : packResult['@kburson/ai-task-manager'];
  if (report.name !== '@kburson/ai-task-manager' || !report.filename) {
    throw new Error('capture: unexpected production package');
  }
  const consumer = path.join(scratchDir, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, 'package.json'),
    '{"name":"guidance-capture-consumer","private":true}\n'
  );
  run(
    'npm',
    [
      'install',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      `file:${path.join(scratchDir, report.filename)}`,
    ],
    consumer
  );
  const installedRoot = path.join(consumer, 'node_modules/@kburson/ai-task-manager');
  const packagePaths = [
    'bin/aitm.mjs',
    'skill/SKILL.md',
    'skill/shared/router.md',
    'skill/adapters/claude/SKILL.md',
    'skill/adapters/codex/SKILL.md',
    'templates/pickup-directive.md',
  ];
  const files = packagePaths.map((sourcePath) => ({
    path: sourcePath,
    sha256: sha256(readFileSync(path.join(installedRoot, sourcePath))),
  }));
  return {
    installedRoot,
    bin: path.join(consumer, 'node_modules/.bin/aitm'),
    package: {
      name: report.name,
      version: report.version,
      productionOnly: true,
      files,
      filesSha256: sha256(JSON.stringify(files)),
    },
  };
}
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

function injectMergedDeliveryFixture(fixtureDir, sourceHead) {
  const base = git(['rev-parse', 'origin/trunk'], fixtureDir);
  const tree = git(['rev-parse', `${sourceHead}^{tree}`], fixtureDir);
  const commitTitle = '[#2100] Merge recertification fixture';
  const commitMessage = `PR #2101 incorporates ${sourceHead}\n\nAttribution: [#2100]`;
  const created = spawnSync('git', ['commit-tree', tree, '-p', base, '-p', sourceHead], {
    cwd: fixtureDir,
    env: { ...process.env, ...fixedGitEnv },
    encoding: 'utf8',
    input: `${commitTitle}\n\n${commitMessage}\n`,
  });
  if (created.status !== 0) throw new Error(`capture:merge-fixture:${created.stderr}`);
  const mergeCommitSha = created.stdout.trim();
  git(['push', '-q', 'origin', `${mergeCommitSha}:refs/heads/trunk`], fixtureDir);
  git(['update-ref', 'refs/remotes/origin/trunk', mergeCommitSha], fixtureDir);
  const intent = buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: issue,
    repository: 'example/project',
    prNumber: 2101,
    baseRef: 'trunk',
    headRef: 'feature/child/2100',
    expectedHeadSha: sourceHead,
    mergeMethod: 'merge',
    attributionTokens: ['#2100'],
    commitTitle,
    commitMessage,
    provider: 'external',
    sessionId: 'fixture',
    clientCreatedAt: '2026-09-21T00:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId: intent.intentId,
    issueNumber: issue,
    prNumber: 2101,
    expectedHeadSha: sourceHead,
    mergeCommitSha,
    baseRef: 'trunk',
    mergeMethod: 'merge',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'external',
    sessionId: 'fixture',
    verifiedAt: '2026-09-22T00:00:00.000Z',
  });
  return {
    mergeCommitSha,
    comments: [
      {
        id: 11,
        created_at: '2026-09-21T00:00:00Z',
        body: renderDeliveryIntentComment(intent),
      },
      {
        id: 12,
        created_at: '2026-09-22T00:00:00Z',
        body: renderDeliveryReceiptComment(receipt),
      },
    ],
  };
}

export function issueBody(snapshot, recertification = false) {
  const evidence = snapshot.evidence.map((name) => `- ${name}`).join('\n') || '- none';
  if (recertification) {
    const deepDive = Array.from(
      { length: 24 },
      (_, index) =>
        `The delivery fixture checks a distinct authority condition ${index + 1}: issue state, bound session, current commit, evidence, dependency, approval, and final delivery all have separate recorded sources. This fixture changes those sources between read-only queries and never executes a blocked action.`
    ).join('\n');
    const reviewReady = ['review', 'done'].includes(snapshot.state);
    const receipt = (stage) =>
      Buffer.from(
        JSON.stringify({
          schema: 'aitm.verification-receipt/v1',
          receiptId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          issue: 2100,
          stage,
          commitSha: snapshot.head,
          startedAt: '2026-09-22T00:00:00Z',
          completedAt: '2026-09-22T00:00:00Z',
          environment: {
            node: 'v26.8.1',
            platform: 'darwin',
            lockfileHash: 'sha256:' + 'a'.repeat(64),
            configHashes: {},
            sandbox: { kind: 'worktree', identity: 'fixture', clean: true },
          },
          commands: [],
          supersedes: null,
        })
      ).toString('base64url');
    return `## User Story\nAs a delivery operator\nI want a complete capture\nSo that feasibility is truthful\n\n## Scope\nCapture read-only lifecycle guidance.\n\n## Plan Metadata\n- **Source-plan**: fixture-plan.md\n\n## Pickup Directive — MANDATORY, DO NOT SKIP\nFollow the fixture contract.\n\n## Deep-Dive Analysis\n${deepDive}\n\n<!-- aitm-deep-dive-posted: 2026-09-22T00:00:00Z -->\n<!-- aitm-deep-dive-complete: 2026-09-22T00:00:00Z -->\n\n## Acceptance Criteria\n- [${snapshot.state === 'plan' ? ' ' : 'x'}] Capture all traffic. <!-- aitm-verified cmd="\`npm test\`" sha="${snapshot.head}" ts="2026-09-22T00:00:00Z" exit="0" -->\n\n## Verification Commands\n- [${snapshot.state === 'plan' ? ' ' : 'x'}] \`npm test\`\n\n### 🔗 Commits\n<!-- aitm-commits: ${snapshot.head ?? 'uncommitted'} -->\n\n## Fixture Evidence (simulation only)\n${evidence}\n\n<!-- aitm-entered-backlog: 2026-09-22T00:00:00Z -->\n<!-- aitm-entered-refine: 2026-09-22T00:00:00Z -->\n<!-- aitm-entered-ready-for-plan: 2026-09-22T00:00:00Z -->\n<!-- aitm-entered-plan: 2026-09-22T00:00:00Z -->\n${snapshot.state === 'plan' ? '' : '<!-- aitm-entered-develop: 2026-09-22T00:00:00Z -->'}\n${['test', 'review', 'done'].includes(snapshot.state) ? '<!-- aitm-entered-test: 2026-09-22T00:00:00Z -->' : ''}\n${['review', 'done'].includes(snapshot.state) ? '<!-- aitm-entered-review: 2026-09-22T00:00:00Z -->' : ''}\n${['test', 'review', 'done'].includes(snapshot.state) ? `<!-- aitm-dod-verified sha=\"${snapshot.head}\" ts=\"2026-09-22T00:00:00Z\" -->` : ''}\n${reviewReady ? `<!-- aitm-verification-receipt stage=\"test\" data=\"${receipt('test')}\" -->\n<!-- aitm-verification-receipt stage=\"review\" data=\"${receipt('review')}\" -->\n- [x] Agent Review Passed <!-- aitm-verified gate=\"agent-review\" result=\"pass\" -->\n<!-- aitm-review-approved ts=\"2026-09-22T00:00:00Z\" approved-sha=\"${snapshot.head}\" full-auto=\"yes\" signals=\"fixture\" -->` : ''}\n<!-- aitm-last-known-state state="${snapshot.state}" ts="2026-09-22T00:00:00Z" -->\n<!-- aitm-fields: {"schema":1,"values":{"size":"S","estimate":4}} -->`;
  }
  return `## User Story\nAs a delivery operator\nI want a complete capture\nSo that feasibility is truthful\n\n## Scope\nCapture read-only lifecycle guidance.\n\n## Acceptance Criteria\n- [ ] Capture all traffic.\n\n## Fixture Evidence (simulation only)\n${evidence}\n\n<!-- aitm-last-known-state state="${snapshot.state}" ts="2026-09-22T00:00:00Z" -->`;
}

function fakeGhSource(mode) {
  return `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
const recertification = ${mode !== 'historical'};
const snapshot = JSON.parse(readFileSync(process.env.CAPTURE_SNAPSHOT_PATH, 'utf8'));
const body = ${issueBody.toString()}(snapshot, recertification);
appendFileSync(process.env.CAPTURE_AUTHORITY_LOG, JSON.stringify({ args, revision: snapshot.revision }) + '\\n');
if (args[0] === 'issue' && args[1] === 'view') {
  if (recertification && args.includes('state') && args[args.indexOf('--json') + 1] === 'state') {
    process.stdout.write(JSON.stringify({ state: snapshot.state === 'done' ? 'CLOSED' : 'OPEN' }) + '\\n');
    process.exit(0);
  }
  if (recertification && args.includes('blockedBy,blocking')) {
    const refs = snapshot.heavy && args[2] === '${issue}' ? [3100, 3101, 3102] : [];
    const nodes = refs.map((number) => ({ number, repository: { nameWithOwner: 'example/project' } }));
    process.stdout.write(JSON.stringify({ blockedBy: { nodes, totalCount: nodes.length }, blocking: { nodes: [], totalCount: 0 } }) + '\\n');
    process.exit(0);
  }
  if (recertification && args.includes('comments')) {
    const comments = [{ body: '### 🔗 Commits\\n<!-- aitm-commits: ' + snapshot.head + ' -->' }];
    process.stdout.write(JSON.stringify(args.includes('--jq') ? comments : { comments }) + '\\n');
    process.exit(0);
  }
  process.stdout.write(args.includes('--jq') ? body : JSON.stringify({ number: ${issue}, body, state: snapshot.state === 'done' ? 'CLOSED' : 'OPEN', stateReason: null, updatedAt: '2026-09-22T00:00:00Z', labels: [], assignees: recertification ? [{ login: 'fixture-operator' }] : [] }));
  process.exit(0);
}
if (recertification && args[0] === 'api' && args[1] === 'user') {
  process.stdout.write('fixture-operator\\n');
  process.exit(0);
}
if (recertification && args[0] === 'api' && args[1] === 'repos/example/project/issues/${issue}/comments') {
  process.stdout.write(JSON.stringify([{ id: 1, body: '<!-- aitm-refined-estimate: ${issue} -->\\n### Planned Estimate\\n\\n| Field | Refine | Plan | Δ |\\n|---|---|---|---|\\n| Size | S | S | 0 |\\n| Estimate (h) | 4 | 4 | 0 |' }]) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'api' && args.includes('--slurp') && args.includes('repos/example/project/issues/${issue}/comments')) {
  process.stdout.write(JSON.stringify([snapshot.external.comments ?? []]) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'api' && args.includes('--slurp') && args.some((arg) => arg.startsWith('repos/example/project/issues/${issue}/sub_issues?'))) {
  const children = snapshot.heavy
    ? [2201, 2202, 2203, 2204].map((number) => ({ number, state: 'open', body: '## User Story\\nChild fixture.\\n<!-- aitm-last-known-state state="review" ts="2026-09-22T00:00:00Z" -->' }))
    : [];
  process.stdout.write(JSON.stringify([children]) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'api' && args.includes('--slurp') && args.some((arg) => arg.startsWith('repos/example/project/issues/${issue}/comments?'))) {
  process.stdout.write(JSON.stringify([snapshot.external.comments ?? []]) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'api' && args[1] === 'repos/example/project') {
  process.stdout.write(JSON.stringify({ allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false }) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'api' && args[1] === 'repos/example/project/git/ref/heads/feature/child/2100') {
  process.stdout.write(JSON.stringify({ object: { sha: snapshot.head } }) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'pr' && args[1] === 'list') {
  const requested = args[args.indexOf('--json') + 1];
  const item = requested === 'number'
    ? { number: 2101 }
    : { number: 2101, state: snapshot.external.merge === 'merged' ? 'MERGED' : 'OPEN', mergedAt: snapshot.external.merge === 'merged' ? '2026-09-22T00:00:00Z' : null, mergeCommit: snapshot.external.merge === 'merged' ? { oid: snapshot.external.mergeCommitSha } : null, headRefName: 'feature/child/2100', headRefOid: snapshot.head, baseRefName: 'trunk' };
  process.stdout.write(JSON.stringify([item]) + '\\n');
  process.exit(0);
}
if (recertification && args[0] === 'pr' && args[1] === 'checks') {
  process.stdout.write(JSON.stringify([{ name: 'ci', state: 'SUCCESS' }]) + '\\n');
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'view') {
  if (recertification && args.includes('headRefOid') && args[args.indexOf('--json') + 1] === 'headRefOid') {
    process.stdout.write(JSON.stringify({ headRefOid: snapshot.head }) + '\\n');
    process.exit(0);
  }
  if (recertification && args[args.indexOf('--json') + 1] === 'reviewDecision') {
    process.stdout.write(JSON.stringify({ reviewDecision: snapshot.external.approval }) + '\\n');
    process.exit(0);
  }
  if (recertification && args[args.indexOf('--json') + 1] === 'mergedAt') {
    process.stdout.write(JSON.stringify({ mergedAt: snapshot.external.merge === 'merged' ? '2026-09-22T00:00:00Z' : null }) + '\\n');
    process.exit(0);
  }
  if (recertification) {
    process.stdout.write(JSON.stringify({ number: 2101, state: snapshot.external.merge === 'merged' ? 'MERGED' : 'OPEN', isDraft: false, baseRefName: 'trunk', headRefName: 'feature/child/2100', headRefOid: snapshot.head, headRepository: { name: 'project' }, headRepositoryOwner: { login: 'example' }, mergeable: 'MERGEABLE', mergedAt: snapshot.external.merge === 'merged' ? '2026-09-22T00:00:00Z' : null, mergeCommit: snapshot.external.merge === 'merged' ? { oid: snapshot.external.mergeCommitSha } : null }) + '\\n');
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ number: 2101, reviewDecision: snapshot.external.approval, mergedAt: snapshot.external.merge === 'merged' ? '2026-09-22T00:00:00Z' : null }) + '\\n');
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  const inlineQuery = args.find((arg) => arg.startsWith('query='));
  if (!recertification && inlineQuery) {
    process.stderr.write('unsupported historical fake gh call: api graphql -f');
    process.exit(2);
  }
  if (recertification && inlineQuery) {
    if (inlineQuery.includes('pullRequest(number:')) {
      const { execFileSync } = require('node:child_process');
      const tree = execFileSync('git', ['rev-parse', snapshot.head + '^{tree}'], { encoding: 'utf8' }).trim();
      const parent = execFileSync('git', ['rev-parse', snapshot.head + '^'], { encoding: 'utf8' }).trim();
      const message = execFileSync('git', ['log', '-1', '--format=%B', snapshot.head], { encoding: 'utf8' }).trim();
      process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { headRefOid: snapshot.head, commits: { totalCount: 1, nodes: [{ commit: { oid: snapshot.head, messageHeadline: message.split('\\n')[0], message, parents: { totalCount: 1, nodes: [{ oid: parent }], pageInfo: { hasNextPage: false } }, tree: { oid: tree } } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } }) + '\\n');
    } else if (inlineQuery.includes('issue(number:$number)')) {
      process.stdout.write(JSON.stringify({ data: { repository: { issue: { number: ${issue}, body, parent: null } } } }) + '\\n');
    } else {
      process.stdout.write(JSON.stringify({ data: { repository: { issue: { parent: null } } } }) + '\\n');
    }
    process.exit(0);
  }
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    const query = JSON.parse(input).query;
    if (recertification && query.includes('subIssues(')) {
      process.stdout.write(JSON.stringify({ data: { repository: { issue: { subIssues: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } }));
    } else if (query.includes('projectItems')) {
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

export function captureGuidanceLifecycle({ mode = 'historical' } = {}) {
  if (!['historical', 'recertification', 'final'].includes(mode)) {
    throw new TypeError(`capture:mode:${mode}`);
  }
  const fixtureDir = mkdtempProjectIsolated('aitm-guidance-lifecycle-');
  const packageScratchDir =
    mode === 'final' ? mkdtempProjectIsolated('aitm-guidance-package-') : null;
  const config = {
    repo: 'example/project',
    projectId: 'P1',
    preferences: { gateAssigneeMatch: false },
    ...(mode !== 'historical'
      ? {
          assignee: 'fixture-operator',
          trunkRef: 'origin/trunk',
          fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'merge' },
        }
      : {}),
  };
  const authorityLog = path.join(fixtureDir, 'authority.jsonl');
  const snapshotPath = path.join(fixtureDir, 'snapshot.json');
  const fakeGh = fakeGhSource(mode);
  const snapshot = {
    revision: 0,
    state: 'plan',
    evidence: [],
    external: { approval: 'REVIEW_REQUIRED', merge: 'open' },
  };
  const events = [];
  const writeSnapshot = () => writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`);
  try {
    const production = mode === 'final' ? installProductionPackage(packageScratchDir) : null;
    if (mode !== 'historical') {
      // The shared scratch prototype has a wall-clock commit; replace that
      // parent so fixture and evidence hashes survive a fresh process.
      const tree = git(['rev-parse', 'HEAD^{tree}'], fixtureDir);
      const stableRoot = git(
        ['commit-tree', tree, '-m', 'deterministic capture prototype'],
        fixtureDir
      );
      git(['reset', '--hard', stableRoot], fixtureDir);
    }
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
    if (mode === 'final') {
      writeFileSync(path.join(fixtureDir, 'capture-clock.mjs'), fixedClockSource);
    }
    if (mode === 'final') symlinkSync(production.bin, path.join(fixtureDir, 'fake-bin/aitm'));
    chmodSync(path.join(fixtureDir, 'fake-bin/gh'), 0o755);
    git(['add', '-f', `${SHARED_DIR}/aitm-guidance.yml`], fixtureDir);
    git(['commit', '-qm', 'baseline fixture'], fixtureDir);
    if (mode !== 'historical') {
      const remoteDir = path.join(fixtureDir, '.git', 'capture-origin.git');
      git(['init', '--bare', '-q', remoteDir], fixtureDir);
      git(['remote', 'add', 'origin', remoteDir], fixtureDir);
      git(['push', '-q', 'origin', 'HEAD:refs/heads/trunk'], fixtureDir);
      git(['checkout', '-qb', 'feature/child/2100'], fixtureDir);
      snapshot.head = git(['rev-parse', 'HEAD'], fixtureDir);
      writeSnapshot();
    }
    const baseEnv = {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: fixtureDir,
      PATH: `${path.join(fixtureDir, 'fake-bin')}${path.delimiter}${process.env.PATH}`,
      TT_FULL_AUTO: '1',
      CAPTURE_AUTHORITY_LOG: authorityLog,
      CAPTURE_SNAPSHOT_PATH: snapshotPath,
      ...(mode === 'final'
        ? { NODE_OPTIONS: `--import=${path.join(fixtureDir, 'capture-clock.mjs')}` }
        : {}),
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
          authorityBodySha256: sha256(issueBody(snapshot, mode !== 'historical')),
        },
        argv,
        stdin: '',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
        remoteAuthorityReads: readFileSync(authorityLog, 'utf8').split('\n').filter(Boolean).length,
        ...(mode !== 'historical'
          ? {
              remoteAuthorityCallOrder: 'canonical-multiset',
              remoteAuthorityCalls: readFileSync(authorityLog, 'utf8')
                .split('\n')
                .filter(Boolean)
                .map((line) => JSON.parse(line))
                .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
            }
          : {}),
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
        ...(mode === 'final' ? ['aitm'] : [process.execPath, bin]),
        'explain',
        String(issue),
        '--action',
        actionId,
        ...extra,
        '--json',
      ]);
    const transition = (name, state, evidenceAdded, external = {}, nextHead = null) => {
      const from = {
        ...snapshotIdentity(snapshot),
        bodySha256: sha256(issueBody(snapshot, mode !== 'historical')),
      };
      snapshot.revision += 1;
      snapshot.state = state;
      snapshot.evidence.push(...evidenceAdded);
      Object.assign(snapshot.external, external);
      if (nextHead) snapshot.head = nextHead;
      writeSnapshot();
      if (mode !== 'historical' && state === 'develop') {
        writeFileSync(
          statePath(fixtureDir),
          `${JSON.stringify({ active: `#${issue}`, entryStartTs: '2026-09-22T00:00:00Z' })}\n`
        );
      }
      events.push({
        kind: 'transition',
        name,
        source: 'fixture-injection',
        executedAction: null,
        from,
        to: {
          ...snapshotIdentity(snapshot),
          bodySha256: sha256(issueBody(snapshot, mode !== 'historical')),
        },
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
    if (mode === 'historical') transition('approve-plan', 'plan', ['plan-approval']);
    const catalogPath = path.join(fixtureDir, SHARED_DIR, 'aitm-guidance.yml');
    const originalCatalog = readFileSync(catalogPath, 'utf8');
    const changedCatalog = originalCatalog.replace(
      '        - never: bypass_guard\n        - execution_revalidates: true',
      '        - never: bypass_guard\n        - never: reuse_stale_decision\n        - execution_revalidates: true'
    );
    if (changedCatalog === originalCatalog) throw new Error('capture:agent-change-anchor');
    writeFileSync(catalogPath, changedCatalog);
    git(['add', '-f', `${SHARED_DIR}/aitm-guidance.yml`], fixtureDir);
    git(
      [
        'commit',
        '-qm',
        mode !== 'historical' ? '[#2100] agent guidance change' : 'agent guidance change',
      ],
      fixtureDir
    );
    if (mode === 'recertification') {
      transition(
        'approve-plan',
        'plan',
        ['plan-approval'],
        {},
        git(['rev-parse', 'HEAD'], fixtureDir)
      );
    }
    const changed = query('agent-change', 'bind', ['--known', firstReceipt]);
    const changedGuidance = changed.guidance[0];
    const changedReceipt = `${changedGuidance.id}@${changedGuidance.digest}`;
    appendFileSync(catalogPath, '\n# source-only capture change\n');
    query('source-only-change', 'bind', ['--known', changedReceipt]);
    if (mode === 'final') {
      // A real operator resolves source drift before continuing. The next
      // lifecycle query observes the restored catalog under a new head.
      writeFileSync(catalogPath, originalCatalog);
      git(['add', '-f', `${SHARED_DIR}/aitm-guidance.yml`], fixtureDir);
      git(['commit', '-qm', '[#2100] restore published guidance'], fixtureDir);
      transition(
        'approve-plan',
        'plan',
        ['plan-approval'],
        {},
        git(['rev-parse', 'HEAD'], fixtureDir)
      );
    }
    query('lifecycle-resume', 'resume');
    query('lifecycle-promote', 'promote');
    if (mode === 'recertification') {
      git(['add', '-f', `${SHARED_DIR}/aitm-guidance.yml`], fixtureDir);
      git(['commit', '-qm', '[#2100] record fixture source-only change'], fixtureDir);
    }
    transition(
      'enter-develop',
      'develop',
      mode !== 'historical' ? ['plan-transition', 'verification-passed'] : ['plan-transition'],
      {},
      mode !== 'historical' ? git(['rev-parse', 'HEAD'], fixtureDir) : null
    );
    query('lifecycle-test', 'test');
    transition('enter-test', 'test', ['test-receipt']);
    query('lifecycle-review', 'review');
    transition('enter-review', 'review', ['review-transition']);
    query('lifecycle-deliver', 'deliver');
    let heavyCase = null;
    const mergedFixture =
      mode !== 'historical'
        ? injectMergedDeliveryFixture(fixtureDir, git(['rev-parse', 'HEAD'], fixtureDir))
        : {};
    transition('external-authority', 'review', ['review-approval', 'merge-evidence'], {
      approval: 'APPROVED',
      merge: 'merged',
      ...mergedFixture,
    });
    run('external', 'external-approval', ['gh', 'pr', 'view', '2101', '--json', 'reviewDecision']);
    run('external', 'external-merge', ['gh', 'pr', 'view', '2101', '--json', 'mergedAt']);
    if (mode === 'final') {
      // Supplemental case shares the completed Review authority point but
      // injects unfinished children/dependencies before normal close guidance.
      snapshot.heavy = true;
      writeSnapshot();
      const observed = query('reachable-heavy-case', 'close', ['--diagnostic']);
      const event = events.pop();
      heavyCase = {
        captureKind: 'actual-installed-public-cli',
        declaredInputs: {
          action: 'close',
          childIds: [2201, 2202, 2203, 2204],
          dependencyIds: [3100, 3101, 3102],
          diagnostic: true,
        },
        event,
        observedStatus: observed.result.status,
        observedBlockers: observed.result.blockers,
        traffic: measureLifecycleTraffic([event]),
      };
      delete snapshot.heavy;
      writeSnapshot();
    }
    query('lifecycle-close', 'close');
    transition('enter-done', 'done', ['close-transition']);
    run('external', 'post-close-state', ['gh', 'issue', 'view', String(issue), '--json', 'state']);
    const traffic = measureLifecycleTraffic(events);
    const proposedStatic = Object.fromEntries(
      ['claude', 'codex'].map((adapter) => [
        adapter,
        mode === 'final'
          ? measureInstalledStatic(adapter, production.installedRoot)
          : mode !== 'historical'
            ? measureRecertificationStatic(adapter)
            : measureProposedStatic(adapter),
      ])
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
    const selectedBudgets =
      mode === 'final' ? FINAL_GUIDANCE_CONTEXT_BUDGETS : GUIDANCE_CONTEXT_BUDGETS;
    const budgets = {
      routerPlusPickupWorking: selectedBudgets.routerPlusPickup.working,
      ...(mode === 'final' ? { fullLifecycleTarget: selectedBudgets.fullLifecycle.target } : {}),
      fullLifecycleWorking: selectedBudgets.fullLifecycle.working,
      cleanResponseWorking: selectedBudgets.clean.working,
      blockedResponseWorking: selectedBudgets.blocked.working,
    };
    const capture = {
      schema: 'aitm.guidance-lifecycle-capture/v1',
      captureKind:
        mode === 'final'
          ? 'actual-public-cli-and-installed-static-with-deterministic-authority'
          : 'actual-public-cli-with-deterministic-authority',
      authority: 'deterministic-fixture',
      limitation:
        'Fixture state and evidence transitions are injected between read-only CLI queries; no lifecycle action, approval, or merge was executed. Action readiness is reported exactly as observed and does not authorize a delivery GO.',
      capturedAt: mode === 'final' ? null : new Date().toISOString(),
      ...(mode === 'final'
        ? {
            fixtureClock: '2026-09-23T00:00:00.000Z',
            captureTimestampPolicy: 'commit-is-publication-time',
          }
        : {}),
      identity: {
        ...(mode !== 'historical' ? { mode } : {}),
        ...(mode === 'final' ? {} : { sourceCommit: git(['rev-parse', 'HEAD']) }),
        ...(production ? { productionPackage: production.package } : {}),
        implementationFiles: [
          fileIdentity('bin/aitm.mjs'),
          fileIdentity('scripts/task-tracker/verbs/explain.mjs'),
          fileIdentity('scripts/tests/helpers/capture-guidance-release.mjs'),
          ...(mode !== 'historical'
            ? [
                fileIdentity('scripts/task-tracker/lib/action-decision/close.mjs'),
                fileIdentity('scripts/task-tracker/lib/action-decision/deliver.mjs'),
              ]
            : []),
          fileIdentity('instructions/aitm-guidance.yml'),
        ],
        scenarioManifestSha256: sha256(JSON.stringify(requiredNames)),
        initialFixtureSha256: events[0].snapshotSha256,
        initialBodySha256: events[0].authorityBodySha256,
        configSha256: sha256(`${JSON.stringify(config, null, 2)}\n`),
        fakeGhSha256: sha256(fakeGh),
        ...(mode === 'final' ? { fixedClockSha256: sha256(fixedClockSource) } : {}),
        transcriptSha256: sha256(JSON.stringify(events)),
      },
      events,
      ...(heavyCase ? { heavyCase } : {}),
      measurement: {
        proxyRule: 'ceil(concatenated agent-visible UTF-16 characters / 4)',
        traffic,
        currentFullStaticSource: 'scripts/tests/fixtures/1558/context-comparison.json',
        currentFullStaticProxyTokens,
        ...(mode === 'final'
          ? { installedStatic: proposedStatic }
          : { modeledProposedStatic: proposedStatic }),
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
    if (mode === 'final') {
      capture.identity.sourceInputsSha256 = sha256(
        JSON.stringify({
          implementationFiles: capture.identity.implementationFiles,
          productionPackage: capture.identity.productionPackage,
        })
      );
    }
    validateLifecycleTranscript(capture);
    return capture;
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
    if (packageScratchDir) rmSync(packageScratchDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode =
    process.argv[2] === '--final'
      ? 'final'
      : process.argv[2] === '--recertification'
        ? 'recertification'
        : 'historical';
  if (process.argv.length > 3 || (process.argv[2] && mode === 'historical')) {
    throw new Error('usage: capture-guidance-release [--recertification|--final]');
  }
  process.stdout.write(`${JSON.stringify(captureGuidanceLifecycle({ mode }), null, 2)}\n`);
}
