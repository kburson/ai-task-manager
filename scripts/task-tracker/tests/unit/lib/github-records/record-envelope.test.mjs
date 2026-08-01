// @story #1069
// cspell:ignore accesstoken apikey authorizationheader clientsecret ghp githubtoken
// cspell:ignore noncanonical refreshtoken tokenenv

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { canonicalRecordJson } from '../../../../lib/github-records/canonical-json.mjs';
import {
  hashRecordPayload,
  parseAitmRecord,
  renderAitmRecord,
} from '../../../../lib/github-records/record-envelope.mjs';

const payload = {
  tags: ['x', 'y'],
  nested: { z: null, a: true },
  alpha: 1,
};

const payloadHash = 'sha256:ca8d1b5b789a19c4824724d92b02b568948fcfae437eb4c178f377da3faeb9ab';

const validEnvelope = {
  schema: 'aitm.record/v1',
  recordId: '01J00000000000000000000000',
  recordType: 'verification-evidence',
  repository: 'kburson/ai-task-manager',
  issue: 1069,
  createdAt: '2026-08-01T10:00:00.000Z',
  authority: {
    grantId: '01J00000000000000000000001',
    epoch: 4,
    actor: 'codex/session-1069',
  },
  predecessor: '01J00000000000000000000002',
  supersedes: null,
  payloadHash,
  payload,
};

function envelope(overrides = {}) {
  return { ...validEnvelope, ...overrides };
}

function render(overrides = {}, visibleMarkdown = 'Verified by the focused test.\n') {
  return renderAitmRecord({ envelope: envelope(overrides), visibleMarkdown });
}

function parse(body, overrides = {}) {
  return parseAitmRecord({
    commentNodeId: 'IC_kwDORecord1069',
    body,
    expectedRepository: 'kburson/ai-task-manager',
    expectedIssue: 1069,
    ...overrides,
  });
}

test('canonical durable JSON sorts nested object keys and preserves array order', () => {
  assert.equal(
    canonicalRecordJson(payload),
    '{"alpha":1,"nested":{"a":true,"z":null},"tags":["x","y"]}'
  );
  assert.equal(canonicalRecordJson({ b: 2, a: [{ d: 4, c: 3 }] }), '{"a":[{"c":3,"d":4}],"b":2}');
});

test('canonical durable JSON rejects values that JSON would erase or normalize ambiguously', () => {
  const sparse = [];
  sparse[1] = 'present';
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = {};
  Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 });

  for (const value of [
    undefined,
    1n,
    Symbol('value'),
    () => null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -0,
    new Date('2026-08-01T00:00:00.000Z'),
    new Map(),
    sparse,
    cyclic,
    accessor,
  ]) {
    assert.throws(() => canonicalRecordJson(value), /canonical-json:invalid/);
  }
});

test('payload hashes are stable SHA-256 vectors over canonical payload JSON only', () => {
  assert.equal(hashRecordPayload(payload), payloadHash);
  assert.equal(
    hashRecordPayload({ alpha: 1, nested: { a: true, z: null }, tags: ['x', 'y'] }),
    payloadHash
  );
});

test('a v1 envelope renders and parses as a deeply frozen correlated record', () => {
  const body = render();
  const parsed = parse(body);

  assert.match(body, /^<!-- aitm-record\n\{"authority":/);
  assert.deepEqual(parsed, {
    commentNodeId: 'IC_kwDORecord1069',
    envelope: validEnvelope,
  });
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.envelope));
  assert.ok(Object.isFrozen(parsed.envelope.authority));
  assert.ok(Object.isFrozen(parsed.envelope.payload));
  assert.ok(Object.isFrozen(parsed.envelope.payload.tags));
});

test('ordinary visible Markdown changes cannot alter structured authority', () => {
  const first = parse(render({}, 'First presentation.\n'));
  const second = parse(render({}, 'Completely different presentation.\n- [x] Cosmetic\n'));
  const manuallyEdited = parse(
    render({}, 'First presentation.\n').replace(
      'First presentation.',
      'Presentation edited without changing the structured record.'
    )
  );

  assert.deepEqual(first, second);
  assert.deepEqual(first, manuallyEdited);
  assert.equal(first.envelope.payloadHash, payloadHash);
});

test('root and authority objects require their exact v1 key sets', () => {
  const { payloadHash: _missing, ...missingRoot } = validEnvelope;
  const rootCases = [missingRoot, { ...validEnvelope, invented: true }];
  const authorityCases = [
    { ...validEnvelope.authority, extra: true },
    { grantId: validEnvelope.authority.grantId, epoch: 4 },
  ];

  for (const invalidEnvelope of rootCases) {
    assert.throws(
      () => renderAitmRecord({ envelope: invalidEnvelope, visibleMarkdown: '' }),
      /record-envelope:keys/
    );
  }
  for (const authority of authorityCases) {
    assert.throws(() => render({ authority }), /record-envelope:authority-keys/);
  }
});

test('schema dispatch and common field validation fail closed', () => {
  const invalidCases = [
    [{ schema: 'aitm.record/v2' }, /record-envelope:unsupported-schema/],
    [{ recordId: '' }, /record-envelope:record-id/],
    [{ recordType: 'Verification Evidence' }, /record-envelope:record-type/],
    [{ repository: 'not-a-repository' }, /record-envelope:repository/],
    [{ issue: 0 }, /record-envelope:issue/],
    [{ createdAt: '2026-08-01' }, /record-envelope:created-at/],
    [{ authority: { ...validEnvelope.authority, epoch: 0 } }, /record-envelope:authority-epoch/],
    [{ predecessor: '' }, /record-envelope:predecessor/],
    [{ supersedes: 42 }, /record-envelope:supersedes/],
    [{ payloadHash: 'sha256:nope' }, /record-envelope:payload-hash/],
  ];

  for (const [overrides, expectedError] of invalidCases) {
    assert.throws(() => render(overrides), expectedError);
  }
});

test('rendering rejects recursively nested secret-bearing keys and credential values', () => {
  const secretPayloads = [
    { nested: { my_github_token: 'redacted' } },
    { github_token_backup: 'redacted' },
    { my_refresh_token: 'redacted' },
    { token_env_name: 'redacted' },
    { database_credentials: 'redacted' },
    { session_credentials: 'redacted' },
    { client_secret_backup: 'redacted' },
    { database_password: 'redacted' },
    { authorizationHeader: 'redacted' },
    { authorizationBackup: 'redacted' },
    { sessionCookie: 'redacted' },
    { sessionCookieBackup: 'redacted' },
    { sessionCookies: 'redacted' },
    { cookieBackup: 'redacted' },
    { sessionCookieValue: 'redacted' },
    { 'x-api-key': 'redacted' },
    { apikey: 'redacted' },
    { APIKEY: 'redacted' },
    { privateKey: 'redacted' },
    { privatekey: 'redacted' },
    { clientsecret: 'redacted' },
    { authorizationheader: 'redacted' },
    { githubtoken: 'redacted' },
    { refreshtoken: 'redacted' },
    { accesstoken: 'redacted' },
    { tokenenv: 'redacted' },
    { bearerToken: 'redacted' },
    { oauthToken: 'redacted' },
    { secretToken: 'redacted' },
    { secretValue: 'redacted' },
    { note: 'Bearer abcdefghijk' },
    { note: 'ghp_1234567890abcdefghijklmnop' },
    { note: 'Read the token environment name from GH_TOKEN.' },
    { note: 'Read the token environment name from gh_token.' },
    { note: '-----BEGIN PRIVATE KEY-----' },
  ];

  for (const secretPayload of secretPayloads) {
    const secretEnvelope = envelope({
      payload: secretPayload,
      payloadHash: hashRecordPayload(secretPayload),
    });
    assert.throws(
      () => renderAitmRecord({ envelope: secretEnvelope, visibleMarkdown: '' }),
      /record-envelope:secret/
    );
  }
  assert.throws(() => render({}, 'Authorization: Bearer abcdefghijk'), /record-envelope:secret/);
});

test('secret scanning permits ordinary policy and token-accounting fields', () => {
  const ordinaryPayload = {
    passwordPolicy: 'Rotate credentials regularly.',
    tokenCount: 42,
    fortuneCookie: 'Ship small slices.',
    priorAuthorization: 'superseded',
    credentialPolicy: 'Do not publish credentials.',
    apiKeyPolicy: 'Use repository secrets.',
    sessionCookiePolicy: 'Do not persist session cookies.',
    note: 'The bearer responsibility remains with the coordinator.',
  };
  const body = render({
    payload: ordinaryPayload,
    payloadHash: hashRecordPayload(ordinaryPayload),
  });

  assert.deepEqual(parse(body).envelope.payload, ordinaryPayload);
});

test('parsing rejects secret signatures introduced into visible Markdown', () => {
  const safeBody = render({}, 'Ordinary presentation.');
  for (const visibleMarkdown of [
    'Bearer abcdefghijk',
    'ghp_1234567890abcdefghijklmnop',
    'Environment variable GH_TOKEN',
    'Environment variable gh_token',
    '-----BEGIN PRIVATE KEY-----',
  ]) {
    assert.throws(
      () => parse(safeBody.replace('Ordinary presentation.', visibleMarkdown)),
      /record-envelope:secret/
    );
  }
  assert.doesNotThrow(() =>
    parse(safeBody.replace('Ordinary presentation.', 'The bearer responsibility remains clear.'))
  );
});

test('record references require canonical uppercase ULIDs and cannot self-link', () => {
  const invalidCases = [
    [{ recordId: 'short' }, /record-envelope:record-id/],
    [{ recordId: '01j00000000000000000000000' }, /record-envelope:record-id/],
    [{ recordId: '81J00000000000000000000000' }, /record-envelope:record-id/],
    [{ authority: { ...validEnvelope.authority, grantId: 'short' } }, /authority-grant-id/],
    [{ predecessor: 'short' }, /record-envelope:predecessor/],
    [{ supersedes: 'short' }, /record-envelope:supersedes/],
    [{ predecessor: validEnvelope.recordId }, /record-envelope:self-link/],
    [{ supersedes: validEnvelope.recordId }, /record-envelope:self-link/],
    [
      { authority: { ...validEnvelope.authority, grantId: validEnvelope.recordId } },
      /record-envelope:self-link/,
    ],
  ];

  for (const [overrides, expectedError] of invalidCases) {
    assert.throws(() => render(overrides), expectedError);
  }
  assert.doesNotThrow(() => render({ predecessor: null, supersedes: null }));
});

test('canonical JSON rejects excessive nesting with a categorized error', () => {
  let nested = 'leaf';
  for (let depth = 0; depth < 80; depth += 1) nested = { nested };

  assert.throws(() => canonicalRecordJson(nested), /canonical-json:invalid:nesting/);
  const nestedPayloadEnvelope = envelope({
    payload: nested,
    payloadHash,
  });
  assert.throws(
    () => renderAitmRecord({ envelope: nestedPayloadEnvelope, visibleMarkdown: '' }),
    /canonical-json:invalid:nesting/
  );
});

test('canonical JSON rejects ill-formed Unicode strings and keys', () => {
  const loneHighSurrogate = '\ud800';
  assert.throws(() => canonicalRecordJson(loneHighSurrogate), /canonical-json:invalid:unicode/);
  assert.throws(
    () => canonicalRecordJson({ [loneHighSurrogate]: 'value' }),
    /canonical-json:invalid:unicode/
  );
});

test('marker syntax is bounded and exactly one complete record is required', () => {
  for (const body of [
    'Visible text only',
    '<!-- aitm-record\n{}',
    `Visible prefix\n${render()}`,
    `${render()}\n${render()}`,
    `<!-- aitm-record\n${' '.repeat(262_145)}{}\n-->`,
  ]) {
    assert.throws(() => parse(body), /record-envelope:(missing|malformed|duplicate|too-large)/);
  }
  const unsafePayload = { note: 'closes --> the marker' };
  assert.throws(
    () => render({ payload: unsafePayload, payloadHash: hashRecordPayload(unsafePayload) }),
    /record-envelope:unsafe-comment/
  );
  assert.throws(
    () => render({}, 'Visible text must not inject <!-- aitm-record\n{}\n-->'),
    /record-envelope:unsafe-comment/
  );
});

test('embedded JSON must already be canonical, which rejects duplicate members', () => {
  const body = render();
  const canonicalJson = canonicalRecordJson(validEnvelope);
  const prettyBody = body.replace(canonicalJson, JSON.stringify(validEnvelope, null, 2));
  const duplicateBody = body.replace(
    '"schema":"aitm.record/v1"',
    '"schema":"aitm.record/v2","schema":"aitm.record/v1"'
  );

  assert.throws(() => parse(prettyBody), /record-envelope:noncanonical/);
  assert.throws(() => parse(duplicateBody), /record-envelope:noncanonical/);
});

test('malformed JSON and secret-bearing parsed records fail closed', () => {
  assert.throws(() => parse('<!-- aitm-record\n{"schema":}\n-->'), /record-envelope:malformed/);

  const secretPayload = { nested: { clientSecret: 'redacted' } };
  const secretEnvelope = envelope({
    payload: secretPayload,
    payloadHash: hashRecordPayload(secretPayload),
  });
  const rawBody = `<!-- aitm-record\n${canonicalRecordJson(secretEnvelope)}\n-->`;
  assert.throws(() => parse(rawBody), /record-envelope:secret/);
});

test('hash tampering and caller correlation mismatches fail closed', () => {
  const invalidHashEnvelope = envelope({ payloadHash: `sha256:${'0'.repeat(64)}` });
  assert.throws(
    () => renderAitmRecord({ envelope: invalidHashEnvelope, visibleMarkdown: '' }),
    /record-envelope:hash-mismatch/
  );
  const tamperedBody = `<!-- aitm-record\n${canonicalRecordJson(invalidHashEnvelope)}\n-->`;
  assert.throws(() => parse(tamperedBody), /record-envelope:hash-mismatch/);
  assert.throws(
    () => parse(render(), { expectedRepository: 'other/repository' }),
    /record-envelope:repository-mismatch/
  );
  assert.throws(() => parse(render(), { expectedIssue: 1070 }), /record-envelope:issue-mismatch/);
  assert.throws(() => parse(render(), { commentNodeId: '' }), /record-envelope:comment-node-id/);
});
