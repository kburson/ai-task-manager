// @story #1661

import assert from 'node:assert/strict';
import { test } from 'node:test';

import '../../../helpers/action-decision-contract-adversarial-cases.mjs';

import {
  actionDescriptorFor,
  listLifecycleActions,
} from '../../../../task-tracker/lib/lifecycle-policy/actions.mjs';
import {
  ACTION_DECISION_SCHEMA,
  ACTION_DECISION_SCHEMA_V1,
  ACTION_VOCABULARY_VERSION,
  AUTHORITY_RESOURCE_IDS,
  BOUNDARY_PRODUCER_IDS,
  CODE_DEFINITIONS,
  actionNavigationRefusal,
  normalizeRefusal,
  validateBlocker,
  validateActionDecision,
  vocabularyDigest,
} from '../../../../task-tracker/lib/action-decision/contract.mjs';
import {
  listRemediations,
  validateRemediation,
} from '../../../../task-tracker/lib/action-decision/remediations.mjs';
import {
  actionDecisionSnapshot,
  legacyRefusalInventory,
} from '../../../helpers/action-decision-fixtures.mjs';
import { GUARDS, registerGuard, runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import { blockedByGuard } from '../../../../task-tracker/lib/blocked-by-guard.mjs';
import {
  lintRefusalInventory,
  scanRefusalSites,
} from '../../../../maintenance/lint-action-refusals.mjs';

const EXPECTED_ACTIONS = [
  'bind',
  'resume',
  'promote',
  'test',
  'review',
  'deliver',
  'close',
  'refine',
  'demote',
  'shelve',
  'park',
  'cancel-plan',
];

function readyDecision(overrides = {}) {
  const decision = {
    schema: ACTION_DECISION_SCHEMA,
    issue: 1661,
    actionId: 'promote',
    status: 'ready',
    blockers: [],
    normalizations: [],
    warnings: [],
    humanDecision: null,
    guidanceIds: ['action.promote'],
    ...overrides,
  };
  decision.snapshot ??= actionDecisionSnapshot({}, decision.normalizations);
  return decision;
}

test('the lifecycle registry enumerates the complete bare action vocabulary', () => {
  assert.deepEqual(
    listLifecycleActions().map(({ id }) => id),
    EXPECTED_ACTIONS
  );
  assert.equal(
    listLifecycleActions().some(({ id }) => id.startsWith('workflow.')),
    false
  );
  assert.deepEqual(
    listLifecycleActions()
      .filter(({ explainReady }) => explainReady)
      .map(({ id }) => id),
    EXPECTED_ACTIONS.slice(0, 7)
  );
  assert.equal(actionDescriptorFor('refine').evaluator, null);
  assert.equal(actionDescriptorFor('refine').executor, 'refine');
  assert.equal(actionDescriptorFor('not-registered'), null);
});

test('the remediation registry is closed and rejects bypasses', () => {
  assert.ok(listRemediations().some(({ id }) => id === 'record-plan-approval'));
  assert.throws(() => validateRemediation({ id: 'bypass-guard', args: {} }), /unknown remediation/);
  assert.deepEqual(validateRemediation({ id: 'record-plan-approval', args: { issue: 1661 } }), {
    id: 'record-plan-approval',
    args: { issue: 1661 },
  });
  assert.throws(
    () => validateRemediation({ id: 'record-plan-approval', args: { issue: 0 } }),
    /args/
  );
});

test('the decision vocabulary exposes its version and reserved boundary producers', () => {
  assert.equal(ACTION_DECISION_SCHEMA, 'aitm.action-decision/v2');
  assert.equal(ACTION_DECISION_SCHEMA_V1, 'aitm.action-decision/v1');
  assert.equal(ACTION_VOCABULARY_VERSION, 'aitm.action-vocabulary/v2');
  assert.deepEqual(BOUNDARY_PRODUCER_IDS, [
    'authority-collection',
    'action-navigation',
    'action-result-validation',
  ]);
  assert.equal(CODE_DEFINITIONS['unclassified-refusal'].domain, 'decision-blocker');
  assert.equal(CODE_DEFINITIONS['guidance-source-diverged'].domain, 'operational-warning');
  assert.equal(CODE_DEFINITIONS['guidance-annotation-failed'].domain, 'audit-warning');
  assert.match(vocabularyDigest(), /^sha256:[a-f0-9]{64}$/);
});

test('authority resources include honest local session sources while remaining closed', () => {
  assert.deepEqual(AUTHORITY_RESOURCE_IDS, [
    'issue-body',
    'issue-comment',
    'project-board',
    'delivery',
    'timing-log',
    'workflow-policy',
    'local-config',
    'session-state',
    'worktree',
    'github-user',
    'occupancy',
    'migration-journal',
  ]);
});

test('observed session and worktree mismatches are valid closed v2 blockers', () => {
  for (const code of [
    'session-bind-mismatch',
    'worktree-mismatch',
    'state-drift',
    'ownership-mismatch',
    'occupancy-conflict',
  ]) {
    const blocker = {
      guardId: 'authority-collection',
      code,
      args: {},
      noAutomaticRemediation: { reason: 'state-investigation-required' },
    };
    assert.deepEqual(validateBlocker(blocker, { status: 'blocked' }), blocker);
  }
});

test('an inventoried legacy refusal normalizes without interpreting its reason', () => {
  const legacyInventory = legacyRefusalInventory();
  assert.deepEqual(
    normalizeRefusal(
      { reason: 'run arbitrary shell text' },
      { guardId: 'fixture-legacy-guard', legacyInventory }
    ),
    {
      guardId: 'fixture-legacy-guard',
      code: 'unclassified-refusal',
      args: {},
      noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
    }
  );
  assert.throws(
    () =>
      normalizeRefusal(
        { reason: 'the same arbitrary shell text' },
        { guardId: 'unfrozen-guard', legacyInventory }
      ),
    /not fully inventoried/
  );
  assert.deepEqual(
    normalizeRefusal(
      { reason: 'legacy diagnostic', code: 'story-approval-binding-missing' },
      { guardId: 'fixture-legacy-guard', legacyInventory }
    ),
    {
      guardId: 'fixture-legacy-guard',
      code: 'unclassified-refusal',
      args: {},
      noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
    }
  );
});

test('action navigation fails closed for non-ready and unknown actions', () => {
  assert.equal(actionNavigationRefusal('promote'), null);
  assert.deepEqual(actionNavigationRefusal('refine'), {
    guardId: 'action-navigation',
    code: 'action-not-explain-ready',
    args: {},
    noAutomaticRemediation: { reason: 'action-not-explain-ready' },
  });
  assert.deepEqual(actionNavigationRefusal('not-registered'), {
    guardId: 'action-navigation',
    code: 'unknown-vocabulary',
    args: {},
    noAutomaticRemediation: { reason: 'result-investigation-required' },
  });
});

test('unknown action ids remain explicit in an indeterminate decision envelope', () => {
  const unknown = readyDecision({
    actionId: 'rebind',
    status: 'indeterminate',
    blockers: [actionNavigationRefusal('rebind')],
    guidanceIds: ['navigation.unknown'],
  });

  assert.deepEqual(validateActionDecision(unknown), unknown);
  assert.throws(() => validateActionDecision({ ...unknown, blockers: [] }), /blockers/);
  assert.throws(
    () => validateActionDecision({ ...unknown, actionId: 'promote' }),
    /unknown-vocabulary/
  );
});

test('typed remediation failures never fall back to the legacy adapter', () => {
  assert.throws(
    () =>
      normalizeRefusal(
        {
          code: 'plan-approval-missing',
          args: {},
          remediation: { id: 'bypass-guard', args: {} },
        },
        {
          guardId: 'fixture-legacy-guard',
          legacyInventory: legacyRefusalInventory(),
        }
      ),
    /unknown remediation bypass-guard/
  );
});

test('manual-only blocker codes reject executable remediations', () => {
  assert.throws(
    () =>
      normalizeRefusal(
        {
          code: 'unclassified-refusal',
          args: {},
          remediation: { id: 'record-plan-approval', args: { issue: 1661 } },
        },
        {
          guardId: 'fixture-legacy-guard',
          legacyInventory: legacyRefusalInventory(),
        }
      ),
    /manual-disposition-required/
  );
});

test('the vocabulary digest changes when a canonical definition changes', () => {
  const changed = structuredClone(CODE_DEFINITIONS);
  changed['migration-freeze'].severity = 'warning';
  assert.notEqual(vocabularyDigest({ codeDefinitions: changed }), vocabularyDigest());
});

test('ready decisions require explicit empty operational collections', () => {
  const decision = readyDecision();

  assert.deepEqual(validateActionDecision(decision), decision);
  assert.throws(() => validateActionDecision({ ...decision, blockers: undefined }), /blockers/);
  assert.throws(() => validateActionDecision({ ...decision, status: 'blocked' }), /blockers/);
});

test('blocked decisions bind typed remediation to the matching human request', () => {
  const blocker = {
    guardId: 'plan-exit-plan-approved',
    code: 'plan-approval-missing',
    args: {},
    remediation: { id: 'record-plan-approval', args: { issue: 1661 } },
  };
  const decision = readyDecision({
    status: 'blocked',
    blockers: [blocker],
    humanDecision: {
      requests: [
        {
          kind: 'plan-approval',
          actor: 'configured-approver',
          subject: { issue: 1661, actionId: 'promote' },
          args: {},
        },
      ],
    },
  });

  assert.deepEqual(validateActionDecision(decision), decision);
  const crossIssueDecision = {
    ...decision,
    blockers: [
      {
        ...blocker,
        remediation: { id: 'record-plan-approval', args: { issue: 1662 } },
      },
    ],
    humanDecision: {
      requests: [
        {
          kind: 'plan-approval',
          actor: 'configured-approver',
          subject: { issue: 1662, actionId: 'promote' },
          args: {},
        },
      ],
    },
  };
  assert.deepEqual(validateActionDecision(crossIssueDecision), crossIssueDecision);
  assert.throws(
    () => validateActionDecision({ ...decision, humanDecision: null }),
    /humanDecision/
  );
  assert.throws(
    () =>
      validateActionDecision({
        ...decision,
        blockers: [
          {
            ...blocker,
            noAutomaticRemediation: {
              reason: 'legacy-guard-requires-human-investigation',
            },
          },
        ],
      }),
    /disposition/
  );
  assert.throws(
    () =>
      validateActionDecision({
        ...decision,
        humanDecision: {
          requests: [
            {
              kind: 'plan-approval',
              actor: 'configured-approver',
              subject: { issue: 1662, actionId: 'promote' },
              args: {},
            },
          ],
        },
      }),
    /humanDecision/
  );
  assert.throws(
    () =>
      validateActionDecision({
        ...decision,
        blockers: [
          {
            ...blocker,
            remediation: { id: 'record-plan-approval', args: { issue: 1662 } },
          },
        ],
      }),
    /humanDecision|remediation/
  );
});

test('authority failures require typed unique subjects when one source has multiple targets', () => {
  const authorityFailure = (subject) => ({
    guardId: 'authority-collection',
    code: 'authority-read-failed',
    args: {
      source: 'issue-comment',
      reason: 'incomplete',
      ...(subject ? { subject } : {}),
    },
    noAutomaticRemediation: { reason: 'authority-investigation-required' },
  });
  const humanRequest = (issue) => ({
    kind: 'manual-investigation',
    actor: 'human-operator',
    subject: { issue, actionId: 'promote' },
    args: { guardId: 'authority-collection', code: 'authority-read-failed' },
  });
  const decision = readyDecision({
    status: 'indeterminate',
    blockers: [authorityFailure({ issue: 1661 }), authorityFailure({ issue: 1662 })],
    humanDecision: { requests: [humanRequest(1661), humanRequest(1662)] },
  });

  assert.deepEqual(validateActionDecision(decision), decision);
  assert.throws(
    () =>
      validateActionDecision({
        ...decision,
        blockers: [authorityFailure(), authorityFailure({ issue: 1662 })],
      }),
    /subject/
  );
  assert.throws(
    () =>
      validateActionDecision({
        ...decision,
        blockers: [authorityFailure({ issue: 1661 }), authorityFailure({ issue: 1661 })],
      }),
    /subject/
  );
  assert.throws(
    () => validateActionDecision({ ...decision, humanDecision: null }),
    /humanDecision/
  );
});

test('snapshot evidence is unique, in-window, issue-bound, and digest-bound', () => {
  const first = actionDecisionSnapshot().observations[0];
  const snapshot = actionDecisionSnapshot({
    observations: [
      first,
      {
        source: 'issue-comment',
        identity: 'evidence:1661:1',
        observedAt: '2026-09-20T15:00:00.750Z',
        digest: `sha256:${'d'.repeat(64)}`,
      },
    ],
  });
  assert.deepEqual(validateActionDecision(readyDecision({ snapshot })).snapshot, snapshot);

  const outsideWindow = structuredClone(snapshot);
  outsideWindow.observations[0].observedAt = '2026-09-20T14:59:59.999Z';
  assert.throws(
    () => validateActionDecision(readyDecision({ snapshot: outsideWindow })),
    /observation.*window/
  );
  const duplicate = structuredClone(snapshot);
  duplicate.observations[1].identity = duplicate.observations[0].identity;
  assert.throws(
    () => validateActionDecision(readyDecision({ snapshot: duplicate })),
    /observation.*duplicate/
  );
  const otherIssue = structuredClone(snapshot);
  otherIssue.observations[1].identity = 'evidence:1662:1';
  assert.throws(
    () => validateActionDecision(readyDecision({ snapshot: otherIssue })),
    /observation.*issue/
  );
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({ snapshot: { ...snapshot, digest: `sha256:${'e'.repeat(64)}` } })
      ),
    /snapshot\.digest/
  );
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({ snapshot: actionDecisionSnapshot({ state: 'banana' }) })
      ),
    /snapshot\.state/
  );

  const unresolved = readyDecision({
    actionId: null,
    status: 'indeterminate',
    snapshot: actionDecisionSnapshot({ state: 'banana' }),
    blockers: [
      {
        guardId: 'action-navigation',
        code: 'state-unavailable',
        args: { reason: 'unknown' },
        noAutomaticRemediation: { reason: 'state-investigation-required' },
      },
    ],
    humanDecision: {
      requests: [
        {
          kind: 'manual-investigation',
          actor: 'human-operator',
          subject: { issue: 1661, actionId: null },
          args: { guardId: 'action-navigation', code: 'state-unavailable' },
        },
      ],
    },
    guidanceIds: ['navigation.unresolved'],
  });
  assert.deepEqual(validateActionDecision(unresolved), unresolved);
});

test('terminal decisions use null action and terminal guidance without inventing execution', () => {
  const terminal = readyDecision({
    actionId: null,
    snapshot: actionDecisionSnapshot({ state: 'done' }),
    guidanceIds: ['state.done'],
  });

  assert.deepEqual(validateActionDecision(terminal), terminal);
  assert.throws(() => validateActionDecision({ ...terminal, actionId: 'close' }), /terminal/);
  assert.throws(
    () => validateActionDecision({ ...terminal, guidanceIds: ['action.close'] }),
    /guidanceIds/
  );
  assert.throws(
    () => validateActionDecision(readyDecision({ guidanceIds: ['transition.plan-to-develop'] })),
    /guidanceIds/
  );
});

test('functional DoD normalizations enforce their closed ordered decision contract', () => {
  const normalization = {
    normalizerId: 'functional-dod-derived/v1',
    inputDigest: `sha256:${'1'.repeat(64)}`,
    decisions: [
      { derivationRule: 'derive-acs/v1', key: 'acs', stamp: true, tick: false },
      {
        derivationRule: 'derive-checkboxes/v1',
        key: 'checkboxes',
        stamp: true,
        tick: true,
      },
    ],
    decisionDigest: 'sha256:fffeb532cd18f6981e9e45fc02782059500197630433339c7ccbf7b5c0c583be',
    disposition: 'persist-on-execute',
  };

  assert.deepEqual(
    validateActionDecision(readyDecision({ normalizations: [normalization] })).normalizations,
    [normalization]
  );
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({
          normalizations: [
            {
              ...normalization,
              decisions: [...normalization.decisions].reverse(),
            },
          ],
        })
      ),
    /normalizations/
  );
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({
          normalizations: [{ ...normalization, decisionDigest: `sha256:${'2'.repeat(64)}` }],
        })
      ),
    /decisionDigest/
  );
});

test('operational warnings preserve order and reject cross-domain code reuse', () => {
  const warnings = [
    {
      code: 'guidance-source-diverged',
      args: {
        source: '.ai-task-manager/aitm-guidance.yml',
        digest: `sha256:${'d'.repeat(64)}`,
      },
    },
    { code: 'legacy-guard-warning', args: { guardId: 'blocked-by-not-done' } },
    { code: 'legacy-guard-warning', args: { guardId: 'blocked-by-not-done' } },
  ];
  const decision = readyDecision({ warnings });

  assert.deepEqual(validateActionDecision(decision).warnings, warnings);
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({ warnings: [{ code: 'guidance-annotation-failed', args: {} }] })
      ),
    /warnings\[0\]\.code:domain/
  );
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({ warnings: [{ code: 'guidance-catalog-invalid', args: {} }] })
      ),
    /warnings\[0\]\.code:domain/
  );
  assert.throws(
    () => validateActionDecision(readyDecision({ warnings: [...warnings].reverse() })),
    /warning-order/
  );
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({
          warnings: [
            {
              code: 'legacy-guard-warning',
              args: { guardId: 'not-a-registered-guard' },
            },
          ],
        })
      ),
    /producer/
  );
});

test('decision blockers reject producers outside the frozen guard inventory', () => {
  assert.throws(
    () =>
      validateActionDecision(
        readyDecision({
          status: 'blocked',
          blockers: [
            {
              guardId: 'not-a-registered-guard',
              code: 'migration-freeze',
              args: {},
              noAutomaticRemediation: { reason: 'result-investigation-required' },
            },
          ],
        })
      ),
    /producer/
  );
});

function registerFixtureGuard(guard) {
  registerGuard('done', 'entry', guard);
  return () => {
    const index = GUARDS.done.entry.findIndex(({ id }) => id === guard.id);
    if (index !== -1) GUARDS.done.entry.splice(index, 1);
  };
}

test('the guard boundary preserves multiple typed refusals and human requests', async (t) => {
  const guardId = 'fixture-typed-multi-refusal';
  const cleanup = registerFixtureGuard({
    id: guardId,
    run: () => ({
      ok: false,
      reason: 'diagnostic only',
      refusals: [
        {
          code: 'migration-freeze',
          args: {},
          noAutomaticRemediation: { reason: 'result-investigation-required' },
        },
        {
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      warnings: [{ code: 'legacy-guard-warning', args: { guardId } }],
      requests: [
        {
          kind: 'manual-investigation',
          actor: 'human-operator',
          subject: { issue: 1661, actionId: 'promote' },
          args: { guardId, code: 'migration-freeze' },
        },
      ],
    }),
  });
  t.after(cleanup);

  const result = await runGuards('backlog', 'done', { issueNumber: 1661 });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.refusals.map(({ guardId: producer, code }) => [producer, code]),
    [
      [guardId, 'migration-freeze'],
      [guardId, 'unclassified-refusal'],
    ]
  );
  assert.deepEqual(result.warns, [
    { id: guardId, code: 'legacy-guard-warning', args: { guardId } },
  ]);
  assert.deepEqual(result.humanDecision, {
    requests: [
      {
        kind: 'manual-investigation',
        actor: 'human-operator',
        subject: { issue: 1661, actionId: 'promote' },
        args: { guardId, code: 'migration-freeze' },
      },
    ],
  });
});

test('a frozen multi-branch legacy guard emits one conservative manual refusal', async (t) => {
  const cleanup = registerFixtureGuard(blockedByGuard);
  t.after(cleanup);

  const result = await runGuards('backlog', 'done', null);

  assert.equal(result.status, 'blocked');
  assert.equal(result.refusals.length, 1);
  assert.deepEqual(
    {
      guardId: result.refusals[0].guardId,
      code: result.refusals[0].code,
      args: result.refusals[0].args,
      noAutomaticRemediation: result.refusals[0].noAutomaticRemediation,
    },
    {
      guardId: 'blocked-by-not-done',
      code: 'unclassified-refusal',
      args: {},
      noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
    }
  );
});

for (const fixture of [
  {
    name: 'thrown guards become guard-error',
    guardId: 'fixture-thrown-guard',
    run: () => {
      throw new Error('untrusted boom');
    },
    code: 'guard-error',
  },
  {
    name: 'malformed guards become guard-result-invalid',
    guardId: 'fixture-malformed-guard',
    run: () => ({ nope: true }),
    code: 'guard-result-invalid',
  },
]) {
  test(fixture.name, async (t) => {
    const cleanup = registerFixtureGuard({ id: fixture.guardId, run: fixture.run });
    t.after(cleanup);

    const result = await runGuards('backlog', 'done', { issueNumber: 1661 });

    assert.equal(result.status, 'indeterminate');
    assert.equal(result.refusals[0].guardId, fixture.guardId);
    assert.equal(result.refusals[0].code, fixture.code);
    assert.deepEqual(result.refusals[0].args, {});
    assert.deepEqual(result.refusals[0].noAutomaticRemediation, {
      reason: 'result-investigation-required',
    });
    assert.match(result.refusals[0].reason, /guard/);
  });
}

test('the parser-based refusal lint freezes added and edited legacy sites', () => {
  const originalSource = [
    "export const fixtureGuard = { id: 'fixture-guard',",
    '  run() {',
    "    return { ok: false, reason: 'legacy reason' };",
    '  },',
    '};',
  ].join('\n');
  const original = scanRefusalSites({ file: 'fixture-guard.mjs', source: originalSource });
  const inventory = {
    version: 1,
    guards: {
      'fixture-guard': { complete: true, sites: original },
    },
  };

  assert.deepEqual(
    lintRefusalInventory({
      inventory,
      sources: [{ file: 'fixture-guard.mjs', source: originalSource }],
      registeredGuardIds: ['fixture-guard'],
    }),
    []
  );
  const edited = originalSource.replace('legacy reason', 'edited legacy reason');
  assert.match(
    lintRefusalInventory({
      inventory,
      sources: [{ file: 'fixture-guard.mjs', source: edited }],
      registeredGuardIds: ['fixture-guard'],
    }).join('\n'),
    /changed legacy site/
  );
  const added = originalSource.replace(
    "return { ok: false, reason: 'legacy reason' };",
    "if (Date.now()) return { ok: false, reason: 'added' };\n    return { ok: false, reason: 'legacy reason' };"
  );
  assert.match(
    lintRefusalInventory({
      inventory,
      sources: [{ file: 'fixture-guard.mjs', source: added }],
      registeredGuardIds: ['fixture-guard'],
    }).join('\n'),
    /new unclassified refusal/
  );
  const addedCodeOnly = originalSource.replace(
    "return { ok: false, reason: 'legacy reason' };",
    "return { ok: false, code: 'diagnostic-only', reason: 'legacy reason' };"
  );
  assert.match(
    lintRefusalInventory({
      inventory,
      sources: [{ file: 'fixture-guard.mjs', source: addedCodeOnly }],
      registeredGuardIds: ['fixture-guard'],
    }).join('\n'),
    /changed legacy site/
  );
});

test('the refusal lint rejects undeclared and cross-domain codes', () => {
  const undeclared = [
    "export const fixtureGuard = { id: 'fixture-guard',",
    "  run() { return { ok: false, code: 'made-up-code', args: {},",
    "    noAutomaticRemediation: { reason: 'result-investigation-required' } }; },",
    '};',
  ].join('\n');
  const auditAsDecision = undeclared.replace('made-up-code', 'guidance-annotation-failed');
  const admissionWarningFromGuard = [
    "export const fixtureGuard = { id: 'fixture-guard',",
    '  run() { return { ok: true, warnings: [{',
    "    code: 'guidance-source-diverged', args: {",
    "      source: '.ai-task-manager/aitm-guidance.yml',",
    `      digest: 'sha256:${'d'.repeat(64)}'`,
    '    }',
    '  }] }; },',
    '};',
  ].join('\n');
  const base = {
    inventory: { version: 1, guards: { 'fixture-guard': { complete: true, sites: [] } } },
    registeredGuardIds: ['fixture-guard'],
  };

  assert.match(
    lintRefusalInventory({
      ...base,
      sources: [{ file: 'fixture-guard.mjs', source: undeclared }],
    }).join('\n'),
    /undeclared code made-up-code/
  );
  assert.match(
    lintRefusalInventory({
      ...base,
      sources: [{ file: 'fixture-guard.mjs', source: auditAsDecision }],
    }).join('\n'),
    /illegal decision code guidance-annotation-failed/
  );
  assert.match(
    lintRefusalInventory({
      ...base,
      sources: [{ file: 'fixture-guard.mjs', source: admissionWarningFromGuard }],
    }).join('\n'),
    /illegal producer guidance-source-diverged/
  );
});
