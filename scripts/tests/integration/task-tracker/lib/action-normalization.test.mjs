// @story #1732
import assert from 'node:assert/strict';
import test from 'node:test';

import { persistReadyNormalizations } from '../../../../task-tracker/lib/action-decision/normalization.mjs';
import { deriveAndRescan } from '../../../../task-tracker/lib/review-derive-rescan.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import '../../../../task-tracker/lib/guard-bootstrap.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
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
async function blockedDecision(label = 'Step A') {
  return runGuards('test', 'review', {
    issueNumber: 1732,
    body: `## Scope\n- [ ] ${label}\n<!-- aitm-dod-verified sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-09-21T13:40:00Z" -->`,
    toState: 'review',
    cfg: { repo: 'owner/repo' },
    deps: {
      observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
      reconcileDependencyDisposition: async () => {},
      fetchParentIssue: async () => null,
      resolveDocsOnlyLaneSkipProof: async () => false,
    },
  });
}
const blocked = await blockedDecision();
const indeterminate = await runGuards('test', 'review', {
  issueNumber: 1732,
  body: '<!-- aitm-dod-verified sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-09-21T13:40:00Z" -->',
  toState: 'review',
  cfg: { repo: 'owner/repo' },
  deps: {
    observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
    reconcileDependencyDisposition: async () => {},
    fetchParentIssue: async () => null,
    resolveDocsOnlyLaneSkipProof: async () => {
      throw new Error('proof authority unavailable');
    },
  },
});

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

for (const [name, decision] of [
  ['blocked', blocked],
  ['indeterminate', indeterminate],
]) {
  for (const pending of [true, false]) {
    test(`${name} fresh readiness preserves its envelope ${pending ? 'with' : 'without'} pending normalization`, async () => {
      let writes = 0;
      const original = pending ? body() : '## Scope\n- [ ] Step A';
      const result = await persistReadyNormalizations({
        issueNumber: 1732,
        repo: 'owner/repo',
        head: HEAD,
        evaluatedAt: TIME,
        refreshAndEvaluate: async () => decision,
        mutateBody: async () => {
          writes++;
          throw new Error('unexpected write');
        },
        readBack: async () => ({ body: original, head: HEAD }),
      });
      assert.deepEqual(result.decision, decision);
      assert.deepEqual(result.warnings, []);
      assert.equal(result.persisted, false);
      assert.equal(result.body, original);
      assert.equal(writes, 0);
    });
  }
}

test('real registry completeness labels survive normalization', async () => {
  assert.deepEqual(
    blocked.refusals.filter((r) => r.code === 'test-scope-incomplete').map((r) => r.args.label),
    ['- [ ] Step A']
  );
});

test('indeterminate readiness on a fresh versioned base is retained before persistence', async () => {
  let liveBody = body();
  let evaluations = 0;
  let pushed = false;
  const result = await persistReadyNormalizations({
    issueNumber: 1732,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async () => (++evaluations === 1 ? ready : indeterminate),
    mutateBody: async ({ mutate, validateFreshBaseAsync }) => {
      const next = mutate(liveBody);
      await validateFreshBaseAsync(liveBody, next);
      pushed = true;
      liveBody = next;
      return { status: 'ok', body: liveBody };
    },
    readBack: async () => ({ body: liveBody, head: HEAD }),
  });
  assert.deepEqual(result.decision, indeterminate);
  assert.equal(result.body, body());
  assert.equal(result.persisted, false);
  assert.equal(pushed, false);
});

for (const pending of [true, false]) {
  test(`malformed non-ready envelope is invalid ${pending ? 'with' : 'without'} normalization`, async () => {
    await assert.rejects(
      persistReadyNormalizations({
        issueNumber: 1732,
        repo: 'owner/repo',
        head: HEAD,
        evaluatedAt: TIME,
        refreshAndEvaluate: async () => ({
          status: 'indeterminate',
          ok: false,
          refusals: [],
          humanDecision: null,
        }),
        readBack: async () => ({ body: pending ? body() : '## Scope', head: HEAD }),
      }),
      { code: 'normalization-decision-invalid' }
    );
  });
}

test('successful normalization keeps persisted truth when readback becomes blocked', async () => {
  let liveBody = body();
  const result = await persistReadyNormalizations({
    issueNumber: 1732,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async ({ body: current }) =>
      current.includes('derive:') ? blocked : ready,
    readBack: async () => ({ body: liveBody, head: HEAD }),
    deps: {
      fetchBody: async () => liveBody,
      pushBody: async (_repo, _issue, next) => {
        liveBody = next;
      },
    },
  });
  assert.deepEqual(result.decision, blocked);
  assert.equal(result.persisted, true);
  assert.equal(result.body, liveBody);
  assert.deepEqual(result.warnings, []);
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

test('a changed HEAD during a versioned retry refuses before another push', async () => {
  let currentHead = HEAD;
  let pushes = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1732,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => ready,
      readBack: async () => ({ body: body(), head: currentHead }),
      mutateBody: async ({ mutate, validateFreshBaseAsync }) => {
        const base = body();
        await validateFreshBaseAsync(base, mutate(base));
        pushes++;
        currentHead = 'b'.repeat(40); // a concurrent versioned retry starts here
        await validateFreshBaseAsync(base, mutate(base));
        pushes++;
        return { status: 'ok', body: base };
      },
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(pushes, 1, 'stale-HEAD proof must not reach the retry push');
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
  const result = await persistReadyNormalizations({
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
  });
  assert.deepEqual(result.decision, blocked);
  assert.equal(result.persisted, false);
  assert.equal(result.body, liveBody);
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

test('test-to-review rescan preserves projected refusal before any derived write', async () => {
  let writes = 0;
  const original = body();
  const result = await deriveAndRescan({
    issueNumber: 1732,
    repo: 'owner/repo',
    projectDir: process.cwd(),
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
  });
  assert.deepEqual(result.decision, blocked);
  assert.equal(result.scanBody, original);
  assert.deepEqual(result.warnings, []);
  assert.equal(writes, 0);
});

// @story #1859
test('a concurrent HEAD change wins over an otherwise valid blocked retry', async () => {
  let reads = 0;
  let evaluations = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1859,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      readBack: async () => ({ body: body(), head: ++reads === 1 ? HEAD : 'b'.repeat(40) }),
      refreshAndEvaluate: async () => (++evaluations === 1 ? ready : blocked),
      mutateBody: async ({ mutate, validateFreshBaseAsync }) =>
        validateFreshBaseAsync(body(), mutate(body())),
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(evaluations, 1);
});

test('remaining projection drift wins over a blocked post-write guard', async () => {
  let liveBody = body().replace(
    '## Acceptance Criteria',
    '## Scope\n- [ ] Concurrent prerequisite\n## Acceptance Criteria'
  );
  let evaluations = 0;
  await assert.rejects(
    persistReadyNormalizations({
      issueNumber: 1859,
      repo: 'owner/repo',
      head: HEAD,
      evaluatedAt: TIME,
      refreshAndEvaluate: async () => (++evaluations === 1 ? ready : blocked),
      readBack: async () => ({ body: liveBody, head: HEAD }),
      mutateBody: async ({ mutate }) => {
        liveBody = mutate(liveBody).replace(
          '- [ ] Concurrent prerequisite',
          '- [x] Concurrent prerequisite'
        );
        return { status: 'ok' };
      },
    }),
    { code: 'normalization-authority-drift' }
  );
  assert.equal(evaluations, 1);
});

// @story #1859
test('normalization retains warnings and human requests separately from normalization warnings', async () => {
  const warningDecision = await runGuards('test', 'done', {
    issueNumber: 1859,
    body: body(),
    toState: 'done',
    cfg: { repo: 'owner/repo', lifecycleCheckboxesRequired: false },
    deps: {
      observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
      reconcileDependencyDisposition: async () => {},
      fetchParentIssue: async () => null,
    },
  });
  assert.ok(warningDecision.warns.length > 0, 'real done-entry lifecycle warning');
  // Command orchestration may attach the operator request to the complete
  // registry decision; retain it verbatim rather than replace that envelope.
  const decision = {
    ...warningDecision,
    humanDecision: {
      requests: [
        {
          kind: 'manual-investigation',
          actor: 'human-operator',
          subject: { issue: 1859, actionId: 'close' },
          args: { guardId: 'body-gates-entry-done', code: 'unclassified-refusal' },
        },
      ],
    },
  };
  const result = await persistReadyNormalizations({
    issueNumber: 1859,
    repo: 'owner/repo',
    head: HEAD,
    evaluatedAt: TIME,
    refreshAndEvaluate: async () => decision,
    readBack: async () => ({ body: body(), head: HEAD }),
    mutateBody: async () => {
      throw new Error('must not write');
    },
  });
  assert.deepEqual(result.decision, decision);
  assert.deepEqual(result.decision.warns, warningDecision.warns);
  assert.deepEqual(result.warnings, []);
});
