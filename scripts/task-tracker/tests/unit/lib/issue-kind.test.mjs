#!/usr/bin/env node
// @story #494
// Unit tests for the pure issue-kind module (#494): kind parsing,
// classification, marker presence helpers, and idempotent upsert round-trips.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_KIND,
  AUDIT_KINDS,
  NO_COMMIT_KINDS,
  TESTLESS_KINDS,
  VALID_KINDS,
  normalizeKind,
  parseIssueKind,
  isAuditKind,
  isNoCommitKind,
  isTestlessKind,
  expectsAutomatedTests,
  hasDeliverableMarker,
  hasEpicAcReconciledMarker,
  hasNoNewTestsDeclaration,
  isAcWaived,
  setIssueKindMarker,
} from '../../../lib/issue-kind.mjs';

function progressMarkers(...markers) {
  return ['## Problem', '', 'prose', '', '## AITM Progress Markers', '', ...markers].join('\n');
}

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

describe('parseIssueKind / isNoCommitKind', () => {
  it('returns the default kind when no marker present', () => {
    assert.equal(parseIssueKind('## Body\n\nno marker'), DEFAULT_KIND);
    assert.equal(isNoCommitKind('## Body\n\nno marker'), false);
  });
  it('reads a quoted-attribute marker from the Progress Markers section', () => {
    const body = progressMarkers('<!-- aitm-issue-kind kind="research" -->');
    assert.equal(parseIssueKind(body), 'research');
    assert.equal(isNoCommitKind(body), true);
  });
  it('classifies every no-commit kind as no-commit-lane and code as not', () => {
    for (const k of NO_COMMIT_KINDS) {
      assert.equal(isNoCommitKind(progressMarkers(`<!-- aitm-issue-kind kind="${k}" -->`)), true);
    }
    assert.equal(isNoCommitKind(progressMarkers('<!-- aitm-issue-kind kind="code" -->')), false);
  });
  it('treats an unknown marker value as the default kind', () => {
    const body = progressMarkers('<!-- aitm-issue-kind kind="bogus" -->');
    assert.equal(parseIssueKind(body), DEFAULT_KIND);
    assert.equal(isNoCommitKind(body), false);
  });
  it('#963 ignores a prose-quoted issue-kind marker outside Progress Markers', () => {
    const body = [
      '## Problem',
      '',
      'Issue #899 documents that `kind-prefix.mjs` stamps `<!-- aitm-issue-kind kind="epic" -->` when creating epics.',
      '',
      '## Scope',
      '',
      'No live issue-kind marker appears in the Progress Markers section.',
      '',
      '## AITM Progress Markers',
      '',
      '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    ].join('\n');
    assert.equal(parseIssueKind(body), DEFAULT_KIND);
    assert.equal(isNoCommitKind(body), false);
    assert.equal(isAuditKind(body), false);
  });
  it('#963 ignores an issue-kind marker without Progress Markers', () => {
    assert.equal(
      parseIssueKind('top\n<!-- aitm-issue-kind kind="research" -->\nbottom'),
      DEFAULT_KIND
    );
  });
});

describe('#500 — epic joins the no-commit lane', () => {
  it('epic is a valid kind', () => {
    assert.equal(normalizeKind('EPIC'), 'epic');
    assert.ok(VALID_KINDS.has('epic'));
    assert.ok(NO_COMMIT_KINDS.has('epic'));
  });
  it('an epic-marked body routes to the no-commit lane', () => {
    const body = progressMarkers('<!-- aitm-issue-kind kind="epic" -->');
    assert.equal(parseIssueKind(body), 'epic');
    assert.equal(isNoCommitKind(body), true);
  });
  it('the deprecated isAuditKind alias still reports epic as true', () => {
    assert.equal(isAuditKind(progressMarkers('<!-- aitm-issue-kind kind="epic" -->')), true);
  });
  it('AUDIT_KINDS is the same frozen set as NO_COMMIT_KINDS (back-compat alias)', () => {
    assert.equal(AUDIT_KINDS, NO_COMMIT_KINDS);
    assert.ok(AUDIT_KINDS.has('epic'));
  });
});

describe('#923 — docs-only kind: commit-bearing but testless', () => {
  const DOCS_ONLY_BODY = progressMarkers('<!-- aitm-issue-kind kind="docs-only" -->');

  it('docs-only is a valid kind and round-trips', () => {
    assert.equal(normalizeKind('DOCS-ONLY'), 'docs-only');
    assert.ok(VALID_KINDS.has('docs-only'));
    assert.equal(parseIssueKind(DOCS_ONLY_BODY), 'docs-only');
  });
  it('docs-only is NOT a no-commit kind (commit-trail gate still applies)', () => {
    assert.ok(!NO_COMMIT_KINDS.has('docs-only'));
    assert.equal(isNoCommitKind(DOCS_ONLY_BODY), false);
  });
  it('docs-only IS a testless kind', () => {
    assert.ok(TESTLESS_KINDS.has('docs-only'));
    assert.equal(isTestlessKind(DOCS_ONLY_BODY), true);
    assert.equal(expectsAutomatedTests(DOCS_ONLY_BODY), false);
  });
  it('TESTLESS_KINDS is the no-commit kinds plus docs-only', () => {
    for (const k of NO_COMMIT_KINDS) assert.ok(TESTLESS_KINDS.has(k), `missing ${k}`);
    assert.ok(TESTLESS_KINDS.has('docs-only'));
    assert.equal(TESTLESS_KINDS.size, NO_COMMIT_KINDS.size + 1);
  });
  it('every no-commit kind is also testless', () => {
    for (const k of NO_COMMIT_KINDS) {
      assert.equal(isTestlessKind(progressMarkers(`<!-- aitm-issue-kind kind="${k}" -->`)), true);
      assert.equal(
        expectsAutomatedTests(progressMarkers(`<!-- aitm-issue-kind kind="${k}" -->`)),
        false
      );
    }
  });
  it('code expects tests and is not testless', () => {
    assert.equal(isTestlessKind('no marker'), false);
    assert.equal(expectsAutomatedTests('no marker'), true);
    assert.equal(
      expectsAutomatedTests(progressMarkers('<!-- aitm-issue-kind kind="code" -->')),
      true
    );
  });
});

describe('hasDeliverableMarker / isAcWaived', () => {
  it('detects a bare and a propertied deliverable marker', () => {
    assert.equal(hasDeliverableMarker(progressMarkers('<!-- aitm-deliverable-posted -->')), true);
    assert.equal(
      hasDeliverableMarker(progressMarkers('<!-- aitm-deliverable-posted url="https://x" -->')),
      true
    );
    assert.equal(hasDeliverableMarker('nothing here'), false);
  });
  it('#963 ignores issue-level sibling markers outside Progress Markers', () => {
    const prose = [
      '## Problem',
      '',
      '`<!-- aitm-deliverable-posted -->` is an example.',
      '`<!-- aitm-no-new-tests reason="covered" guarded-by="x.test.mjs" -->` is an example.',
      '`<!-- aitm-epic-ac-reconciled ts="2026-07-25T00:00:00.000Z" -->` is an example.',
      '',
      '## AITM Progress Markers',
      '',
      '<!-- aitm-fields -->',
    ].join('\n');
    assert.equal(hasDeliverableMarker(prose), false);
    assert.equal(hasNoNewTestsDeclaration(prose), false);
    assert.equal(hasEpicAcReconciledMarker(prose), false);
  });
  it('#963 still reads issue-level sibling markers from Progress Markers', () => {
    const body = progressMarkers(
      '<!-- aitm-deliverable-posted -->',
      '<!-- aitm-no-new-tests reason="covered by existing regression" guarded-by="issue-kind.test.mjs" -->',
      '<!-- aitm-epic-ac-reconciled ts="2026-07-25T00:00:00.000Z" -->'
    );
    assert.equal(hasDeliverableMarker(body), true);
    assert.equal(hasNoNewTestsDeclaration(body), true);
    assert.equal(hasEpicAcReconciledMarker(body), true);
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
