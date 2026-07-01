#!/usr/bin/env node
// @story #675 (AC4)
// heal-entry-markers.mjs (multi-issue sweep) and reconcile.mjs's `backfill`
// mode (single-issue, single-current-stage) used to independently re-derive
// "what timestamp should a missing entry marker get" — each with its own
// copy of the interval-safe backfill algorithm. #675 AC4 extracted that
// algorithm into lib/stage-entry-markers.mjs (`safeBackfillTs`) and made both
// callers delegate to it. This test asserts they now produce IDENTICAL
// timestamps for the same hole instead of two diverging computations.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runReconcile } from '../../verbs/reconcile.mjs';
import { planStageHeal } from '../../heal-entry-markers.mjs';
import { stampEntryMarker, safeBackfillTs } from '../../lib/stage-entry-markers.mjs';

const cfg = { repo: 'o/r', projectId: 'PID' };
const now = () => '2026-06-29T00:00:00Z';
const CREATED_AT = '2026-05-01T00:00:00Z';

// refine -> develop, missing `plan` -> one contiguity hole at `plan`.
const BASE = '## AC\n- [x] x\n';
const BODY = stampEntryMarker(
  stampEntryMarker(BASE, 'refine', '2026-06-01T00:00:00Z'),
  'develop',
  '2026-06-03T00:00:00Z'
);

test('heal-entry-markers.planStageHeal and lib safeBackfillTs agree on the hole ts', () => {
  const plan = planStageHeal({ stage: 'plan', body: BODY, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');

  const direct = safeBackfillTs({
    stage: 'plan',
    markers: { refine: '2026-06-01T00:00:00Z', develop: '2026-06-03T00:00:00Z' },
    createdAt: CREATED_AT,
  });

  assert.equal(plan.ts, direct);
});

test('reconcile backfill stamps the same ts heal-entry-markers would compute for the hole', async () => {
  const PROJ = mkdtempSync(join(projectScratchDir('test'), 'reconcile-delegate-'));
  const calls = { writes: [] };
  const deps = {
    fetchIssueBody: async () => ({ body: BODY, createdAt: CREATED_AT }),
    getLiveState: async () => 'develop',
    writeIssueBody: async ({ body }) => {
      calls.writes.push(body);
    },
    runMoveState: async () => 0,
    persistTrackerState: () => {},
    mutateIssueBody: async ({ mutate }) => {
      calls.writes.push(mutate(BODY));
      return { status: 'ok' };
    },
  };

  const { result } = await runReconcile({
    issueNumber: 9_200_001,
    mode: 'backfill',
    cfg: { ...cfg, projectId: PROJ },
    deps,
    now,
  }).then((r) => ({ result: r }));

  const expectedTs = planStageHeal({ stage: 'plan', body: BODY, createdAt: CREATED_AT }).ts;

  assert.equal(result.status, 'backfilled');
  const written = calls.writes.at(-1);
  assert.ok(
    written.includes(`ts="${expectedTs}"`) && written.includes('aitm-entered-plan'),
    `expected backfilled body to stamp plan at ${expectedTs}, got:\n${written}`
  );
});
