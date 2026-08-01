#!/usr/bin/env node
// @story #1068

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { locateAuthoritySource } from '../../../../lib/github-records/authority-locator.mjs';

const legacyBody = readFileSync(
  new URL('../../../fixtures/github-records/legacy-body-contract.md', import.meta.url),
  'utf8'
);

const validDirectory = {
  schema: 'aitm.directory/v1',
  revision: 1,
  issueNodeId: 'I_kwDOAuthority',
  singletons: {
    'delivery-contract': 'IC_kwDODelivery',
    coordination: 'IC_kwDOCoordination',
    'evidence-projection': 'IC_kwDOEvidences',
    timing: 'IC_kwDOTiming',
  },
};

function bodyWithDirectory(directory = validDirectory) {
  return `${legacyBody}\n<!-- aitm-directory\n${JSON.stringify(directory, null, 2)}\n-->\n`;
}

test('legacy fixture remains a body-governed authority source', () => {
  assert.match(legacyBody, /^## Acceptance Criteria$/m);
  assert.match(legacyBody, /^### Lifecycle \(auto-ticked at Review\/Close\)$/m);
  assert.match(legacyBody, /<!-- aitm-fields:/);
  assert.deepEqual(locateAuthoritySource({ issueBody: legacyBody }), { kind: 'legacy-body/v1' });
});

test('a complete v1 directory resolves to frozen github-record authority', () => {
  const source = locateAuthoritySource({ issueBody: bodyWithDirectory() });
  assert.deepEqual(source, { kind: 'github-records/v1', directory: validDirectory });
  assert.ok(Object.isFrozen(source));
  assert.ok(Object.isFrozen(source.directory));
  assert.ok(Object.isFrozen(source.directory.singletons));
});

test('duplicate directories fail closed', () => {
  assert.throws(
    () => locateAuthoritySource({ issueBody: `${bodyWithDirectory()}${bodyWithDirectory()}` }),
    /authority-directory:duplicate/
  );
});

test('malformed or unterminated directory JSON fails closed', () => {
  for (const issueBody of [
    `${legacyBody}\n<!-- aitm-directory\n{ not-json }\n-->`,
    `${legacyBody}\n<!-- aitm-directory\n${JSON.stringify(validDirectory)}`,
  ]) {
    assert.throws(() => locateAuthoritySource({ issueBody }), /authority-directory:malformed/);
  }
});

test('unknown directory schemas fail closed', () => {
  assert.throws(
    () =>
      locateAuthoritySource({
        issueBody: bodyWithDirectory({ ...validDirectory, schema: 'aitm.directory/v2' }),
      }),
    /authority-directory:unsupported/
  );
});

test('a directory without the complete v1 singleton mapping fails closed', () => {
  const { timing: _timing, ...singletons } = validDirectory.singletons;
  assert.throws(
    () =>
      locateAuthoritySource({ issueBody: bodyWithDirectory({ ...validDirectory, singletons }) }),
    /authority-directory:invalid/
  );
});
