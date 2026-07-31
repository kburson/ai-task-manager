// @story #186
import assert from 'node:assert/strict';

import { main as updateEventFields } from '../../../../gh/update-event-fields.mjs';

const ISSUE_BODY = '<!-- aitm-fields: {"schema":1,"values":{"startTime":null}} -->';
const FIELD_DEFS = [{ key: 'startTime', name: 'Start Time', type: 'text' }];

function exactAuthority(options, callback) {
  assert.equal(options.issueId, '999');
  assert.equal(options.operation, 'lifecycle-mutation');
  assert.equal(options.heartbeat, true);
  return callback({ reverify: async () => {} });
}

async function runState(state) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const code = await updateEventFields(['999', state, '--item-id', 'ITEM_FAKE'], {
      cfg: {
        repo: 'owner/repo',
        projectId: 'PVT_FAKE',
        fieldStartTime: 'F_START_FAKE',
        fieldIds: { startTime: 'F_START_FAKE' },
      },
      projectDir: process.cwd(),
      loadProjectFieldDefs: () => FIELD_DEFS,
      fetchIssueBody: async () => ISSUE_BODY,
      writeProjectFieldValue: async () => {},
      writeIssueBody: async ({ reverify }) => reverify(),
      withGovernedEffect: exactAuthority,
    });
    return { code, stdout: logs.join('\n') };
  } finally {
    console.log = originalLog;
  }
}

// Each event-bound state is accepted under exact lifecycle authority.
const states = ['refine', 'plan', 'develop', 'test', 'review', 'done'];
for (const state of states) {
  const result = await runState(state);
  assert.equal(result.code, 0, `expected exit 0 for state="${state}"`);
  // refine writes startTime (moved from develop in #133); the remaining
  // default bindings are empty.
  if (state === 'refine') {
    assert.match(result.stdout, /startTime set for #999/);
  } else {
    assert.doesNotMatch(result.stdout, /set for #999/);
  }
  console.log(`PASS: state arg "${state}" accepted (exit 0)`);
}

// Unknown state still fails at the usage guard before authority.
{
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const result = await updateEventFields(['999', 'bogus', '--item-id', 'ITEM_FAKE'], {
      withGovernedEffect: async () => {
        throw new Error('unknown state must not open authority');
      },
    });
    assert.equal(result, 1);
    assert.match(errors.join('\n'), /Usage:.*refine\|plan\|develop\|test\|review\|done/);
  } finally {
    console.error = originalError;
  }
  console.log('PASS: unknown state arg rejected with usage');
}

console.log('All update-event-fields state-arg tests passed.');
