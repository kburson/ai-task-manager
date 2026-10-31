// @story #2093 #2105
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  branchRenewalArgv,
  branchRenewalCommand,
} from '../../../../task-tracker/lib/native-branch-renewal.mjs';

test('only exact native Start transports request renewal', () => {
  assert.equal(
    branchRenewalArgv(['start', '2105\n', '--role', 'agent', '--confirm-relocation']),
    null
  );
  for (const prefix of ['node_modules/@kburson/ai-task-manager/bin/aitm.mjs', 'bin/aitm.mjs'])
    assert.deepEqual(
      branchRenewalCommand(prefix + ' start 2105 --role orchestrator --confirm-relocation'),
      { issueNumber: 2105, role: 'orchestrator' }
    );
  assert.equal(branchRenewalCommand('npx aitm start 2105 --role agent --confirm-relocation'), null);
  for (const command of [
    'npx aitm start 2105',
    'npx aitm resume 2105 --role agent --confirm-relocation',
    'npx aitm start 2106 --role solo --confirm-relocation',
    'npx aitm start 02105 --role agent --confirm-relocation',
    'env npx aitm start 2105 --role agent --confirm-relocation',
    'npx aitm start 2105 --role agent --confirm-relocation\n',
    'npx aitm start 2105 --role agent --confirm-relocation && touch other',
    'npx aitm start 2105 --role agent --confirm-relocation --allow-foreign-worktree',
  ].flatMap((command) => [
    command,
    command.replace(/^npx aitm/, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs'),
  ]))
    assert.equal(branchRenewalCommand(command), null, command);
  assert.equal(
    branchRenewalArgv([
      'start',
      '2105',
      '--role',
      'agent',
      '--confirm-relocation',
      '--role',
      'orchestrator',
    ]),
    null
  );
});
