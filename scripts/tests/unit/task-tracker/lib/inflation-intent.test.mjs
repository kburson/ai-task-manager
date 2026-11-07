// @story #2163 — exact source prediction and identity never replace observed authority.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rmSync } from 'node:fs';
import {
  correlateInflationComment,
  deriveInflationIntendedInput,
} from '../../../../task-tracker/lib/inflation-intent.mjs';
import {
  collectDecompositionAuthority,
  collectDecompositionCommentProposals,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import {
  intendedPublishedRevisionInput,
  executeEstimateWriter,
} from '../../../../task-tracker/lib/estimate-writer-publication.mjs';
import { publishEstimateRevision } from '../../../../task-tracker/lib/decomposition-publication.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { buildInflationSection } from '../../../../task-tracker/verbs/inflate-estimate.mjs';
import {
  fixture,
  hash,
  subject,
  freshUnitDir,
  observed,
} from './decomposition-authority-fixtures.mjs';

const beforeBody = `<!-- aitm-refined-estimate: ${subject.issue} -->\n### Planned Estimate\n\n| Field | Refine | Planned |\n|---|---|---|\n| Size | S | S |\n| Estimate (h) | 2 | 2 |\n`;
const restComment = {
  id: 101,
  node_id: 'IC_opaque',
  issue_url: `https://api.github.com/repos/${subject.repository}/issues/${subject.issue}`,
  body: beforeBody,
};
const node = (id = 'IC_opaque', databaseId = 101) => ({
  id,
  databaseId,
  body: beforeBody,
  issue: { number: subject.issue, repository: { nameWithOwner: subject.repository } },
});
const identity = {
  repository: subject.repository,
  issue: subject.issue,
  restId: 101,
  graphqlId: 'IC_opaque',
};
const proposal = { estimate: { basis: 'published', hours: 6, proposalId: null }, size: 'M' };
const operation = '77d98283-2bb6-4750-ae81-94bcd6305e08';
const intendedBody =
  beforeBody +
  buildInflationSection({
    reason: 'Discovered work.',
    items: ['Integration (~4h)'],
    beforeSize: 'S',
    beforeEstimate: 2,
    newSize: 'M',
    newEstimate: 6,
    date: '2026-11-05',
  }) +
  `\nPublication operation: ${operation}\n`;
async function initialInput({ contributes = true } = {}) {
  const f = fixture(2);
  f.body = f.body.replace('"size":"M"', '"size":"S"');
  f.values.project.size = 'S';
  const parsed = collectDecompositionCommentProposals({
    comments: [node(), node('IC_other', 102)],
    subject,
    body: f.body,
    published: null,
    board: { estimate: 2, size: 'S' },
    bodyFields: { estimate: 2, size: 'S' },
  });
  assert.equal(parsed.available, true);
  f.values.forecast = {
    estimate: null,
    size: null,
    recordId: null,
    payloadHash: null,
    proposals: contributes ? parsed.proposals : [],
    observedProjections: [
      { estimate: 2, size: 'S' },
      { estimate: 2, size: 'S' },
    ],
  };
  const initial = await collectDecompositionAuthority({
    subject,
    cfg: { repo: subject.repository, projectId: subject.projectId },
    deps: f.deps,
  });
  assert.equal(initial.input.availability.status, 'complete');
  return initial;
}

test('dual-domain comment correlation ignores equal-body aliases', () => {
  assert.deepEqual(
    correlateInflationComment({
      subject,
      restComment,
      graphqlComments: [node('IC_other', 102), node()],
    }),
    identity
  );
  for (const graphqlComments of [
    [],
    [node('wrong', 101)],
    [node('IC_opaque', 999)],
    [node(), node()],
    [node(), node('IC_other', 101)],
    [{ ...node(), body: beforeBody + ' ' }],
    [{ ...node(), issue: { number: 123, repository: { nameWithOwner: subject.repository } } }],
    [
      {
        ...node(),
        issue: { number: subject.issue, repository: { nameWithOwner: 'foreign/repo' } },
      },
    ],
  ])
    assert.throws(
      () => correlateInflationComment({ subject, restComment, graphqlComments }),
      /inflate-estimate:comment-identity/
    );
  for (const changed of [
    { id: '101' },
    { node_id: '' },
    { issue_url: 'https://api.github.com/repos/foreign/repo/issues/1987' },
    { body: null },
  ])
    assert.throws(
      () =>
        correlateInflationComment({
          subject,
          restComment: { ...restComment, ...changed },
          graphqlComments: [node()],
        }),
      /inflate-estimate:comment-identity/
    );
});

test('intended authority updates only the correlated full comment hash and ordinary projections', async () => {
  const initial = await initialInput(),
    copy = structuredClone(initial);
  const result = deriveInflationIntendedInput({
    initial,
    proposal,
    commentIdentity: identity,
    beforeBody,
    intendedBody,
  });
  const expected = structuredClone(initial);
  expected.sourceObservations.readForecast.value.proposals[0].sourceDigest = hash(intendedBody);
  assert.deepEqual(result, intendedPublishedRevisionInput(expected, proposal));
  assert.deepEqual(initial, copy);
  assert.equal(
    initial.sourceObservations.readForecast.value.proposals[1].sourceDigest,
    hash(beforeBody)
  );
});

test('noncontributing comments do not invent a proposal', async () => {
  const initial = await initialInput({ contributes: false });
  assert.deepEqual(
    deriveInflationIntendedInput({
      initial,
      proposal,
      commentIdentity: identity,
      beforeBody,
      intendedBody,
    }),
    intendedPublishedRevisionInput(initial, proposal)
  );
});

test('changed semantics, duplicate headings, operation injection and stale source hashes refuse', async () => {
  const initial = await initialInput();
  for (const changed of [
    intendedBody.replace('| 2 | 2 |', '| 2 | 8 |'),
    intendedBody + '\n### Planned Estimate\n',
    intendedBody + `Publication operation: ${operation}\n`,
    intendedBody.replace('Discovered work.', 'Publication operation: injected'),
    intendedBody.replace(beforeBody, beforeBody.slice(1)),
  ])
    assert.throws(
      () =>
        deriveInflationIntendedInput({
          initial,
          proposal,
          commentIdentity: identity,
          beforeBody,
          intendedBody: changed,
        }),
      /inflate-estimate:/
    );
  const stale = structuredClone(initial);
  stale.sourceObservations.readForecast.value.proposals[0].sourceDigest = hash('different');
  assert.throws(
    () =>
      deriveInflationIntendedInput({
        initial: stale,
        proposal,
        commentIdentity: identity,
        beforeBody,
        intendedBody,
      }),
    /inflate-estimate:/
  );
});

function writerHarness(t) {
  const f = fixture(2),
    dir = freshUnitDir('inflation-clock-');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  f.values.forecast = {
    estimate: null,
    size: null,
    recordId: null,
    proposals: [],
    observedProjections: [],
  };
  const cfg = { repo: subject.repository, projectId: subject.projectId };
  return {
    f,
    cfg,
    dir,
    args: {
      cfg,
      issueNumber: subject.issue,
      writerId: 'inflate-estimate',
      key: { test: 'clock' },
      proposal: { estimate: { basis: 'published', hours: 2, proposalId: null }, size: 'M' },
      deps: {
        projectDir: dir,
        projectItemForIssue: async () => ({ itemId: subject.projectItemId }),
        decomposition: f.deps,
      },
    },
  };
}
test('writer passes one prepared effects array and context, and skips derivation on exact retry', async (t) => {
  const { f, args } = writerHarness(t);
  let value = 'before',
    prepared,
    calls = 0,
    derivations = 0;
  const effects = async (context) => {
    calls++;
    prepared = [
      {
        id: 'audit',
        resource: 'comment',
        targetIdentity: 'comment:101',
        value: context.createdAt,
        read: async () => observed(value),
        apply: async () => {
          value = context.createdAt;
        },
      },
    ];
    return prepared;
  };
  const deriveIntendedInput = (initial, context) => {
    derivations++;
    assert.ok(context, 'prepared context is required');
    assert.equal(context.effects, prepared);
    assert.equal(context.createdAt, prepared[0].value);
    assert.deepEqual(context.subject, subject);
    return initial.input;
  };
  assert.equal(
    (await executeEstimateWriter({ ...args, effects, deriveIntendedInput })).status,
    'recorded'
  );
  const publication = readDecompositionRecords(f.body).publication;
  assert.equal(publication.createdAt, value);
  assert.equal(calls, 1);
  assert.equal(derivations, 1);
  assert.equal(
    (
      await executeEstimateWriter({
        ...args,
        effects,
        deriveIntendedInput: () => {
          throw Error('must not derive sealed retry');
        },
      })
    ).status,
    'recorded'
  );
  assert.equal(calls, 2);
  assert.equal(derivations, 1);
});

test('one-argument derivation keeps preparation time across midnight and persisted retry', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-05T23:59:59.999Z') });
  const { f, args } = writerHarness(t);
  let value = 'before',
    interrupt = true,
    preparedBody;
  const effects = async ({ createdAt }) => {
    preparedBody = `Audit date ${createdAt.slice(0, 10)}`;
    t.mock.timers.tick(2);
    return [
      {
        id: 'audit',
        resource: 'comment',
        targetIdentity: 'comment:101',
        value: preparedBody,
        read: async () => observed(value),
        apply: async () => {
          value = preparedBody;
          if (interrupt) {
            interrupt = false;
            throw Error('lost audit response');
          }
        },
      },
    ];
  };
  const first = await executeEstimateWriter({
    ...args,
    effects,
    deriveIntendedInput: (initial) => initial.input,
  });
  assert.equal(first.status, 'partial', first.reason);
  const prior = readDecompositionRecords(f.body).publication;
  assert.equal(prior.createdAt, '2026-11-05T23:59:59.999Z');
  assert.equal(value, 'Audit date 2026-11-05');
  const second = await executeEstimateWriter({
    ...args,
    effects,
    deriveIntendedInput: () => {
      throw Error('sealed retry');
    },
  });
  assert.equal(second.status, 'recorded', second.reason);
  assert.equal(preparedBody, value);
  assert.equal(readDecompositionRecords(f.body).publication.createdAt, prior.createdAt);
});

test('invalid supplied publication timestamp refuses before any persistence', async (t) => {
  const { f, cfg, dir } = writerHarness(t),
    runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
  const initial = await runtime.collect(subject);
  const result = await publishEstimateRevision({
    subject,
    operationId: operation,
    expectedInputDigest: initial.inputDigest,
    proposal: { estimate: { basis: 'published', hours: 2, proposalId: null }, size: 'M' },
    effects: [
      {
        id: 'audit',
        resource: 'comment',
        targetIdentity: 'comment:101',
        value: 'unchanged',
        read: async () => observed('unchanged'),
        apply: async () => {
          throw Error('unexpected write');
        },
      },
    ],
    deps: {
      runtime,
      writerId: 'inflate-estimate',
      intendedInputDigest: initial.inputDigest,
      createdAt: 'not-a-timestamp',
    },
  });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /creation-time/);
  assert.equal(f.writes.length, 0);
});

test('pending validation can refuse before the first retry persistence without deriving new intent', async (t) => {
  const { f, args } = writerHarness(t);
  let value = 'before',
    interrupt = true;
  const effects = async () => [
    {
      id: 'audit',
      resource: 'comment',
      targetIdentity: 'comment:101',
      value: 'after',
      read: async () => observed(value),
      apply: async () => {
        if (interrupt) {
          interrupt = false;
          throw Error('before audit');
        }
        value = 'after';
      },
    },
  ];
  assert.equal((await executeEstimateWriter({ ...args, effects })).status, 'partial');
  const writes = f.writes.length,
    body = f.body;
  await assert.rejects(
    executeEstimateWriter({
      ...args,
      effects,
      deriveIntendedInput: () => {
        throw Error('must not derive replacement intent');
      },
      validatePendingInput: async (current, context) => {
        assert.equal(current.publication.operationId, context.operationId);
        assert.equal(
          context.beforeRecord.intendedInputDigest,
          current.publication.intendedInputDigest
        );
        throw Error('inflate-estimate:pending-source-drift');
      },
    }),
    /inflate-estimate:pending-source-drift/
  );
  assert.equal(f.writes.length, writes);
  assert.equal(f.body, body);
  const sealed = readDecompositionRecords(body).publication.intendedInputDigest;
  const retry = await executeEstimateWriter({
    ...args,
    effects,
    deriveIntendedInput: () => {
      throw Error('must not derive replacement intent');
    },
    validatePendingInput: () => ({ intendedInputDigest: hash('cannot replace sealed intent') }),
  });
  assert.equal(retry.status, 'recorded', retry.reason);
  assert.equal(readDecompositionRecords(f.body).publication.intendedInputDigest, sealed);
});

for (const phase of ['before', 'after'])
  test(`midnight ${phase} first intent application follows actual durability`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-05T23:59:59.999Z') });
    const { f, args } = writerHarness(t),
      push = f.deps.pushBody;
    let fault = true,
      value = 'before',
      firstIntent,
      intendedValue;
    args.deps.decomposition = {
      ...f.deps,
      pushBody: async (...input) => {
        const publication = readDecompositionRecords(input[2]).publication;
        if (fault && publication) {
          fault = false;
          firstIntent = publication;
          if (phase === 'after') await push(...input);
          throw Error(`lost ${phase} initial intent`);
        }
        return push(...input);
      },
    };
    const effects = async ({ createdAt }) => {
      intendedValue = `Audit date ${createdAt.slice(0, 10)}`;
      t.mock.timers.tick(2);
      return [
        {
          id: 'audit',
          resource: 'comment',
          targetIdentity: 'comment:101',
          value: intendedValue,
          read: async () => observed(value),
          apply: async () => {
            value = intendedValue;
          },
        },
      ];
    };
    const first = await executeEstimateWriter({ ...args, effects });
    assert.notEqual(first.status, 'recorded');
    const prior = readDecompositionRecords(f.body).publication;
    assert.equal(Boolean(prior), phase === 'after');
    const retry = await executeEstimateWriter({
      ...args,
      effects,
      ...(prior
        ? {
            deriveIntendedInput: () => {
              throw Error('must not derive sealed retry');
            },
          }
        : {}),
    });
    assert.equal(retry.status, 'recorded', retry.reason);
    const final = readDecompositionRecords(f.body).publication;
    assert.equal(
      final.createdAt,
      phase === 'after' ? '2026-11-05T23:59:59.999Z' : '2026-11-06T00:00:00.001Z'
    );
    assert.equal(value, phase === 'after' ? 'Audit date 2026-11-05' : 'Audit date 2026-11-06');
    if (prior) {
      assert.equal(final.intendedInputDigest, firstIntent.intendedInputDigest);
      assert.equal(
        final.effects.find((e) => e.id === 'audit').intendedDigest,
        firstIntent.effects.find((e) => e.id === 'audit').intendedDigest
      );
    }
  });

test('pending validation recollects after preparing retry adapters', async (t) => {
  const { f, args } = writerHarness(t);
  let value = 'before',
    interrupt = true;
  const effects = async () => [
    {
      id: 'audit',
      resource: 'comment',
      targetIdentity: 'comment:101',
      value: 'after',
      read: async () => observed(value),
      apply: async () => {
        if (interrupt) {
          interrupt = false;
          throw Error('interrupt');
        }
        value = 'after';
      },
    },
  ];
  assert.equal((await executeEstimateWriter({ ...args, effects })).status, 'partial');
  const writes = f.writes.length;
  await assert.rejects(
    executeEstimateWriter({
      ...args,
      effects: async () => {
        const prepared = await effects();
        f.body += '\nChanged while adapters were prepared.\n';
        return prepared;
      },
      validatePendingInput: (current) => {
        assert.equal(
          current.sourceObservations.readIssue.value.body,
          f.body,
          'must read after adapter preparation'
        );
        throw Error('fresh current source refused');
      },
    }),
    /fresh current source refused/
  );
  assert.equal(f.writes.length, writes);
});
