// @story #2039 #2065
import { historicalForecastEnvelope } from '../../../helpers/task-2065-forecast-fixture.mjs';
// @story #1987 #2034
import test from 'node:test';
import { buildPlannedAppendix } from '../../../../task-tracker/lib/refine-estimate-comment.mjs';
import { buildAuditCommentBody } from '../../../../task-tracker/lib/reevaluate-estimate.mjs';
import { buildEstimationForecast } from '../../../../task-tracker/lib/estimation/forecast-model.mjs';
import { createBootstrapRubric } from '../../../../task-tracker/lib/estimation/rubric-model.mjs';
import { renderAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { freshUnitDir } from './decomposition-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import {
  collectDecompositionAuthority,
  createDecompositionRuntime,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  fixture,
  subject,
  observed,
  unavailable,
  hash,
  publication,
} from './decomposition-authority-fixtures.mjs';
const cfg = { repo: 'o/r', projectId: 'PVT_a', fieldIds: { estimate: 'EST', size: 'SIZE' } };
const collect = (f) =>
  collectDecompositionAuthority({ subject, cfg, projectDir: process.cwd(), deps: f.deps });
test('effect-free collection computes current input but absent projection denies scoped admission', async () => {
  const f = fixture();
  const r = await collect(f);
  assert.equal(r.assessment.status, 'story-ok');
  assert.equal(r.projection.status, 'absent');
  assert.equal(r.capabilities.includes('scoped-implementation'), false);
  assert.equal(f.writes.length, 0);
  assert.equal(
    typeof createDecompositionRuntime({ cfg, projectDir: process.cwd(), deps: f.deps }).collect,
    'function'
  );
});
test('display ticks proof timing and body revision do not stale semantic identity', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body =
    f.body
      .replace('- [ ]', '- [x]')
      .replace(
        'Collect current authority.',
        'Collect current authority. <!-- aitm-execution-proof payload="display" -->'
      ) + '\n<!-- aitm-body-version version="99" -->\n## Timing Log\nnew timing row';
  assert.equal((await collect(f)).inputDigest, a.inputDigest);
});
for (const [name, change] of [
  [
    'scope',
    (f) =>
      (f.body = f.body.replace(
        'Collect current authority.',
        'Collect current and proposal authority.'
      )),
  ],
  ['verifier', (f) => (f.body = f.body.replace('node verify.mjs', 'node other.mjs'))],
  [
    'criterion',
    (f) =>
      (f.body = f.body.replace(
        'Current inputs must agree.',
        'All inputs and pending intent must agree.'
      )),
  ],
]) {
  test(`semantic ${name} change invalidates old assessment`, async () => {
    const f = fixture();
    const a = await collect(f);
    f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: null });
    change(f);
    const b = await collect(f);
    assert.notEqual(b.inputDigest, a.inputDigest);
    assert.equal(b.projection.status, 'stale');
    assert.equal(b.capabilities.includes('scoped-implementation'), false);
  });
}
for (const port of ['readIssue', 'readProject', 'readSelectedPlan', 'readForecast', 'readPolicy']) {
  test(`unavailable ${port} preserves mandatory estimate signal and denies admission`, async () => {
    const f = fixture(25);
    f.deps[port] = async () => unavailable();
    const r = await collect(f);
    assert.equal(r.assessment.status, 'indeterminate');
    assert.equal(r.capabilities.includes('scoped-implementation'), false);
    if (port !== 'readIssue' && port !== 'readProject')
      assert.equal(
        r.assessment.signals.some((s) => s.code === 'estimate-hours'),
        true
      );
  });
}
test('disagreeing body project and forecast retain higher observed estimate', async () => {
  const f = fixture(7);
  f.values.project.estimate = 25;
  const r = await collect(f);
  assert.equal(r.input.estimate.hours, 25);
  assert.equal(r.assessment.status, 'indeterminate');
  assert.ok(r.input.availability.reasons.includes('authority-conflict'));
});
test('missing configured membership is unavailable rather than exemption', async () => {
  const f = fixture();
  f.values.project.projectItemId = null;
  assert.equal((await collect(f)).assessment.status, 'indeterminate');
});
for (const marker of [
  '<!-- aitm-issue-kind kind="unknown" -->',
  '<!-- aitm-issue-kind kind="epic" -->\n<!-- aitm-issue-kind kind="code" -->',
  '<!-- aitm-issue-kind kind=code -->',
]) {
  test(`malformed or duplicate explicit kind cannot fall back to code: ${marker}`, async () => {
    const f = fixture();
    f.body += marker;
    assert.equal((await collect(f)).assessment.status, 'indeterminate');
  });
}
test('pending intent fences matching old low authority before any effect', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: a.assessment,
    publication: publication(a.inputDigest),
  });
  const r = await collect(f);
  assert.equal(r.assessment.status, 'pending');
  assert.equal(r.capabilities.includes('scoped-implementation'), false);
  assert.equal(f.writes.length, 0);
});
test('selected exact plan content and named root references bind digest', async () => {
  const f = fixture();
  const content = '### Task 2: Collect authority\nBounded bytes.\n';
  f.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: '### Task 2: Collect authority',
    digest: hash(content),
    availability: 'available',
    content,
    references: 'shared wire bytes',
  };
  const a = await collect(f);
  assert.equal(a.input.plan.content, content);
  assert.equal(a.input.plan.digest, hash(content));
  f.values.plan.references = 'changed wire bytes';
  assert.notEqual((await collect(f)).inputDigest, a.inputDigest);
});
test('dishonest observed digest is unavailable authority', async () => {
  const f = fixture();
  f.deps.readPolicy = async () => ({ ...observed(f.values.policy), digest: '0'.repeat(64) });
  assert.equal((await collect(f)).assessment.status, 'indeterminate');
});

test('ordinary verified proof changes retain declarations and semantic identity', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = f.body.replace(
    'vc-list="vc:1"',
    'vc-list="vc:1" sha="abc" ts="2026-10-11T12:00:00Z" evidence="verified"'
  );
  assert.equal((await collect(f)).inputDigest, a.inputDigest);
});
test('malformed observed policy becomes typed unavailable rather than throwing', async () => {
  const f = fixture();
  f.deps.readPolicy = async () => observed({ policy: 'unknown' });
  const r = await collect(f);
  assert.equal(r.assessment.status, 'indeterminate');
  assert.ok(r.input.availability.reasons.includes('policy-unavailable'));
});
test('production plan adapter classifies exact pinned selected bytes over dirty working copy', async () => {
  const f = fixture();
  delete f.deps.readSelectedPlan;
  const selected = '### Task 2: Collect authority\n\nBounded selected content.\n';
  const full =
    '# Plan\n## Shared wire and API contracts\nShared bytes.\n## Work\n### Task 1: Other\nOther bytes.\n' +
    selected +
    '## Tail\nTail bytes.\n';
  f.body = f.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n- **Source-plan-section**: ### Task 2: Collect authority\n\n## AITM Progress Markers'
  );
  f.deps.readPlanAtCommit = async (args) => {
    assert.equal(args.planCommit, '1'.repeat(40));
    return full;
  };
  const dir = freshUnitDir('decomposition-plan-');
  try {
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'docs/plan.md'), 'dirty unrelated file');
    const r = await collectDecompositionAuthority({ subject, cfg, projectDir: dir, deps: f.deps });
    assert.equal(r.input.plan.content, selected);
    assert.equal(r.input.plan.digest, hash(selected));
    assert.equal(r.assessment.status, 'story-ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('duplicate records remain distinct from missing authority', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: null });
  f.body += f.body.match(/<!-- aitm-decomposition-assessment[^]*?-->/)[0];
  const r = await collect(f);
  assert.equal(r.projection.status, 'malformed');
  assert.equal(r.assessment.status, 'indeterminate');
});
test('stale displayed status and capabilities are not treated as current projection', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: null });
  f.body = f.body.replace('Status: story-ok', 'Status: must-decompose');
  const r = await collect(f);
  assert.equal(r.projection.status, 'stale');
});

function epicFixture(terminal = false) {
  const f = fixture(25);
  f.body += '<!-- aitm-issue-kind kind="epic" -->';
  const content = '### Task 1: Child authority\n\nRun: `node verify-child.mjs`\n';
  f.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: null,
    digest: hash(content),
    availability: 'available',
    content,
    references: null,
  };
  f.values.project.children = [
    {
      number: 2001,
      title: 'Child authority',
      body:
        '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
        '1'.repeat(40) +
        '\n- **Source-plan-section**: ### Task 1: Child authority\n\n<!-- aitm-refinement-snapshot schema="3" digest="' +
        'a'.repeat(64) +
        '" provenance="' +
        'b'.repeat(64) +
        '" priority="P1" size="M" estimate="7" rank="1" ts="2026-10-11T12:00:00Z" -->',
      rank: 1,
      blockedBy: [],
      hasCurrentRefinement: true,
      state: terminal ? 'done' : 'ready-for-plan',
      issueState: terminal ? 'closed' : 'open',
      boardState: terminal ? 'done' : 'ready-for-plan',
      closeReason: terminal ? 'completed' : null,
      recoveryPhase: null,
    },
  ];
  f.deps.readPlanAtCommit = async () => content;
  return f;
}
test('real materialized WBS permits planning while R4P children deny completion', async () => {
  const f = epicFixture();
  const r = await collect(f);
  assert.equal(r.input.epicReadiness.planning, true);
  assert.equal(r.input.epicReadiness.completion, false);
  assert.equal(r.assessment.status, 'epic-readiness-required');
  assert.equal(
    r.assessment.signals.some((s) => s.code === 'estimate-hours'),
    false
  );
});
test('only accepted terminal provider child evidence permits epic completion', async () => {
  const f = epicFixture(true);
  const r = await collect(f);
  assert.equal(r.input.epicReadiness.completion, true);
  f.values.project.children[0].boardState = 'review';
  assert.equal((await collect(f)).input.epicReadiness.completion, false);
});
test('epic dependency permutations preserve identity and provider arrays', async () => {
  const f = epicFixture(true);
  const child = f.values.project.children[0];
  child.blockedBy = [1990, 1991, 2006];
  const original = await collect(f);
  assert.equal(original.input.epicReadiness.completion, true);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: original.assessment,
    publication: null,
  });
  const providerOrder = Object.freeze([2006, 1991, 1990]);
  child.blockedBy = providerOrder;
  const current = await collect(f);
  assert.deepEqual(current.input.epicReadiness.children[0].blockedBy, [1990, 1991, 2006]);
  assert.equal(current.input.epicReadiness.digest, original.input.epicReadiness.digest);
  assert.equal(current.inputDigest, original.inputDigest);
  assert.equal(current.projection.status, 'current');
  assert.equal(current.input.epicReadiness.completion, true);
  assert.strictEqual(child.blockedBy, providerOrder);
  assert.deepEqual(providerOrder, [2006, 1991, 1990]);
});
test('epic dependency membership changes invalidate stored authority', async () => {
  const f = epicFixture(true);
  const child = f.values.project.children[0];
  child.blockedBy = [1990, 1991, 2006];
  const original = await collect(f);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: original.assessment,
    publication: null,
  });
  child.blockedBy = [1990, 1991, 2007];
  const current = await collect(f);
  assert.notEqual(current.input.epicReadiness.digest, original.input.epicReadiness.digest);
  assert.notEqual(current.inputDigest, original.inputDigest);
  assert.equal(current.projection.status, 'stale');
});
test('epic terminal board drift still invalidates stored authority', async () => {
  const f = epicFixture(true);
  const child = f.values.project.children[0];
  child.blockedBy = [1990, 1991, 2006];
  const original = await collect(f);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: original.assessment,
    publication: null,
  });
  child.boardState = 'review';
  const current = await collect(f);
  assert.equal(current.input.epicReadiness.completion, false);
  assert.notEqual(current.inputDigest, original.inputDigest);
  assert.equal(current.projection.status, 'stale');
});
test('child readiness cannot be supplied as an admission boolean', async () => {
  const f = epicFixture();
  f.values.project.children[0].hasCurrentRefinement = false;
  f.values.project.planning = true;
  const r = await collect(f);
  assert.equal(r.input.epicReadiness.planning, false);
  assert.equal(r.input.epicReadiness.completion, false);
});

test('proof reference IDs and legacy display proof cannot alter semantic admission identity', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = f.body.replace(
    'vc-list="vc:1"',
    'vc-list="vc:1" proof="#123" verified-at="2026-10-11T12:00:00Z"'
  );
  assert.equal((await collect(f)).inputDigest, a.inputDigest);
});

test('dangling VC citation is unavailable scope authority', async () => {
  const f = fixture();
  f.body = f.body.replace('vc-list="vc:1"', 'vc-list="vc:999"');
  const r = await collect(f);
  assert.equal(r.assessment.status, 'indeterminate');
  assert.ok(r.input.availability.reasons.includes('scope-unavailable'));
});
test('declared named root reference cannot become empty valid authority', async () => {
  const f = fixture();
  delete f.deps.readSelectedPlan;
  const content =
    '### Task 2: Collect authority\n\nRead exact root Shared wire and API contracts.\n';
  f.body = f.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n- **Source-plan-section**: ### Task 2: Collect authority\n\n## AITM Progress Markers'
  );
  f.deps.readPlanAtCommit = async () => content;
  const dir = freshUnitDir('decomposition-ref-');
  try {
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'docs/plan.md'), content);
    const r = await collectDecompositionAuthority({ subject, cfg, projectDir: dir, deps: f.deps });
    assert.equal(r.assessment.status, 'indeterminate');
    assert.ok(r.input.availability.reasons.includes('plan-unavailable'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const variant of ['crlf', 'quoted-heading']) {
  test(`selected pinned bytes remain exact with ${variant}`, async () => {
    const f = fixture();
    delete f.deps.readSelectedPlan;
    const selected = '### Task 2: Collect authority\n\nActual selected bytes.\n';
    let full = '# Plan\n## Work\n' + selected + '## Tail\nTail.\n';
    if (variant === 'quoted-heading')
      full =
        '# Plan\n```md\n### Task 2: Collect authority\nFake quoted task.\n```\n## Work\n' +
        selected +
        '## Tail\nTail.\n';
    if (variant === 'crlf') full = full.replaceAll('\n', '\r\n');
    f.body = f.body.replace(
      '## AITM Progress Markers',
      '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
        '1'.repeat(40) +
        '\n- **Source-plan-section**: ### Task 2: Collect authority\n\n## AITM Progress Markers'
    );
    f.deps.readPlanAtCommit = async () => full;
    const dir = freshUnitDir('decomposition-bytes-');
    try {
      mkdirSync(path.join(dir, 'docs'));
      writeFileSync(path.join(dir, 'docs/plan.md'), full);
      const r = await collectDecompositionAuthority({
        subject,
        cfg,
        projectDir: dir,
        deps: f.deps,
      });
      assert.equal(
        r.input.plan.content,
        variant === 'crlf' ? selected.replaceAll('\n', '\r\n') : selected
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const field of ['estimate', 'size']) {
  test(`observed missing board ${field} conflicts with published body fields`, async () => {
    const f = fixture();
    f.values.project[field] = null;
    const r = await collect(f);
    assert.equal(r.assessment.status, 'indeterminate');
    assert.ok(r.input.availability.reasons.includes('authority-conflict'));
  });
}

function forecastTransport(f, comments, snapshot = {}) {
  delete f.deps.readForecast;
  const nodes = comments.map((comment, index) => ({
    __typename: 'IssueComment',
    id: comment.id ?? `IC_${index}`,
    body: comment.body,
    updatedAt: '2026-10-11T12:00:00Z',
    issue: { number: 1987, repository: { nameWithOwner: 'o/r' } },
  }));
  f.deps.forecast = {
    graphql: async () => ({
      data: {
        repository: {
          issue: {
            id: 'I_1987',
            number: 1987,
            body: snapshot.body ?? f.body,
            repository: { nameWithOwner: 'o/r' },
            projectItems: {
              nodes: [
                {
                  id: 'PVTI_a',
                  project: { id: 'PVT_a' },
                  fieldValues: {
                    nodes: [
                      {
                        number: snapshot.estimate ?? f.values.project.estimate,
                        field: { id: 'EST' },
                      },
                      { name: snapshot.size ?? f.values.project.size, field: { id: 'SIZE' } },
                    ],
                    pageInfo: { hasNextPage: false },
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
            },
            comments: { nodes, pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      },
    }),
  };
}
function activeForecastComment() {
  const payload = buildEstimationForecast({
    issue: 1987,
    refine: { size: 'M', humanHours: 7 },
    planInput: {
      schema: 'aitm.plan-estimation-input/v1',
      wbs: [
        {
          id: 'delivery',
          description: 'Deliver the revised implementation',
          baseHumanHours: 25,
          independentlyReviewable: false,
          signals: { modules: ['authority'], dependencies: [] },
        },
      ],
      testImpact: { lanes: ['unit'], isolation: 'provider fixture', expectedMinutes: 0 },
      risks: [],
      comparableIssueIds: [],
    },
    rubric: {
      recordId: '01J00000000000000000000703',
      payload: createBootstrapRubric({ generatedAt: '2026-10-11T12:00:00.000Z' }),
    },
  });
  const envelope = historicalForecastEnvelope({
    recordType: 'estimation-forecast',
    repository: 'o/r',
    issue: 1987,
    payload,
    actor: 'aitm/plan-estimate',
    recordId: '01J00000000000000000000702',
    grantId: '01J00000000000000000000704',
    createdAt: '2026-10-11T12:00:00.000Z',
  });
  return { id: 'IC_active', body: renderAitmRecord({ envelope }) };
}
for (const ready of ['missing', 'dangling']) {
  test(`review regression: ${ready} ready identity cannot hide an active oversized forecast`, async () => {
    const f = fixture();
    if (ready === 'dangling')
      f.body += '<!-- aitm-estimation-forecast-ready record-id="01J00000000000000000000999" -->';
    forecastTransport(f, [activeForecastComment()]);
    const r = await collect(f);
    assert.equal(r.assessment.status, 'indeterminate');
    assert.ok(r.input.availability.reasons.includes('forecast-unavailable'));
    assert.equal(
      r.assessment.signals.some((s) => s.code === 'estimate-hours' && s.value >= 24),
      true
    );
  });
}
test('review regression: real compatibility appendix identifies active proposed hours', async () => {
  const f = fixture();
  forecastTransport(f, [
    {
      id: 'IC_compat',
      body:
        '<!-- aitm-refined-estimate: 1987 -->' +
        buildPlannedAppendix({
          planned: { size: 'M', estimate: 25 },
          current: { size: 'M', estimate: 7 },
          rationale: 'Current delivery growth',
        }),
    },
  ]);
  const r = await collect(f);
  assert.equal(r.input.estimate.basis, 'proposed');
  assert.equal(r.input.estimate.hours, 25);
  assert.equal(r.assessment.status, 'must-decompose');
  assert.equal(r.capabilities.includes('scoped-implementation'), false);
});
test('review regression: actual human-attention reestimate remains proposed and unapplied', async () => {
  const f = fixture();
  const comment = buildAuditCommentBody({
    current: { size: 'S', estimate: 7 },
    size: 'XL',
    estimate: 25,
    requiresHuman: true,
    signals: { files: 8, steps: 8, risks: 3, deps: 3 },
    score: 12,
  });
  forecastTransport(f, [{ id: 'IC_human', body: comment }]);
  const r = await collect(f);
  assert.equal(r.input.estimate.basis, 'proposed');
  assert.equal(r.input.estimate.hours, 25);
  assert.equal(r.assessment.status, 'must-decompose');
  assert.equal(f.values.project.estimate, 7);
  assert.equal(f.writes.length, 0);
});

for (const outcome of ['confirmed', 'failed', 'pending', 'changed-comment']) {
  test(`compatibility proposal retirement requires exact reconciled history: ${outcome}`, async () => {
    const f = fixture();
    const raw =
      '<!-- aitm-refined-estimate: 1987 -->' +
      buildPlannedAppendix({
        planned: { size: 'M', estimate: 25 },
        current: { size: 'M', estimate: 7 },
        rationale: 'Unapplied growth',
      });
    forecastTransport(f, [{ id: 'IC_history', body: raw }]);
    const before = await collect(f);
    const record = publication(before.inputDigest, {
      supersedes: {
        operationId: 'b41d3bf2-e26e-477e-88d1-b2db32793999',
        effects: [
          {
            id: 'proposal',
            resource: 'comment',
            targetIdentity: 'comment:IC_history',
            intendedDigest: hash(raw),
            status:
              outcome === 'pending'
                ? 'pending'
                : ['failed', 'changed-comment'].includes(outcome)
                  ? 'failed'
                  : 'confirmed',
            observedDigest:
              outcome === 'pending'
                ? null
                : outcome === 'changed-comment'
                  ? hash('earlier version')
                  : hash(raw),
          },
        ],
      },
    });
    if (outcome === 'pending') {
      record.effects = [
        {
          id: 'proposal',
          resource: 'comment',
          targetIdentity: 'comment:IC_history',
          intendedDigest: hash(raw),
          status: 'pending',
          observedDigest: null,
        },
      ];
      record.supersedes = null;
    }
    f.body = replaceDecompositionRecords(f.body, {
      assessment: before.assessment,
      publication: record,
    });
    const after = await collect(f);
    assert.equal(
      after.input.estimate.basis,
      ['confirmed', 'failed'].includes(outcome) ? 'published' : 'proposed'
    );
    assert.equal(after.input.estimate.hours, ['confirmed', 'failed'].includes(outcome) ? 7 : 25);
    assert.ok(f.body.includes(record.operationId));
    assert.equal(f.writes.length, 0);
  });
}
test('duplicate compatibility headings are unavailable rather than absent proposal', async () => {
  const f = fixture();
  const raw =
    '<!-- aitm-refined-estimate: 1987 -->' +
    buildPlannedAppendix({
      planned: { size: 'M', estimate: 25 },
      current: { size: 'M', estimate: 7 },
      rationale: 'Growth',
    });
  forecastTransport(f, [{ id: 'IC_duplicate', body: raw + '\n### Planned Estimate\n' }]);
  const result = await collect(f);
  assert.ok(result.input.availability.reasons.includes('forecast-unavailable'));
  assert.equal(result.capabilities.includes('scoped-implementation'), false);
});

test('production forecast snapshot disagreement retains observed mandatory high estimate', async () => {
  const f = fixture();
  const other = fixture(25);
  forecastTransport(f, [], { estimate: 25, body: other.body });
  const result = await collect(f);
  assert.equal(result.input.availability.status, 'incomplete');
  assert.ok(result.input.availability.reasons.includes('authority-conflict'));
  assert.equal(result.input.estimate.hours, 25);
  assert.equal(result.assessment.status, 'indeterminate');
  assert.equal(result.capabilities.includes('scoped-implementation'), false);
  assert.equal(f.writes.length, 0);
});
test('production forecast snapshot disagreement retains observed mandatory size', async () => {
  const f = fixture();
  forecastTransport(f, [], { size: 'XL' });
  const result = await collect(f);
  assert.ok(result.input.availability.reasons.includes('authority-conflict'));
  assert.equal(result.input.size, 'XL');
  assert.equal(result.capabilities.includes('scoped-implementation'), false);
});

test('unready unique forecast exposes reconciliation data but remains unavailable authority', async () => {
  const f = fixture();
  forecastTransport(f, [activeForecastComment()]);
  const current = await collect(f),
    read = current.sourceObservations.readForecast;
  assert.equal(read.status, 'unavailable');
  assert.equal(read.value.publicationTransition.recordId, '01J00000000000000000000702');
  assert.equal(read.value.publicationTransition.readyRecordId, null);
  assert.equal(current.capabilities.includes('scoped-implementation'), false);
});

// Historical transport fixture: validation uses native legacy render/parse, never new publication.
