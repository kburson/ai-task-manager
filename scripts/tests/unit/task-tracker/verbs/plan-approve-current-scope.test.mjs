// @story #2153
// cspell:ignore WFFQSAYKTYJ
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { currentScopeFixture } from '../../../fixtures/current-plan-approval.mjs';
import * as planApproveModule from '../../../../task-tracker/verbs/plan-approve.mjs';
import { formatPlanApproveOutcome } from '../../../../task-tracker/verbs/plan-approve.mjs';
import {
  buildPlanApprovedMarker,
  parsePlanApprovedMarker,
} from '../../../../task-tracker/lib/markers.mjs';
const FIXED_TS = '2026-05-16T00:00:00Z';

// @story #2153 — current approval exercises real governed plan/story and Git source.
test('#2153 explicit current approval validates current source without waiver reconstruction', async (t) => {
  const f = currentScopeFixture(t);
  const before = f.body;
  const sourceHead = f.git('rev-parse', 'HEAD');
  const result = await f.run();
  assert.equal(result.status, 'approved-current-scope');
  const approved = parsePlanApprovedMarker(f.body);
  assert.equal(approved.mode, 'full-auto');
  assert.match(approved.currentApprovalDigest, /^sha256:/);
  assert.equal(approved.repairRecordId, null);
  assert.equal(f.calls.waiverReads, 0);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.audits, 1);
  assert.equal(
    f.body.replace(/<!--\s*aitm-plan-approved\b[^]*?-->\s*/g, '').trimEnd(),
    before.trimEnd()
  );
  assert.equal(f.git('rev-parse', 'HEAD'), sourceHead);
});
test('#2153 same current evidence idempotently reconciles its audit', async (t) => {
  const f = currentScopeFixture(t);
  assert.equal((await f.run()).status, 'approved-current-scope');
  const before = f.body;
  assert.equal((await f.run()).status, 'already-approved-current-scope');
  assert.equal(f.body, before);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.audits, 1);
});
for (const state of ['backlog', 'plan', 'done'])
  test(`#2153 current lane refuses ${state} without ordinary approval`, async (t) => {
    const f = currentScopeFixture(t);
    f.state = state;
    assert.equal((await f.run()).status, 'current-scope-refused');
    assert.equal(f.calls.writes, 0);
  });
test('#2153 current lane requires explicit Full-Auto', async (t) => {
  const f = currentScopeFixture(t);
  f.deps.env = {};
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
});
test('#2153 current and repair flags conflict without writes', async (t) => {
  const f = currentScopeFixture(t);
  assert.equal((await f.run({ repairFromEvidence: true })).status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
});
for (const mode of ['human', 'full-auto'])
  test(`#2153 preserves existing ${mode} approval provenance`, async (t) => {
    const f = currentScopeFixture(t);
    f.body += '\n' + buildPlanApprovedMarker('2026-11-04T02:00:00Z', { mode });
    const before = f.body;
    assert.equal((await f.run()).status, 'current-scope-refused');
    assert.equal(f.body, before);
    assert.equal(f.calls.audits, 0);
  });
test('#2153 tracked source drift refuses before approval', async (t) => {
  const f = currentScopeFixture(t);
  writeFileSync(path.join(f.projectDir, 'plan.md'), 'changed plan');
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
});
test('#2153 scope change at same HEAD requires a fresh current timestamp', async (t) => {
  const f = currentScopeFixture(t);
  assert.equal((await f.run()).status, 'approved-current-scope');
  const prior = parsePlanApprovedMarker(f.body);
  f.body = f.body.replace('Stop partial publication.', 'Reject incomplete publication.');
  f.now = '2026-11-05T07:01:00Z';
  assert.equal((await f.run()).status, 'approved-current-scope');
  const next = parsePlanApprovedMarker(f.body);
  assert.notEqual(next.currentApprovalDigest, prior.currentApprovalDigest);
  assert.notEqual(next.ts, prior.ts);
});
test('#2153 live trunk movement forces a new producer approval at unchanged HEAD', async (t) => {
  const f = currentScopeFixture(t);
  assert.equal((await f.run()).status, 'approved-current-scope');
  const prior = parsePlanApprovedMarker(f.body);
  f.trunk = 'f'.repeat(40);
  f.now = '2026-11-05T07:01:00Z';
  assert.equal((await f.run()).status, 'approved-current-scope');
  const next = parsePlanApprovedMarker(f.body);
  assert.notEqual(next.currentApprovalDigest, prior.currentApprovalDigest);
  assert.notEqual(next.ts, prior.ts);
});

for (const args of [
  [],
  ['0'],
  ['2153', '--current-scop'],
  ['2153', '--unknown'],
  ['2153', '2154'],
  ['2153', '--current-scope', '--current-scope'],
  ['2153', '--repair-from-evidence', '--repair-from-evidence'],
  ['2153', '--current-scope', '--repair-from-evidence'],
])
  test(`#2153 strict parser rejects ${JSON.stringify(args)}`, () => {
    assert.throws(() => planApproveModule.parsePlanApproveArgs(args), /usage/);
  });
test('#2153 strict parser separates current approval from waiver repair', () => {
  assert.deepEqual(planApproveModule.parsePlanApproveArgs(['#2153', '--current-scope']), {
    issueNumber: 2153,
    currentScope: true,
    repairFromEvidence: false,
  });
});
test('#2153 existing ordinary marker cannot be relabeled through current CLI success mapping', () => {
  assert.match(
    formatPlanApproveOutcome(2153, {
      status: 'approved-current-scope',
      ts: FIXED_TS,
      mode: 'full-auto',
      audit: { auditPosted: true },
    }),
    /current/i
  );
  assert.match(
    formatPlanApproveOutcome(2153, {
      status: 'already-approved-current-scope',
      ts: FIXED_TS,
      mode: 'full-auto',
      audit: { alreadyPresent: true },
    }),
    /current/i
  );
});
test('#2153 child addition during fresh observation refuses before writes', async (t) => {
  const f = currentScopeFixture(t);
  let reads = 0;
  f.deps.fetchEpicChildren = async () => (++reads === 1 ? [] : [{ number: 9 }]);
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
});
for (const [name, change] of Object.entries({
  scope: (f) => {
    f.body = f.body.replace('Stop partial publication.', 'Changed scope.');
  },
  plan: (f) => {
    writeFileSync(path.join(f.projectDir, 'plan.md'), 'changed');
  },
  human: (f) => {
    f.body += '\n' + buildPlanApprovedMarker(FIXED_TS, { mode: 'human' });
  },
  history: (f) => {
    f.comments[0].updatedAt = '2026-11-04T01:51:51Z';
  },
  state: (f) => {
    f.state = 'test';
  },
}))
  test(`#2153 fresh-base ${name} drift refuses without approval write`, async (t) => {
    const f = currentScopeFixture(t);
    const normal = f.deps.mutateIssueBody;
    f.deps.mutateIssueBody = async (input) => {
      change(f);
      return normal(input);
    };
    assert.equal((await f.run()).status, 'current-scope-refused');
    assert.equal(f.calls.writes, 0);
    assert.equal(f.calls.audits, 0);
  });
test('#2153 failed audit post retries same evidence and timestamp exactly once', async (t) => {
  const f = currentScopeFixture(t);
  const normal = f.deps.postComment;
  f.deps.postComment = async () => {
    throw Error('audit unavailable');
  };
  assert.equal((await f.run()).status, 'current-scope-refused');
  const prior = parsePlanApprovedMarker(f.body);
  assert.ok(prior.currentApprovalDigest);
  f.now = '2026-11-05T07:02:00Z';
  f.deps.postComment = normal;
  assert.equal((await f.run()).status, 'already-approved-current-scope');
  assert.equal(parsePlanApprovedMarker(f.body).ts, prior.ts);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.audits, 1);
});

test('#2153 fresh provider readback catches drift despite an earlier successful mutation result', async (t) => {
  const f = currentScopeFixture(t);
  const normal = f.deps.mutateIssueBody;
  f.deps.mutateIssueBody = async (input) => {
    const result = await normal(input);
    f.body = f.body.replace('Stop partial publication.', 'A concurrent AC change.');
    return result;
  };
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.audits, 0);
});
test('#2153 failed audit plus moved live trunk requires a new digest and timestamp at the same source HEAD', async (t) => {
  const f = currentScopeFixture(t);
  const post = f.deps.postComment;
  const head = f.git('rev-parse', 'HEAD');
  f.deps.postComment = async () => {
    throw Error('audit unavailable');
  };
  assert.equal((await f.run()).status, 'current-scope-refused');
  const before = parsePlanApprovedMarker(f.body);
  f.trunk = 'b'.repeat(40);
  f.deps.postComment = post;
  assert.equal((await f.run()).status, 'approved-current-scope');
  const after = parsePlanApprovedMarker(f.body);
  assert.notEqual(after.ts, before.ts);
  assert.notEqual(after.currentApprovalDigest, before.currentApprovalDigest);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.calls.audits, 1);
});

for (const [name, change] of Object.entries({
  head: (f) => {
    f.git('commit', '--allow-empty', '--quiet', '-m', 'Concurrent source');
  },
  trunk: (f) => {
    f.trunk = 'c'.repeat(40);
  },
  forecast: (f) => {
    f.body += '\n<!-- aitm-estimation-forecast-ready record-id="01M6N4D6WFFQSAYKTYJ8HW3ZZ6" -->';
  },
  planPath: (f) => {
    f.body = f.body.replace('Implementation-plan: plan.md', 'Implementation-plan: missing.md');
  },
}))
  test(`#2153 fresh-base ${name} observation cannot reuse the prepared approval`, async (t) => {
    const f = currentScopeFixture(t);
    const normal = f.deps.mutateIssueBody;
    f.deps.mutateIssueBody = async (input) => {
      change(f);
      return normal(input);
    };
    assert.equal((await f.run()).status, 'current-scope-refused');
    assert.equal(f.calls.writes, 0);
    assert.equal(f.calls.audits, 0);
  });
for (const [name, change] of Object.entries({
  directory: (f) => {
    f.deps.readDirectoryContract = async () => ({ authority: 'directory' });
  },
  epic: (f) => {
    f.deps.fetchEpicChildren = async () => [{ number: 2 }];
  },
  plan: (f) => {
    f.body = f.body.replace('Implementation-plan: plan.md', 'Implementation-plan: absent.md');
  },
  story: (f) => {
    f.body = f.body.replace(
      'I want to stop partial publication',
      'Missing the required capability prefix'
    );
  },
}))
  test(`#2153 current approval refuses unsupported ${name} before writes`, async (t) => {
    const f = currentScopeFixture(t);
    change(f);
    assert.equal((await f.run()).status, 'current-scope-refused');
    assert.equal(f.calls.writes, 0);
    assert.equal(f.calls.audits, 0);
  });
test('#2153 changed persisted marker refuses before audit', async (t) => {
  const f = currentScopeFixture(t);
  const normal = f.deps.mutateIssueBody;
  f.deps.mutateIssueBody = async (input) => {
    const r = await normal(input);
    f.body = f.body.replace(/current-approval-digest="[^"]+"/, 'current-approval-digest="broken"');
    return { ...r, body: f.body };
  };
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.audits, 0);
});

// Independent review F1: successful POST is not final canonical readback.
for (const [name, alter] of Object.entries({
  deleted: (f) => f.comments.pop(),
  edited: (f) => {
    f.comments.at(-1).body += '\nChanged after POST';
  },
  duplicate: (f) => f.comments.push({ ...f.comments.at(-1), id: 'another' }),
}))
  test(`#2153 final audit ${name} refuses success`, async (t) => {
    const f = currentScopeFixture(t);
    const post = f.deps.postComment;
    f.deps.postComment = async (input) => {
      await post(input);
      alter(f);
    };
    assert.equal((await f.run()).status, 'current-scope-refused');
  });
for (const extra of [
  buildPlanApprovedMarker(FIXED_TS, { mode: 'human' }),
  '<!-- aitm-plan-approved -->',
])
  test('#2153 conflicting or malformed persisted approval claim refuses before audit', async (t) => {
    const f = currentScopeFixture(t);
    const mutate = f.deps.mutateIssueBody;
    f.deps.mutateIssueBody = async (input) => {
      const result = await mutate(input);
      f.body += '\n' + extra;
      return result;
    };
    assert.equal((await f.run()).status, 'current-scope-refused');
    assert.equal(f.calls.audits, 0);
  });
test('#2153 malformed existing approval claim cannot be treated as absence', async (t) => {
  const f = currentScopeFixture(t);
  f.body += '\n<!-- aitm-plan-approved -->';
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
});

const READY = '01M00000000000000000000001';
const projection = () => ({
  forecast: {
    recordId: READY,
    supersededBy: null,
    payload: { plan: { size: 'M', humanHours: 6 } },
  },
  activeForecastRecordIds: [READY],
  board: { size: 'M', estimate: 6 },
  bodyFields: { size: 'M', estimate: 6 },
});
for (const [name, alter] of Object.entries({
  absent: (p) => {
    p.forecast = null;
  },
  superseded: (p) => {
    p.forecast.supersededBy = '01M00000000000000000000002';
  },
  multiple: (p) => {
    p.activeForecastRecordIds.push('01M00000000000000000000002');
  },
  board: (p) => {
    p.board.estimate = 7;
  },
  body: (p) => {
    p.bodyFields.size = 'S';
  },
}))
  test(`#2153 current adaptive forecast refuses ${name} authority`, async (t) => {
    const f = currentScopeFixture(t);
    f.body += `\n<!-- aitm-estimation-forecast-ready record-id="${READY}" -->`;
    const p = projection();
    alter(p);
    f.deps.plannedEstimate = { forecastProjection: async () => p };
    assert.equal(
      (await f.run({ cfg: { repo: 'o/r', trunkRef: 'HEAD', estimationRubricIssue: 99 } })).status,
      'current-scope-refused'
    );
    assert.equal(f.calls.writes, 0);
  });
test('#2153 current adaptive forecast validates authority on every fresh base and readback', async (t) => {
  const f = currentScopeFixture(t);
  f.body += `\n<!-- aitm-estimation-forecast-ready record-id="${READY}" -->`;
  let reads = 0;
  f.deps.plannedEstimate = {
    forecastProjection: async () => {
      reads++;
      return projection();
    },
  };
  assert.equal(
    (await f.run({ cfg: { repo: 'o/r', trunkRef: 'HEAD', estimationRubricIssue: 99 } })).status,
    'approved-current-scope'
  );
  assert.ok(reads >= 4);
});
test('#2153 forecast authority drift before write refuses', async (t) => {
  const f = currentScopeFixture(t);
  f.body += `\n<!-- aitm-estimation-forecast-ready record-id="${READY}" -->`;
  let p = projection();
  f.deps.plannedEstimate = { forecastProjection: async () => p };
  const normal = f.deps.mutateIssueBody;
  f.deps.mutateIssueBody = async (input) => {
    p = { ...p, activeForecastRecordIds: [] };
    return normal(input);
  };
  assert.equal((await f.run()).status, 'current-scope-refused');
  assert.equal(f.calls.writes, 0);
});

test('#2153 forecast reader ignores fences and rejects malformed or duplicate live claims', async () => {
  const { readCurrentForecastId } =
    await import('../../../../task-tracker/lib/plan-approval-current-source.mjs');
  const ready = `<!-- aitm-estimation-forecast-ready record-id="${READY}" -->`;
  assert.equal(readCurrentForecastId('```html\n' + ready + '\n```'), null);
  for (const body of [
    '<!-- aitm-estimation-forecast-ready record-id="BROKEN" -->',
    ready + '\n<!-- aitm-estimation-forecast-ready record-id="BROKEN" -->',
    ready + '\n<!-- aitm-estimation-forecast-ready',
  ])
    assert.throws(() => readCurrentForecastId(body));
});
