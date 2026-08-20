import { createHash } from 'node:crypto';

import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import { parseBodyVersion, stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { stripBodyVersion } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import { parseShelveJournal } from '../../../../task-tracker/lib/shelve-transaction.mjs';

export const CFG = {
  repo: 'owner/repo',
  projectId: 'PVT_target',
  fieldIds: {
    priority: 'FIELD_priority',
    size: 'FIELD_size',
    estimate: 'FIELD_estimate',
    rank: 'FIELD_rank',
    blockedBy: 'FIELD_blocked_by',
  },
};
export const FIELD_DEFS = [
  { key: 'priority', name: 'Priority', type: 'single_select' },
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'rank', name: 'Rank', type: 'number' },
  { key: 'blockedBy', name: 'Blocked By', type: 'text' },
];
export const LABELS = ['kind:code', 'area:backlog'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function initialBody(state = 'refine') {
  let body = writeLastKnownState(
    `<!-- aitm-refinement-rationale: {"size":"M","estimate":"4","priority":"P1","rank":2,"rationale":"current"} -->
<!-- aitm-refine-complete ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-estimation-forecast-ready schema="2" id="forecast-1" -->
<!-- aitm-deep-dive-complete ts="2026-08-12T00:01:00.000Z" -->

## User Story

As a steward I want shelving to be recoverable.

## Scope

This integration fixture has enough durable scope to build a current snapshot.

## Plan Metadata

- **Depends On**: #1213
- **Execution Order**: 5

## Acceptance Criteria

- [x] Shelve safely <!-- aitm-verified vc-list="vc:6" sha="abc1234" ts="2026-08-12T00:02:00.000Z" exit="0" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":4,"rank":2,"blockedBy":"#1213"}} -->
`,
    state,
    '2026-08-12T00:00:00.000Z'
  );
  body = body.replace(
    /^(<!--\s*aitm-last-known-state[^>]*?-->)/,
    '$1\n<!-- aitm-body-version version="7" -->'
  );
  if (state === 'ready-for-plan') {
    body = body.replace(
      '<!-- aitm-body-version version="7" -->',
      `<!-- aitm-body-version version="7" -->
<!-- aitm-entered-refine ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-entered-ready-for-plan ts="2026-08-12T01:00:00.000Z" -->
<!-- aitm-entered-plan ts="2026-08-12T02:00:00.000Z" -->
<!-- aitm-entered-ready-for-plan-2 ts="2026-08-12T03:00:00.000Z" -->
<!-- aitm-stage-rollup: {"schema":2,"perStageSec":{"backlog":0,"refine":3600,"ready-for-plan":3600,"plan":3600,"develop":0,"test":0,"review":0,"done":0},"totalSec":10800,"visits":[{"stage":"refine","visit":1,"durationSec":3600},{"stage":"ready-for-plan","visit":1,"durationSec":3600},{"stage":"plan","visit":1,"durationSec":3600},{"stage":"ready-for-plan","visit":2,"durationSec":0}]} -->`
    );
  }
  return stampRefinementSnapshot(body, {
    labels: LABELS,
    ts: '2026-08-12T00:00:00.000Z',
  });
}

function legacyBlockedBody(blockers) {
  const refs = blockers.map((number) => `#${number}`).join(',');
  const withoutSnapshot = initialBody('ready-for-plan')
    .replace(/<!--\s*aitm-refinement-snapshot\s+[^>]*?-->\n?/g, '')
    .replace(
      '\n<!-- aitm-fields:',
      '\n## Definition of Done\n\n- [ ] Preserve legacy evidence.\n\n<!-- aitm-fields:'
    )
    .replace('"blockedBy":"#1213"', '"blockedBy":null');
  const rationale = {
    size: 'M',
    estimate: '4',
    priority: 'P1',
    rank: 2,
    rationale: 'current',
  };
  const provenance = sha256(JSON.stringify(rationale));
  const digest = sha256(
    JSON.stringify({
      scope: 'This integration fixture has enough durable scope to build a current snapshot.',
      acceptanceCriteria:
        '- [x] Shelve safely <!-- aitm-verified vc-list="vc:6" sha="abc1234" ts="2026-08-12T00:02:00.000Z" exit="0" -->',
      fields: { priority: 'P1', size: 'M', estimate: 4, rank: 2, blockedBy: null },
      dependencies: '- **Depends On**: #1213',
      labels: [...LABELS].sort(),
      provenance,
    })
  );
  return `${withoutSnapshot.trimEnd()}\n<!-- aitm-blocked-by refs="${refs}" -->\n<!-- aitm-refinement-snapshot schema="1" digest="${digest}" provenance="${provenance}" priority="P1" size="M" estimate="4" rank="2" blocked-by="" ts="2026-08-12T00:00:00.000Z" -->\n`;
}

export function harness({
  state = 'refine',
  issueState = 'OPEN',
  assignees = ['alice'],
  failOnce = null,
  failAfterPhase = null,
  failAfterMutation = null,
  failAfterClearFields = false,
  failAfterMove = false,
  failAfterOwner = false,
  onFetch = null,
  beforeFirstMutation = null,
  legacyBlockers = null,
  projectBlockedBy = null,
  labels = null,
} = {}) {
  const migration = Array.isArray(legacyBlockers);
  const store = {
    issueState,
    title: 'Shelve story',
    body: migration ? legacyBlockedBody(legacyBlockers) : initialBody(state),
    labels: labels || (migration ? ['BLOCKED', ...LABELS] : [...LABELS]),
    state,
    fields: { priority: 'P1', size: 'M', estimate: 4, rank: 2 },
    blockedBy: migration
      ? (projectBlockedBy ?? legacyBlockers.map((number) => `#${number}`).join(', '))
      : null,
    assignees: [...assignees],
  };
  const calls = [];
  let failure = failOnce;
  let fetchCount = 0;
  let mutationCount = 0;

  function maybeFail(name) {
    if (failure === name) {
      failure = null;
      throw new Error(`injected:${name}`);
    }
  }

  const deps = {
    assertIssueLockHeld: () => {},
    now: () => '2026-08-12T00:05:00.000Z',
    makeTx: () => 'tx-1215',
    getBaseSha: async () => 'c02bdd3e00000000000000000000000000000000',
    loadProjectFieldDefs: () => FIELD_DEFS,
    resolveLogin: async () => 'alice',
    fetchSnapshot: async () => {
      fetchCount += 1;
      await onFetch?.({ store, fetchCount });
      return structuredClone(store);
    },
    mutateBody: async ({ mutate }) => {
      maybeFail('mutate-body');
      mutationCount += 1;
      if (mutationCount === 1) await beforeFirstMutation?.({ store });
      const nextVersion = parseBodyVersion(store.body) + 1;
      store.body = stampBodyVersion(await mutate(stripBodyVersion(store.body)), nextVersion);
      const phase = parseShelveJournal(store.body)?.phase || 'none';
      calls.push(['body', phase]);
      if (failAfterMutation === mutationCount) {
        failAfterMutation = null;
        throw new Error(`transport failed after mutation ${mutationCount} landed`);
      }
      if (failAfterPhase === phase) {
        failAfterPhase = null;
        throw new Error(`injected:after-${phase}`);
      }
      return { body: store.body };
    },
    clearBoardFields: async () => {
      maybeFail('clear-fields');
      store.fields = { priority: null, size: null, estimate: null, rank: null };
      calls.push(['fields-cleared']);
      if (failAfterClearFields) {
        failAfterClearFields = false;
        throw new Error('transport failed after board fields landed');
      }
    },
    runMoveState: async () => {
      maybeFail('move-status');
      store.state = 'backlog';
      store.body = writeLastKnownState(store.body, 'backlog', '2026-08-12T00:06:00.000Z');
      calls.push(['status-backlog']);
      if (failAfterMove) {
        failAfterMove = false;
        throw new Error('transport failed after Status landed');
      }
      return 0;
    },
    removeOwner: async () => {
      maybeFail('remove-owner');
      store.assignees = [];
      calls.push(['owner-removed']);
      if (failAfterOwner) {
        failAfterOwner = false;
        throw new Error('transport failed after owner removal landed');
      }
      return { status: 'unassigned' };
    },
  };
  return { store, calls, deps };
}
