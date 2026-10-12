// @story #1908 #1986
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assessDecomposition,
  decompositionInputDigest,
  deriveDecompositionCapabilities,
  normalizeDecompositionInputs,
  validateDecompositionAssessment,
  validateDecompositionPublication,
} from '../../../../task-tracker/lib/decomposition-assessment.mjs';
import {
  readDecompositionRecords,
  replaceDecompositionRecords,
} from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  decompositionPolicyIdentity,
  selectDecompositionPlanSection,
} from '../../../../task-tracker/lib/decomposition-policy.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const SUBJECT = {
  repository: 'kburson/ai-task-manager',
  issue: 1986,
  projectId: 'PVT_project',
  projectItemId: 'PVTI_item',
};
const TS = '2026-10-11T18:10:00.000Z';
const OP = 'b41d3bf2-e26e-477e-88d1-b2db32793001';
const BASE = ['inspect', 'checkpoint', 'decomposition-prepare', 'governed-decomposition'];
const SCOPED = [...BASE, 'scoped-implementation', 'scoped-deliverable', 'scoped-completion'];
function plan(tasks, groups = tasks) {
  return Array.from(
    { length: tasks },
    (_, index) =>
      `### Task ${index + 1}: Deliver part ${index + 1}\n${index < groups ? `Run: \`node verify-${index + 1}.mjs\`` : 'Bounded work.'}`
  ).join('\n\n');
}
function child(state = 'ready-for-plan', disposition = null) {
  return {
    issue: 1987,
    sourcePlanCommit: '1'.repeat(40),
    sourcePlanSection: '### Task 2: Collect current authority',
    refinementDigest: sha('refinement'),
    rank: 2,
    blockedBy: [1986],
    state,
    disposition,
  };
}
function fixture({
  kind = 'code',
  hours = 8,
  size = 'M',
  content = null,
  readiness,
  ...changes
} = {}) {
  return {
    schema: 'aitm.decomposition-input/v1',
    subject: structuredClone(SUBJECT),
    kind,
    estimate: { basis: hours === null ? 'unset' : 'published', hours, proposalId: null },
    size,
    plan:
      content === null
        ? {
            path: null,
            commit: null,
            section: null,
            digest: null,
            availability: 'absent',
            content: null,
          }
        : {
            path: 'docs/plan.md',
            commit: '1'.repeat(40),
            section: '### Task 1: Deliver part 1',
            digest: sha(content),
            availability: 'available',
            content,
          },
    policy: decompositionPolicyIdentity(),
    scopeDigest: sha('story/scope/criteria/verifiers'),
    observations: [
      { resource: 'project', identity: 'PVTI_item', revision: '1', digest: sha('project-values') },
    ],
    availability: { status: 'complete', reasons: [] },
    epicReadiness:
      readiness ??
      (kind === 'epic'
        ? {
            availability: 'observed',
            planning: false,
            completion: false,
            digest: sha('graph'),
            children: [child()],
          }
        : {
            availability: 'not-applicable',
            planning: null,
            completion: null,
            digest: null,
            children: [],
          }),
    ...changes,
  };
}
function assessment(input = fixture(), publication = null) {
  return assessDecomposition(input, { publication, assessedAt: TS });
}
function publication(changes = {}) {
  return {
    schema: 'aitm.decomposition-publication/v1',
    subject: structuredClone(SUBJECT),
    operationId: OP,
    writerId: 'inflate-estimate',
    beforeInputDigest: sha('before'),
    intendedInputDigest: sha('after'),
    proposal: { estimate: { basis: 'published', hours: 24, proposalId: null }, size: 'L' },
    effects: [
      {
        id: 'board-estimate',
        resource: 'project-estimate',
        targetIdentity: 'PVTI_item',
        intendedDigest: sha('24'),
        status: 'pending',
        observedDigest: null,
      },
    ],
    status: 'pending',
    supersedes: null,
    createdAt: TS,
    updatedAt: TS,
    ...changes,
  };
}
function marker(name, value, attrs = '') {
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((key) => [key, canonical(v[key])])
          )
        : v;
  return `<!-- aitm-decomposition-${name} schema="1" payload="${Buffer.from(JSON.stringify(canonical(value))).toString('base64url')}"${attrs} -->`;
}
function bodyWith(raw) {
  return `## Decomposition Assessment\n\nVisible disposition.\n\n## AITM Progress Markers\n\n${raw}\n`;
}

// Wrong estimate boundary/kind exemption would expose oversized delivery capabilities.
for (const kind of ['code', 'docs-only', 'audit', 'research', 'spike', 'epic']) {
  for (const [hours, storyStatus] of [
    [23, 'needs-decomposition-review'],
    [24, 'must-decompose'],
    [25, 'must-decompose'],
  ]) {
    test(`${kind} ${hours}h uses the shared estimate boundary`, () => {
      const result = assessment(fixture({ kind, hours }));
      assert.equal(result.status, kind === 'epic' ? 'epic-readiness-required' : storyStatus);
      assert.deepEqual(result.capabilities, kind === 'epic' || hours >= 24 ? BASE : SCOPED);
      assert.equal(
        result.signals.some((entry) => entry.code === 'estimate-hours'),
        kind !== 'epic'
      );
    });
  }
}
test('genuine absent kind defaults to code while malformed explicit markers fence admission', () => {
  assert.equal(assessment(fixture({ kind: null, hours: 24 })).status, 'must-decompose');
  for (const kind of ['defect', 'unknown', '', 'CODE', ['code'], ['code', 'code'], 7]) {
    const result = assessment(fixture({ kind, hours: 24 }));
    assert.equal(result.status, 'indeterminate');
    assert.equal(
      result.signals.some((signal) => signal.level === 'must-split'),
      true
    );
    assert.equal(result.capabilities.includes('scoped-implementation'), false);
  }
});
test('published and proposed fractions become whole hours without claiming board effects', () => {
  for (const basis of ['published', 'proposed']) {
    const input = fixture({
      estimate: { basis, hours: 23.5, proposalId: basis === 'proposed' ? OP : null },
    });
    const result = assessment(input);
    assert.equal(result.estimate.hours, 24);
    assert.equal(result.estimate.basis, basis);
    assert.equal(result.status, 'must-decompose');
  }
  assert.equal(assessment(fixture({ hours: 0 })).status, 'story-ok');
  assert.equal(assessment(fixture({ hours: null })).estimate.basis, 'unset');
});
// Ignoring selected content or supplied-count laundering would miss independent signals.
for (const [tasks, groups, size, want] of [
  [1, 1, 'M', 'needs-decomposition-review'],
  [3, 1, 'M', 'needs-decomposition-review'],
  [4, 1, 'M', 'must-decompose'],
  [2, 2, 'M', 'needs-decomposition-review'],
  [1, 1, 'XL', 'needs-decomposition-review'],
  [2, 2, 'XL', 'must-decompose'],
]) {
  test(`runtime ${size}/23 ${tasks} tasks ${groups} groups derives ${want}`, () => {
    assert.equal(
      assessment(fixture({ hours: 23, size, content: plan(tasks, groups) })).status,
      want
    );
  });
}
test('selected child section excludes sibling tasks while exact bytes bind the digest', () => {
  const full = plan(4);
  const selected = selectDecompositionPlanSection({
    body: '## Plan Metadata\n- **Source-plan-section**: ### Task 1: Deliver part 1\n',
    planText: full,
    activePlanKey: 'Source-plan',
  });
  assert.equal(selected.ok, true);
  assert.equal(
    assessment(fixture({ hours: 23, content: selected.planText })).status,
    'needs-decomposition-review'
  );
  assert.equal(assessment(fixture({ hours: 23, content: full })).status, 'must-decompose');
  assert.notEqual(
    decompositionInputDigest(fixture({ content: selected.planText })),
    decompositionInputDigest(fixture({ content: `${selected.planText}\n` }))
  );
  assert.throws(
    () =>
      normalizeDecompositionInputs(
        fixture({ plan: { ...fixture({ content: full }).plan, digest: sha('other') } })
      ),
    /plan-content-digest/
  );
});
test('absent optional plan is allowed but declared unreadable or escaping plans are unavailable', () => {
  assert.equal(assessment().status, 'story-ok');
  for (const path of ['docs/missing.md', '../escape.md', '/absolute.md']) {
    const result = assessment(
      fixture({
        hours: 25,
        plan: {
          path,
          commit: null,
          section: null,
          digest: null,
          availability: 'unavailable',
          content: null,
        },
      })
    );
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.signals[0].level, 'must-split');
  }
  const escaping = fixture({ content: plan(1) });
  escaping.plan.path = '../escape.md';
  assert.equal(assessment(escaping).status, 'indeterminate');
});
test('semantic scope/verifier, policy, observations and plan identity changes bind current inputs', () => {
  const base = fixture();
  const digest = decompositionInputDigest(base);
  for (const update of [
    { scopeDigest: sha('changed scope') },
    { scopeDigest: sha('changed verifier bytes') },
    { policy: { ...base.policy, digest: sha('different-policy') } },
    { observations: [{ ...base.observations[0], revision: '2' }] },
    { content: plan(1) },
  ]) {
    assert.notEqual(decompositionInputDigest(fixture(update)), digest);
  }
  const reordered = Object.fromEntries(Object.entries(base).reverse());
  assert.equal(decompositionInputDigest(reordered), digest);
  assert.equal(
    assessment(fixture({ policy: { ...base.policy, digest: sha('different-policy') } })).status,
    'indeterminate'
  );
  assert.equal(decompositionInputDigest(normalizeDecompositionInputs(base)), digest);
  assert.equal(
    assessment(base).inputDigest,
    assessDecomposition(base, { assessedAt: '2026-10-12T18:10:00.000Z' }).inputDigest
  );
  assert.throws(() => normalizeDecompositionInputs({ ...base, taskCount: 1 }), /input-keys/);
  assert.throws(
    () => normalizeDecompositionInputs({ ...base, timing: 100, checked: true }),
    /input-keys/
  );
});
test('missing configured project identity is unavailable, never an epic exemption', () => {
  const input = fixture({ kind: 'epic' });
  input.subject.projectItemId = null;
  assert.equal(assessment(input).status, 'indeterminate');
});
test('epic complexity requires readiness without story must-decompose', () => {
  const result = assessment(fixture({ kind: 'epic', size: 'XL', hours: 100, content: plan(4) }));
  assert.equal(result.status, 'epic-readiness-required');
  assert.equal(
    result.signals.some((signal) => signal.level === 'must-split'),
    true
  );
  assert.equal(
    result.signals.some((signal) => signal.code === 'estimate-hours'),
    false
  );
  assert.deepEqual(result.capabilities, BASE);
});
for (const [planning, completion, want] of [
  [false, false, BASE],
  [true, false, BASE],
  [true, true, [...BASE, 'scoped-deliverable', 'scoped-completion']],
]) {
  test(`converted epic planning=${planning} completion=${completion} separates both boundaries`, () => {
    const readiness = {
      availability: 'observed',
      planning,
      completion,
      digest: sha('graph'),
      children: [child(completion ? 'done' : 'ready-for-plan', completion ? 'completed' : null)],
    };
    const result = assessment(fixture({ kind: 'epic', readiness }));
    assert.equal(result.status, 'epic-readiness-required');
    assert.deepEqual(result.capabilities, want);
    assert.equal(result.capabilities.includes('scoped-implementation'), false);
    assert.equal(Object.hasOwn(result.plan, 'content'), false);
    assert.equal(JSON.stringify(result).includes('sourcePlanCommit'), false);
    assert.equal(validateDecompositionAssessment(result), result);
  });
}
test('unavailable epic readiness fences scoped completion', () => {
  const result = assessment(
    fixture({
      kind: 'epic',
      readiness: {
        availability: 'unavailable',
        planning: null,
        completion: null,
        digest: null,
        children: [],
      },
    })
  );
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.capabilities.includes('scoped-completion'), false);
});
test('pending publication precedes complete, incomplete and ready epic current values', () => {
  for (const input of [
    fixture(),
    fixture({ availability: { status: 'incomplete', reasons: ['forecast-unavailable'] } }),
    fixture({
      kind: 'epic',
      readiness: {
        availability: 'observed',
        planning: true,
        completion: true,
        digest: sha('graph'),
        children: [child('done', 'completed')],
      },
    }),
  ]) {
    const result = assessment(input, publication());
    assert.equal(result.status, 'pending');
    assert.deepEqual(result.capabilities, [...BASE, 'publication-reconcile']);
  }
  assert.deepEqual(deriveDecompositionCapabilities(assessment(), publication()), [
    ...BASE,
    'publication-reconcile',
  ]);
  const complete = publication({ status: 'complete' });
  complete.effects[0].status = 'confirmed';
  complete.effects[0].observedDigest = complete.effects[0].intendedDigest;
  assert.deepEqual(deriveDecompositionCapabilities(assessment(), complete), SCOPED);
});
test('strict input validators reject malformed, duplicate and oversized authority', () => {
  const mutations = [
    (v) => {
      v.subject.issue = 0;
    },
    (v) => {
      v.subject.extra = true;
    },
    (v) => {
      v.estimate.hours = -1;
    },
    (v) => {
      v.estimate.hours = Infinity;
    },
    (v) => {
      v.estimate.proposalId = OP;
    },
    (v) => {
      v.estimate.basis = 'proposed';
    },
    (v) => {
      v.size = 'XXL';
    },
    (v) => {
      v.scopeDigest = 'bad';
    },
    (v) => {
      v.plan.counts = 1;
    },
    (v) => {
      v.plan.availability = 'absent';
      v.plan.path = 'docs/declared.md';
    },
    (v) => {
      v.observations.push(v.observations[0]);
    },
    (v) => {
      v.observations = Array.from({ length: 33 }, (_, n) => ({
        ...v.observations[0],
        identity: `item-${n}`,
      }));
    },
    (v) => {
      v.observations[0].body = 'raw body';
    },
    (v) => {
      v.availability.reasons = ['invented-reason'];
    },
    (v) => {
      v.epicReadiness.planning = true;
    },
  ];
  for (const mutate of mutations) {
    const v = fixture();
    mutate(v);
    assert.throws(() => assessment(v), /decomposition/);
  }
  const epic = fixture({ kind: 'epic' });
  epic.epicReadiness.children.push(child());
  assert.throws(() => assessment(epic), /readiness/);
  const forged = fixture({ kind: 'epic' });
  forged.epicReadiness.planning = true;
  forged.epicReadiness.completion = true;
  assert.throws(() => assessment(forged), /readiness/);
});
test('assessment validation refuses forged permissions, missing signals and contradictory readiness', () => {
  const mutations = [
    (v) => {
      v.capabilities.push('close');
    },
    (v) => {
      v.capabilities = SCOPED;
    },
    (v) => {
      v.status = 'story-ok';
    },
    (v) => {
      v.signals = [];
    },
    (v) => {
      v.extra = true;
    },
    (v) => {
      v.plan.content = 'raw';
    },
    (v) => {
      v.assessedAt = '2026-02-30T18:10:00.000Z';
    },
    (v) => {
      v.signals[0].threshold = 25;
    },
  ];
  for (const mutate of mutations) {
    const v = assessment(fixture({ hours: 24 }));
    mutate(v);
    assert.throws(() => validateDecompositionAssessment(v), /decomposition/);
  }
  const epic = assessment(fixture({ kind: 'epic' }));
  epic.blockers = [];
  epic.capabilities = [...BASE, 'parent-orchestration', 'scoped-deliverable', 'scoped-completion'];
  assert.throws(() => validateDecompositionAssessment(epic), /readiness/);
});
test('publication records enforce registered writers, sealed effects and reconciled supersession', () => {
  assert.equal(validateDecompositionPublication(publication()).status, 'pending');
  for (const mutate of [
    (v) => {
      v.writerId = 'shell';
    },
    (v) => {
      v.operationId = 'not-uuid';
    },
    (v) => {
      v.proposal.allow = true;
    },
    (v) => {
      v.effects[0].callback = 'shell';
    },
    (v) => {
      v.effects.push(v.effects[0]);
    },
    (v) => {
      v.effects = Array.from({ length: 33 }, (_, n) => ({ ...v.effects[0], id: `effect-${n}` }));
    },
    (v) => {
      v.status = 'complete';
    },
    (v) => {
      v.effects[0].status = 'confirmed';
    },
    (v) => {
      v.updatedAt = '2025-10-11T18:10:00.000Z';
    },
    (v) => {
      v.supersedes = { operationId: OP, effects: v.effects };
    },
  ]) {
    const v = publication();
    mutate(v);
    assert.throws(() => validateDecompositionPublication(v), /decomposition/);
  }
  const prior = publication().effects;
  prior[0].status = 'failed';
  prior[0].observedDigest = sha('actual');
  assert.equal(
    validateDecompositionPublication(
      publication({
        supersedes: { operationId: 'c41d3bf2-e26e-477e-88d1-b2db32793002', effects: prior },
      })
    ).status,
    'pending'
  );
});
test('pure codec round-trips compact records and preserves unrelated body evidence', () => {
  const original = '## User Story\n\nRetained story.\n\n## Scope\n\nRetained scope.\n';
  assert.deepEqual(readDecompositionRecords(original), { assessment: null, publication: null });
  const records = {
    assessment: assessment(fixture({ content: plan(1) })),
    publication: publication(),
  };
  const body = replaceDecompositionRecords(original, records);
  assert.deepEqual(readDecompositionRecords(body), records);
  assert.equal(body.startsWith(original.trimEnd()), true);
  assert.equal(body.match(/^## Decomposition Assessment$/gm).length, 1);
  assert.equal(body.match(/aitm-decomposition-assessment /g).length, 1);
  assert.equal(body.includes('### Task 1: Deliver part 1\nRun'), false);
  assert.equal(replaceDecompositionRecords(body, records), body);
  const cleared = replaceDecompositionRecords(body, { assessment: null, publication: null });
  assert.deepEqual(readDecompositionRecords(cleared), { assessment: null, publication: null });
});
test('codec rejects duplicate records/attributes, unsupported schemas and mixed subjects', () => {
  const a = assessment();
  const raw = marker('assessment', a);
  for (const body of [
    bodyWith(`${raw}\n${raw}`),
    bodyWith(marker('assessment', a, ' schema="1"')),
    bodyWith(raw.replace('schema="1"', 'schema="2"')),
    bodyWith(
      `${raw}\n${marker('publication', publication({ subject: { ...SUBJECT, issue: 1908 } }))}`
    ),
    `${raw}\n## AITM Progress Markers`,
    `## Decomposition Assessment\n## Decomposition Assessment\n## AITM Progress Markers\n${raw}`,
    bodyWith(marker('assessment', { ...a, extra: true })),
    bodyWith(raw.replace('payload="', 'extra="x" payload="')),
  ]) {
    assert.throws(() => readDecompositionRecords(body), /decomposition/);
  }
});
test('codec rejects oversized, noncanonical, invalid UTF-8 and malformed payloads before use', () => {
  const record = assessment();
  const payloads = [
    '@',
    'e30=',
    Buffer.from([0xc3, 0x28]).toString('base64url'),
    Buffer.from(' ').toString('base64url'),
    Buffer.from('x'.repeat(8193)).toString('base64url'),
    Buffer.from('{"schema":1,"schema":2}').toString('base64url'),
  ];
  for (const payload of payloads)
    assert.throws(
      () =>
        readDecompositionRecords(
          bodyWith(`<!-- aitm-decomposition-assessment schema="1" payload="${payload}" -->`)
        ),
      /decomposition/
    );
  assert.throws(
    () =>
      readDecompositionRecords(
        bodyWith('<!-- aitm-decomposition-assessment schema="1" payload="unterminated')
      ),
    /decomposition/
  );
  const big = assessment();
  big.plan.path = `docs/${'x'.repeat(9000)}.md`;
  assert.throws(
    () => replaceDecompositionRecords('', { assessment: big, publication: null }),
    /decomposition/
  );
  assert.throws(
    () => replaceDecompositionRecords('x'.repeat(65536), { assessment: record, publication: null }),
    /body-limit/
  );
});

test('record signals reject numeric coercion', () => {
  for (const value of ['4', 4.5, Number.MAX_SAFE_INTEGER + 1]) {
    const result = assessment(fixture({ content: plan(4, 1) }));
    result.signals.find((signal) => signal.code === 'task-count').value = value;
    assert.throws(() => validateDecompositionAssessment(result), /assessment-signal/);
  }
});
test('observation references reject raw command text', () => {
  for (const field of ['identity', 'revision']) {
    const input = fixture();
    input.observations[0][field] = 'node --test arbitrary.mjs';
    assert.throws(() => assessment(input), /observation/);
  }
});
test('codec rejects marker authority inside a fenced Markdown example', () => {
  assert.throws(
    () =>
      readDecompositionRecords(
        bodyWith(`\`\`\`markdown\n${marker('assessment', assessment())}\n\`\`\``)
      ),
    /marker-placement/
  );
});
test('valid but oversized compact record is refused on decode and before replacement', () => {
  const large = assessment();
  large.observations = Array.from({ length: 32 }, (_, i) => ({
    resource: 'project',
    identity: `${i}-${'x'.repeat(230)}`,
    revision: '1',
    digest: sha(`obs-${i}`),
  }));
  assert.equal(validateDecompositionAssessment(large), large);
  assert.throws(
    () => readDecompositionRecords(bodyWith(marker('assessment', large))),
    /record-limit/
  );
  assert.throws(
    () => replaceDecompositionRecords('', { assessment: large, publication: null }),
    /record-limit/
  );
});
test('unknown and failed transport outcomes remain pending; supersession requires reconciled outcomes', () => {
  for (const status of ['unknown', 'failed']) {
    const value = publication();
    value.effects[0].status = status;
    assert.equal(assessment(fixture(), value).status, 'pending');
    assert.equal(
      deriveDecompositionCapabilities(assessment(), value).includes('scoped-deliverable'),
      false
    );
  }
  const superseded = publication({ status: 'superseded' });
  superseded.effects[0].status = 'failed';
  superseded.effects[0].observedDigest = sha('observed-other-value');
  assert.deepEqual(deriveDecompositionCapabilities(assessment(), superseded), SCOPED);
});
test('codec replacement remains idempotent with a later section and preserves its exact bytes', () => {
  const records = { assessment: assessment(), publication: null };
  const input =
    '## Scope\n\nExact scope.\n\n## AITM Progress Markers\n\n<!-- aitm-other ts="kept" -->\n\n## Later Evidence\n\nExact retained evidence.\n';
  const once = replaceDecompositionRecords(input, records);
  assert.equal(once.endsWith('## Later Evidence\n\nExact retained evidence.\n'), true);
  assert.equal(replaceDecompositionRecords(once, records), once);
});

test('assessment options accept only publication and timestamp, never caller admission', () => {
  assert.throws(() => assessDecomposition(fixture(), { allow: true }), /assessment-options/);
  assert.throws(
    () => assessDecomposition(fixture(), { publication: null, capabilities: SCOPED }),
    /assessment-options/
  );
});

test('planning-ready epic reads the validated boundary without inventing a capability', () => {
  const input = fixture({
    kind: 'epic',
    readiness: {
      availability: 'observed',
      planning: true,
      completion: false,
      digest: sha('graph'),
      children: [child()],
    },
  });
  assert.equal(normalizeDecompositionInputs(input).epicReadiness.planning, true);
  assert.deepEqual(assessment(input).capabilities, BASE);
});
test('pending observation cannot survive removal of its blocker and admit scoped effects', () => {
  const value = assessment(fixture(), publication());
  value.blockers = [];
  value.status = 'story-ok';
  value.capabilities = SCOPED;
  assert.throws(() => validateDecompositionAssessment(value), /publication-observation/);
  assert.throws(() => deriveDecompositionCapabilities(value), /publication-observation/);
  const contradictory = assessment(fixture(), publication());
  contradictory.observations.push({
    resource: 'publication',
    identity: 'c41d3bf2-e26e-477e-88d1-b2db32793002',
    revision: 'complete',
    digest: sha('complete'),
  });
  assert.throws(() => validateDecompositionAssessment(contradictory), /publication-observation/);
});
test('verification groups cannot hide a required task-count signal or outnumber observed tasks', () => {
  const omitted = assessment(fixture({ hours: 23, content: plan(4) }));
  omitted.signals = omitted.signals.filter((signal) => signal.code !== 'task-count');
  omitted.status = 'needs-decomposition-review';
  omitted.capabilities = SCOPED;
  assert.throws(() => validateDecompositionAssessment(omitted), /assessment-signals/);
  const impossible = assessment(fixture({ hours: 23, content: plan(4) }));
  const taskSignal = impossible.signals.find((signal) => signal.code === 'task-count');
  taskSignal.value = 3;
  taskSignal.threshold = 3;
  taskSignal.level = 'review';
  impossible.status = 'needs-decomposition-review';
  impossible.capabilities = SCOPED;
  assert.throws(() => validateDecompositionAssessment(impossible), /assessment-signals/);
});
test('visible record rendering shows shared thresholds and permitted actions with pending precedence', () => {
  const visible = (value) => value.split('## AITM Progress Markers')[0];
  const ready = visible(
    replaceDecompositionRecords('', { assessment: assessment(), publication: null })
  );
  assert.match(ready, /Thresholds:.*16h.*24h/);
  assert.match(ready, /Allowed actions:.*scoped-implementation.*scoped-completion/);
  const pending = visible(
    replaceDecompositionRecords('', { assessment: assessment(), publication: publication() })
  );
  assert.match(pending, /Status: pending/);
  assert.match(pending, /Allowed actions:.*publication-reconcile/);
  assert.doesNotMatch(
    pending,
    /Status: story-ok|scoped-implementation|scoped-deliverable|scoped-completion/
  );
});

// Writer matrix is loaded here so the issue's canonical guard verifier executes it.
import { registerEstimatePublicationCases } from './decomposition-publication.cases.mjs';
registerEstimatePublicationCases();
import { registerAdaptivePublicationCases } from './decomposition-adaptive-publication.cases.mjs';
registerAdaptivePublicationCases();

import { registerProposalPublicationCases } from './decomposition-proposal-publication.cases.mjs';
registerProposalPublicationCases();

import {
  registerShelvePublicationCases,
  registerShelveLandedCases,
} from './decomposition-shelve-publication.cases.mjs';
registerShelvePublicationCases();

registerShelveLandedCases();

import { registerMigrationPublicationCases } from './decomposition-migration-publication.cases.mjs';
registerMigrationPublicationCases();

// @story #1992
import { registerDecompositionPreservationCases } from './decomposition-preservation.cases.mjs';
registerDecompositionPreservationCases();

// @story #1992
import { registerDecompositionCensusCases } from './decomposition-census.cases.mjs';
registerDecompositionCensusCases();
