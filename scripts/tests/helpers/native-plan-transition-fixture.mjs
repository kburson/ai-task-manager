// @story #2069
// Durable native owner/store/journal; only the remote provider is an offline ledger.
import assert from 'node:assert/strict';
import {
  fixture,
  context,
  identity,
  hash,
  changeGeneration,
  pair,
  transition,
} from './story-timing-candidate-fixture.mjs';
import { initial, trunk } from './plan-transition-candidate-fixture.mjs';
import { setIssue } from './story-batch-fixture.mjs';
import { canonicalRecordJson as json } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  stageNativePlanApproval,
  rebindNativePlanApproval,
} from '../../task-tracker/lib/plan-approval-staging.mjs';
import * as authority from '../../task-tracker/lib/plan-transition-authority.mjs';
import { hydrateJournalSnapshot } from '../../task-tracker/lib/story-cache/journal.mjs';
import { observeContent } from '../../task-tracker/lib/story-cache/native-observation.mjs';
import { runTransitionBatch } from '../../task-tracker/lib/story-cache/transition-batch.mjs';
export async function nativePlanFixture(
  t,
  {
    outcome = 'satisfied',
    estimate = true,
    baselineAuthorityOnly = false,
    mode = 'human',
    omitVc = false,
    authorityRecordedAt = null,
    waiverExpiresAt = null,
    fencedApprovalExample = false,
    rubricIssue = 0,
    duplicateEstimate = false,
    fencedEstimateExample = false,
    missingEstimateAppendix = false,
    workflowWaiver = false,
    pendingForecast = false,
    probeAssessment = false,
    proposalOrderCase = false,
    stagingOverride = null,
    legacyPlan = false,
    epic = false,
    epicProposal = false,
    epicChildMode = 'ready',
    publishedApproval = false,
    skipApproval = false,
    workingEdit = null,
    disposition = '',
    clearDisposition = false,
    adaptive = false,
    legacyEstimateAlias = false,
    historicalPolicy = false,
    trunkState = { value: trunk },
    waiverRequirementIds = ['approval.plan', 'planning.planned-estimate', 'planning.forecast'],
  } = {}
) {
  const move = {
    ...transition,
    id: 'move:11111111-1111-4111-8111-111111111111',
    from: 'plan',
    to: 'develop',
  };
  const events = pair(move).map((row) => ({
    ...row,
    event: row.event === 'develop:completed' ? 'plan:completed' : 'develop:started',
  }));
  if (adaptive) {
    const { activateNativeForecastFixture } = await import('./native-plan-forecast-fixture.mjs');
    await activateNativeForecastFixture(t.unitRoot);
  }
  const f = await fixture(t, { events });
  let base =
    initial.replace(
      '## Deep-Dive Analysis\n',
      '## Deep-Dive Analysis\n' +
        'This explicit offline fixture preserves source identity, complete scope and actual transition dependencies. '.repeat(
          30
        ) +
        '\n'
    ) +
    '\n<!-- aitm-last-known-state state="plan" ts="2026-10-19T00:00:00Z" -->\n' +
    '<!-- aitm-entered-plan ts="2026-10-19T00:00:00Z" -->\n<!-- aitm-entered-backlog ts="2026-10-17T00:00:00Z" -->\n<!-- aitm-entered-refine ts="2026-10-18T00:00:00Z" -->\n' +
    '\n## Pickup Directive — MANDATORY, DO NOT SKIP\nFollow the native issue workflow.\n' +
    '\n<!-- aitm-deep-dive-posted ts="2026-10-19T00:00:00Z" -->\n<!-- aitm-deep-dive-complete ts="2026-10-19T00:00:00Z" -->\n' +
    '\n## Plan Metadata\n- **Execution-mode**: bounded local fixture\n' +
    '\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n' +
    '\n## AITM Progress Markers\n';
  if (fencedApprovalExample)
    base =
      '```markdown\n<!-- aitm-plan-approved ts="2000-01-01T00:00:00Z" mode="human" -->\n```\n' +
      base;
  if (legacyPlan) base = base.replace(/<!-- aitm-entered-ready-for-plan[^>]*-->\n?/g, '');
  const cfg = {
    repo: identity.repository,
    projectId: identity.projectId,
    kanbanFieldId: 'F_status',
    kanbanOptionPlan: 'OPT_plan',
    kanbanOptionDevelop: 'OPT_develop',
    estimationRubricIssue: adaptive ? 1001 : rubricIssue,
    gateAnalysisToDevelopment: outcome !== 'not-required',
    gatePlanRefineWip: false,
    fieldIds: { estimate: 'F_estimate', size: 'F_size', disposition: 'F_disposition' },
  };
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  await fs.mkdir(path.join(f.root, '.ai-task-manager'), { recursive: true });
  await fs.writeFile(path.join(f.root, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
  let configured = null;
  if (adaptive) {
    const { configureNativeForecastFixture } = await import('./native-plan-forecast-fixture.mjs');
    configured = await configureNativeForecastFixture({
      root: f.root,
      base,
      cfg,
      identity,
      historicalPolicy,
    });
    base = configured.body;
  }
  let epicFixture = null;
  if (epic) {
    const { configureNativeEpicFixture } = await import('./native-plan-epic-fixture.mjs');
    epicFixture = await configureNativeEpicFixture({
      root: f.root,
      base,
      cfg,
      identity,
      childMode: epicChildMode,
    });
    base = epicFixture.body;
  }
  if (legacyEstimateAlias) {
    delete cfg.fieldIds.estimate;
    cfg.fieldEstimate = 'F_estimate';
  }
  await fs.writeFile(path.join(f.root, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
  const { fixture: decompositionFixture, observed } =
    await import('../unit/task-tracker/lib/decomposition-authority-fixtures.mjs');
  const { createDecompositionRuntime } =
    await import('../../task-tracker/lib/decomposition-authority.mjs');
  const { formatIssueFieldDb } = await import('../../task-tracker/issue-field-db.mjs');
  const decomposition = decompositionFixture(3);
  decomposition.values.project.projectId = identity.projectId;
  decomposition.values.project.projectItemId = identity.projectItemId;
  decomposition.values.forecast = {
    estimate: null,
    size: null,
    recordId: null,
    payloadHash: null,
    proposals: [],
    observedProjections: [
      { size: 'M', estimate: 3 },
      { size: 'M', estimate: 3 },
    ],
  };
  decomposition.body = configured ? base : base + formatIssueFieldDb({ size: 'M', estimate: 3 });
  if (configured) {
    decomposition.values.project.estimate = configured.forecast.plan.humanHours;
    decomposition.values.project.size = configured.forecast.plan.size;
    decomposition.values.plan = configured.plan;
    decomposition.values.forecast = {
      estimate: configured.forecast.plan.humanHours,
      size: configured.forecast.plan.size,
      recordId: configured.record.recordId,
      payloadHash: configured.record.payloadHash,
      proposals: [],
      observedProjections: [
        { size: configured.forecast.plan.size, estimate: configured.forecast.plan.humanHours },
        { size: configured.forecast.plan.size, estimate: configured.forecast.plan.humanHours },
      ],
    };
  }
  decomposition.deps.readIssue = async () =>
    observed({ number: identity.issueNumber, body: decomposition.body });
  decomposition.deps.readBackIssue = decomposition.deps.readIssue;
  if (epicFixture) {
    decomposition.values.project.children = epicFixture.mappedChildren();
    decomposition.values.plan = epicFixture.plan;
    decomposition.deps.readPlanAtCommit = async () => epicFixture.planBytes.toString();
  }
  const decompositionRuntime = createDecompositionRuntime({
    cfg,
    projectDir: f.root,
    deps: decomposition.deps,
  });
  await decompositionRuntime.refresh({
    repository: identity.repository,
    issue: identity.issueNumber,
    projectId: identity.projectId,
    projectItemId: identity.projectItemId,
  });
  base = decomposition.body;
  if (publishedApproval) {
    const { runPlanApprove } = await import('../../task-tracker/verbs/plan-approve.mjs');
    let published = base;
    const issued = await runPlanApprove({
      issueNumber: identity.issueNumber,
      cfg,
      projectDir: f.root,
      retainCandidateAuthority: true,
      deps: {
        fetchIssueBody: async () => published,
        getBoardState: async () => 'plan',
        fetchEpicChildren: async () => [],
        resolveTrunkSha: async () => trunk,
        nowIso: () => '2026-10-19T01:00:00Z',
        listComments: async () => [],
        postComment: async () => {},
        mutateIssueBody: async ({ mutate, validateFreshBase }) => {
          validateFreshBase(published);
          published = mutate(published);
          return { status: 'ok', body: published };
        },
      },
    });
    assert.equal(issued.status, 'approved');
    base = published;
  }
  const beforeField = {
    itemId: identity.projectItemId,
    fieldId: cfg.kanbanFieldId,
    type: 'SINGLE_SELECT',
    value: { optionId: cfg.kanbanOptionPlan, name: 'Plan' },
  };
  const { addPublishedPlanProposal, stagePendingPlanProposal } =
    await import('./native-plan-proposal-fixture.mjs');
  await changeGeneration(f, (g, payloads) => {
    setIssue(g, payloads, base, base);
    g.baseSnapshot.fields = [
      {
        itemId: identity.projectItemId,
        fieldId: 'F_disposition',
        type: 'SINGLE_SELECT',
        value: disposition ? { optionId: 'OPT_blocked', name: disposition } : null,
      },
      {
        itemId: identity.projectItemId,
        fieldId: 'F_estimate',
        type: 'NUMBER',
        value: configured?.forecast.plan.humanHours ?? 3,
      },
      {
        itemId: identity.projectItemId,
        fieldId: 'F_size',
        type: 'SINGLE_SELECT',
        value: { optionId: 'OPT_M', name: configured?.forecast.plan.size ?? 'M' },
      },
      beforeField,
    ];
    g.baseSnapshot.fieldsDigest = hash(
      json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: g.baseSnapshot.fields })
    );
    if (proposalOrderCase)
      addPublishedPlanProposal({
        generation: g,
        payloads,
        identity,
        size: configured?.forecast.plan.size ?? 'M',
        hours: configured?.forecast.plan.humanHours ?? 3,
      });
    if (configured) {
      const { body: ignored, ...row } = observeContent({
        identity,
        node: {
          id: configured.comment.id,
          lastEditedAt: null,
          includesCreatedEdit: false,
          userContentEdits: { totalCount: 0, nodes: [] },
        },
        body: configured.comment.body,
      });
      void ignored;
      payloads.set('base/forecast.md', configured.comment.body);
      g.baseSnapshot.resources['comment:IC_forecast'] = {
        ...row,
        ownership: 'owned',
        payloadPath: 'base/forecast.md',
      };
      g.baseSnapshot.inventory.push('IC_forecast');
      g.baseSnapshot.inventory.sort();
    }
    if (estimate) {
      const estimateBody = `<!-- aitm-refined-estimate: ${identity.issueNumber} -->\n### Planned Estimate\n| Field | Refine | Plan | Δ |\n| Size | M | ${configured?.forecast.plan.size ?? 'M'} | — |\n| Estimate (h) | 3 | ${configured?.forecast.plan.humanHours ?? 3} | 0 |`;
      const { body: ignored, ...observed } = observeContent({
        identity,
        node: {
          id: 'IC_estimate',
          lastEditedAt: null,
          includesCreatedEdit: false,
          userContentEdits: { totalCount: 0, nodes: [] },
        },
        body: missingEstimateAppendix
          ? `<!-- aitm-refined-estimate: ${identity.issueNumber} -->`
          : estimateBody,
      });
      void ignored;
      payloads.set(
        'base/estimate.md',
        missingEstimateAppendix
          ? `<!-- aitm-refined-estimate: ${identity.issueNumber} -->`
          : estimateBody
      );
      g.baseSnapshot.resources['comment:IC_estimate'] = {
        ...observed,
        ownership: 'owned',
        payloadPath: 'base/estimate.md',
      };
      g.baseSnapshot.inventory.push('IC_estimate');
      g.baseSnapshot.inventory.sort();
      if (fencedEstimateExample) {
        const example = '```markdown\n' + estimateBody + '\n```';
        const { body: ignoredExample, ...exampleRow } = observeContent({
          identity,
          node: {
            id: 'IC_A_example',
            lastEditedAt: null,
            includesCreatedEdit: false,
            userContentEdits: { totalCount: 0, nodes: [] },
          },
          body: example,
        });
        void ignoredExample;
        payloads.set('base/example.md', example);
        g.baseSnapshot.resources['comment:IC_A_example'] = {
          ...exampleRow,
          ownership: 'read-only',
          payloadPath: 'base/example.md',
        };
        g.baseSnapshot.inventory.push('IC_A_example');
        g.baseSnapshot.inventory.sort();
      }
      if (duplicateEstimate) {
        const otherBody = estimateBody.replace('| 3 | 3 | 0 |', '| 3 | 9 | 6 |');
        const { body: ignoredOther, ...other } = observeContent({
          identity,
          node: {
            id: 'IC_estimate_2',
            lastEditedAt: null,
            includesCreatedEdit: false,
            userContentEdits: { totalCount: 0, nodes: [] },
          },
          body: otherBody,
        });
        void ignoredOther;
        payloads.set('base/estimate-other.md', otherBody);
        g.baseSnapshot.resources['comment:IC_estimate_2'] = {
          ...other,
          ownership: 'owned',
          payloadPath: 'base/estimate-other.md',
        };
        g.baseSnapshot.inventory.push('IC_estimate_2');
        g.baseSnapshot.inventory.sort();
      }
    }
  });
  const { createNativePlanPublishedFixture } = await import('./native-plan-published-fixture.mjs');
  const publishedFixture = await createNativePlanPublishedFixture({
    f,
    identity,
    cfg,
    configured,
    epicFixture,
    trunkState,
    omitVc,
    initialBody: base,
  });
  base = publishedFixture.base;
  const deps = publishedFixture.deps;
  const { resolveStoryIntentSource } =
    await import('../../task-tracker/lib/story-intent-source.mjs');
  const intent = resolveStoryIntentSource({ body: base, projectDir: f.root });
  assert.equal(intent.ok, true, JSON.stringify(intent.violations));
  let working = base;
  if (pendingForecast) {
    assert.ok(configured);
    const { createAitmRecordEnvelope, renderAitmRecord } =
      await import('../../task-tracker/lib/github-records/record-envelope.mjs');
    const { stageOwnedComment } =
      await import('../../task-tracker/lib/story-cache/stage-comment.mjs');
    const { stageStoryMutation } =
      await import('../../task-tracker/lib/story-cache/stage-body.mjs');
    const previous = configured.record;
    const next = createAitmRecordEnvelope({
      ...previous,
      ...previous.authority,
      recordId: '01M2Y000000000000000000098',
      predecessor: previous.recordId,
      supersedes: previous.recordId,
      payload: { ...previous.payload, supersedesForecastRecordId: previous.recordId },
    });
    configured.stagedRecord = next;
    await context(f.root, () =>
      stageOwnedComment({
        store: f.store,
        claim: f.claim,
        key: 'comment:new:forecast-successor',
        body: renderAitmRecord({ envelope: next }),
      })
    );
    working = base.replace(`record-id="${previous.recordId}"`, `record-id="${next.recordId}"`);
    await context(f.root, () =>
      stageStoryMutation({
        store: f.store,
        claim: f.claim,
        key: 'issue:I_test',
        mutate: () => working,
      })
    );
  }
  if (workingEdit) {
    const { stageStoryMutation } =
      await import('../../task-tracker/lib/story-cache/stage-body.mjs');
    working =
      workingEdit === 'neutral'
        ? base + '\n\n## Operator Notes\nRetain this unrelated local note.\n'
        : base.replace(
            'Validate the approved publication scope.',
            'Publish a materially different scope.'
          );
    await context(f.root, () =>
      stageStoryMutation({
        store: f.store,
        claim: f.claim,
        key: 'issue:I_test',
        mutate: () => working,
      })
    );
  }
  let staged = { body: working, title: 'Title' };
  if (epicProposal) {
    const { stageEpicAssessmentChange } = await import('./native-plan-epic-fixture.mjs');
    await stageEpicAssessmentChange(f);
  }
  if (proposalOrderCase)
    await stagePendingPlanProposal({
      f,
      size: configured?.forecast.plan.size ?? 'M',
      hours: configured?.forecast.plan.humanHours ?? 3,
    });
  const stagingReadsBefore = publishedFixture.graphCalls();
  let assessmentProbe = null;
  if (probeAssessment) {
    const { withNativePlanAssessmentAdvance } =
      await import('../../task-tracker/lib/decomposition-projection.mjs');
    const { withIssueLock } = await import('../../task-tracker/issue-mutator-lock.mjs');
    const { resolveSessionId } = await import('../../task-tracker/lib/session-id.mjs');
    await context(f.root, () =>
      withIssueLock(
        { issue: identity.issueNumber, projDir: f.root, sessionId: resolveSessionId() },
        async () => {
          let escaped = false;
          const result = await withNativePlanAssessmentAdvance(
            { store: f.store, claim: f.claim, cfg, body: working, deps },
            (value) => {
              escaped = !!value.capability;
              return value;
            }
          );
          assessmentProbe = { escaped, returnedCapability: Object.hasOwn(result, 'capability') };
        }
      )
    );
  }
  if (outcome === 'satisfied' && !skipApproval) {
    const previousMode = process.env.TT_FULL_AUTO;
    try {
      if (mode === 'full-auto') process.env.TT_FULL_AUTO = '1';
      else delete process.env.TT_FULL_AUTO;
      staged = await context(f.root, async () => {
        const input = { store: f.store, claim: f.claim, cfg, deps };
        return stageNativePlanApproval(stagingOverride ? await stagingOverride(input) : input);
      });
    } finally {
      if (previousMode === undefined) delete process.env.TT_FULL_AUTO;
      else process.env.TT_FULL_AUTO = previousMode;
    }
  }
  const approved =
    outcome === 'satisfied' && !skipApproval
      ? await context(f.root, () =>
          rebindNativePlanApproval({ store: f.store, claim: f.claim, cfg, deps })
        )
      : null;
  const stagingRemoteReads = publishedFixture.graphCalls() - stagingReadsBefore;
  let workflowPolicy = null;
  if (outcome === 'waived' || workflowWaiver) {
    const { createWorkflowExceptionEnvelope } =
      await import('../../task-tracker/lib/workflow-policy/exception-record.mjs');
    const { evaluateWorkflowBoundary } =
      await import('../../task-tracker/lib/workflow-policy/enforcement.mjs');
    const { computeScopeIdentity } =
      await import('../../task-tracker/lib/workflow-policy/scope-identity.mjs');
    const waiver = createWorkflowExceptionEnvelope({
      repository: identity.repository,
      issue: identity.issueNumber,
      exceptionId: 'bounded-plan-exception',
      revision: 1,
      status: 'active',
      scopeIdentity: computeScopeIdentity({
        repository: identity.repository,
        issue: identity.issueNumber,
        body: base,
      }),
      requirementIds: waiverRequirementIds,
      constraints: [],
      reason: 'Explicit offline native policy fixture for this bounded transition.',
      authorization: {
        reference: 'codex://sessions/offline/messages/authorization',
        statement: 'Waive the three named Plan requirements for this offline fixture only.',
        principal: 'github-user:tester',
        recordingActor: 'codex/session:author-A',
        origin: 'codex-session-transcript',
        verificationLevel: 'host-verified-user-message',
      },
      expiresAt: waiverExpiresAt,
      operationId: 'sha256:' + 'a'.repeat(64),
      createdAt: '2026-10-19T00:00:00.000Z',
      recordId: '01M2Y000000000000000000001',
      grantId: '01M2Y000000000000000000099',
    });
    workflowPolicy = evaluateWorkflowBoundary({
      repository: identity.repository,
      issue: identity.issueNumber,
      body: base,
      records: [{ commentNodeId: 'IC_waiver', envelope: waiver }],
      requirementIds: ['approval.plan', 'planning.planned-estimate', 'planning.forecast'],
      activity: 'workflow-transition:develop',
      state: 'plan',
      now: '2026-10-19T01:00:00.000Z',
    });
    if (waiverRequirementIds.length === 3) assert.equal(workflowPolicy.status, 'policy-compatible');
    const { renderAitmRecord } =
      await import('../../task-tracker/lib/github-records/record-envelope.mjs');
    const waiverBody = renderAitmRecord({ envelope: waiver });
    await changeGeneration(f, (g, payloads) => {
      const { body: ignored, ...row } = observeContent({
        identity,
        node: {
          id: 'IC_waiver',
          lastEditedAt: null,
          includesCreatedEdit: false,
          userContentEdits: { totalCount: 0, nodes: [] },
        },
        body: waiverBody,
      });
      void ignored;
      payloads.set('base/waiver.md', waiverBody);
      g.baseSnapshot.resources['comment:IC_waiver'] = {
        ...row,
        ownership: 'owned',
        payloadPath: 'base/waiver.md',
      };
      g.baseSnapshot.inventory.push('IC_waiver');
      g.baseSnapshot.inventory.sort();
    });
  }
  const record = authority.resolvePlanTransitionAuthority({
    repository: identity.repository,
    issue: identity.issueNumber,
    transitionId: move.id,
    body: staged.body,
    workflowPolicy,
    cfg,
    recordedAt: authorityRecordedAt ?? events[0].timestamp,
  });
  const authorityBody = authority.renderPlanTransitionCandidateAuthority(record);
  const statusCandidate = {
    ...beforeField,
    value: { optionId: cfg.kanbanOptionDevelop, name: 'Develop' },
  };
  const statusKey = `project-field:${identity.projectItemId}:${cfg.kanbanFieldId}`;
  const authorityKey = 'comment:new:plan-authority';
  await changeGeneration(f, (g, payloads) => {
    if (baselineAuthorityOnly) {
      const { body: ignored, ...observed } = observeContent({
        identity,
        node: {
          id: 'IC_authority',
          lastEditedAt: null,
          includesCreatedEdit: false,
          userContentEdits: { totalCount: 0, nodes: [] },
        },
        body: authorityBody,
      });
      void ignored;
      payloads.set('base/authority.md', authorityBody);
      g.baseSnapshot.resources['comment:IC_authority'] = {
        ...observed,
        ownership: 'owned',
        payloadPath: 'base/authority.md',
      };
      g.baseSnapshot.inventory.push('IC_authority');
      g.baseSnapshot.inventory.sort();
    }
    for (const [key, value, kind] of [
      ...(!baselineAuthorityOnly ? [[authorityKey, authorityBody, 'comment']] : []),
      [statusKey, json(statusCandidate), 'project-field'],
    ]) {
      const payloadPath = 'working/' + hash(value) + '.txt';
      payloads.set(payloadPath, value);
      g.working[key] = { payloadPath, digest: hash(value), kind, capabilityRef: null };
      g.dirtyKeys.push(key);
    }
    g.dirtyKeys.sort();
  });
  let dispositionEffect = null;
  if (clearDisposition) {
    const before = {
      itemId: identity.projectItemId,
      fieldId: 'F_disposition',
      type: 'SINGLE_SELECT',
      value: { optionId: 'OPT_blocked', name: disposition },
    };
    const candidate = { ...before, value: null };
    const key = `project-field:${identity.projectItemId}:F_disposition`;
    dispositionEffect = {
      key,
      kind: 'project-field-update',
      target: {
        identity,
        projectId: identity.projectId,
        itemId: identity.projectItemId,
        fieldId: 'F_disposition',
        type: 'SINGLE_SELECT',
      },
      beforeDigest: hash(json(before)),
      intendedDigest: hash(json(candidate)),
      candidate,
      dependencies: [],
      attempted: false,
      outcome: null,
    };
    await changeGeneration(f, (g, payloads) => {
      const raw = json(candidate);
      payloads.set('working/disposition.json', raw);
      g.working[key] = {
        payloadPath: 'working/disposition.json',
        digest: hash(raw),
        kind: 'project-field',
        capabilityRef: null,
      };
      g.dirtyKeys.push(key);
      g.dirtyKeys.sort();
    });
  }
  const timing = await f.freeze(move);
  const note = {
    key: authorityKey,
    kind: 'comment-create',
    target: { identity, commentNodeId: null, creationIntent: 'plan-authority' },
    beforeDigest: null,
    intendedDigest: hash(authorityBody),
    candidate: authorityBody,
    dependencies: [],
    attempted: false,
    outcome: null,
  };
  const stagedRecord = await f.store.readGeneration();
  const extraComments = Object.entries(stagedRecord.generation.working)
    .filter(([key]) => key.startsWith('comment:new:') && key !== authorityKey)
    .map(([key, entry]) => {
      const body = String(stagedRecord.payloads.get(entry.payloadPath));
      return {
        key,
        kind: 'comment-create',
        target: { identity, commentNodeId: null, creationIntent: key.slice(12) },
        beforeDigest: null,
        intendedDigest: hash(body),
        candidate: body,
        dependencies: [],
        attempted: false,
        outcome: null,
      };
    });
  const status = {
    key: statusKey,
    kind: 'project-field-update',
    target: {
      identity,
      projectId: identity.projectId,
      itemId: identity.projectItemId,
      fieldId: cfg.kanbanFieldId,
      type: 'SINGLE_SELECT',
    },
    beforeDigest: hash(json(beforeField)),
    intendedDigest: hash(json(statusCandidate)),
    candidate: statusCandidate,
    dependencies: [
      ...(baselineAuthorityOnly ? [timing.key] : [timing.key, note.key]),
      ...extraComments.map((effect) => effect.key),
      ...(dispositionEffect ? [dispositionEffect.key] : []),
    ].sort(),
    attempted: false,
    outcome: null,
  };
  const issue = {
    key: 'issue:I_test',
    kind: 'issue-update',
    target: { identity, issueNodeId: identity.issueNodeId },
    beforeDigest: hash(base),
    intendedDigest: hash(staged.body),
    candidate: { schema: 'aitm.story-issue-update/v1', body: staged.body, title: staged.title },
    dependencies: [
      ...(!baselineAuthorityOnly ? [note.key] : []),
      timing.key,
      status.key,
      ...extraComments.map((effect) => effect.key),
      ...(dispositionEffect ? [dispositionEffect.key] : []),
    ].sort(),
    attempted: false,
    outcome: null,
  };
  const effects = [
    issue,
    ...(!baselineAuthorityOnly ? [note] : []),
    ...extraComments,
    ...(dispositionEffect ? [dispositionEffect] : []),
    status,
    timing,
  ];
  const native = await f.store.readGeneration();
  const cloud = hydrateJournalSnapshot(native.generation.baseSnapshot, native.payloads);
  const calls = [];
  assert.equal(typeof authority.createNativePlanAuthorityPorts, 'function');
  const validators = authority.createNativePlanAuthorityPorts({
    deps,
    evidenceStore: configured?.evidenceStore,
  });
  const ports = {
    capabilities: [
      ...(working !== base ? [{ base, candidate: working }] : []),
      {
        base: working,
        candidate: staged.body,
        ...(approved ? { capability: { nativePlanApprovalCapability: approved.capability } } : {}),
      },
    ],
    ...validators,
    nativePlanAuthority: validators,
    readSnapshot: async () => structuredClone(cloud),
    observe: async () => ({ complete: false }),
    validateFinal: async () => ({ verified: true }),
    apply: async (effect) => {
      calls.push(effect.kind);
      if (effect.kind === 'project-field-update') {
        cloud.fields = cloud.fields.map((field) =>
          field.fieldId === effect.candidate.fieldId ? structuredClone(effect.candidate) : field
        );
        cloud.fieldsDigest = hash(
          json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: cloud.fields })
        );
        return { complete: true, identity, field: structuredClone(effect.candidate) };
      }
      const body = typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body;
      const id =
        effect.kind === 'issue-update'
          ? identity.issueNodeId
          : effect.kind === 'comment-create'
            ? 'IC_' + effect.target.creationIntent.replace(/[^a-zA-Z0-9_]/g, '_')
            : effect.target.commentNodeId;
      const value = {
        complete: true,
        identity,
        node: {
          id,
          lastEditedAt: null,
          includesCreatedEdit: false,
          userContentEdits: { totalCount: 0, nodes: [] },
        },
        body,
        ...(effect.kind === 'issue-update' ? { title: effect.candidate.title } : {}),
      };
      cloud.resources[(effect.kind === 'issue-update' ? 'issue:' : 'comment:') + id] = {
        ...observeContent(value),
        ownership: 'owned',
      };
      if (effect.kind === 'comment-create') {
        cloud.inventory.push(id);
        cloud.inventory.sort();
      }
      return {
        ...value,
        ...(effect.kind === 'comment-create'
          ? {
              inventory: cloud.inventory.map((id) => ({
                id,
                body: cloud.resources['comment:' + id].body,
              })),
            }
          : {}),
      };
    },
  };
  const ctx = {
    issueArg: String(identity.issueNumber),
    resolvedFromState: 'plan',
    stateArg: 'develop',
    transitionId: move.id,
    transition: move,
    effects,
    statusKey,
    cfg,
    _runGuardExecution: async (ctx) => {
      ctx.planTransitionAuthorityInput = Object.freeze({
        body: staged.body,
        workflowPolicy,
        sessionPolicy: null,
        scopeIdentity: null,
      });
      return { exit: null };
    },
  };
  const args = { ctx, store: f.store, claim: f.claim, ports };
  return {
    ...f,
    authorityRecord: record,
    configured,
    epicFixture,
    assessmentProbe,
    stagingRemoteReads,
    base,
    deps,
    args,
    ctx,
    ports,
    cloud,
    calls,
    run: () => context(f.root, () => runTransitionBatch(args)),
  };
}
