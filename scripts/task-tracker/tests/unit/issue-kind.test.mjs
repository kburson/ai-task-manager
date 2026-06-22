#!/usr/bin/env node
// @story #494
// Unit tests for the pure issue-kind module (#494): kind parsing,
// classification, marker presence helpers, and idempotent upsert round-trips.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_KIND,
  AUDIT_KINDS,
  VALID_KINDS,
  normalizeKind,
  parseIssueKind,
  isAuditKind,
  hasDeliverableMarker,
  isAcWaived,
  setIssueKindMarker,
} from '../../lib/issue-kind.mjs';

describe('normalizeKind', () => {
  it('lowercases + trims a valid kind', () => {
    assert.equal(normalizeKind('  Audit '), 'audit');
    assert.equal(normalizeKind('CODE'), 'code');
  });
  it('accepts every declared valid kind', () => {
    for (const k of VALID_KINDS) assert.equal(normalizeKind(k), k);
  });
  it('throws on an unknown kind', () => {
    assert.throws(() => normalizeKind('chore'), /invalid issue kind/);
    assert.throws(() => normalizeKind(''), /invalid issue kind/);
  });
});

describe('parseIssueKind / isAuditKind', () => {
  it('returns the default kind when no marker present', () => {
    assert.equal(parseIssueKind('## Body\n\nno marker'), DEFAULT_KIND);
    assert.equal(isAuditKind('## Body\n\nno marker'), false);
  });
  it('reads a quoted-attribute marker', () => {
    const body = 'top\n<!-- aitm-issue-kind kind="research" -->\nbottom';
    assert.equal(parseIssueKind(body), 'research');
    assert.equal(isAuditKind(body), true);
  });
  it('classifies every audit kind as audit-lane and code as not', () => {
    for (const k of AUDIT_KINDS) {
      assert.equal(isAuditKind(`<!-- aitm-issue-kind kind="${k}" -->`), true);
    }
    assert.equal(isAuditKind('<!-- aitm-issue-kind kind="code" -->'), false);
  });
  it('treats an unknown marker value as the default kind', () => {
    const body = '<!-- aitm-issue-kind kind="bogus" -->';
    assert.equal(parseIssueKind(body), DEFAULT_KIND);
    assert.equal(isAuditKind(body), false);
  });
});

describe('hasDeliverableMarker / isAcWaived', () => {
  it('detects a bare and a propertied deliverable marker', () => {
    assert.equal(hasDeliverableMarker('x <!-- aitm-deliverable-posted -->'), true);
    assert.equal(hasDeliverableMarker('<!-- aitm-deliverable-posted url="https://x" -->'), true);
    assert.equal(hasDeliverableMarker('nothing here'), false);
  });
  it('detects a waived AC label marker', () => {
    assert.equal(isAcWaived('- [x] analysis done <!-- aitm-ac-waived by="audit" -->'), true);
    assert.equal(isAcWaived('- [x] analysis done'), false);
  });
});

describe('setIssueKindMarker (idempotent upsert)', () => {
  it('inserts under the Progress Markers block when present', () => {
    const body = 'intro\n\n## AITM Progress Markers\n\n<!-- aitm-fields -->\n';
    const out = setIssueKindMarker(body, 'audit');
    assert.match(out, /## AITM Progress Markers\s*\n\s*<!-- aitm-issue-kind kind="audit" -->/);
  });
  it('appends at the end when no Progress Markers block', () => {
    const out = setIssueKindMarker('just a body', 'spike');
    assert.match(out, /<!-- aitm-issue-kind kind="spike" -->\s*$/);
  });
  it('is idempotent — re-applying the same kind does not duplicate', () => {
    const once = setIssueKindMarker('body', 'audit');
    const twice = setIssueKindMarker(once, 'audit');
    assert.equal(twice, once);
    assert.equal((twice.match(/aitm-issue-kind/g) || []).length, 1);
  });
  it('replaces an existing marker when the kind changes', () => {
    const a = setIssueKindMarker('body', 'audit');
    const b = setIssueKindMarker(a, 'research');
    assert.equal(parseIssueKind(b), 'research');
    assert.equal((b.match(/aitm-issue-kind/g) || []).length, 1);
  });
  it('setting kind back to code removes the marker', () => {
    const a = setIssueKindMarker('body', 'audit');
    const b = setIssueKindMarker(a, 'code');
    assert.equal(parseIssueKind(b), DEFAULT_KIND);
    assert.doesNotMatch(b, /aitm-issue-kind/);
  });
});
