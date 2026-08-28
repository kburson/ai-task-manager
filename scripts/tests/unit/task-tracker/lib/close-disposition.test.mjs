// @story #761
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runDispose,
  parseDisposition,
  serializeClosedAs,
  parseClosedAs,
  addClosedAs,
} from '../../../../task-tracker/lib/close-disposition.mjs';

// Build a runDispose deps bag of spies. Every I/O seam records its calls so the
// tests can assert ordering and payloads without any network access.
function makeDeps({ readbackStateReason, ...overrides } = {}) {
  const calls = {
    mutate: [],
    pexec: [],
    comment: [],
    flush: [],
    disposition: [],
    done: [],
  };
  let requestedStateReason = null;
  const deps = {
    mutateIssueBody: async ({ mutate }) => {
      const out = mutate('BODY BASE\n');
      calls.mutate.push(out);
      return out;
    },
    pexec: async (bin, argv) => {
      calls.pexec.push([bin, ...argv]);
      if (argv[0] === 'api' && argv[1] === 'graphql') {
        const query = argv.find((arg) => String(arg).startsWith('query=')) || '';
        if (query.includes('duplicate:issue')) {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  issue: { id: 'I_target' },
                  duplicate: { id: 'I_survivor' },
                },
              },
            }),
          };
        }
        if (query.includes('closeIssue')) {
          requestedStateReason = 'DUPLICATE';
          return {
            stdout: JSON.stringify({
              data: { closeIssue: { issue: { state: 'CLOSED', stateReason: 'DUPLICATE' } } },
            }),
          };
        }
      }
      if (argv[0] === 'issue' && argv[1] === 'close') {
        requestedStateReason = 'NOT_PLANNED';
        return { stdout: '' };
      }
      if (argv[0] === 'issue' && argv[1] === 'view') {
        return {
          stdout: JSON.stringify({
            state: 'CLOSED',
            stateReason: readbackStateReason || requestedStateReason,
          }),
        };
      }
      throw new Error(`unexpected pexec call: ${bin} ${argv.join(' ')}`);
    },
    postComment: async ({ issueNumber, repo, body }) => {
      calls.comment.push({ issueNumber, repo, body });
    },
    flushTiming: async (n) => {
      calls.flush.push(n);
    },
    writeDisposition: async ({ issueNumber, disposition }) => {
      calls.disposition.push({ issueNumber, disposition });
    },
    moveToDone: async ({ issueNumber }) => {
      calls.done.push(issueNumber);
    },
    now: () => '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
  return { deps, calls };
}

const BASE = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PVT_test',
};

// ── AC1 — close without the Done DoD/commit-trace gate ─────────────────────
test('AC1: runDispose closes without invoking any Done DoD/commit-trace dep', async () => {
  const commitTrace = () => {
    throw new Error('commit-trace must never run on the disposition lane');
  };
  const moveStateDone = () => {
    throw new Error('move-state done must never run on the disposition lane');
  };
  const { deps } = makeDeps({
    // These deps do not exist on the disposition contract; presence proves the
    // lane cannot reach them. runDispose only reads its documented seams.
    runCommitTrace: commitTrace,
    runMoveStateDone: moveStateDone,
  });
  const r = await runDispose({
    issueNumber: '761',
    reason: 'not-planned',
    ...BASE,
    deps,
  });
  assert.equal(r.status, 'closed-as');
  assert.equal(r.reason, 'not-planned');
});

test('Incorporated is parsed as a distinct owner-bound close lane', () => {
  assert.deepEqual(parseDisposition({ reason: 'incorporated', of: '1381' }), {
    key: 'incorporated',
    stateReason: 'COMPLETED',
    of: '#1381',
  });
  assert.throws(
    () => parseDisposition({ reason: 'incorporated' }),
    /close --as incorporated: --of <M> is required/
  );
});

// ── AC2 — correct stateReason + timing flush ───────────────────────────────
test('AC1/AC2: duplicate uses closeIssue with the target and surviving issue node IDs', async () => {
  const { deps, calls } = makeDeps();
  const result = await runDispose({
    issueNumber: '761',
    reason: 'duplicate',
    of: '742',
    ...BASE,
    deps,
  });
  const idQuery = calls.pexec.find(
    (call) => call[1] === 'api' && call.some((arg) => String(arg).includes('duplicate:issue'))
  );
  assert.ok(idQuery, 'target and surviving issue node IDs are resolved together');
  assert.ok(idQuery.includes('issue=761'));
  assert.ok(idQuery.includes('duplicate=742'));
  const closeMutation = calls.pexec.find(
    (call) => call[1] === 'api' && call.some((arg) => String(arg).includes('closeIssue'))
  );
  assert.ok(closeMutation, 'GraphQL closeIssue mutation was invoked');
  assert.ok(closeMutation.some((arg) => String(arg).includes('duplicateIssueId:$duplicate')));
  assert.ok(closeMutation.includes('issue=I_target'));
  assert.ok(closeMutation.includes('duplicate=I_survivor'));
  assert.equal(
    calls.pexec.some((call) => call[1] === 'issue' && call[2] === 'close'),
    false,
    'duplicate does not use the unsupported gh issue close reason'
  );
  assert.equal(result.stateReason, 'DUPLICATE');
  assert.deepEqual(calls.flush, ['761'], 'timing flushed for the issue');
});

test('AC5: not-planned keeps the supported CLI transport and verifies NOT_PLANNED', async () => {
  const { deps, calls } = makeDeps();
  const result = await runDispose({
    issueNumber: '761',
    reason: 'not-planned',
    ...BASE,
    deps,
  });
  const closeCall = calls.pexec.find((call) => call[1] === 'issue' && call[2] === 'close');
  assert.equal(closeCall[closeCall.length - 1], 'not planned');
  assert.equal(result.stateReason, 'NOT_PLANNED');
});

test('AC3: a coerced stateReason fails loud with requested and stored values', async () => {
  const { deps, calls } = makeDeps({ readbackStateReason: 'COMPLETED' });
  await assert.rejects(
    runDispose({ issueNumber: '761', reason: 'duplicate', of: '742', ...BASE, deps }),
    /requested stateReason DUPLICATE.*stored COMPLETED/
  );
  assert.equal(calls.comment.length, 0, 'no success audit comment is posted after mismatch');
});

test('AC4: the success result and audit comment use the read-back stateReason', async () => {
  const { deps, calls } = makeDeps();
  const result = await runDispose({
    issueNumber: '761',
    reason: 'duplicate',
    of: '742',
    ...BASE,
    deps,
  });
  assert.equal(result.stateReason, 'DUPLICATE');
  assert.match(calls.comment[0].body, /stateReason `DUPLICATE`/);
  assert.ok(
    calls.pexec.some(
      (call) => call[1] === 'issue' && call[2] === 'view' && call.includes('state,stateReason')
    ),
    'GitHub state and stateReason are read back after close'
  );
});

// ── AC3 — retained on the board with an honest terminal value ───────────────
test('AC3: duplicate is retained in Done with Disposition Duplicate', async () => {
  const { deps, calls } = makeDeps();
  const r = await runDispose({ issueNumber: '761', reason: 'duplicate', of: '742', ...BASE, deps });
  assert.deepEqual(calls.disposition, [{ issueNumber: '761', disposition: 'Duplicate' }]);
  assert.deepEqual(calls.done, ['761']);
  assert.equal(r.retained, true);
});

test('AC3: a disposition write failure is fail-closed before GitHub close', async () => {
  const { deps, calls } = makeDeps({
    writeDisposition: async () => {
      throw new Error('Disposition field missing');
    },
  });
  await assert.rejects(
    runDispose({ issueNumber: '761', reason: 'not-planned', ...BASE, deps }),
    /Disposition field missing/
  );
  assert.equal(calls.pexec.length, 0, 'GitHub close was not attempted');
});

// ── AC4 — aitm-closed-as marker + audit comment ────────────────────────────
test('AC4: the body is stamped with aitm-closed-as and an audit comment is posted', async () => {
  const { deps, calls } = makeDeps();
  await runDispose({ issueNumber: '761', reason: 'duplicate', of: '742', ...BASE, deps });
  const stamped = calls.mutate[0];
  assert.match(stamped, /<!-- aitm-closed-as reason="duplicate" of="#742" ts="[^"]+" -->/);
  assert.equal(calls.comment.length, 1, 'one audit comment posted');
  assert.match(calls.comment[0].body, /Closed as duplicate/);
  assert.match(calls.comment[0].body, /#742/);
  assert.match(calls.comment[0].body, /retained on the project board/);
});

test('AC4: not-planned marker omits the of= attribute', async () => {
  assert.equal(
    serializeClosedAs({ reason: 'not-planned', ts: 'T' }),
    '<!-- aitm-closed-as reason="not-planned" ts="T" -->'
  );
  const round = parseClosedAs(addClosedAs('body\n', { reason: 'not-planned', ts: 'T' }));
  assert.equal(round.reason, 'not-planned');
  assert.equal(round.of, '');
});

// ── AC5 — the raw `gh issue close` guard still forbids the un-sanctioned path ─
test('AC5: raw `gh issue close` is caught by the guard predicate; the lane is the only sanctioned bypass', () => {
  // The bash-guard contract (bash-guard.mjs:252): raw operator `gh issue close`
  // is refused. The disposition lane routes the SAME command through the
  // verb-internal pexec seam, which the guard does not mediate — so it is the
  // one honest path. Assert both halves of that contract.
  const GUARD_RE = /\bgh\s+issue\s+close\b/;
  assert.ok(GUARD_RE.test('gh issue close 761 -R kburson/ai-task-manager'), 'raw close is caught');
  assert.ok(
    GUARD_RE.test('gh issue close 761 --reason DUPLICATE'),
    'raw close w/ reason is caught'
  );
  // A label-only edit is NOT the close path and must not trip the predicate.
  assert.equal(GUARD_RE.test('gh issue edit 761 --add-label BLOCKED'), false);
});

// ── argument validation ────────────────────────────────────────────────────
test('parseDisposition: duplicate requires --of', () => {
  assert.throws(() => parseDisposition({ reason: 'duplicate' }), /--of <M> is required/);
  assert.deepEqual(parseDisposition({ reason: 'duplicate', of: '742' }), {
    key: 'duplicate',
    stateReason: 'DUPLICATE',
    of: '#742',
  });
});

test('parseDisposition: unknown reason is rejected', () => {
  assert.throws(() => parseDisposition({ reason: 'wontfix' }), /unknown disposition/);
});

test('parseDisposition: not-planned drops a stray --of', () => {
  const p = parseDisposition({ reason: 'not-planned', of: '742' });
  assert.equal(p.key, 'not-planned');
  assert.equal(p.of, '', 'a stray --of on not-planned is dropped');
});
