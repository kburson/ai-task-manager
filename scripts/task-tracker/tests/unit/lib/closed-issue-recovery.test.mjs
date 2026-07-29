// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  readUnauthorizedCloseRecovery,
  runClosedIssueConvergence,
  upsertUnauthorizedCloseRecovery,
} from '../../../lib/closed-issue-convergence.mjs';
import { upsertProgressMarker } from '../../../lib/markers.mjs';

const FIELD_DB = '<!-- aitm-fields: {"schema":1,"values":{"size":"M","estimate":8}} -->';
const BODY_WITH_FIELDS = `## Body

Keep this content.

${FIELD_DB}
`;

const RECOVERY = {
  tx: 'tx-1',
  phase: 'intent',
  stateReason: 'completed',
  unticked: ['Agent Review Passed'],
  actor: 'octocat',
  ts: '2026-07-29T20:00:00.000Z',
};

test('unauthorized-close recovery uses exact structured attributes and preserves field DB', () => {
  const intent = upsertUnauthorizedCloseRecovery(BODY_WITH_FIELDS, RECOVERY);

  assert.equal((intent.match(/aitm-unauthorized-close/g) || []).length, 1);
  assert.match(
    intent,
    /<!-- aitm-unauthorized-close tx="tx-1" phase="intent" state-reason="completed" unticked="\[&quot;Agent Review Passed&quot;\]" actor="octocat" ts="2026-07-29T20:00:00.000Z" -->/
  );
  assert.deepEqual(readUnauthorizedCloseRecovery(intent), RECOVERY);
  assert.ok(intent.indexOf('aitm-unauthorized-close') < intent.indexOf('aitm-fields'));
  assert.equal((intent.match(/<!-- aitm-fields:/g) || []).length, 1);
  assert.match(intent, new RegExp(`${FIELD_DB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n$`));
});

test('unauthorized-close recovery ignores fenced examples', () => {
  const fencedExample = [
    '```md',
    '<!-- aitm-unauthorized-close tx="example" phase="intent" state-reason="completed" unticked="[]" actor="nobody" ts="2026-07-29T20:00:00.000Z" -->',
    '```',
  ].join('\n');

  assert.equal(readUnauthorizedCloseRecovery(fencedExample), null);
});

test('unauthorized-close recovery replaces only the top-level marker without duplication', () => {
  const fencedMarker =
    '<!-- aitm-unauthorized-close tx="example" phase="intent" state-reason="completed" unticked="[]" actor="nobody" ts="2026-07-29T20:00:00.000Z" -->';
  const prior = upsertUnauthorizedCloseRecovery(
    `## Example

\`\`\`md
${fencedMarker}
\`\`\`

Body text.
`,
    RECOVERY
  );
  const next = upsertUnauthorizedCloseRecovery(prior, {
    ...RECOVERY,
    phase: 'reopened',
  });

  assert.equal((next.match(/aitm-unauthorized-close/g) || []).length, 2);
  assert.equal((next.match(/phase="reopened"/g) || []).length, 1);
  assert.equal((next.match(/tx="tx-1"/g) || []).length, 1);
  assert.match(next, new RegExp(fencedMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(readUnauthorizedCloseRecovery(next), {
    ...RECOVERY,
    phase: 'reopened',
  });
});

for (const [name, fence] of [
  ['four-backtick', '````'],
  ['four-tilde', '~~~~'],
]) {
  test(`${name} recovery examples are ignored by reads and top-level upserts`, () => {
    const fencedMarker =
      '<!-- aitm-unauthorized-close tx="example" phase="intent" state-reason="completed" unticked="[]" actor="nobody" ts="2026-07-29T20:00:00.000Z" -->';
    const fencedExample = `${fence}md
${fencedMarker}
${fence}
`;

    assert.equal(readUnauthorizedCloseRecovery(fencedExample), null);

    const withTopLevel = upsertUnauthorizedCloseRecovery(fencedExample, RECOVERY);
    assert.equal((withTopLevel.match(/aitm-unauthorized-close/g) || []).length, 2);
    assert.match(withTopLevel, new RegExp(fencedMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(readUnauthorizedCloseRecovery(withTopLevel), RECOVERY);

    const reopened = upsertUnauthorizedCloseRecovery(withTopLevel, {
      ...RECOVERY,
      phase: 'reopened',
    });
    assert.equal((reopened.match(/phase="reopened"/g) || []).length, 1);
    assert.match(reopened, new RegExp(fencedMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(readUnauthorizedCloseRecovery(reopened)?.phase, 'reopened');
  });
}

test('backtick in a candidate info string does not hide a later top-level recovery', () => {
  const topLevel = upsertUnauthorizedCloseRecovery('## Body\n', RECOVERY);
  const body = `\`\`\`language\`invalid
This candidate is ordinary text under CommonMark.

${topLevel}`;

  assert.deepEqual(readUnauthorizedCloseRecovery(body), RECOVERY);

  const reopened = upsertUnauthorizedCloseRecovery(body, {
    ...RECOVERY,
    phase: 'reopened',
  });
  assert.equal((reopened.match(/aitm-unauthorized-close/g) || []).length, 1);
  assert.equal(readUnauthorizedCloseRecovery(reopened)?.phase, 'reopened');
});

test('unticked labels round-trip JSON punctuation exactly', () => {
  const unticked = ['label | pipe', 'quoted "label"', 'comma, label'];
  const body = upsertUnauthorizedCloseRecovery('## Body\n', {
    ...RECOVERY,
    unticked,
  });

  assert.deepEqual(readUnauthorizedCloseRecovery(body)?.unticked, unticked);
});

test('unauthorized-close recovery rejects phases outside the durable phase machine', () => {
  assert.throws(
    () =>
      upsertUnauthorizedCloseRecovery('## Body\n', {
        ...RECOVERY,
        phase: 'pending',
      }),
    /phase must be one of intent, reopened, review, timing, complete/
  );
});

test('unauthorized-close recovery rejects structurally incomplete transaction state', () => {
  const incomplete = '<!-- aitm-unauthorized-close phase="review" unticked="[]" -->';

  assert.equal(readUnauthorizedCloseRecovery(incomplete), null);
  assert.throws(
    () =>
      upsertUnauthorizedCloseRecovery('## Body\n', {
        ...RECOVERY,
        tx: '',
      }),
    /tx must be a non-empty string/
  );
});

test('unauthorized-close writer rejects every incomplete recovery field', () => {
  for (const [field, value, message] of [
    ['tx', '   ', /tx must be a non-empty string/],
    ['stateReason', '', /stateReason must be a non-empty string/],
    ['actor', '', /actor must be a non-empty string/],
    ['ts', undefined, /ts must be a non-empty string/],
    ['ts', '', /ts must be a non-empty string/],
    ['unticked', 'Agent Review Passed', /unticked must be an array of strings/],
    ['unticked', ['Agent Review Passed', 7], /unticked must be an array of strings/],
  ]) {
    assert.throws(
      () =>
        upsertUnauthorizedCloseRecovery('## Body\n', {
          ...RECOVERY,
          [field]: value,
        }),
      message,
      `${field}=${JSON.stringify(value)} must be refused`
    );
  }
});

test('unauthorized-close reader rejects empty required attributes', () => {
  const marker = upsertUnauthorizedCloseRecovery('## Body\n', RECOVERY);

  for (const [attribute, value] of [
    ['tx', '   '],
    ['state-reason', ''],
    ['actor', ''],
    ['ts', ''],
  ]) {
    const malformed = marker.replace(new RegExp(`${attribute}="[^"]*"`), `${attribute}="${value}"`);
    assert.equal(readUnauthorizedCloseRecovery(malformed), null, `${attribute} must be non-empty`);
  }
});

test('upsertProgressMarker rejects an empty or non-string kind', () => {
  assert.throws(
    () => upsertProgressMarker('body', { kind: '' }),
    /upsertProgressMarker: 'kind' must be a non-empty string/
  );
  assert.throws(
    () => upsertProgressMarker('body', { kind: null }),
    /upsertProgressMarker: 'kind' must be a non-empty string/
  );
});

function recoveryService({ failOnce = null, queuedTiming = false } = {}) {
  const state = {
    body: '## Body\n',
    issueClosed: true,
    boardState: 'develop',
  };
  Object.defineProperty(state, 'recovery', {
    get() {
      return readUnauthorizedCloseRecovery(state.body);
    },
    set(recovery) {
      state.body = recovery ? upsertUnauthorizedCloseRecovery(state.body, recovery) : '## Body\n';
    },
  });
  const timingTransactions = new Set();
  const calls = [];
  let pendingFailure = failOnce;

  const injectFailure = (point) => {
    if (pendingFailure !== point) return;
    pendingFailure = null;
    throw new Error(`${point} failed`);
  };

  const buildDeps = () => ({
    createTransactionId: async () => 'tx-1',
    writeRecoveryPhase: async (phase, recovery) => {
      injectFailure(`${phase} write`);
      calls.push(`writeRecoveryPhase:${phase}`);
      state.body = upsertUnauthorizedCloseRecovery(state.body, {
        ...recovery,
        phase,
      });
      return readUnauthorizedCloseRecovery(state.body);
    },
    reopenIssue: async () => {
      injectFailure('reopen');
      calls.push('reopenIssue');
      state.issueClosed = false;
      return { ok: true };
    },
    moveToReview: async () => {
      injectFailure('Review move');
      calls.push('moveToReview');
      state.boardState = 'review';
      return { ok: true };
    },
    timingAuditPresent: async (tx) => timingTransactions.has(tx),
    postTimingAudit: async ({ recovery }) => {
      if (queuedTiming) {
        calls.push('postTimingAudit');
        return { ok: false, queued: true };
      }
      injectFailure('timing post');
      calls.push('postTimingAudit');
      timingTransactions.add(recovery.tx);
      return { ok: true };
    },
  });

  const invoke = () => {
    const durableRecovery = readUnauthorizedCloseRecovery(state.body);
    return runClosedIssueConvergence(
      {
        decision: { action: 'aberration' },
        issueNumber: 925,
        issueClosed: state.issueClosed,
        boardState: state.boardState,
        stateReason: 'completed',
        unticked: ['Agent Review Passed'],
        actor: 'octocat',
        ts: '2026-07-29T20:00:00.000Z',
        recovery: durableRecovery ? structuredClone(durableRecovery) : null,
      },
      buildDeps()
    );
  };

  return {
    calls,
    invoke,
    setFailure(value) {
      pendingFailure = value;
    },
    state,
  };
}

for (const [failurePoint, durablePhase] of [
  ['intent write', null],
  ['reopen', 'intent'],
  ['reopened write', 'intent'],
  ['Review move', 'reopened'],
  ['review write', 'reopened'],
  ['timing post', 'review'],
  ['timing write', 'review'],
  ['complete write', 'timing'],
]) {
  test(`fresh invocation resumes after ${failurePoint} failure`, async () => {
    const service = recoveryService({ failOnce: failurePoint });

    const first = await service.invoke();
    assert.equal(first.status, 'failed');
    assert.equal(first.durablePhase, durablePhase);
    assert.equal(
      readUnauthorizedCloseRecovery(service.state.body)?.phase ?? null,
      durablePhase,
      'durable phase is reconstructed from the serialized marker store'
    );

    service.setFailure(null);
    const second = await service.invoke();

    assert.equal(second.status, 'recovered');
    assert.equal(second.durablePhase, 'complete');
    assert.equal(service.state.recovery.phase, 'complete');
    assert.equal(
      service.calls.filter((call) => call === 'postTimingAudit').length,
      1,
      'timing audit is posted exactly once across fresh invocations'
    );
  });
}

test('queued timing result fails and leaves durable phase at review', async () => {
  const service = recoveryService({ queuedTiming: true });

  const result = await service.invoke();

  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'postTimingAudit');
  assert.equal(result.durablePhase, 'review');
  assert.equal(service.state.recovery.phase, 'review');
  assert.equal(service.calls.filter((call) => call === 'postTimingAudit').length, 1);
});

test('a completed recovery is an idempotent recovered no-op', async () => {
  const service = recoveryService();
  service.state.issueClosed = false;
  service.state.boardState = 'review';
  service.state.recovery = {
    ...RECOVERY,
    phase: 'complete',
  };

  const result = await service.invoke();

  assert.equal(result.status, 'recovered');
  assert.equal(result.durablePhase, 'complete');
  assert.deepEqual(service.calls, []);
});

test('executor refuses a pending-recovery decision mismatch without taking policy authority', async () => {
  const calls = [];
  const adapter = (name) => async () => {
    calls.push(name);
    return { ok: true };
  };
  const recovery = { ...RECOVERY, phase: 'review' };

  const mismatch = await runClosedIssueConvergence(
    {
      decision: { action: 'finalize' },
      recovery,
    },
    {
      moveToDone: adapter('moveToDone'),
      emitClosePair: adapter('emitClosePair'),
      reconcileLifecycle: adapter('reconcileLifecycle'),
      cleanup: adapter('cleanup'),
    }
  );

  assert.deepEqual(mismatch, {
    action: 'finalize',
    status: 'failed',
    steps: [],
    failedStep: 'recovery-decision-mismatch',
    durablePhase: 'review',
    error: 'incomplete recovery phase review requires an aberration decision',
  });
  assert.deepEqual(calls, []);

  const repair = await runClosedIssueConvergence({
    decision: { action: 'proceed', repair: true },
    recovery,
  });
  assert.deepEqual(repair, { action: 'proceed', status: 'not-handled', steps: [] });
});

test('executor validates a complete recovery before calling the phase writer', async () => {
  let writeCalls = 0;

  const result = await runClosedIssueConvergence(
    {
      decision: { action: 'aberration' },
      issueClosed: false,
      boardState: 'review',
      stateReason: 'completed',
      unticked: [],
      actor: 'octocat',
      ts: '',
    },
    {
      createTransactionId: async () => 'tx-1',
      writeRecoveryPhase: async (_phase, recovery) => {
        writeCalls += 1;
        return recovery;
      },
    }
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'writeRecoveryPhase:intent');
  assert.match(result.error, /ts must be a non-empty string/);
  assert.equal(writeCalls, 0);
});
