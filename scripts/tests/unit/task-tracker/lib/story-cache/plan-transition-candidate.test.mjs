// @story #2069
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  trunk,
  projectDir,
  initial,
  transition,
  approve,
  verify,
  candidateFixture,
  enabledFixture,
} from '../../../../helpers/plan-transition-candidate-fixture.mjs';
import * as approvals from '../../../../../task-tracker/verbs/plan-approve.mjs';

import {
  verifyPlanTransitionAuthorityScope,
  resolvePlanTransitionAuthority,
} from '../../../../../task-tracker/lib/plan-transition-authority.mjs';

import fs from 'node:fs';
import path from 'node:path';

import { id } from '../../../../helpers/local-estimation-evidence-fixture.mjs';

import {
  createAitmRecordEnvelope,
  parseAitmRecord,
  renderAitmRecord,
} from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';

import {
  renderPlanTransitionCandidateAuthority,
  renderPlanApprovalCandidateAudit,
} from '../../../../../task-tracker/lib/plan-transition-authority.mjs';
import { validateStagedComposite } from '../../../../../task-tracker/lib/story-cache/stage-capabilities.mjs';
import { upsertOwnedComment } from '../../../../../task-tracker/lib/owned-comment.mjs';
import { isCanonicalPlanApprovalAuditComment } from '../../../../../task-tracker/lib/plan-approval-audit.mjs';

for (const mode of ['human', 'full-auto']) {
  test(`retains real ${mode} approval through final-body materialization`, async () => {
    const s = await approve(mode);
    const result = await verify(s, {
      body: s.body + '\n<!-- aitm-move-complete state=develop -->',
    });
    assert.equal(result.approved.mode, mode);
    assert.equal(result.approved.trunkSha, trunk);
    assert.equal(result.repository, 'owner/repo');
  });
}

test('changed semantic scope invalidates retained approval', async () => {
  const s = await approve();
  await assert.rejects(
    verify(s, {
      body: s.body.replace(
        'Validate the approved publication scope.',
        'Publish a different artifact.'
      ),
    }),
    /scope|source/
  );
});

test('changed trunk invalidates retained approval', async () => {
  const s = await approve();
  s.changeTrunk();
  await assert.rejects(verify(s), /trunk/);
});

test('a serialized or invented approval handle cannot authorize a candidate', async () => {
  const s = await approve();
  assert.equal(typeof approvals.verifyRetainedPlanApproval, 'function');
  for (const handle of [{}, { approved: true }, structuredClone(s.result.approvalCapability)]) {
    await assert.rejects(
      approvals.verifyRetainedPlanApproval(handle, {
        body: s.body,
        repository: 'owner/repo',
        issue: 2039,
        projectDir,
      }),
      /capability/
    );
  }
});

test('caller-assembled baseline and confirmed effects cannot grant native authority', async () => {
  const f = await candidateFixture();
  await assert.rejects(verifyPlanTransitionAuthorityScope(f.input), /native-boundary-required/);
});

async function forecastCheck(f) {
  const admitted = await approvals.verifyRetainedPlanApproval(
    f.input.candidate.approvalCapability,
    f.input.candidate
  );
  const comments = f.baseline.inventory.map((id) => ({
    id,
    body: f.baseline.resources['comment:' + id].body,
  }));
  const { validatePlanCandidateForecast } =
    await import('../../../../../task-tracker/lib/plan-exit-planned-estimate-guard.mjs');
  return validatePlanCandidateForecast({
    admitted,
    body: f.s.body,
    snapshot: f.baseline,
    comments,
    evidenceStore: f.input.candidate.evidenceStore,
  });
}

test('duplicate approval markers cannot retain a valid first marker as authority', async () => {
  const s = await approve();
  const marker = s.body.match(/<!-- aitm-plan-approved[^>]*-->/)[0];
  await assert.rejects(verify(s, { body: s.body + '\n' + marker }), /marker/);
});

test('changed Plan Metadata invalidates approval even when semantic scope is unchanged', async () => {
  const s = await approve();
  await assert.rejects(
    verify(s, {
      body: s.body + '\n## Plan Metadata\n\n- **Source-plan-commit**: ' + 'c'.repeat(40),
    }),
    /plan|source/
  );
});

test('a newly staged forecast cannot bypass the approval forecast freeze', async () => {
  const f = await candidateFixture();
  f.input.candidate.body +=
    '\n<!-- aitm-estimation-forecast-ready record-id="01M2Y000000000000000000001" -->';
  await assert.rejects(
    approvals.verifyRetainedPlanApproval(f.input.candidate.approvalCapability, f.input.candidate),
    /forecast/
  );
});

test('a frozen forecast ID without current native selection cannot acquire authority', async () => {
  await assert.rejects(
    candidateFixture('human', {
      cfg: { estimationRubricIssue: 1001 },
      body:
        initial +
        '\n<!-- aitm-estimation-forecast-ready record-id="01M2Y000000000000000000001" -->',
    }),
    /current-selection-required/
  );
});

test('accepts a verified v3 forecast with exact retained plan bytes and board projection', async (t) => {
  const f = await enabledFixture(t);
  assert.equal((await forecastCheck(f)).ok, true);
});

test('missing retained forecast bytes refuse without a cloud fallback', async (t) => {
  const f = await enabledFixture(t);
  f.input.candidate.evidenceStore = {
    read() {
      throw new Error('missing retained bytes');
    },
  };
  assert.equal((await forecastCheck(f)).ok, false);
});

test('a concurrently appearing approval marker does not mint a new native grant', async () => {
  const first = await approve();
  await assert.rejects(approve('human', { beforeMutate: () => first.body }), /concurrent-approval/);
});

test('changed local selected-plan bytes invalidate the native grant', async (t) => {
  const f = await enabledFixture(t);
  fs.appendFileSync(path.join(f.root, 'docs/selected-plan.md'), '\nChanged local scope.\n');
  await assert.rejects(
    approvals.verifyRetainedPlanApproval(f.input.candidate.approvalCapability, f.input.candidate),
    /source/
  );
});

test('candidate authority comments pass the actual staging invariants without new approval markers', async () => {
  const f = await candidateFixture('full-auto');
  const authority = resolvePlanTransitionAuthority({
    repository: 'owner/repo',
    issue: 2039,
    transitionId: transition.id,
    body: f.s.body,
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    recordedAt: '2026-10-19T01:00:00.000Z',
  });
  for (const body of [
    renderPlanTransitionCandidateAuthority(authority),
    renderPlanApprovalCandidateAudit({ issueNumber: 2039, ts: f.s.result.ts }),
  ]) {
    assert.equal(
      validateStagedComposite({
        base: '',
        candidate: body,
        operations: [{ base: '', candidate: body }],
      }),
      true
    );
  }
  assert.throws(
    () =>
      validateStagedComposite({
        base: initial,
        candidate: f.s.body,
        operations: [{ base: initial, candidate: f.s.body }],
      }),
    /protected-marker/
  );
});

test('the legacy context still reads real scope body and rejects drift', async () => {
  const s = await approve();
  const record = resolvePlanTransitionAuthority({
    repository: 'owner/repo',
    issue: 2039,
    transitionId: transition.id,
    body: s.body,
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    recordedAt: '2026-10-19T01:00:00.000Z',
  });
  let calls = 0;
  let body = s.body;
  const ctx = {
    cfg: { repo: 'owner/repo' },
    issueArg: '2039',
    planTransitionAuthority: { record },
    deps: {
      fetchPlanTransitionAuthorityScopeBody: async () => {
        calls++;
        return body;
      },
    },
  };
  assert.equal((await verifyPlanTransitionAuthorityScope(ctx)).verified, true);
  assert.equal(calls, 1);
  body = s.body.replace('Validate the approved publication scope.', 'Different external scope.');
  await assert.rejects(verifyPlanTransitionAuthorityScope(ctx), /scope-drift/);
});

test('legacy skip flags cannot authorize a candidate without native approval', async () => {
  await assert.rejects(
    verifyPlanTransitionAuthorityScope({ candidate: {}, SKIP_NETWORK: true }),
    /native-boundary-required/
  );
});

test('native comment renderers round-trip through the real owned writer without a write', async () => {
  const f = await candidateFixture('full-auto');
  const record = resolvePlanTransitionAuthority({
    repository: 'owner/repo',
    issue: 2039,
    transitionId: transition.id,
    body: f.s.body,
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    recordedAt: '2026-10-19T01:00:00.000Z',
  });
  for (const body of [
    renderPlanTransitionCandidateAuthority(record),
    renderPlanApprovalCandidateAudit({ issueNumber: 2039, ts: f.s.result.ts }),
  ]) {
    const match = /<!-- aitm-owned-comment key="([^"]+)" -->/.exec(body);
    const deny = () => {
      throw new Error('unexpected remote effect');
    };
    const result = await upsertOwnedComment({
      repository: 'owner/repo',
      issue: 2039,
      key: match[1],
      body: body.slice(0, match.index),
      deps: {
        listComments: async () => ({
          issueId: 'I_test',
          comments: [{ id: 'IC_native', body, repository: 'owner/repo', issue: 2039 }],
        }),
        graphql: deny,
        beforeWrite: deny,
        createComment: deny,
        updateComment: deny,
        readComment: deny,
      },
    });
    assert.equal(result.status, 'no-op');
  }
});

test('candidate Full-Auto audits remain canonical and use distinct event ownership keys', async () => {
  const first = { issueNumber: 2039, ts: '2026-10-19T01:00:00Z' };
  const second = { issueNumber: 2039, ts: '2026-10-20T01:00:00Z' };
  const a = renderPlanApprovalCandidateAudit(first);
  const b = renderPlanApprovalCandidateAudit(second);
  assert.equal(isCanonicalPlanApprovalAuditComment(a, first), true);
  assert.equal(isCanonicalPlanApprovalAuditComment(b, second), true);
  assert.notEqual(
    a.match(/aitm-owned-comment key="([^"]+)"/)[1],
    b.match(/aitm-owned-comment key="([^"]+)"/)[1]
  );
  assert.equal(
    isCanonicalPlanApprovalAuditComment(a.replace('AI agent', 'Human reviewer'), first),
    false
  );
});

test('a concurrent Scope edit cannot receive a grant for the newly adopted scope', async () => {
  await assert.rejects(
    approve('human', {
      beforeMutate: (body) =>
        body.replace('Validate the approved publication scope.', 'Approve a different scope.'),
    }),
    /scope/
  );
});

for (const [prior, current] of [
  ['human', 'full-auto'],
  ['full-auto', 'human'],
]) {
  test(`a concurrent stale ${prior} marker cannot become a ${current} invocation grant`, async () => {
    const first = await approve(prior);
    await assert.rejects(
      approve(current, {
        beforeMutate: () =>
          first.body.replace(`trunk-sha="${trunk}"`, `trunk-sha="${'b'.repeat(40)}"`),
      }),
      /concurrent|approval/
    );
  });
}

for (const defect of ['missing-predecessor', 'disconnected-cycle']) {
  test(`forecast refuses ${defect} despite one apparently active head`, async (t) => {
    const f = await enabledFixture(t);
    const { validatePlanCandidateForecast } =
      await import('../../../../../task-tracker/lib/plan-exit-planned-estimate-guard.mjs');
    const admitted = await approvals.verifyRetainedPlanApproval(
      f.input.candidate.approvalCapability,
      f.input.candidate
    );
    const comments = f.baseline.inventory.map((id) => ({
      id,
      body: f.baseline.resources['comment:' + id].body,
    }));
    const current = comments.find((row) => row.id === 'IC_forecast');
    const { envelope: record } = parseAitmRecord({
      commentNodeId: current.id,
      body: current.body,
      expectedRepository: 'owner/repo',
      expectedIssue: 2039,
    });
    if (defect === 'missing-predecessor') {
      current.body = renderAitmRecord({ envelope: { ...record, predecessor: id(40) } });
    } else {
      comments.push(
        ...[40, 41].map((number) => ({
          id: 'IC_cycle_' + number,
          body: renderAitmRecord({
            envelope: createAitmRecordEnvelope({
              ...record,
              ...record.authority,
              payload: {
                ...record.payload,
                supersedesForecastRecordId: id(number === 40 ? 41 : 40),
              },
              recordId: id(number),
              predecessor: id(number === 40 ? 41 : 40),
              supersedes: id(number === 40 ? 41 : 40),
            }),
          }),
        }))
      );
    }
    const result = validatePlanCandidateForecast({
      admitted,
      body: f.s.body,
      snapshot: f.baseline,
      comments,
      evidenceStore: f.input.candidate.evidenceStore,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.args, { reason: 'lineage' });
  });
}

for (const defect of ['duplicate', 'malformed', 'fenced-only']) {
  test(`forecast refuses ${defect} ready authority`, async (t) => {
    const f = await enabledFixture(t);
    const { validatePlanCandidateForecast } =
      await import('../../../../../task-tracker/lib/plan-exit-planned-estimate-guard.mjs');
    const admitted = await approvals.verifyRetainedPlanApproval(
      f.input.candidate.approvalCapability,
      f.input.candidate
    );
    const marker = /<!-- aitm-estimation-forecast-ready[^>]*-->/g;
    let body = f.s.body;
    if (defect === 'duplicate')
      body += '\n<!-- aitm-estimation-forecast-ready record-id="' + id(31) + '" -->';
    if (defect === 'malformed')
      body += '\n<!-- aitm-estimation-forecast-ready record-id="invalid" -->';
    if (defect === 'fenced-only')
      body = body.replace(marker, (value) => '\n```markdown\n' + value + '\n```\n');
    const comments = f.baseline.inventory.map((id) => ({
      id,
      body: f.baseline.resources['comment:' + id].body,
    }));
    const result = validatePlanCandidateForecast({
      admitted,
      body,
      snapshot: f.baseline,
      comments,
      evidenceStore: f.input.candidate.evidenceStore,
    });
    assert.equal(result.ok, false);
  });
}

for (const changed of ['configuration', 'refine', 'modelPolicy', 'plan']) {
  test(`changed current ${changed} refuses candidate forecast authority`, async (t) => {
    const f = await enabledFixture(t);
    if (changed === 'configuration') f.selection.configuration.estimationRubricIssue = 2002;
    if (changed === 'refine') f.selection.refine.source.digest = 'e'.repeat(64);
    if (changed === 'modelPolicy') f.selection.modelPolicy.policyVersion = 'changed-policy';
    if (changed === 'plan') f.selection.plan.commit = 'd'.repeat(40);
    await assert.rejects(
      approvals.verifyRetainedPlanApproval(f.input.candidate.approvalCapability, f.input.candidate),
      /selection/
    );
  });
}

import { registerNativePlanCandidateTests } from '../../../../helpers/native-plan-transition-cases.mjs';
registerNativePlanCandidateTests();

// A forecast's selected-plan facts are independent of the approval policy outcome.
test('required forecast retains its real freeze and current plan when approval is waived', async (t) => {
  const f = await enabledFixture(t);
  const guard =
    await import('../../../../../task-tracker/lib/plan-exit-planned-estimate-guard.mjs');
  assert.equal(typeof guard.readPlanCandidateForecastFacts, 'function');
  const approval = await approvals.verifyRetainedPlanApproval(
    f.input.candidate.approvalCapability,
    f.input.candidate
  );
  const facts = guard.readPlanCandidateForecastFacts({ body: f.s.body, projectDir: f.root });
  const admitted = {
    repository: approval.repository,
    issue: approval.issue,
    cfg: approval.cfg,
    currentForecastSelection: f.selection,
    ...facts,
  };
  assert.equal(admitted.approved.mode, undefined);
  const comments = f.baseline.inventory.map((id) => ({
    id,
    body: f.baseline.resources['comment:' + id].body,
  }));
  const withoutAppendix = comments.filter((row) => !row.body.includes('aitm-refined-estimate'));
  assert.equal(
    guard.validatePlanCandidateForecast({
      admitted,
      body: f.s.body,
      snapshot: f.baseline,
      comments: withoutAppendix,
      evidenceStore: f.input.candidate.evidenceStore,
      estimateRequired: false,
    }).ok,
    true
  );
  assert.equal(
    guard.validatePlanCandidateForecast({
      admitted,
      body: f.s.body,
      snapshot: f.baseline,
      comments,
      evidenceStore: f.input.candidate.evidenceStore,
    }).ok,
    true
  );
  const missingFreeze = f.s.body.replace(/<!-- aitm-plan-approved[^>]*-->/g, '');
  const unfrozen = guard.readPlanCandidateForecastFacts({
    body: missingFreeze,
    projectDir: f.root,
  });
  assert.equal(
    guard.validatePlanCandidateForecast({
      admitted: { ...admitted, ...unfrozen },
      body: missingFreeze,
      snapshot: f.baseline,
      comments,
      evidenceStore: f.input.candidate.evidenceStore,
    }).ok,
    false
  );
});
