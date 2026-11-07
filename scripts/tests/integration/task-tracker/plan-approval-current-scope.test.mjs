// @story #2153
// Transport-isolated workflow coverage, not native host qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCurrentApprovalProvider } from '../../fixtures/current-plan-approval-provider.mjs';
import { currentScopeFixture } from '../../fixtures/current-plan-approval.mjs';
import '../../../task-tracker/lib/agent-review/bootstrap.mjs';
import { runAgentReviewGate } from '../../../task-tracker/lib/agent-review/review-gate.mjs';
import { reviewAgentValidationAction } from '../../../task-tracker/lib/resident-actions/review-agent-validation.mjs';
import { computeScopeIdentity } from '../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { parsePlanApprovedMarker } from '../../../task-tracker/lib/markers.mjs';
import { validateCurrentScopeApproval } from '../../../task-tracker/lib/plan-approval-current-review.mjs';
import { runDemote } from '../../../task-tracker/verbs/demote.mjs';

import {
  buildVerificationFingerprint,
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../task-tracker/lib/verification-receipt.mjs';
import { parseVerificationCommands } from '../../../task-tracker/lib/verification-commands.mjs';
import { resolveReviewVerificationEvidence } from '../../../task-tracker/verbs/review.mjs';

import { loadForecastProjection } from '../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { createBootstrapRubric } from '../../../task-tracker/lib/estimation/rubric-model.mjs';
import { buildEstimationForecast } from '../../../task-tracker/lib/estimation/forecast-model.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../task-tracker/lib/github-records/record-envelope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const providerUrl = new URL('../../fixtures/current-plan-approval-provider.mjs', import.meta.url)
  .href;
const scratchUrl = new URL('../../../task-tracker/lib/scratch-dir.mjs', import.meta.url).href;
const fixtureUrl = new URL('../../fixtures/current-plan-approval.mjs', import.meta.url).href;
const verbUrl = new URL('../../../task-tracker/verbs/plan-approve.mjs', import.meta.url).href;
function publicCommand(args, setup = '') {
  // Exercise the exported public CLI entry, including parser and process exit.
  // The fixture replaces GitHub reads/writes; all validation and local Git are real.
  const code = `import {currentScopeFixture} from ${JSON.stringify(fixtureUrl)};
    import {verbPlanApprove} from ${JSON.stringify(verbUrl)};
    import {installCurrentApprovalProvider} from ${JSON.stringify(providerUrl)};
    const {mkdtempOutsideRepo}=await import(${JSON.stringify(scratchUrl)});
    const {rmSync}=await import('node:fs');
    const outside=mkdtempOutsideRepo('current-approval-cli-');
    const cleanup=[()=>rmSync(outside,{recursive:true,force:true})]; const f=currentScopeFixture({after:fn=>cleanup.push(fn)},outside);
    process.on('exit',()=>{for(const fn of cleanup) fn();});
    process.chdir(f.projectDir);
    await installCurrentApprovalProvider(f);
    ${setup}
    try { await verbPlanApprove(${JSON.stringify(args)}, {repo:'o/r',trunkRef:'HEAD'}, f.deps);
      console.log('RESULT '+JSON.stringify({body:f.body,comments:f.comments,calls:f.calls,head:f.git('rev-parse','HEAD')}));
    } finally { for(const fn of cleanup) fn(); }`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    env: {
      ...process.env,
      TT_SKIP_NETWORK: '0',
      TT_PROJECT_DIR: '',
      TASK_TRACKER_PROJECT_DIR: '',
      AI_TASK_MANAGER_PROJECT_DIR: '',
      CLAUDE_PROJECT_DIR: '',
      AITM_CAPTURE_PROJECT_DIR: '',
    },
    encoding: 'utf8',
    timeout: 30000,
  });
}

test('public current-scope command approves after the Review singleton replaced Develop', () => {
  const result = publicCommand(['2153', '--current-scope']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current.scope/i);
  const record = JSON.parse(result.stdout.split('RESULT ')[1]);
  assert.equal(record.calls.audits, 1);
  assert.equal(record.calls.waiverReads, 0);
  assert.match(record.body, /aitm-entered-develop/);
  assert.match(record.body, /aitm-move-complete state=review/);
  assert.ok(parsePlanApprovedMarker(record.body).currentApprovalDigest);
  assert.equal(
    validateCurrentScopeApproval({
      body: record.body,
      comments: record.comments,
      repository: 'o/r',
      issue: 2153,
      acceptedSourceHead: record.head,
    }).pass,
    true
  );
});

test('public parser refuses usage before provider reads and current refusal exits 15', () => {
  for (const args of [
    [],
    ['2153', '--current-scop'],
    ['2153', '2154'],
    ['2153', '--current-scope', '--current-scope'],
    ['2153', '--current-scope', '--repair-from-evidence'],
  ]) {
    const r = publicCommand(
      args,
      `f.deps.getBoardState=()=>{throw Error('UNEXPECTED PROVIDER READ')};`
    );
    assert.equal(r.status, 2, r.stderr);
    assert.doesNotMatch(r.stderr, /UNEXPECTED PROVIDER READ/);
  }
  const refused = publicCommand(['2153', '--current-scope'], `f.deps.env={TT_FULL_AUTO:'0'};`);
  assert.equal(refused.status, 15, refused.stderr);
});

test('public legacy route refuses policy-exempt history and public scope/source races do not write approval', () => {
  const legacy = publicCommand(
    ['2153'],
    `f.deps.listWorkflowExceptionRecords=async()=>[];f.deps.listIssueBodyHistory=async()=>[];`
  );
  assert.equal(legacy.status, 15, legacy.stderr);
  for (const change of [
    "f.body=f.body.replace('Stop partial publication.','Changed AC.');",
    "f.git('commit','--allow-empty','--quiet','-m','Concurrent source');",
  ]) {
    const r = publicCommand(
      ['2153', '--current-scope'],
      `const normal=f.deps.mutateIssueBody;f.deps.mutateIssueBody=async(input)=>{${change}return normal(input)};process.on('exit',()=>console.log('COUNTS '+JSON.stringify(f.calls)));`
    );
    assert.equal(r.status, 15, r.stderr);
    const calls = JSON.parse(r.stdout.split('COUNTS ')[1]);
    assert.equal(calls.writes, 0);
    assert.equal(calls.audits, 0);
  }
});

function readyForReview(f) {
  mkdirSync(path.join(f.projectDir, 'scripts/tests'), { recursive: true });
  writeFileSync(
    path.join(f.projectDir, 'scripts/tests/fixture.test.mjs'),
    "import test from 'node:test'; import assert from 'node:assert/strict'; test('fixture verification',()=>assert.equal(1+1,2));\n"
  );
  writeFileSync(
    path.join(f.projectDir, 'package-lock.json'),
    '{"lockfileVersion":3,"packages":{}}\n'
  );
  f.git('add', '.');
  f.git('commit', '--quiet', '-m', 'Fixture verification source');
  f.body = f.body
    .replace('## Plan Metadata', '## Story Origin\n\n**kind:** code\n\n## Plan Metadata')
    .replace(
      '## Deep-Dive Analysis',
      '## Pickup Directive\n\nUse the governed workflow.\n\n## Deep-Dive Analysis'
    )
    .replace(
      '<!-- aitm-entered-plan',
      '## Definition of Done\n\n- [ ] Agent Review Passed\n\n## AITM Progress Markers\n\n<!-- aitm-entered-plan'
    );
  f.body +=
    '\n<!-- aitm-entered-test ts="2026-11-05T05:00:00Z" -->\n<!-- aitm-entered-review ts="2026-11-05T06:00:00Z" -->\n';
  f.comments.push(
    {
      body: '## ⏱ Timing Log\n\n| Timestamp | Event |\n|---|---|\n| 2026-11-04 01:50:00 | plan:started |',
    },
    { body: '<!-- aitm-refined-estimate: fixture -->\n### Planned Estimate\nSix hours.' },
    { body: '## 🔗 Commits\nFixture source.' },
    {
      body: '## New Automated Tests\n\n- `scripts/tests/fixture.test.mjs`\n  - fixture verification',
    }
  );
}

function qualifyFixture(f) {
  const head = f.git('rev-parse', 'HEAD');
  const startedAt = new Date().toISOString();
  execFileSync(process.execPath, ['--test', 'scripts/tests/fixture.test.mjs'], {
    cwd: f.projectDir,
    stdio: 'pipe',
  });
  const completedAt = new Date().toISOString();
  const fingerprint = buildVerificationFingerprint({
    projectDir: f.projectDir,
    commitSha: head,
    verificationCommands: parseVerificationCommands(f.body),
  });
  const receipt = createVerificationReceipt({
    issueNumber: 2153,
    stage: 'test',
    fingerprint,
    provider: { id: 'project', requiredClassifications: ['test-targeted-1'] },
    commands: [
      {
        classification: 'test-targeted-1',
        providerId: 'project',
        kind: 'test',
        command: 'node',
        args: ['--test', 'scripts/tests/fixture.test.mjs'],
        exitCode: 0,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
        startedAt,
        completedAt,
      },
    ],
  });
  f.body =
    upsertVerificationReceipt(f.body, receipt).replace(
      /<!-- aitm-(?:test-started|dod-verified)\b[^>]*-->/g,
      ''
    ) +
    `\n<!-- aitm-test-started sha="${head}" ts="${completedAt}" -->\n<!-- aitm-dod-verified sha="${head}" ts="${completedAt}" -->\n`;
  return receipt;
}

test('real resident Review normalizes, converges with at most one reapproval, then reuses the pass', async (t) => {
  const f = currentScopeFixture(t);
  await installCurrentApprovalProvider(f);
  readyForReview(f);
  const head = f.git('rev-parse', 'HEAD');
  const receipt = qualifyFixture(f);
  const testMarker = f.body.match(/<!-- aitm-test-started[^>]*-->/)[0];
  const history = f.body.match(/<!-- aitm-(?:entered|move-complete)[^]*?-->/g);
  assert.equal((await f.run()).status, 'approved-current-scope');
  let gateRuns = 0;
  const context = {
    now: () => '2026-11-05T08:00:00Z',
    review: {
      repo: 'o/r',
      readComments: async () => f.comments,
      computeChangedPaths: async () => ['scripts/fixture.mjs'],
      loadWorkflowBoundary: async () => ({ isWaived: () => false }),
      runAgentReviewGate: (input) => {
        gateRuns++;
        return runAgentReviewGate(input);
      },
      onPass: async ({ passedBody }) => {
        f.body = passedBody;
      },
      onFailure: async ({ failedBody }) => {
        f.body = failedBody;
      },
    },
  };
  const snapshot = () => ({
    body: f.body,
    issue: 2153,
    headSha: { value: head },
    stateVisitId: 'review:1',
    reviewComments: f.comments,
  });
  const first = await reviewAgentValidationAction.run(context, snapshot());
  assert.equal(first.status, 'complete', JSON.stringify(first));
  let verification = await reviewAgentValidationAction.verify(context, snapshot());
  if (verification.status !== 'complete') {
    assert.equal(verification.reason, 'current-plan-approval-invalid');
    assert.equal((await f.run()).status, 'approved-current-scope');
    assert.equal((await reviewAgentValidationAction.run(context, snapshot())).status, 'complete');
  }
  const stableScope = computeScopeIdentity({ repository: 'o/r', issue: 2153, body: f.body });
  const second = await reviewAgentValidationAction.verify(context, snapshot());
  assert.equal(second.status, 'complete', JSON.stringify(second));
  const normalized = runAgentReviewGate({
    body: f.body,
    issueNumber: 2153,
    repo: 'o/r',
    comments: f.comments,
    acceptedSourceHead: head,
    changedPaths: ['scripts/fixture.mjs'],
  });
  assert.equal(normalized.pass, true, JSON.stringify(normalized.failures));
  assert.equal(
    computeScopeIdentity({
      repository: 'o/r',
      issue: 2153,
      body: normalized.normalizedBody ?? f.body,
    }),
    stableScope
  );
  assert.ok(gateRuns <= 2);
  assert.ok(f.body.includes(testMarker));
  assert.equal(
    (
      await resolveReviewVerificationEvidence({
        body: f.body,
        issueNumber: 2153,
        repository: 'o/r',
        projectDir: f.projectDir,
        getHeadSha: async () => head,
      })
    ).receipt.receiptId,
    receipt.receiptId
  );
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  for (const marker of history) assert.ok(f.body.includes(marker));
});

test('delivered correction is genuine code rework and old source approval cannot qualify its new HEAD', async (t) => {
  const f = currentScopeFixture(t);
  await installCurrentApprovalProvider(f);
  readyForReview(f);
  assert.equal((await f.run()).status, 'approved-current-scope');
  const oldHead = f.git('rev-parse', 'HEAD');
  const reviewEvidence = () =>
    resolveReviewVerificationEvidence({
      body: f.body,
      issueNumber: 2153,
      repository: 'o/r',
      projectDir: f.projectDir,
      getHeadSha: async () => f.git('rev-parse', 'HEAD'),
    });
  const oldReceipt = qualifyFixture(f);
  assert.equal((await reviewEvidence()).ok, true);

  const priorComments = JSON.stringify(f.comments);
  f.body = '<!-- aitm-last-known-state state="review" ts="2026-11-05T06:00:00Z" -->\n' + f.body;
  const demoted = await runDemote({
    issueNumber: 2153,
    cfg: { repo: 'o/r' },
    rework: 'Integrate delivered #2153 current-approval correction',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: f.body }),
      getLiveState: async () => 'review',
      mutateIssueBody: async ({ mutate }) => {
        f.body = mutate(f.body);
        return { body: f.body };
      },
      runMoveState: async ({ target, rework }) => {
        assert.equal(target, 'develop');
        assert.match(rework, /delivered #2153/);
        return 0;
      },
    },
  });
  assert.equal(demoted.status, 'demoted');
  // Integrate an actual committed correction from a separate delivered branch.
  f.git('checkout', '-b', 'delivered-correction');
  writeFileSync(
    path.join(f.projectDir, 'correction.mjs'),
    'export const currentApproval = true;\n'
  );
  f.git('add', 'correction.mjs');
  f.git('commit', '--quiet', '-m', 'Delivered current approval correction');
  const delivered = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-');
  f.git('merge', '--ff-only', 'delivered-correction');
  const newHead = f.git('rev-parse', 'HEAD');
  assert.equal(newHead, delivered);
  assert.notEqual(newHead, oldHead);
  const staleTest = await reviewEvidence();
  assert.equal(staleTest.ok, false);
  assert.ok(
    staleTest.reasons.some(({ code }) => /sha|commit/.test(code)),
    JSON.stringify(staleTest.reasons)
  );
  assert.equal(staleTest.receipt.receiptId, oldReceipt.receiptId);

  assert.equal(
    validateCurrentScopeApproval({
      body: f.body,
      comments: f.comments,
      repository: 'o/r',
      issue: 2153,
      acceptedSourceHead: newHead,
    }).pass,
    false
  );
  assert.equal(JSON.stringify(f.comments), priorComments, 'old evidence is preserved');
  const newReceipt = qualifyFixture(f);
  assert.notEqual(newReceipt.receiptId, oldReceipt.receiptId);
  assert.equal((await reviewEvidence()).ok, true);
  f.state = 'develop';
  assert.equal((await f.run()).status, 'approved-current-scope');
  assert.equal(
    validateCurrentScopeApproval({
      body: f.body,
      comments: f.comments,
      repository: 'o/r',
      issue: 2153,
      acceptedSourceHead: newHead,
    }).pass,
    true
  );
});

test('registered dispatcher exposes the delivered current-scope command', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/task-tracker/task-tracker.mjs'), 'plan-approve', '--help'],
    { cwd: root, env: { ...process.env, TT_SKIP_NETWORK: '1' }, encoding: 'utf8', timeout: 15000 }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--current-scope/);
});

function attachRealForecast(f, remoteBody = () => f.body) {
  const id = '01J00000000000000000000702';
  const payload = buildEstimationForecast({
    issue: 2153,
    refine: { size: 'XL', humanHours: 40 },
    planInput: {
      schema: 'aitm.plan-estimation-input/v1',
      wbs: [
        {
          id: 'implementation',
          description: 'Implement the planned change',
          baseHumanHours: 39.15,
          independentlyReviewable: true,
          signals: { modules: ['estimation'], dependencies: ['github-records'] },
        },
      ],
      testImpact: { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 0 },
      risks: [],
      comparableIssueIds: [],
    },
    rubric: {
      recordId: '01J00000000000000000000703',
      payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
    },
  });
  const envelope = createAitmRecordEnvelope({
    recordType: 'estimation-forecast',
    repository: 'o/r',
    issue: 2153,
    payload,
    actor: 'aitm/plan-estimate',
    recordId: id,
    grantId: '01J00000000000000000000704',
    createdAt: '2026-08-02T14:00:00.000Z',
  });
  f.comments.push({
    id: 'forecast',
    body: renderAitmRecord({ envelope }),
    createdAt: '2026-08-02T14:00:01Z',
    updatedAt: '2026-08-02T14:00:01Z',
    author: { login: 'owner' },
    authorAssociation: 'OWNER',
  });
  f.body += `\n<!-- aitm-estimation-forecast-ready record-id="${id}" -->\n<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: payload.plan.size, estimate: payload.plan.humanHours } })} -->`;
  const cfg = {
    repo: 'o/r',
    trunkRef: 'HEAD',
    projectId: 'P',
    estimationRubricIssue: 99,
    fieldIds: { size: 'SIZE', estimate: 'HOURS' },
  };
  // Only GraphQL transport is replaced; real record parsing/projection runs.
  f.deps.plannedEstimate = {
    graphql: async () => ({
      data: {
        repository: {
          issue: {
            body: remoteBody(),
            comments: {
              nodes: f.comments.map((c) => ({
                __typename: 'IssueComment',
                id: c.id,
                body: c.body,
                updatedAt: c.updatedAt,
                issue: { number: 2153, repository: { nameWithOwner: 'o/r' } },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
            projectItems: {
              nodes: [
                {
                  id: 'ITEM',
                  project: { id: 'P' },
                  fieldValues: {
                    nodes: [
                      { number: payload.plan.humanHours, field: { id: 'HOURS' } },
                      { name: payload.plan.size, field: { id: 'SIZE' } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }),
  };
  return cfg;
}
test('real forecast loader preserves current approval when a fenced example precedes the live ready marker', async (t) => {
  const f = currentScopeFixture(t);
  await installCurrentApprovalProvider(f);
  const cfg = attachRealForecast(f);
  const legacyProjection = await loadForecastProjection({
    cfg,
    issueNumber: 2153,
    deps: f.deps.plannedEstimate,
  });
  assert.equal(legacyProjection.forecast.recordId, '01J00000000000000000000702');
  assert.equal((await f.run({ cfg })).status, 'approved-current-scope');
  f.body =
    '```html\n<!-- aitm-estimation-forecast-ready record-id="01J00000000000000000000701" -->\n```\n' +
    f.body;
  const result = await f.run({ cfg });
  assert.equal(result.status, 'already-approved-current-scope', JSON.stringify(result));
});
test('real forecast loader refuses malformed readiness in its fresh remote snapshot', async (t) => {
  const f = currentScopeFixture(t);
  await installCurrentApprovalProvider(f);
  const cfg = attachRealForecast(
    f,
    () => f.body + '\n<!-- aitm-estimation-forecast-ready record-id="BROKEN" -->'
  );
  const result = await f.run({ cfg });
  assert.equal(result.status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
  assert.equal(f.calls.audits, 0);
});
