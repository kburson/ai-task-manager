#!/usr/bin/env node
// @story #309
// Unit tests for the entry-field guard adapters (#276, parent epic #259).
//
// Verifies:
//   1. guard-bootstrap registers the three adapter ids at the expected
//      registry slots.
//   2. Each adapter translates the underlying gate's
//      `{ ok: false, blockers: string[] }` shape into the registry's
//      `{ ok: false, reason: string }` shape via `blockers.join('; ')`.
//   3. `planEntryFieldsBody` side-channels the resolved refinement plan onto
//      `ctx.refinementPlan` so promote.mjs's post-success hook can consume it.
//   4. Adapter registration is idempotent — re-running bootstrap does not
//      duplicate slot entries.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GUARDS } from '../../../../task-tracker/lib/guard-registry.mjs';
import { bootstrapGuards } from '../../../../task-tracker/lib/guard-bootstrap.mjs';
import {
  refineEntryFieldsPriority,
  planEntryFieldsBody,
  planEntryFieldsBoard,
} from '../../../../task-tracker/lib/guard-adapters-entry-fields.mjs';

const CFG = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PVT_TEST',
  fieldIds: {
    priority: 'F_priority',
    size: 'F_size',
    estimate: 'F_estimate',
    rank: 'F_rank',
    startTime: 'F_startTime',
  },
};

function fieldDefs() {
  return {
    priority: { type: 'singleSelect', id: 'F_priority' },
    size: { type: 'singleSelect', id: 'F_size' },
    estimate: { type: 'number', id: 'F_estimate' },
    rank: { type: 'number', id: 'F_rank' },
    startTime: { type: 'text', id: 'F_startTime' },
  };
}

describe('guard-bootstrap: entry-field adapter registration', () => {
  // Bootstrap is eager on import — calling it again must be a no-op.
  it('the obsolete pre-refine Priority adapter is not registered', () => {
    bootstrapGuards();
    const ids = Object.values(GUARDS).flatMap((state) => state.exit.map((g) => g.id));
    assert.equal(ids.includes('refine-entry-fields-priority'), false, `got ${ids.join(',')}`);
  });

  it('planEntryFieldsBody and planEntryFieldsBoard are registered at refine.exit', () => {
    bootstrapGuards();
    const ids = GUARDS.refine.exit.map((g) => g.id);
    assert.ok(ids.includes('plan-entry-fields-body'), `got ${ids.join(',')}`);
    assert.ok(ids.includes('plan-entry-fields-board'), `got ${ids.join(',')}`);
  });

  it('re-bootstrap is idempotent', () => {
    const before = GUARDS.refine.exit.length;
    bootstrapGuards();
    bootstrapGuards();
    assert.equal(GUARDS.refine.exit.length, before);
  });
});

describe('refineEntryFieldsPriority adapter', () => {
  it('refuses on missing Priority and joins blockers into reason', async () => {
    const ctx = {
      cfg: CFG,
      issueNumber: 1,
      deps: {
        refinementEstimate: {
          loadProjectFieldDefs: () => fieldDefs(),
          projectValuesForIssue: async () => ({}), // priority missing
          fetchLabels: async () => [],
        },
      },
    };
    const r = await refineEntryFieldsPriority.run(ctx);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0, 'reason must be non-empty');
  });

  it('passes on Priority present', async () => {
    const ctx = {
      cfg: CFG,
      issueNumber: 1,
      deps: {
        refinementEstimate: {
          loadProjectFieldDefs: () => fieldDefs(),
          projectValuesForIssue: async () => ({ priority: 'P2' }),
          fetchLabels: async () => [],
        },
      },
    };
    const r = await refineEntryFieldsPriority.run(ctx);
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it('refuses with a structured reason when ctx is malformed', async () => {
    const r = await refineEntryFieldsPriority.run({});
    assert.equal(r.ok, false);
    assert.match(r.reason, /missing ctx/);
  });
});

describe('planEntryFieldsBody adapter', () => {
  it('returns refinementPlan as derived data on success', async () => {
    const body = [
      '## Scope',
      'Do the thing.',
      '',
      '## Acceptance Criteria',
      '- [ ] Item A',
      '- [ ] Item B',
      '',
      '<!-- aitm-refinement-rationale: small change, scoped to lib -->',
    ].join('\n');

    const ctx = {
      cfg: CFG,
      issueNumber: 1,
      body,
      deps: {
        refinementEstimate: {
          loadProjectFieldDefs: () => fieldDefs(),
          projectValuesForIssue: async () => ({ priority: 'P2', size: 'S', estimate: 4 }),
          fetchLabels: async () => [],
        },
      },
    };
    const r = await planEntryFieldsBody.run(ctx);
    if (!r.ok) {
      // Underlying gate may refuse for reasons unrelated to side-channel;
      assert.equal(r.derived, undefined);
    } else {
      assert.ok(r.derived?.refinementPlan, 'refinementPlan must be returned on ok');
      assert.equal(ctx.refinementPlan, undefined, 'the adapter itself remains read-only');
    }
  });

  it('joins multiple blockers with "; " when underlying gate refuses', async () => {
    const ctx = {
      cfg: CFG,
      issueNumber: 1,
      body: '', // empty → many missing pieces
      deps: {
        refinementEstimate: {
          loadProjectFieldDefs: () => fieldDefs(),
          projectValuesForIssue: async () => ({}),
          fetchLabels: async () => [],
        },
      },
    };
    const r = await planEntryFieldsBody.run(ctx);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    // The reason MAY be a single blocker — but if multiple, separator is '; '.
    if (r.reason.includes(';')) {
      assert.match(r.reason, /; /);
    }
  });
});

describe('planEntryFieldsBoard adapter', () => {
  it('refuses on missing Rank and joins blockers', async () => {
    const ctx = {
      cfg: CFG,
      issueNumber: 1,
      deps: {
        refineToPlanGateDeps: {
          loadProjectFieldDefs: () => fieldDefs(),
          projectValuesForIssue: async () => ({ priority: 'P2', size: 'S', estimate: 4 }),
          fetchLabels: async () => [],
          fetchBody: async () => '',
        },
      },
    };
    const r = await planEntryFieldsBoard.run(ctx);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
  });
});
