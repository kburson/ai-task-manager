// @story #2165 — independent native lifecycle fixture, no copied bindings or receipts.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from './runtime-root-fixture.mjs';
import { fixture, NOW } from './close-v5-fixture.mjs';
import { PROJECT_ROOT_ALIASES } from '../../task-tracker/lib/runtime-storage.mjs';
import { stampEntryMarker } from '../../task-tracker/lib/stage-entry-markers.mjs';
import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import {
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../task-tracker/lib/delivery-records.mjs';
import { verifyObservedIntegration } from '../../task-tracker/lib/delivery-integration-proof.mjs';
import { createDefaultDeliverDeps } from '../../task-tracker/verbs/deliver.mjs';

const owner = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const conn = (nodes) => ({
  nodes,
  totalCount: nodes.length,
  pageInfo: { hasNextPage: false, endCursor: null },
});
const stages = [
  'Backlog',
  'Refine',
  'Ready for Planning',
  'Plan',
  'Develop',
  'Test',
  'Review',
  'Done',
];
export async function cumulativeNativeFixture() {
  const root = realpathSync(createRuntimeRootFixture('2165-cumulative-native-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('symbolic-ref', 'HEAD', 'refs/heads/trunk');
  const cfg = {
    repo: 'example/project',
    projectId: 'P_fixture',
    kanbanFieldId: 'STATUS',
    trunkRef: 'origin/trunk',
    assignee: 'fixture',
    fieldIds: { size: 'SIZE', estimate: 'ESTIMATE', priority: 'PRIORITY', rank: 'RANK' },
    sizeFieldId: 'SIZE',
    fieldEstimate: 'ESTIMATE',
    priorityFieldId: 'PRIORITY',
    priorityOptionP0: 'P0',
    rankFieldId: 'RANK',
  };
  const extraFields = [
    ['blockedBy', 'Blocked By'],
    ['startTime', 'Started'],
    ['engagedTime', 'Engaged'],
    ['sessionTime', 'Session'],
    ['reviewTime', 'Review'],
    ['planTime', 'Plan'],
  ];
  for (const [key] of extraFields) {
    cfg.fieldIds[key] = 'FIELD_' + key;
    cfg['field' + key[0].toUpperCase() + key.slice(1)] = 'FIELD_' + key;
  }
  cfg.fieldDisposition = cfg.fieldIds.disposition = 'DISPOSITION';
  for (const name of stages)
    cfg['kanbanOption' + (name === 'Ready for Planning' ? 'ReadyForPlan' : name)] =
      'OPT_' + name.replaceAll(' ', '_');
  const executionFile = path.join(root, '.tmp/cumulative-provider/verification-execution.jsonl');
  const assertionSource = `import assert from 'node:assert/strict';import{readFileSync,appendFileSync,realpathSync}from'node:fs';import{execFileSync}from'node:child_process';const text=readFileSync('file with space.txt','utf8');assert.match(text,/accepted prefix/);assert.match(text,/accepted suffix/);appendFileSync(${JSON.stringify(executionFile)},JSON.stringify({kind:'actual-fixture-assertions',script:process.argv[1]?.endsWith('/verify.mjs')?'node-verify':process.env.npm_lifecycle_event??'node-test',entry:process.argv[1],cwd:realpathSync(process.cwd()),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),prefix:true,suffix:true})+'\\n');`;
  const scripts = Object.fromEntries(
    ['lint', 'format:check', 'test:unit', 'test:integration', 'test:slow', 'test'].map((name) => [
      name,
      'node --test scripts/tests/unit/fixture/source.test.mjs',
    ])
  );
  const plan =
    '# Fixture integration plan\n\n## Story Intent\n\n- **Beneficiary:** task operator\n- **Capability:** preserve accepted cumulative source during runtime integration\n- **Need:** returning to a delivered issue changes the verification context\n- **Value or failure prevented:** stale evidence cannot authorize acceptance\n\n## Implementation Tasks\n\n### Task 1: Verify cumulative source — 2h\n\nRun the fixture verifier against accepted prefix and suffix.\n';
  const f = fixture({
    directory: root,
    cumulativePrefix: true,
    headFiles: {
      'scripts/tests/unit/fixture/source.test.mjs':
        "// @story #1878\nimport test from 'node:test';\ntest('accepted source retains prefix and suffix',async()=>{await import('../../../../verify.mjs');});\n",
    },
    baseFiles: {
      '.gitignore': '.ai-task-manager/\n.tmp/\n.scratch/\n',
      'package.json': JSON.stringify({
        name: 'cumulative-native-fixture',
        version: '1.0.0',
        type: 'module',
        scripts,
      }),
      'package-lock.json': JSON.stringify({
        name: 'cumulative-native-fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'cumulative-native-fixture', version: '1.0.0' } },
      }),
      'verify.mjs': assertionSource + '\n',
      '.ai-task-manager/task-tracker.json': JSON.stringify(cfg),
      'docs/plan.md': plan,
    },
  });
  const deps = createDefaultDeliverDeps({ projectDir: root, cfg });
  const pr = f.context.delivery.gateInput.pullRequest;
  const observed = await verifyObservedIntegration({
    repository: cfg.repo,
    pullRequest: pr,
    acceptedHeadSha: f.head,
    mergedCommitSha: f.merged,
    sourceCommits: f.sourceEvidence,
    inspectCommit: ({ commitSha }) => deps.inspectMergeCommit({ mergeCommitSha: commitSha }),
    isAncestor: deps.isAncestor,
    compareContent: deps.compareDeliveryContent,
    trunkRef: f.merged,
  });
  const old = f.context.delivery.gateInput.records.matchingReceipt.record;
  const { schema: historicalSchema, result: historicalResult, ...receiptInput } = old;
  assert.ok(historicalSchema && historicalResult);
  const receipt = buildDeliveryReceipt({
    ...receiptInput,
    observedIntegration: {
      method: observed.method,
      mergeCommitSha: observed.mergeCommitSha,
      parents: observed.parents,
      tree: observed.tree,
      commitTitle: observed.title,
      commitMessage: observed.message,
      sourceMapping: observed.sourceMapping,
      contentProof: observed.contentProof,
    },
  });
  const providerRoot = path.join(root, '.tmp/cumulative-provider');
  mkdirSync(providerRoot, { recursive: true });
  const bare = path.join(providerRoot, 'origin.git');
  git('init', '--bare', '-q', bare);
  execFileSync('git', ['fetch', '-q', root, f.merged + ':refs/heads/trunk'], { cwd: bare });
  git('remote', 'add', 'origin', bare);
  git('fetch', '-q', 'origin', 'trunk');
  const fields = [
    {
      __typename: 'ProjectV2SingleSelectField',
      id: 'STATUS',
      name: 'Status',
      dataType: 'SINGLE_SELECT',
      options: stages.map((name) => ({
        id: cfg['kanbanOption' + (name === 'Ready for Planning' ? 'ReadyForPlan' : name)],
        name,
      })),
    },
    {
      __typename: 'ProjectV2SingleSelectField',
      id: 'SIZE',
      name: 'Size',
      dataType: 'SINGLE_SELECT',
      options: [{ id: 'SIZE_M', name: 'M' }],
    },
    {
      __typename: 'ProjectV2SingleSelectField',
      id: 'PRIORITY',
      name: 'Priority',
      dataType: 'SINGLE_SELECT',
      options: [{ id: 'P0', name: 'P0' }],
    },
    ...['ESTIMATE', 'RANK'].map((id) => ({
      __typename: 'ProjectV2Field',
      id,
      name: id === 'ESTIMATE' ? 'Estimate' : 'Rank',
      dataType: 'NUMBER',
    })),
  ];
  fields.push(
    ...extraFields.map(([key, name]) => ({
      __typename: 'ProjectV2Field',
      id: cfg.fieldIds[key],
      name,
      dataType: 'TEXT',
    })),
    {
      __typename: 'ProjectV2SingleSelectField',
      id: 'DISPOSITION',
      name: 'Disposition',
      dataType: 'SINGLE_SELECT',
      options: [
        { id: 'DISP_BLOCKED', name: 'BLOCKED' },
        { id: 'DISP_DELIVERED', name: 'Delivered' },
      ],
    }
  );
  for (const field of fields) field.project = { id: cfg.projectId };
  const createdAt = new Date(Date.parse(NOW) - 60_000).toISOString();
  const body = (number) =>
    `## User Story\n\nAs a task operator\nI want to preserve accepted source because operator integration changes verification context\nSo that stale evidence cannot authorize acceptance\n\n## Scope\n\nProve the real fixture source prefix and suffix and preserve them during runtime integration.\n\n## Story Origin\n\n- **kind**: code\n\n## Plan Metadata\n\n- **Implementation-plan**: docs/plan.md\n- **Governing-spec**: docs/plan.md\n- **Reference-commit**: ${f.head}\n\n## Pickup Directive — MANDATORY, DO NOT SKIP\n\nFollow the native task workflow and preserve source/operator separation.\n\n## Acceptance Criteria\n\n- [ ] Accepted prefix and suffix remain present. <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n\n- [ ] \`node verify.mjs\` <!-- id=1 -->\n- [ ] \`npm test\` <!-- id=2 -->\n- [ ] \`git log --oneline -1\` <!-- id=3 -->\n- [ ] \`npm run lint\` <!-- id=4 -->\n- [ ] \`npm run format:check\` <!-- id=5 -->\n\n## Definition of Done\n\n### Functional (verified at Test)\n\n- [ ] All automated tests pass <!-- aitm-verified cmd="\`npm test\`" --> <!-- dod:functional:tests -->\n- [ ] Lint and format checks pass <!-- aitm-verified cmd="\`npm run lint\` \`npm run format:check\`" --> <!-- dod:functional:lint -->\n- [ ] All changes committed <!-- aitm-verified cmd="\`git log --oneline -1\`" --> <!-- dod:functional:commits -->\n\n### Lifecycle (verified at Review)\n\n- [ ] Agent Review Passed\n- [ ] Final Review Passed\n\n## AITM Progress Markers\n\n<!-- aitm-last-known-state state="backlog" ts="${createdAt}" -->\n${formatIssueFieldDb({ size: null, estimate: null, priority: 'P0', rank: number === 1878 ? 1 : 2 })}\n`;
  const issues = Object.fromEntries(
    [1878, 1879].map((number) => [
      number,
      {
        __typename: 'Issue',
        id: 'I_fixture_' + number,
        number,
        title: 'Cumulative fixture ' + number,
        url: 'https://github.com/example/project/issues/' + number,
        // Initial synthetic issue creation uses the same Backlog writer as creation.
        // No verification, approval or later-stage history is seeded.
        body: stampEntryMarker(body(number), 'backlog', createdAt),
        state: 'OPEN',
        createdAt,
        stateReason: null,
        updatedAt: new Date().toISOString(),
        repository: { nameWithOwner: cfg.repo },
        assignees: conn([{ login: 'fixture' }]),
        labels: conn([{ id: 'L_bug', name: 'bug' }]),
        comments: conn([]),
        parent: null,
        subIssues: conn([]),
        blockedBy: conn([]),
        blocking: conn([]),
        projectItems: conn([
          {
            __typename: 'ProjectV2Item',
            id: 'PI_fixture_' + number,
            content: {
              __typename: 'Issue',
              id: 'I_fixture_' + number,
              number,
              repository: { nameWithOwner: cfg.repo },
            },
            isArchived: false,
            project: {
              id: cfg.projectId,
              title: 'Cumulative fixture project',
              url: 'https://github.com/users/example/projects/1',
            },
            fieldValues: conn([
              {
                __typename: 'ProjectV2ItemFieldSingleSelectValue',
                id: 'FV_status_' + number,
                name: 'Backlog',
                optionId: cfg.kanbanOptionBacklog,
                field: fields[0],
              },
            ]),
          },
        ]),
      },
    ])
  );
  const historicalComment = (id, kind, body) => ({
    __typename: 'IssueComment',
    id: 'IC_fixture_historical_' + kind,
    databaseId: id,
    body,
    url: 'https://github.com/example/project/issues/1878#issuecomment-' + id,
    html_url: 'https://github.com/example/project/issues/1878#issuecomment-' + id,
    author: { login: 'fixture' },
    user: { login: 'fixture', type: 'User' },
    authorAssociation: 'OWNER',
    createdAt: NOW,
    updatedAt: NOW,
    created_at: NOW,
    updated_at: NOW,
    issue: { number: 1878, repository: { nameWithOwner: cfg.repo } },
  });
  issues[1878].comments = conn([
    historicalComment(
      1,
      'intent',
      renderDeliveryIntentComment(f.context.delivery.gateInput.records.liveIntent.record)
    ),
    historicalComment(2, 'receipt', renderDeliveryReceiptComment(receipt)),
  ]);
  const state = {
    synthetic: true,
    repo: cfg.repo,
    project: {
      __typename: 'ProjectV2',
      id: cfg.projectId,
      number: 1,
      title: 'Cumulative fixture project',
      url: 'https://github.com/users/example/projects/1',
      fields: conn(fields),
    },
    issues,
    effects: [],
    nextComment: 100,
    pr: {
      ...pr,
      headRepository: { name: 'project' },
      headRepositoryOwner: { login: 'example' },
      mergeable: 'MERGEABLE',
      mergeCommit: { oid: f.merged },
      commits: null,
      url: 'https://github.com/example/project/pull/99',
      isDraft: false,
      author: { login: 'fixture' },
      statusCheckRollup: [],
    },
    requiredChecks: [],
    evidence: f.sourceEvidence,
    intent: f.context.delivery.gateInput.records.liveIntent.record,
    receipt,
  };
  const stateFile = path.join(providerRoot, 'state.json');
  writeFileSync(stateFile, JSON.stringify(state));
  const bin = path.join(providerRoot, 'bin');
  mkdirSync(bin);
  const module = new URL('../fixtures/close-cumulative-provider.mjs', import.meta.url).href;
  const executable = path.join(bin, 'gh');
  writeFileSync(
    executable,
    `#!${process.execPath}\nimport{runCumulativeProvider}from ${JSON.stringify(module)};try{const out=runCumulativeProvider(${JSON.stringify(stateFile)},process.argv.slice(2));await new Promise(resolve=>process.stdout.write(out+'\\n',resolve));}catch(error){await new Promise(resolve=>process.stderr.write(error.message+'\\n',resolve));process.exitCode=90;}\n`,
    { mode: 0o755 }
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      key.startsWith('GIT_') ||
      key.startsWith('AITM_') ||
      PROJECT_ROOT_ALIASES.includes(key) ||
      [
        'NODE_TEST_CONTEXT',
        'NODE_OPTIONS',
        'TT_PROJECT_DIR',
        'TT_SKIP_NETWORK',
        'AI_TASK_MANAGER_SESSION_ID',
        'AI_TASK_MANAGER_TRANSCRIPT_DIR',
        'AI_TASK_MANAGER_APP_NAME',
      ].includes(key)
    )
      delete env[key];
  const nativeSid = env.CODEX_THREAD_ID ?? env.CODEX_SESSION_ID;
  // Existing explicit actor mechanism for ordinary offline CI coverage. This
  // never creates a native identity or satisfies the separate host assertion.
  if (!nativeSid) env.AI_TASK_MANAGER_SESSION_ID = 'cumulative-offline-fixture';
  const sid = nativeSid ?? env.AI_TASK_MANAGER_SESSION_ID;
  writeFileSync(
    path.join(providerRoot, 'environment.json'),
    JSON.stringify(
      {
        inherited: {
          NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT ?? null,
          NODE_OPTIONS: process.env.NODE_OPTIONS ?? null,
        },
        baseline: {
          NODE_TEST_CONTEXT: env.NODE_TEST_CONTEXT ?? null,
          NODE_OPTIONS: env.NODE_OPTIONS ?? null,
        },
      },
      null,
      2
    )
  );
  env.PATH = bin + path.delimiter + env.PATH;
  env.AITM_GH_TEST_DOUBLE_BIN = bin;
  assert.equal(
    realpathSync(execFileSync('which', ['gh'], { env, encoding: 'utf8' }).trim()),
    executable
  );
  const pathsUrl = new URL('../../task-tracker/paths.mjs', import.meta.url).href;
  const storageUrl = new URL('../../task-tracker/lib/runtime-storage.mjs', import.meta.url).href;
  const wordsUrl = new URL('../../task-tracker/word-counter.mjs', import.meta.url).href;
  const sandboxUrl = new URL('../../task-tracker/lib/test-sandbox-reaper.mjs', import.meta.url)
    .href;
  const containment = `import assert from 'node:assert/strict';import path from 'node:path';import{realpathSync}from'node:fs';import * as p from ${JSON.stringify(pathsUrl)};import{readPhysicalRuntimeIdentity,runtimeStoragePaths,resolveRuntimeRootOverride}from ${JSON.stringify(storageUrl)};import{currentSessionId}from ${JSON.stringify(wordsUrl)};import{testSandboxDirectory}from ${JSON.stringify(sandboxUrl)};const root=process.cwd(),identity=readPhysicalRuntimeIdentity(root),sid=currentSessionId();assert.equal(resolveRuntimeRootOverride(),null);assert.equal(identity.mainRoot,root);assert.equal(identity.worktreeIdentity.commonDir,path.join(root,'.git'));const host=${JSON.stringify(owner)};assert.notEqual(identity.worktreeIdentity.commonDir,readPhysicalRuntimeIdentity(host).worktreeIdentity.commonDir);const layout=runtimeStoragePaths({projectRoot:root,mainRoot:identity.mainRoot});const owned=[p.activeTaskPath(sid,root),p.sessionDir(sid,root),p.statePath(root),p.queuePath(root),p.fleetPath(root),p.occupancyPath(root),p.timingLockPath('1878',root),p.issueLockPath('1878',root),testSandboxDirectory(root),...['localRuntimeRoot','sharedRuntimeRoot','localRoot','sharedRoot','controlPath','sharedControlPath','migrationRoot'].map(key=>layout[key])];for(const file of owned){const relative=path.relative(root,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),file);}console.log(JSON.stringify({identity,sid,owned}));`;
  const inspected = spawnSync(process.execPath, ['--input-type=module', '-e', containment], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(inspected.status, 0, inspected.stderr);
  writeFileSync(path.join(providerRoot, 'containment.json'), inspected.stdout);
  const run = (args, options = {}) => {
    const effectiveEnv = { ...env, ...options.env };
    delete effectiveEnv.NODE_OPTIONS;
    delete effectiveEnv.NODE_TEST_CONTEXT;
    if (options.trace)
      effectiveEnv.NODE_OPTIONS =
        '--import ' +
        JSON.stringify(
          path.join(owner, 'scripts/tests/fixtures/close-cumulative-trace-loader.mjs')
        );
    const parentBootstrap = process.env.NODE_OPTIONS;
    const result = spawnSync(
      process.execPath,
      [
        ...(options.wrapperOnly
          ? [
              '--import',
              path.join(owner, 'scripts/tests/fixtures/close-cumulative-trace-loader.mjs'),
            ]
          : []),
        path.join(owner, 'bin/aitm.mjs'),
        ...args,
      ],
      {
        cwd: options.cwd ?? root,
        env: effectiveEnv,
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    assert.equal(
      process.env.NODE_OPTIONS,
      parentBootstrap,
      'fixture bootstrap must not change parent environment'
    );
    writeFileSync(
      path.join(providerRoot, 'runs.jsonl'),
      JSON.stringify({
        args,
        environment: {
          NODE_TEST_CONTEXT: effectiveEnv.NODE_TEST_CONTEXT ?? null,
          NODE_OPTIONS: effectiveEnv.NODE_OPTIONS ?? null,
        },
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error?.message,
      }) + '\n',
      { flag: 'a' }
    );
    return result;
  };
  assert.equal(
    spawnSync('gh', ['api', 'user', '--jq', '.login'], { env, encoding: 'utf8' }).stdout.trim(),
    'fixture'
  );
  assert.equal(spawnSync('gh', ['unmapped'], { env, encoding: 'utf8' }).status, 90);
  return {
    root,
    git,
    f,
    cfg,
    run,
    env,
    stateFile,
    executionFile,
    sid,
    nativeSid,
    read: () => JSON.parse(readFileSync(stateFile, 'utf8')),
  };
}
