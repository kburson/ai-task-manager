import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runGovernedIssueTimeWrites } from '../../../../gh/log-issue-time.mjs';

test('issue-time stale authority performs zero body or project mutations', async () => {
  const effects = [];
  const stale = Object.assign(new Error('stale'), { code: 'fence-stale' });
  await assert.rejects(
    runGovernedIssueTimeWrites({
      issueNumber: '#1049',
      bodyWrite: async () => effects.push('body'),
      projectWrites: [{ fieldId: 'a' }],
      writeProjectField: async () => effects.push('project'),
      withGovernedEffect: async (options) => {
        effects.push(options);
        throw stale;
      },
    }),
    (error) => error === stale
  );
  assert.deepEqual(effects, [{ issueId: '1049', operation: 'evidence-mutation', heartbeat: true }]);
});

test('issue-time re-verifies immediately before body and every ProjectV2 write', async () => {
  const effects = [];
  await runGovernedIssueTimeWrites({
    issueNumber: '1049',
    bodyWrite: async (authority) => {
      effects.push('body');
      await authority.reverify();
      effects.push('body-push');
    },
    projectWrites: [{ fieldId: 'a' }, { fieldId: 'b' }],
    writeProjectField: async (item) => effects.push(`project:${item.fieldId}`),
    withGovernedEffect: async (options, callback) => {
      effects.push(`verify:${options.operation}`);
      return callback({
        reverify: async () => effects.push('reverify'),
      });
    },
  });
  assert.deepEqual(effects, [
    'verify:evidence-mutation',
    'reverify',
    'body',
    'reverify',
    'body-push',
    'reverify',
    'project:a',
    'reverify',
    'project:b',
  ]);
});
