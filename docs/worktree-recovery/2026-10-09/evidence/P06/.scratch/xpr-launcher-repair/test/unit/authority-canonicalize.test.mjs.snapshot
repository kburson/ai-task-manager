import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRANT_PARAMETER_FIELDS,
  canonicalGrantParameters,
  digestGrantParameters,
} from '../../src/authority/canonicalize.mjs';
import {
  GRANT_PARAMETER_FIELDS as PARSER_GRANT_PARAMETER_FIELDS,
  parseCommand,
} from '../../src/cli/parse.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

const vectors = [
  {
    action: 'pin-verifier',
    input: {
      verifier_fingerprint: digest('a'),
      assurance_grade: 'hardened',
      authority_policy: 'prevention-required',
      artifact_path: 'docs/spec.md',
      artifact_kind: 'spec',
      reviews_root: 'docs/reviews',
      path_template: 'docs/reviews/{artifact}-{review_id}',
      issue_id: 1537,
      maximum_turns: 10,
      commit_mode: 'normal',
    },
    json: '{"artifact_kind":"spec","artifact_path":"docs/spec.md","assurance_grade":"hardened","authority_policy":"prevention-required","commit_mode":"normal","issue_id":1537,"maximum_turns":10,"path_template":"docs/reviews/{artifact}-{review_id}","reviews_root":"docs/reviews","verifier_fingerprint":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
    digest: 'sha256:700819533e98a49006d1a941db6b90fa2ac487e5f1a70f95c6c5a74382954f67',
  },
  {
    action: 'continue',
    input: {
      resulting_effective_maximum: 12,
      additional_turns: 2,
      resume_role: 'reviewer',
      focus_path: null,
      focus_digest: null,
    },
    json: '{"additional_turns":2,"focus_digest":null,"focus_path":null,"resulting_effective_maximum":12,"resume_role":"reviewer"}',
    digest: 'sha256:60e7e2eae03f080cddd67ff27d3ff99bad07f9736a097f8090a4dcce864a87ca',
  },
  {
    action: 'supplement',
    input: { content_digest: digest('b'), target_role: 'author', target_turn: 3 },
    json: '{"content_digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","target_role":"author","target_turn":3}',
    digest: 'sha256:a3dd5e72fe2233a346ec823e708ffd075552ca6004ca171003ae1872027cf742',
  },
  {
    action: 'accept-over-objections',
    input: {
      artifact_path: 'docs/spec.md',
      artifact_blob: '1'.repeat(40),
      artifact_digest: digest('c'),
      final_round: 4,
      reviewer_response_path: 'docs/reviews/response.md',
      reviewer_response_digest: digest('e'),
      unresolved_finding_ids: ['R4-F001', 'R4-F003'],
      human_rationale_digest: digest('d'),
    },
    json: '{"artifact_blob":"1111111111111111111111111111111111111111","artifact_digest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","artifact_path":"docs/spec.md","final_round":4,"human_rationale_digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","reviewer_response_digest":"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","reviewer_response_path":"docs/reviews/response.md","unresolved_finding_ids":["R4-F001","R4-F003"]}',
    digest: 'sha256:19c6b19477538be409b8f9a07659730087868821db36dbbfb7c07b37856f7399',
  },
  {
    action: 'replace-participant',
    input: {
      role: 'reviewer',
      outgoing_claim_id: 'claim-old',
      outgoing_session_fingerprint: digest('1'),
      incoming_session_fingerprint: digest('f'),
    },
    json: '{"incoming_session_fingerprint":"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","outgoing_claim_id":"claim-old","outgoing_session_fingerprint":"sha256:1111111111111111111111111111111111111111111111111111111111111111","role":"reviewer"}',
    digest: 'sha256:4ca557ec5fca4b4ec8c0bb50eaaaa769085a8ee892fcd4a66e163df65e3d9bb9',
  },
];

test('pins exact domain-separated canonical bytes and digests for every protected action', () => {
  for (const vector of vectors) {
    const expected = `ai-peer-review.grant-parameters/v1\n${vector.json}`;
    assert.equal(canonicalGrantParameters(vector.action, vector.input).toString(), expected);
    assert.equal(digestGrantParameters(vector.action, vector.input), vector.digest);
  }
});

test('the parser and authority service share one deeply frozen field catalog', () => {
  assert.equal(PARSER_GRANT_PARAMETER_FIELDS, GRANT_PARAMETER_FIELDS);
  assert.equal(Object.isFrozen(GRANT_PARAMETER_FIELDS), true);
  assert.equal(Object.getPrototypeOf(GRANT_PARAMETER_FIELDS), null);
  for (const fields of Object.values(GRANT_PARAMETER_FIELDS))
    assert.equal(Object.isFrozen(fields), true);
});

test('rejects unknown, missing, extra, and prototype-key fields', () => {
  const valid = vectors[1].input;
  const prototypeKey = Object.assign(Object.create(null), valid);
  Object.defineProperty(prototypeKey, '__proto__', {
    enumerable: true,
    value: 'polluted',
  });
  for (const [action, value] of [
    ['unknown-action', valid],
    ['continue', { ...valid, focus_digest: undefined }],
    ['continue', { ...valid, surprise: true }],
    ['continue', prototypeKey],
  ]) {
    assert.throws(
      () => canonicalGrantParameters(action, value),
      (error) => error.code === 'APR_GRANT_PARAMETERS_INVALID'
    );
  }
  for (const action of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => canonicalGrantParameters(action, valid),
      (error) => error.code === 'APR_GRANT_PARAMETERS_INVALID'
    );
    assert.throws(
      () => parseCommand(['request-grant', 'workspace', '--action', action]),
      (error) => error.code === 'APR_USAGE'
    );
  }
});

test('rejects non-canonical strings, unsafe integers, and unsafe repository paths', () => {
  const base = vectors[0].input;
  for (const input of [
    { ...base, artifact_path: '/docs/spec.md' },
    { ...base, artifact_path: 'docs/../spec.md' },
    { ...base, artifact_path: 'docs\\spec.md' },
    { ...base, reviews_root: 'docs//reviews' },
    { ...base, path_template: 'docs/re\u0301views/{artifact}' },
    { ...base, issue_id: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, maximum_turns: 1.5 },
  ]) {
    assert.throws(
      () => canonicalGrantParameters('pin-verifier', input),
      (error) => error.code === 'APR_GRANT_PARAMETERS_INVALID'
    );
  }
});

test('requires paired explicit null focus fields and preserves ordered unique finding IDs', () => {
  assert.doesNotThrow(() =>
    canonicalGrantParameters('pin-verifier', { ...vectors[0].input, issue_id: null })
  );
  assert.throws(
    () => canonicalGrantParameters('continue', { ...vectors[1].input, focus_path: 'focus.md' }),
    (error) => error.code === 'APR_GRANT_PARAMETERS_INVALID'
  );
  assert.throws(
    () =>
      canonicalGrantParameters('accept-over-objections', {
        ...vectors[3].input,
        unresolved_finding_ids: ['R4-F001', 'R4-F001'],
      }),
    (error) => error.code === 'APR_GRANT_PARAMETERS_INVALID'
  );
  assert.equal(
    canonicalGrantParameters('accept-over-objections', {
      ...vectors[3].input,
      unresolved_finding_ids: ['R4-F003', 'R4-F001'],
    })
      .toString()
      .includes('["R4-F003","R4-F001"]'),
    true
  );
});
