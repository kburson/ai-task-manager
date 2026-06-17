#!/usr/bin/env node
// @story #300
// #300 — `assertFieldsPersisted` must not be fooled by prose placeholders
// shaped like `<!-- aitm-fields: {...} -->`. It delegates to
// `parseIssueFieldDb`, whose line-anchored, last-match regex ignores
// non-column-0 mentions.
//
// Three sub-tests, exercising `parseIssueFieldDb` directly (the same
// function `assertFieldsPersisted` now delegates to). End-to-end coverage of
// the close path lives in close-gates / close-verb suites — this file pins
// the parser invariant that #298 broke.
import { strict as assert } from 'node:assert';
import { parseIssueFieldDb } from '../issue-field-db.mjs';

const REAL_TRAILER =
  '<!-- aitm-fields: {"schema":1,"values":{"engagedTime":42,"sessionTime":50}} -->';

// 1) Body with a decoy prose placeholder BEFORE the real trailer →
//    last-match wins, values come from the real trailer.
{
  const body = [
    '## Scope',
    'Earlier we wrote `<!-- aitm-fields: {"schema":1,"values":{...}} -->` into prose by mistake.',
    '',
    REAL_TRAILER,
    '',
  ].join('\n');
  const r = parseIssueFieldDb(body);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.values.engagedTime, 42);
  assert.equal(r.values.sessionTime, 50);
}

// 2) Body with ONLY the decoy prose placeholder → parser rejects it
//    (mid-line `{...}` literal fails the `^[ \t]*` line anchor, so the
//    trailer is "missing"; close would then throw the "marker missing" error).
{
  const body = [
    '## Scope',
    'Earlier we wrote `<!-- aitm-fields: {"schema":1,"values":{...}} -->` into prose by mistake.',
    '',
  ].join('\n');
  const r = parseIssueFieldDb(body);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
}

// 3) Body with a column-0 BUT malformed trailer → parser fails with
//    `invalid-json` so the close path raises "malformed" with a useful
//    diagnostic.
{
  const body = ['## Scope', '', '<!-- aitm-fields: {"schema":1,"values":{...}} -->', ''].join('\n');
  const r = parseIssueFieldDb(body);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-json');
}

// 4) Well-formed trailer with engagedTime: null → parser succeeds, but
//    `assertFieldsPersisted`'s post-check (engagedTime != null) is what
//    raises. This test pins the parser contract.
{
  const body = [
    '## Scope',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null}} -->',
    '',
  ].join('\n');
  const r = parseIssueFieldDb(body);
  assert.equal(r.ok, true);
  assert.equal(r.values.engagedTime, null);
}

console.log('assert-fields-persisted.test.mjs: all passed');
