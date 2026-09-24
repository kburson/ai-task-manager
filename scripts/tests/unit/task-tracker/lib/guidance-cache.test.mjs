// @story #1674
import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFileStat } from '../../../../../guidance/cache-identity.mjs';
import { compileGuidance } from '../../../../../guidance/compile.mjs';

test('missing inode metadata requires a content-hash fallback', () => {
  const result = classifyFileStat('/selected.yml', {
    isFile: () => true,
    dev: 1n,
    ino: undefined,
    size: 5n,
    mtimeNs: 10n,
    ctimeNs: 10n,
  });
  assert.equal(result.decision, 'hash-and-recheck-tracking');
});

test('zero inode metadata requires a content-hash fallback', () => {
  const result = classifyFileStat('/selected.yml', {
    isFile: () => true,
    dev: 1n,
    ino: 0n,
    size: 5n,
    mtimeNs: 10n,
    ctimeNs: 10n,
  });
  assert.equal(result.decision, 'hash-and-recheck-tracking');
});

test('valid compilation makes a direct agent index without human prose', () => {
  const validation = {
    valid: true,
    catalogDigest: 'sha256:catalog',
    fingerprints: {
      entryDigests: [
        {
          id: 'action.bind',
          agentDigest: 'sha256:agent',
          humanDigest: 'sha256:human',
          entryDigest: 'sha256:entry',
        },
      ],
    },
    entries: [
      {
        id: 'action.bind',
        revision: 1,
        binds: { action_ids: ['bind'], guard_ids: [], remediation_ids: [] },
        agent: { instruction: [{ query: 'bind' }] },
        human: { summary: 'Bind', explanation: 'Human explanation' },
      },
    ],
  };
  const compiled = compileGuidance(validation);
  assert.deepEqual(compiled, compileGuidance(validation));
  assert.ok(compiled.agentIndex.byId['action.bind']);
  assert.equal(Object.hasOwn(compiled.agentIndex.byId['action.bind'], 'human'), false);
  assert.equal(JSON.stringify(compiled.agentIndex).includes('Human explanation'), false);
  assert.equal(compiled.humanCatalog.byId['action.bind'].explanation, 'Human explanation');
  assert.equal(compiled.diagnostics, null);
});
