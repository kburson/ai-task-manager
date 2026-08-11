// @story #526 #1206
// Assigned enter posts an `assigned:started` timing row via the move-state
// phase-pair emission.
//
// move-state.mjs (the `PHASE_EVENTS[stateArg]?.enter` branch) builds the
// entry row from the descriptor `{state, phase:'enter'}` for every forward
// state, including `assigned`. This test pins the descriptor →
// `assigned:started` row resolution that move-state relies on: if PHASE_EVENTS
// loses the assigned enter entry or buildRow stops deriving its slug, the row
// move-state posts would silently regress to empty again.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { PHASE_EVENTS, resolvePhaseEvent } from '../../../phase-events.mjs';
import { buildRow, readLastKnownState, writeLastKnownState } from '../../../gh-timing-comment.mjs';
import { parseMoveStateArgs, legacyStateAliasWarning } from '../../../lib/move-state/policy.mjs';
import '../../../lib/guard-bootstrap.mjs';
import { GUARDS, runGuards } from '../../../lib/guard-registry.mjs';
import {
  ASSIGNED_ASSIGNEE_GUARD_ID,
  EXIT_ASSIGNED_REQUIRES_ASSIGNEE,
} from '../../../lib/assigned-assignee-invariant.mjs';
import { runGuardExecution } from '../../../lib/move-state/guard-execution.mjs';
import { moveState } from '../../../lib/move-state/move-state-core.mjs';

function argv(...args) {
  return ['node', 'move-state.mjs', ...args];
}

test('legacy on-deck target and --from tokens canonicalize with a deterministic warning', () => {
  const target = parseMoveStateArgs(argv('1206', 'on-deck'));
  assert.equal(target.error, null);
  assert.equal(target.stateArg, 'assigned');
  assert.deepEqual(target.legacyStateAliases, ['state']);

  const from = parseMoveStateArgs(argv('1206', 'refine', '--from', 'on-deck'));
  assert.equal(from.fromOverride, 'assigned');
  assert.deepEqual(from.legacyStateAliases, ['--from']);
  assert.equal(
    legacyStateAliasWarning('state'),
    '[aitm] deprecated state alias "on-deck"; use "assigned".'
  );
});

test('historical last-known-state values read as Assigned and writers stay canonical', () => {
  const historical = '<!-- aitm-last-known-state state="on-deck" ts="2026-08-11T00:00:00Z" -->';
  assert.equal(readLastKnownState(historical).state, 'assigned');
  const rewritten = writeLastKnownState(historical, 'on-deck');
  assert.match(rewritten, /state="assigned"/);
  assert.doesNotMatch(rewritten, /state="on-deck"/);
});

test('assigned enter descriptor resolves to the assigned:started event', () => {
  assert.ok(PHASE_EVENTS.assigned?.enter, 'PHASE_EVENTS.assigned.enter must exist');
  assert.deepEqual(resolvePhaseEvent({ state: 'assigned', phase: 'enter' }), {
    event: 'assigned:started',
    description: 'assigned and ready to work',
  });
});

test('move-state assigned enter renders an assigned:started timing row', () => {
  // Mirror the buildRow call move-state.mjs makes for a forward `enter` move
  // (state = the destination column, phase = 'enter', honest 0/0 deltas).
  const row = buildRow({
    ts: new Date().toISOString(),
    phase: { state: 'assigned', phase: 'enter' },
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
  });
  assert.ok(
    row.includes('| assigned:started |'),
    `assigned enter must render the assigned:started slug; got: ${row}`
  );
  assert.ok(
    row.includes('assigned and ready to work'),
    `assigned enter must render its description; got: ${row}`
  );
});

test('Assigned entry registers the assignee invariant at the central guard boundary', () => {
  assert.ok(
    GUARDS.assigned.entry.some((guard) => guard.id === ASSIGNED_ASSIGNEE_GUARD_ID),
    'Assigned must register the live-assignee entry guard'
  );
});

test('Backlog to Assigned refuses an empty assignee read with the invariant exit code', async () => {
  const result = await runGuards('backlog', 'assigned', {
    issueNumber: 1207,
    repo: 'owner/repo',
    deps: { fetchAssignedInvariantAssignees: async () => [] },
  });
  assert.equal(result.ok, false);
  const refusal = result.refusals.find((item) => item.id === ASSIGNED_ASSIGNEE_GUARD_ID);
  assert.equal(refusal.exitCode, EXIT_ASSIGNED_REQUIRES_ASSIGNEE);
  assert.match(refusal.reason, /at least one live GitHub assignee/);
});

test('central mover guard execution returns the invariant exit code before board mutation', async () => {
  const result = await runGuardExecution({
    issueArg: '1207',
    stateArg: 'assigned',
    resolvedFromState: 'backlog',
    plan: { runGuardPipeline: true },
    forceFlag: false,
    supersedeFlag: false,
    SKIP_NETWORK: false,
    cfg: { repo: 'owner/repo' },
    gh: async () => '<!-- aitm-entered-backlog ts="2026-08-11T00:00:00.000Z" -->',
    pexec: async () => ({ stdout: '' }),
    resolveLiveStateName: async () => null,
    checkDirty: async () => ({ dirty: false }),
    formatSummary: () => '',
    resolveWorkspaceForIssue: () => process.cwd(),
    backlogMoveWarning: () => null,
    lifecycleEvidence: null,
    guardDeps: { fetchAssignedInvariantAssignees: async () => [] },
  });

  assert.deepEqual(result, { exit: EXIT_ASSIGNED_REQUIRES_ASSIGNEE });
});

test('changed assignee read under the issue lock refuses before the Status write', async () => {
  let statusWrites = 0;
  let rollbacks = 0;
  const result = await moveState({
    issueArg: '1207',
    stateArg: 'assigned',
    tailProfile: 'task-owner',
    reviewAuthority: null,
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({ sentinelPresent: false, boardAtTarget: false }),
    _emitPhasePairRows: async () => {},
    _stampEntryMarkers: async () => ({ priorState: 'backlog' }),
    _preStatusGuard: async () => ({ exit: EXIT_ASSIGNED_REQUIRES_ASSIGNEE }),
    _runStatusWrite: async () => {
      statusWrites += 1;
      return { exit: null, itemId: 'ITEM' };
    },
    _rollbackRecordedState: async () => {
      rollbacks += 1;
      return { rolledBack: true };
    },
  });
  assert.equal(result.exit, EXIT_ASSIGNED_REQUIRES_ASSIGNEE);
  assert.equal(result.phase, 'guard');
  assert.equal(statusWrites, 0);
  assert.equal(rollbacks, 1);
});

test('move-state host wires a lock-time Assigned guard instead of stubbing all guards', () => {
  const src = readFileSync(new URL('../../../../gh/move-state.mjs', import.meta.url), 'utf8');
  assert.match(src, /_preStatusGuard\s*=\s*runAssignedEntryRevalidation/);
});
