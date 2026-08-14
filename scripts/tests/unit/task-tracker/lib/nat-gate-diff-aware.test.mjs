// @story #940
// Diff-aware "New Automated Tests" (NAT) required-comment at the Review layer:
// "the kind declares, the diff decides". A `docs-only`-marked issue skips the
// NAT summary only when its `trunk...HEAD` diff is provably documentation-only;
// a `docs-only` body whose diff touches code (or an empty/unclassifiable diff —
// default-deny) still requires it. Proves the pure predicate, the
// buildReviewContext → required-comments threading, and default-deny.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { natCommentRequired } from '../../../../task-tracker/lib/issue-kind.mjs';
import { buildReviewContext } from '../../../../task-tracker/lib/agent-review/review-gate.mjs';
import { validate as validateRequiredComments } from '../../../../task-tracker/lib/agent-review/validators/required-comments.mjs';

const KIND = (k) => `## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="${k}" -->`;
const NO_NEW_TESTS = (reason) => `<!-- aitm-no-new-tests reason="${reason}" -->`;

const CODE_DIFF = ['scripts/task-tracker/lib/foo.mjs', 'docs/readme.md'];
const DOCS_DIFF = ['docs/readme.md', 'README.md'];

const NAT_FAILURE = "required comment 'New Automated Tests' is missing";

// True when the validator, given this body + changedPaths, reports the NAT
// requirement as missing (i.e. the row was required and no comment satisfied it).
function natRequiredViaValidator(body, changedPaths) {
  const { failures } = validateRequiredComments({ comments: [], body, changedPaths });
  return failures.includes(NAT_FAILURE);
}

describe('natCommentRequired — diff-aware predicate (#940)', () => {
  it('docs-only + code-touching diff → required', () => {
    assert.equal(natCommentRequired(KIND('docs-only'), CODE_DIFF), true);
  });

  it('docs-only + provably docs-only diff → skipped', () => {
    assert.equal(natCommentRequired(KIND('docs-only'), DOCS_DIFF), false);
  });

  it('docs-only + empty diff → required (default-deny)', () => {
    assert.equal(natCommentRequired(KIND('docs-only'), []), true);
  });

  it('docs-only + undefined diff → required (default-deny)', () => {
    assert.equal(natCommentRequired(KIND('docs-only'), undefined), true);
  });

  it('code kind → required regardless of diff (kind-only fallback)', () => {
    assert.equal(natCommentRequired('a plain code issue', DOCS_DIFF), true);
    assert.equal(natCommentRequired('a plain code issue', []), true);
  });

  it('no-commit kind (spike) → not required regardless of diff', () => {
    assert.equal(natCommentRequired(KIND('spike'), CODE_DIFF), false);
  });

  it('valid no-new-tests declaration → not required (honest #944 escape)', () => {
    const body = `${KIND('code')}\n${NO_NEW_TESTS('greens pre-existing test')}`;
    assert.equal(natCommentRequired(body, CODE_DIFF), false);
  });

  it('docs-only + no-new-tests declaration → not required (escape wins)', () => {
    const body = `${KIND('docs-only')}\n${NO_NEW_TESTS('doc-only, no tests')}`;
    assert.equal(natCommentRequired(body, CODE_DIFF), false);
  });
});

describe('buildReviewContext threads changedPaths (#940)', () => {
  it('normalizes an array changed-path set onto the context', () => {
    const ctx = buildReviewContext({ body: 'x', changedPaths: CODE_DIFF });
    assert.deepEqual(ctx.changedPaths, CODE_DIFF);
  });

  it('missing changedPaths defaults to [] (default-deny)', () => {
    const ctx = buildReviewContext({ body: 'x' });
    assert.deepEqual(ctx.changedPaths, []);
  });

  it('non-array changedPaths coerces to []', () => {
    const ctx = buildReviewContext({ body: 'x', changedPaths: 'scripts/foo.mjs' });
    assert.deepEqual(ctx.changedPaths, []);
  });
});

describe('required-comments consumes context.changedPaths (#940)', () => {
  it('docs-only + code diff → NAT comment required (failure reported)', () => {
    assert.equal(natRequiredViaValidator(KIND('docs-only'), CODE_DIFF), true);
  });

  it('docs-only + docs-only diff → NAT requirement skipped (no failure)', () => {
    assert.equal(natRequiredViaValidator(KIND('docs-only'), DOCS_DIFF), false);
  });

  it('docs-only + missing diff → required (default-deny)', () => {
    assert.equal(natRequiredViaValidator(KIND('docs-only'), undefined), true);
  });

  it('code kind → required regardless of diff', () => {
    assert.equal(natRequiredViaValidator('plain code issue', DOCS_DIFF), true);
  });

  it('threads end-to-end: buildReviewContext output drives the validator', () => {
    const ctx = buildReviewContext({ body: KIND('docs-only'), changedPaths: DOCS_DIFF });
    const { failures } = validateRequiredComments(ctx);
    assert.equal(failures.includes(NAT_FAILURE), false);

    const ctx2 = buildReviewContext({ body: KIND('docs-only'), changedPaths: CODE_DIFF });
    const { failures: failures2 } = validateRequiredComments(ctx2);
    assert.equal(failures2.includes(NAT_FAILURE), true);
  });
});
