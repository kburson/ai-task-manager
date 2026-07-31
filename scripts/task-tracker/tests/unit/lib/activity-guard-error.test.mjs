// @story #273
// #273 — when an active task is bound but its kanbanState cache is absent,
// the guard's block message must name the issue and include a concrete
// repair command. Pre-#273 it said "no recorded kanban state" with no path
// forward.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildReason } from '../../../lib/activity-block-reason.mjs';
import { STATE_MATRIX } from '../../../activity-policy.mjs';
import { runActivityGuard } from '../../../activity-guard.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ACTIVITY_GUARD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'activity-guard.mjs'
);

test('bound issue + absent cache → message includes repair command', () => {
  const reason = buildReason({
    activityClass: 'WRITE_CODE',
    target: 'src/foo.mjs',
    state: null,
    activeIssue: '#273',
    toolName: 'Edit',
    STATE_MATRIX,
  });
  assert.match(reason, /#273/);
  assert.match(reason, /reconcile accept-live 273/);
});

test('no active issue + no state → no-active-task message', () => {
  const reason = buildReason({
    activityClass: 'WRITE_CODE',
    target: 'src/foo.mjs',
    state: null,
    activeIssue: null,
    toolName: 'Edit',
    STATE_MATRIX,
  });
  assert.match(reason, /no active task/);
  assert.match(reason, /\/task start/);
});

test('non-null state + disallowed activity → message suggests promote/demote', () => {
  // #281 — legacy `/task move <id> <state>` advice was wrong (verb retired in
  // favor of promote/demote). Forward suggestion → /task promote; backward →
  // /task demote. WRITE_CODE in refine resolves forward to develop, so the
  // message points the user at promote.
  const reason = buildReason({
    activityClass: 'WRITE_CODE',
    target: 'src/foo.mjs',
    state: 'refine',
    activeIssue: '#273',
    toolName: 'Edit',
    STATE_MATRIX,
  });
  assert.match(reason, /not permitted in state refine/);
  assert.match(reason, /\/task promote/);
  assert.doesNotMatch(reason, /\/task move /);
});

test('#1049: activity guard exposes an async injectable governed-edit seam', () => {
  const source = readFileSync(ACTIVITY_GUARD, 'utf8');
  assert.match(source, /export async function runActivityGuard\(/);
  assert.match(source, /operation:\s*['"]source-write['"]/);
  assert.match(source, /withGovernedEffect/);
});

test('#1049: allowed source edit evaluates pure policy before source-write authority', async () => {
  const events = [];
  const result = await runActivityGuard(
    { tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } },
    {
      projectRoot: '/fake/project',
      loadPolicy: () => {
        events.push('policy');
        return {};
      },
      readBoundState: () => {
        events.push('state');
        return { activeIssue: '#1049', state: 'develop' };
      },
      classifyEdit: () => {
        events.push('classify');
        return 'WRITE_CODE';
      },
      isChoreModeActive: () => {
        events.push('chore');
        return false;
      },
      withGovernedEffect: async (options, callback) => {
        events.push(`verify:${options.issueId}:${options.operation}`);
        return callback({ reverify: async () => {} });
      },
    }
  );

  assert.equal(result.decision, 'allow');
  assert.deepEqual(events, ['policy', 'state', 'classify', 'chore', 'verify:1049:source-write']);
});

test('#1049: scratch and state refusals never open authority', async () => {
  let touched = false;
  const forbidden = () => {
    touched = true;
    throw new Error('pure bypass/refusal must not reach dependency');
  };

  const scratch = await runActivityGuard(
    { tool_name: 'Write', tool_input: { file_path: '.tmp/inspect/probe.mjs' } },
    {
      projectRoot: '/fake/project',
      loadPolicy: forbidden,
      readBoundState: forbidden,
      withGovernedEffect: forbidden,
    }
  );
  assert.equal(scratch.decision, 'allow');
  assert.equal(touched, false);

  const stateRefusal = await runActivityGuard(
    { tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } },
    {
      projectRoot: '/fake/project',
      loadPolicy: () => ({}),
      readBoundState: () => ({ activeIssue: '#1049', state: 'plan' }),
      classifyEdit: () => 'WRITE_CODE',
      isChoreModeActive: () => false,
      withGovernedEffect: forbidden,
    }
  );
  assert.equal(stateRefusal.decision, 'block');
  assert.equal(stateRefusal.code, 'activity-state-refused');
  assert.equal(touched, false);
});

test('#1049: read-only Bash bypasses activity authority to avoid double governance', async () => {
  let governed = false;
  const result = await runActivityGuard(
    { tool_name: 'Bash', tool_input: { command: 'git status --short' } },
    {
      projectRoot: '/fake/project',
      loadPolicy: () => ({}),
      readBoundState: () => ({ activeIssue: '#1049', state: 'develop' }),
      classifyBash: () => 'READ_*',
      isChoreModeActive: () => false,
      withGovernedEffect: async () => {
        governed = true;
      },
    }
  );
  assert.equal(result.decision, 'allow');
  assert.equal(governed, false);
});

test('#1049: stale activity fence is an explicit no-effect refusal', async () => {
  const result = await runActivityGuard(
    { tool_name: 'NotebookEdit', tool_input: { notebook_path: 'src/work.ipynb' } },
    {
      projectRoot: '/fake/project',
      loadPolicy: () => ({}),
      readBoundState: () => ({ activeIssue: '#1049', state: 'develop' }),
      classifyEdit: () => 'WRITE_CODE',
      isChoreModeActive: () => false,
      withGovernedEffect: async () => {
        const error = new Error('stale lease');
        error.code = 'fence-stale';
        throw error;
      },
    }
  );
  assert.equal(result.decision, 'block');
  assert.equal(result.code, 'activity-source-authority-refused');
  assert.match(result.reason, /fence-stale/);
});

test('#1049: multi-file apply_patch evaluates every class and verifies authority once', async () => {
  const input = {
    tool_name: 'apply_patch',
    tool_input: [
      '*** Begin Patch',
      '*** Update File: src/guarded.mjs',
      '@@',
      '-old',
      '+new',
      '*** Update File: docs/guarded.md',
      '@@',
      '-old',
      '+new',
      '*** End Patch',
    ].join('\n'),
  };
  const baseDeps = {
    projectRoot: '/fake/project',
    loadPolicy: () => ({}),
    readBoundState: () => ({ activeIssue: '#1049', state: 'develop' }),
    classifyEdit: (target) => (target.endsWith('.md') ? 'WRITE_DOCS' : 'WRITE_CODE'),
    isChoreModeActive: () => false,
  };
  let governed = 0;
  const allowed = await runActivityGuard(input, {
    ...baseDeps,
    withGovernedEffect: async (_options, callback) => {
      governed += 1;
      return callback();
    },
  });
  assert.equal(allowed.decision, 'allow');
  assert.equal(governed, 1, 'the whole patch shares one source-write authority check');

  governed = 0;
  const refused = await runActivityGuard(input, {
    ...baseDeps,
    readBoundState: () => ({ activeIssue: '#1049', state: 'review' }),
    withGovernedEffect: async () => {
      governed += 1;
    },
  });
  assert.equal(refused.decision, 'block');
  assert.equal(refused.code, 'activity-state-refused');
  assert.match(refused.reason, /WRITE_CODE/);
  assert.equal(governed, 0, 'one refused target prevents authority initialization');
});
