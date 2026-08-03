// @story #1071
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  SINGLETON_KINDS,
  createIssueDirectory,
  parseIssueDirectory,
  renderIssueDirectory,
  singletonLogicalIdentity,
} from '../../../../lib/github-records/issue-directory.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1071;
const issueNodeId = 'I_kwDOpaqueIssueNode';
const singletons = {
  'delivery-contract': 'IC_kwDOpaqueDelivery',
  coordination: 'IC_kwDOpaqueCoordination',
  'evidence-projection': 'IC_kwDOpaqueEvidence',
  timing: 'IC_kwDOpaqueTiming',
};

test('version-1 directories canonicalize every required opaque singleton ID', () => {
  const directory = createIssueDirectory({ issueNodeId, singletons });
  const body = `## Stable story\n\n${renderIssueDirectory(directory)}\n`;

  assert.deepEqual(SINGLETON_KINDS, [
    'delivery-contract',
    'coordination',
    'evidence-projection',
    'timing',
  ]);
  assert.deepEqual(parseIssueDirectory({ issueBody: body }), directory);
  assert.equal(
    renderIssueDirectory(directory),
    '<!-- aitm-directory\n' +
      '{"issueNodeId":"I_kwDOpaqueIssueNode","revision":1,"schema":"aitm.directory/v1","singletons":{"coordination":"IC_kwDOpaqueCoordination","delivery-contract":"IC_kwDOpaqueDelivery","evidence-projection":"IC_kwDOpaqueEvidence","timing":"IC_kwDOpaqueTiming"}}\n' +
      '-->'
  );
  assert.ok(Object.isFrozen(directory));
  assert.ok(Object.isFrozen(directory.singletons));
});

test('singleton logical identities are deterministic and independent of node IDs or titles', () => {
  const identity = singletonLogicalIdentity({ repository, issue, kind: 'timing' });
  assert.equal(identity, 'aitm.singleton/v1:kburson/ai-task-manager#1071:timing');
  assert.equal(
    singletonLogicalIdentity({ repository, issue, kind: 'timing' }),
    identity,
    'a retry must derive the same identity without a comment position or title'
  );
  assert.notEqual(singletonLogicalIdentity({ repository, issue, kind: 'coordination' }), identity);
});

test('directory parsing fails closed for unknown versions, duplicate markers, duplicate IDs, and incomplete mappings', () => {
  const directory = createIssueDirectory({ issueNodeId, singletons });
  const rendered = renderIssueDirectory(directory);
  const incomplete = { ...singletons };
  delete incomplete.timing;
  const cases = [
    [rendered.replace('aitm.directory/v1', 'aitm.directory/v2'), 'unsupported'],
    [`${rendered}\n${rendered}`, 'duplicate'],
    [
      '<!-- aitm-directory\n' +
        JSON.stringify({
          ...directory,
          singletons: { ...singletons, timing: singletons.coordination },
        }) +
        '\n-->',
      'duplicate-singleton',
    ],
    [
      '<!-- aitm-directory\n' + JSON.stringify({ ...directory, singletons: incomplete }) + '\n-->',
      'invalid',
    ],
    ['<!-- aitm-directory\n{ not-json }\n-->', 'malformed'],
  ];

  for (const [marker, category] of cases) {
    assert.throws(
      () => parseIssueDirectory({ issueBody: `stable body\n${marker}` }),
      new RegExp(`issue-directory:${category}`)
    );
  }
});
