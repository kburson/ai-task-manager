// @story #1069 #1091
// cspell:ignore aaaaation aaaaaaaaability abcdefghically accesstoken apikey authorizationbackup authorizationdecisionpersonalpatbackup authorizationheader authorizationtoken authconfig authtoken authtokenbackup backupauthconfig backupcredentials backuppat backuppatdata bearercredential clientpassword clientsecret cookiebackup customauthmaterial databaseauth databaseauthbackup databasecredentials databasepasswd databasepassword databasepatvalue credentialsbackup ghp githubtoken gitlabtoken gitlabtokenbackup idtoken idtokenbackup myauthbackup mypat mypatbackup noncanonical npmtoken npmtokenbackup passwordbackup passwordment passwordpassword passwordpolicymypatbackup personalpat personalpatbackup qwertyization qwertyuiopa qwertyuiopasdfgh qwertyware randomtoken randomware redactedredacted refreshtoken secretization secretsecretsecret secrettion secretword sessionauth sessionauthconfig sessionauthdata sessioncookie sessioncookiebackup sessioncookies sessioncookievalue sessionpatconfig sessiontoken sessiontokenbackup tokencountdatabaseauthbackup tokenenv tokenvalue zxcvbnmasd zxcvbnment zzzzability
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { canonicalRecordJson } from '../../../../lib/github-records/canonical-json.mjs';
import {
  hashRecordPayload,
  parseAitmRecord,
  renderAitmRecord,
} from '../../../../lib/github-records/record-envelope.mjs';
const payload = { tags: ['x', 'y'], nested: { z: null, a: true }, alpha: 1 };
const payloadHash = 'sha256:ca8d1b5b789a19c4824724d92b02b568948fcfae437eb4c178f377da3faeb9ab';
const bearerSecretNouns =
  `token tokens scheme authentication credential credentials policy security header headers guidance responsibility`.split(
    ' '
  );
const tokenLikeBearerCandidates =
  `abc abc.def abcdefghijklmnop qwertyuiopasdfgh qwertyuiopa zxcvbnmasd qwerty secretword randomtoken aaaaa redactedredacted passwordpassword secretsecretsecret aaaaaaaaaaaaaaaa tokenvalue qwertyization zxcvbnment secretization aaaaaaaaability qwertyware abcdefghically secrettion passwordment randomware aaaaation zzzzability`.split(
    ' '
  );
const credentialSignatures = [
  ...`
    bearer abcdefghijklmnop | Bearer abcdefghijklmnop | BEARER abcdefghijklmnop | bEaReR abcdefghijklmnop | Bearer abcdefghijk | - Bearer abcdefghijklmnop
    > Bearer abcdefghijklmnop | credential: Bearer abcdefghijklmnop | Use Bearer abcdefghijklmnop for request | Bearer abcdefghijklmnop suffix text
    curl -H "Authorization: Bearer abcdefghijklmnop" https://example.invalid | \`Authorization: Bearer abcdefghijklmnop\` | Authorization: Bearer
    Authorization: Bearer responsibility | Bearer tokenvalue | credential: Bearer token is active | > - Bearer token is active | - [ ] Bearer token is active
    credential = Bearer token is active | Authorization = Bearer token is active | credential: **Bearer token** | Authorization: \`Bearer token\`
    credential: The Bearer token | - The Bearer token | > The Bearer credential | credential: (Bearer token) | - **Bearer token**
    "credential": "Bearer token is active" | Authorization: The Bearer token | credential:\n  Bearer token is active | authorization: >-\n  Bearer token is active
    token: Bearer token is active | auth = Bearer token is active | accessToken: Bearer token | - current Bearer token is active | > leaked Bearer token
    credential: leaked Bearer token | {"kind":{"credential":"Bearer token is active"}} | credential: The The Bearer token | - current **The Bearer token**
    **token**: current Bearer token is active | Bearer \`abcdefghijklmnop\` | Bearer "abcdefghijklmnop" | Bearer 'abcdefghijklmnop' |
    Bearer **abcdefghijklmnop** | Bearer (abcdefghijklmnop) | Bearer [abcdefghijklmnop] | Bearer <abcdefghijklmnop> | Bearer ***abcdefghijklmnop*** | Bearer \`\`abcdefghijklmnop\`\` | Bearer \`\`\`abcdefghijklmnop\`\`\` | Bearer {abcdefghijklmnop} | Bearer (**abcdefghijklmnop**) | Bearer [**abcdefghijklmnop**] | Bearer ( abcdefghijklmnop ) | Bearer ** abcdefghijklmnop **
  `
    .trim()
    .split(/\s*\|\s*/),
  ...bearerSecretNouns.flatMap((noun) =>
    ['', '- ', 'credential: '].map((prefix) => `${prefix}Bearer ${noun}`)
  ),
  ...tokenLikeBearerCandidates.flatMap((candidate) => [
    `The Bearer ${candidate}`,
    `A Bearer ${candidate}`,
    `Use a Bearer ${candidate} for request`,
    `Use the Bearer ${candidate} for request`,
    `credential: Bearer ${candidate} is active`,
    `- Bearer ${candidate} is active`,
    `Bearer ${candidate} is active`,
    `Bearer ${candidate} was accepted`,
    `Bearer ${candidate} remains valid`,
    `Review Bearer ${candidate} settings`,
  ]),
  ...`ghp_1234567890abcdefghijklmnop | Environment variable GH_TOKEN
    | Environment variable gh_token | -----BEGIN PRIVATE KEY-----`.split(/\s*\|\s*/),
];
const ambiguousBearerProse =
  `The bearer responsibility remains clear. | The Bearer responsibility remains clear. | Bearer tokens are prohibited. | The bearer scheme is documented. | Bearer authentication is enabled. | Bearer credentials must not be logged. | Bearer policy is documented. | Bearer security is documented. | Bearer headers are redacted. | The Bearer responsibility. | Bearer security, policy, and headers are documented. | Review bearer authentication settings. | Bearer policy documentation is available. | Bearer security guidance follows. | Bearer token handling is documented. | Bearer credential handling is documented. | Bearer header handling is documented. | Bearer guidance is available. | Bearer cryptographically derived values are prohibited. | Bearer decentralization guidance follows. | Explain bearer interoperability requirements. | Bearer standards remain documented. | Review bearer transport requirements. | The bearer implementation is documented. | Bearer middleware should redact credentials. | Document bearer compatibility guidance. | Bearer usage is documented. | Bearer handling remains documented. | Bearer support is available. | Bearer processing behavior is documented. | Bearer behavior remains documented. | Bearer flows are documented. | Bearer mechanism is documented.`.split(
    /\s*\|\s*/
  );
credentialSignatures.push(...ambiguousBearerProse);
const ordinarySafeProse = ['Ordinary policy documentation remains available.'];
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
  const largeArray = Array.from({ length: 12_000 }, (_, index) => index);
  const largeObject = Object.fromEntries(
    largeArray.map((index) => [`key${String(index).padStart(5, '0')}`, index])
  );
  assert.equal(JSON.parse(canonicalRecordJson(largeArray)).length, largeArray.length);
  assert.deepEqual(JSON.parse(canonicalRecordJson(largeObject)), largeObject);
});
test('canonical durable JSON rejects values that JSON would erase or normalize ambiguously', () => {
  const sparse = [];
  sparse[1] = 'present';
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = {};
  Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 });
  const arrayWithExtraProperty = ['present'];
  arrayWithExtraProperty.extra = true;
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
    arrayWithExtraProperty,
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
test('record comment transport round-trips benign double-hyphen command arguments', () => {
  const commandPayload = { ...payload, command: { executable: 'node', args: ['--test'] } };
  const body = render({
    payload: commandPayload,
    payloadHash: hashRecordPayload(commandPayload),
  });

  assert.match(body, /-\\u002dtest/);
  assert.deepEqual(parse(body).envelope.payload, commandPayload);
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
  for (const actor of [
    'Bearer abcdefghijklmnop',
    'ghp_1234567890abcdefghijklmnop',
    'GH_TOKEN',
    '-----BEGIN PRIVATE KEY-----',
  ]) {
    const secretEnvelope = envelope({ authority: { ...validEnvelope.authority, actor } });
    assert.throws(() => render({ authority: secretEnvelope.authority }), /record-envelope:secret/);
    const transportJson = canonicalRecordJson(secretEnvelope).replaceAll('--', '-\\u002d');
    const rawBody = `<!-- aitm-record\n${transportJson}\n-->`;
    assert.throws(() => parse(rawBody), /record-envelope:secret/);
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

test('known estimation record types fail closed when their payload schema is unknown', () => {
  const estimationPayload = { schema: 'aitm.estimation-forecast/v2', issue: 1069 };
  assert.throws(
    () =>
      renderAitmRecord({
        envelope: envelope({
          recordType: 'estimation-forecast',
          payload: estimationPayload,
          payloadHash: hashRecordPayload(estimationPayload),
        }),
      }),
    /estimation-record:forecast-schema/
  );
});
test('rendering rejects recursively nested secret-bearing keys and credential values', () => {
  const secretKeys = `
    github_token_backup my_refresh_token token_env_name database_credentials session_credentials client_secret_backup database_password authorizationHeader authorizationBackup sessionCookie
    sessionCookieBackup sessionCookies cookieBackup sessionCookieValue x-api-key apikey APIKEY privateKey privatekey clientsecret authorizationheader githubtoken refreshtoken accesstoken
    tokenenv bearerToken oauthToken secretToken secretValue authHeader AUTH_HEADER authHeaderBackup basicAuth authValue githubPat githubPAT github_pat bearer bearerValue
    authorizationbackup sessioncookiebackup sessioncookies sessioncookievalue sessioncookie cookiebackup databasecredentials credentialsbackup backupcredentials databasepassword
    databasepasswd passwordbackup clientpassword authtoken authtokenbackup authorizationtoken sessiontoken sessiontokenbackup idtoken idtokenbackup npmtoken npmtokenbackup gitlabtoken gitlabtokenbackup bearercredential
    auth AUTH authBackup authData pat PAT patBackup ghPat gitPat priorAuthorizationHeader authorizationDecisionHeader databaseAuth databaseauth sessionAuth sessionauth myPat mypat backupPat backuppat personalPat
    personalpat patConfig patMaterial patString patRecord ghPatConfig ghPatMaterial gitPatConfig gitPatMaterial passwordPolicyMyPat passwordPolicyBackupPat tokenCountMyPat authorizationDecisionMyPat
    databaseauthbackup sessionauthdata mypatbackup personalpatbackup backupauthconfig databasepatvalue sessionpatconfig backuppatdata myauthbackup sessionauthconfig customauthmaterial
    passwordpolicymypatbackup tokencountdatabaseauthbackup authorizationdecisionpersonalpatbackup patternAuthBackup authorPatBackup authenticationHeader authenticationValue authenticationMaterial authenticationData
    authenticationBackup authenticationKey authConfigurationHeader authPolicyHeader headerAuthentication valueAuthentication materialAuthentication dataAuthentication backupAuthentication keyAuthentication headerAuthConfiguration headerAuthPolicy
    authorName authorityLabel patternName pathName patientId authenticationMode authPolicy authorship authorized authMode authConfiguration patentId patioMode patchVersion dispatchMode compatMode
    filePath relativePath myPatternName securityPatchVersion backgroundDispatchStatus primaryPatientId coauthorName userAuthorship primaryAuthorityLabel legacyAuthenticationMode coAuthorityLabel
    empathyScore spatialIndex repatriationStatus tokenCountAuthor tokenCountAuthority tokenCountPath passwordPolicyAuthenticationMode passwordPolicyPattern fortuneCookieAuthPolicy
    authorizationDecisionAuthor patternPatience dispatchPattern authenticationPolicy patronName paternityStatus patriarchName patellaStatus authenticityScore authenticationMetadata
    authenticationKeynote authorKeynoteTitle patternMaterialityScore pathMetadata pathDatabaseName authenticationTokenCount authenticationPasswordPolicy authenticationCredentialPolicy
    authenticationSessionCookiePolicy authPolicyTokenCount
  `
    .trim()
    .split(/\s+/);
  const secretPayloads = [
    { nested: { my_github_token: 'redacted' } },
    { ['auth'.repeat(40_000)]: 'redacted' },
    { note: 'Bearer token '.repeat(12_000) },
    ...secretKeys.map((key) => ({ [key]: 'redacted' })),
    ...credentialSignatures.map((note) => ({ note })),
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
  const safeKeys = `
    passwordPolicy tokenCount fortuneCookie priorAuthorization credentialPolicy apiKeyPolicy
    sessionCookiePolicy inputTokenCount output_token_count tokenCountTotal passwordPolicyVersion
    priorAuthorizationState authorizationDecision credentialPolicyVersion apiKeyPolicyName
    sessionCookiePolicyVersion fortuneCookieMessage secretaryName tokenizerMode tokenCountByModel
    passwordPolicyName fortuneCookieRecipe priorAuthorizationDecision authorizationDecisionReason
    credentialPolicyName apiKeyPolicyVersion sessionCookiePolicyName
  `
    .trim()
    .split(/\s+/);
  const ordinaryPayload = Object.fromEntries(safeKeys.map((key) => [key, 'safe']));
  for (const note of ordinarySafeProse) {
    const safePayload = { ...ordinaryPayload, note };
    const body = render({ payload: safePayload, payloadHash: hashRecordPayload(safePayload) });
    assert.deepEqual(parse(body).envelope.payload, safePayload);
  }
});
test('parsing rejects secret signatures introduced into visible Markdown', () => {
  const safeBody = render({}, 'Ordinary presentation.');
  for (const visibleMarkdown of credentialSignatures) {
    assert.throws(
      () => parse(safeBody.replace('Ordinary presentation.', visibleMarkdown)),
      /record-envelope:secret/
    );
  }
  for (const prose of ordinarySafeProse) {
    assert.doesNotThrow(() => parse(safeBody.replace('Ordinary presentation.', prose)));
  }
  const unsafeSafeFamily = { passwordPolicyToken: 'redacted' };
  assert.throws(
    () =>
      render({
        payload: unsafeSafeFamily,
        payloadHash: hashRecordPayload(unsafeSafeFamily),
      }),
    /record-envelope:secret/
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
  const unsafeEnvelope = envelope({
    payload: unsafePayload,
    payloadHash: hashRecordPayload(unsafePayload),
  });
  const escapedUnsafeJson = canonicalRecordJson(unsafeEnvelope).replaceAll('--', '-\\u002d');
  assert.throws(
    () => parse(`<!-- aitm-record\n${escapedUnsafeJson}\n-->`),
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
