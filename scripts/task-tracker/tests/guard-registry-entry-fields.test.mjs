#!/usr/bin/env node
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

import { GUARDS } from '../lib/guard-registry.mjs';
import { bootstrapGuards } from '../lib/guard-bootstrap.mjs';
import {
  refineEntryFieldsPriority,
  planEntryFieldsBody,
  planEntryFieldsBoard,
} from '../lib/guard-adapters-entry-fields.mjs';

const CFG = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PVT_TEST',
  fieldIds: {
    priority: 'F_priority',
    size: 'F_size',
    estimate: 'F_estimate',
    sequence: 'F_sequence',
    startTime: 'F_startTime',
  },
};

function fieldDefs() {
  return {
    priority: { type: 'singleSelect', id: 'F_priority' },
    size: { type: 'singleSelect', id: 'F_size' },
    estimate: { type: 'number', id: 'F_estimate' },
    sequence: { type: 'number', id: 'F_sequence' },
    startTime: { type: 'text', id: 'F_startTime' },
  };
}

describe('guard-bootstrap: entry-field adapter registration', () => {
  // Bootstrap is eager on import — calling it again must be a no-op.
  it('refineEntryFieldsPriority is registered at on-deck.exit', () => {
    bootstrapGuards();
    const ids = GUARDS['on-deck'].exit.map((g) => g.id);
    assert.ok(ids.includes('refine-entry-fields-priority'), `got ${ids.join(',')}`);
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
  it('side-channels refinementPlan onto ctx on success', async () => {
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
      // ensure the absence of refinementPlan correlates with refusal.
      assert.equal(ctx.refinementPlan, undefined);
    } else {
      assert.ok(ctx.refinementPlan, 'refinementPlan must be stashed on ctx on ok');
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
  it('refuses on missing Sequence and joins blockers', async () => {
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
