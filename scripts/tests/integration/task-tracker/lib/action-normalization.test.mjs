// @story #1732
import assert from 'node:assert/strict';
import test from 'node:test';

import { persistReadyNormalizations } from '../../../../task-tracker/lib/action-decision/normalization.mjs';
import { deriveAndRescan } from '../../../../task-tracker/lib/review-derive-rescan.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { projectFunctionalDod } from '../../../../task-tracker/lib/functional-dod-project.mjs';

const HEAD = 'a'.repeat(40);
const TIME = '2026-09-21T13:40:00Z';

function body({ acChecked = true } = {}) {
  return [
    '## Acceptance Criteria',
    `- [${acChecked ? 'x' : ' '}] Required behavior`,
    '## Definition of Done',
    '### Functional (verified at Test)',
    '- [x] All automated tests pass <!-- dod:functional:tests -->',
    '- [x] Lint and format checks pass <!-- dod:functional:lint -->',
    '- [x] All changes committed <!-- dod:functional:commits -->',
    '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
    '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
    '### Lifecycle (verified at Review)',
    '- [ ] Agent Review Passed',
    '### Housekeeping (verified at Close)',
    '- [ ] Story closed and moved to Done',
  ].join('\n');
}

const ready = { status: 'ready', ok: true, refusals: [], humanDecision: null };
const blocked = {
  status: 'blocked',
  ok: false,
  refusals: [{ id: 'incomplete', code: 'incomplete', reason: 'required check missing' }],
  humanDecision: null,
};

test('ready execution persists the current projection with proof-introduction authority and verified readback', async () => {
  let liveBody = body();
  const writes = [];
  const result = await persistReadyNormalizations({
    issueNumber: 1732,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async () => ready,
    mutateBody: async ({ mutate, evidenceStamp }) => {
      const next = await mutate(liveBody);
      writes.push({ evidenceStamp, next });
      liveBody = next;
      return { status: 'ok', attempts: 1, body: liveBody };
    },
    readBack: async () => ({ body: liveBody, head: HEAD }),
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].evidenceStamp, true);
  assert.match(liveBody, /cmd="derive:all-acceptance-criteria-ticked"/);
  assert.match(liveBody, /cmd="derive:all-non-self-non-lifecycle-checkboxes-ticked"/);
  assert.match(liveBody, /sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
  assert.match(liveBody, /ts="2026-09-21T13:40:00Z"/);
  assert.equal(result.persisted, true);
  assert.equal(result.decision.status, 'ready');
});

test('the versioned mutation callback remains synchronous so proof guards inspect its body', async () => {
  let liveBody = body();
  const result = await persistReadyNormalizations({
    issueNumber: 1732,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async () => ready,
    mutateBody: async ({ mutate, validateFreshBaseAsync }) => {
      const next = mutate(liveBody);
      assert.equal(typeof next, 'string', 'async mutate would bypass synchronous proof guards');
      await validateFreshBaseAsync(liveBody, next);
      liveBody = next;
      return { status: 'ok', body: liveBody };
    },
    readBack: async () => ({ body: liveBody, head: HEAD }),
  });
  assert.equal(result.persisted, true);
});

test('the real versioned body boundary rejects the same proof-introducing edit without evidenceStamp', async () => {
  let liveBody = body();
  const deps = {
    fetchBody: async () => liveBody,
    pushBody: async (_repo, _issue, next) => {
      liveBody = next;
    },
  };
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 1732,
      repo: 'owner/repo',
      deps,
      mutate: (base) => projectFunctionalDod({ body: base, head: HEAD, evaluatedAt: TIME }).body,
    }),
    { name: 'FabricatedProofError' }
  );
  assert.equal(liveBody, body());
  const result = await persistReadyNormalizations({
    issueNumber: 1732,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async () => ready,
    readBack: async () => ({ body: liveBody, head: HEAD }),
    deps,
  });
  assert.equal(result.persisted, true);
  assert.match(liveBody, /cmd="derive:all-acceptance-criteria-ticked"/);
});

test('blocked fresh readiness performs no write when normalization is pending', async () => {
  let writes = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => blocked,
      mutateBody: async () => {
        writes++;
        throw new Error('unexpected write');
      },
      readBack: async () => ({ body: body(), head: HEAD }),
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(writes, 0);
});

test('indeterminate readiness on a fresh versioned base aborts before persistence', async () => {
  let liveBody = body();
  let evaluations = 0;
  let pushed = false;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => {
        evaluations++;
        return evaluations === 1
          ? ready
          : { status: 'indeterminate', ok: false, refusals: [], humanDecision: null };
      },
      mutateBody: async ({ mutate, validateFreshBaseAsync }) => {
        const next = await mutate(liveBody);
        await validateFreshBaseAsync(liveBody, next);
        pushed = true;
        liveBody = next;
        return { status: 'ok', body: liveBody };
      },
      readBack: async () => ({ body: liveBody, head: HEAD }),
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(pushed, false);
  assert.equal(liveBody, body());
});

test('a thrown fresh authority evaluation is drift, not a write transport failure', async () => {
  let evaluations = 0;
  let pushed = false;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => {
        evaluations++;
        if (evaluations === 1) return ready;
        throw new Error('authority transport unavailable');
      },
      mutateBody: async ({ mutate, validateFreshBaseAsync }) => {
        const next = mutate(body());
        await validateFreshBaseAsync(body(), next);
        pushed = true;
        return { status: 'ok', body: next };
      },
      readBack: async () => ({ body: body(), head: HEAD }),
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(pushed, false);
});

test('post-write readback failure refuses while preserving the fact that a write occurred', async () => {
  let liveBody = body();
  let readCount = 0;
  let pushed = false;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => ready,
      mutateBody: async ({ mutate }) => {
        liveBody = await mutate(liveBody);
        pushed = true;
        return { status: 'ok', body: liveBody };
      },
      readBack: async () => {
        readCount++;
        if (readCount === 2) throw new Error('transport failed');
        return { body: liveBody, head: HEAD };
      },
    }),
    { code: 'normalization-readback-failed' }
  );
  assert.equal(pushed, true);
  assert.match(liveBody, /cmd="derive:all-acceptance-criteria-ticked"/);
});

test('write transport failure is named and stops before post-write authority or later effects', async () => {
  let reads = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => ready,
      mutateBody: async () => {
        throw new Error('GitHub edit failed');
      },
      readBack: async () => {
        reads++;
        return { body: body(), head: HEAD };
      },
    }),
    { code: 'normalization-persist-failed' }
  );
  assert.equal(reads, 1, 'no post-write read or transition is attempted');
});

test('changed execution HEAD refuses even if projected decision intent would be identical', async () => {
  let writes = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => ready,
      mutateBody: async () => {
        writes++;
      },
      readBack: async () => ({ body: body(), head: 'b'.repeat(40) }),
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(writes, 0);
});

test('an empty authority body is a failed readback, never an idempotent no-op', async () => {
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => ready,
      mutateBody: async () => {
        throw new Error('must not write');
      },
      readBack: async () => ({ body: '', head: HEAD }),
    }),
    { code: 'normalization-readback-failed' }
  );
});

test('a version conflict re-evaluates the fresh body and refuses a now-blocked retry', async () => {
  let liveBody = body();
  let pushes = 0;
  let evaluations = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async ({ body: current }) => {
        evaluations++;
        return current.includes('New required check') ? blocked : ready;
      },
      readBack: async () => ({ body: liveBody, head: HEAD }),
      deps: {
        fetchBody: async () => liveBody,
        pushBody: async (_repo, _issue, next) => {
          pushes++;
          liveBody = pushes === 1 ? `${body()}\n- [ ] New required check` : next;
        },
      },
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(pushes, 1, 'blocked fresh base is never pushed');
  assert.ok(evaluations >= 3, 'initial, first write, and retry authority were evaluated');
  assert.doesNotMatch(liveBody, /cmd="derive:all-acceptance-criteria-ticked"/);
});

test('a non-overlapping version conflict recomputes and preserves the concurrent edit', async () => {
  let liveBody = body();
  let pushes = 0;
  let evaluations = 0;
  const result = await persistReadyNormalizations({
    issueNumber: 1732,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async () => {
      evaluations++;
      return ready;
    },
    readBack: async () => ({ body: liveBody, head: HEAD }),
    deps: {
      fetchBody: async () => liveBody,
      pushBody: async (_repo, _issue, next) => {
        pushes++;
        liveBody = pushes === 1 ? `${body()}\n<!-- concurrent note -->` : next;
      },
    },
  });
  assert.equal(pushes, 2);
  assert.ok(evaluations >= 4);
  assert.match(liveBody, /<!-- concurrent note -->/);
  assert.match(liveBody, /cmd="derive:all-acceptance-criteria-ticked"/);
  assert.equal(result.persisted, true);
});

test('readback rejects a proof marker attributed to the wrong execution HEAD', async () => {
  let liveBody = body();
  let reads = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => ready,
      mutateBody: async ({ mutate, validateFreshBaseAsync }) => {
        const next = mutate(liveBody);
        await validateFreshBaseAsync(liveBody, next);
        liveBody = next;
        return { status: 'ok', body: next };
      },
      readBack: async () => {
        reads++;
        return {
          body: reads === 1 ? liveBody : liveBody.replaceAll(HEAD, 'b'.repeat(40)),
          head: HEAD,
        };
      },
    }),
    { code: 'normalization-authority-drift' }
  );
});

test('test-to-review rescan evaluates projected readiness before any derived write', async () => {
  let writes = 0;
  const original = body();
  await assert.rejects(
    deriveAndRescan({
      issueNumber: 1732,
      repo: 'owner/repo',
      scanBody: original,
      deps: {
        pexec: async (bin) => (bin === 'git' ? { stdout: `${HEAD}\n` } : { stdout: original }),
        refreshAndEvaluate: async ({ projection }) => {
          assert.notEqual(projection.normalization, null);
          return blocked;
        },
        mutateBody: async () => {
          writes++;
          throw new Error('must not write');
        },
      },
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(writes, 0);
});
