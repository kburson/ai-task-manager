#!/usr/bin/env node
// @story #331
// #331 — unit tests for `mirrorDeepDiveFromComment` + helpers
// (`parseFromCommentArg`, `stripLeadingDeepDiveHeading`). Hermetic: injects
// a fake `mutateIssueBody` AND a fake `fetchCommentBody` so no GH I/O
// occurs. The body-write-must-route-through-mutateIssueBody guard
// (`deep-dive-no-direct-gh-edit.test.mjs`, #324) already covers AC6 since
// the new helper routes through `mutateIssueBody` like its siblings.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DeepDiveAlreadyInlineError,
  mirrorDeepDiveFromComment,
  parseFromCommentArg,
  stripLeadingDeepDiveHeading,
} from '../lib/deep-dive.mjs';

const TS = '2026-06-07T05:00:00.000Z';

// ---------------------------------------------------------------------------
// parseFromCommentArg
// ---------------------------------------------------------------------------

test('parseFromCommentArg: raw numeric id', () => {
  assert.equal(parseFromCommentArg('4640885208'), '4640885208');
});

test('parseFromCommentArg: hash-prefixed form', () => {
  assert.equal(parseFromCommentArg('#issuecomment-4640885208'), '4640885208');
});

test('parseFromCommentArg: full URL', () => {
  const url = 'https://github.com/kburson/ai-task-manager/issues/331#issuecomment-4640885208';
  assert.equal(parseFromCommentArg(url), '4640885208');
});

test('parseFromCommentArg: refuses gibberish', () => {
  assert.throws(() => parseFromCommentArg('not-a-comment'), /cannot extract comment id/);
});

test('parseFromCommentArg: refuses null', () => {
  assert.throws(() => parseFromCommentArg(null), /input is required/);
});

// ---------------------------------------------------------------------------
// stripLeadingDeepDiveHeading
// ---------------------------------------------------------------------------

test('stripLeadingDeepDiveHeading: strips `## Plan Deep-Dive Analysis`', () => {
  const src = '## Plan Deep-Dive Analysis\n\n### Root cause\n\nbody\n';
  assert.equal(stripLeadingDeepDiveHeading(src), '### Root cause\n\nbody\n');
});

test('stripLeadingDeepDiveHeading: strips `## Deep-Dive Analysis (2026-06-06)`', () => {
  const src = '## Deep-Dive Analysis (2026-06-06)\n\nprose\n';
  assert.equal(stripLeadingDeepDiveHeading(src), 'prose\n');
});

test('stripLeadingDeepDiveHeading: preserves subordinate ### headings', () => {
  const src = '### Root cause\n\nbody\n';
  assert.equal(stripLeadingDeepDiveHeading(src), '### Root cause\n\nbody\n');
});

test('stripLeadingDeepDiveHeading: no-op when no leading heading', () => {
  const src = 'Some prose without a leading heading.\n';
  assert.equal(stripLeadingDeepDiveHeading(src), src);
});

// ---------------------------------------------------------------------------
// mirrorDeepDiveFromComment — fakes
// ---------------------------------------------------------------------------

const BODY_NO_DEEP_DIVE = [
  '## Scope',
  '',
  'do the thing',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
  '---',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '',
].join('\n');

const COMMENT_URL = 'https://github.com/kburson/ai-task-manager/issues/331#issuecomment-4640885208';
const COMMENT_ID = '4640885208';
const COMMENT_BODY = [
  '## Plan Deep-Dive Analysis',
  '',
  '### Root cause',
  '',
  'When a deep dive is authored as a comment, the body lacks the canonical',
  'markers and the Plan→Develop gate refuses.',
].join('\n');

function fakeMutateFactory(initial) {
  const log = { calls: 0, base: null, next: null, opts: null, error: null };
  return {
    log,
    fn: async (opts) => {
      log.calls += 1;
      log.opts = opts;
      const base = initial;
      try {
        const next = opts.mutate(base);
        log.base = base;
        log.next = next;
        const noop = next === base;
        return { status: noop ? 'no-op' : 'ok', attempts: 1, version: noop ? 1 : 2 };
      } catch (err) {
        log.error = err;
        throw err;
      }
    },
  };
}

function fakeFetchFactory(body, url = COMMENT_URL) {
  return async ({ commentId }) => {
    return { body, url: url.replace(/issuecomment-\d+/, `issuecomment-${commentId}`) };
  };
}

// ---------------------------------------------------------------------------
// happy path
// ---------------------------------------------------------------------------

test('mirrorDeepDiveFromComment: happy path mirrors comment + stamps both markers', async () => {
  const m = fakeMutateFactory(BODY_NO_DEEP_DIVE);
  const result = await mirrorDeepDiveFromComment({
    issueNumber: 331,
    repo: 'kburson/ai-task-manager',
    fromComment: COMMENT_ID,
    ts: TS,
    deps: { mutateIssueBody: m.fn, fetchCommentBody: fakeFetchFactory(COMMENT_BODY) },
  });
  assert.equal(result.status, 'mirrored');
  assert.equal(result.commentId, COMMENT_ID);
  assert.equal(result.url, COMMENT_URL);
  assert.match(m.log.next, /## Deep-Dive Analysis \(2026-06-07\)/);
  assert.match(m.log.next, /<!-- aitm-deep-dive-posted ts="2026-06-07T05:00:00\.000Z" -->/);
  assert.match(m.log.next, /<!-- aitm-deep-dive-complete ts="2026-06-07T05:00:00\.000Z" -->/);
  assert.match(m.log.next, new RegExp(`#issuecomment-${COMMENT_ID}`));
  // Only ONE `## Deep-Dive Analysis` heading present (the canonical one — not
  // the stripped one from the comment).
  const headingCount = (m.log.next.match(/^## Deep-Dive Analysis\b/gm) || []).length;
  assert.equal(headingCount, 1);
});

// ---------------------------------------------------------------------------
// no-op
// ---------------------------------------------------------------------------

test('mirrorDeepDiveFromComment: no-op when markers + back-pointer already present', async () => {
  const existing = [
    BODY_NO_DEEP_DIVE,
    `<!-- aitm-deep-dive-posted: ${TS} -->`,
    '',
    '## Deep-Dive Analysis (2026-06-07)',
    '',
    `> Mirrored from comment #issuecomment-${COMMENT_ID} (${COMMENT_URL}).`,
    '',
    'prose body',
    '',
    `<!-- aitm-deep-dive-complete: ${TS} -->`,
    '',
  ].join('\n');
  const m = fakeMutateFactory(existing);
  const result = await mirrorDeepDiveFromComment({
    issueNumber: 331,
    repo: 'kburson/ai-task-manager',
    fromComment: COMMENT_ID,
    ts: TS,
    deps: { mutateIssueBody: m.fn, fetchCommentBody: fakeFetchFactory(COMMENT_BODY) },
  });
  assert.equal(result.status, 'no-op');
  assert.equal(m.log.base, m.log.next);
});

// ---------------------------------------------------------------------------
// conflict refusal
// ---------------------------------------------------------------------------

test('mirrorDeepDiveFromComment: refuses when hand-authored inline deep dive lacks back-pointer', async () => {
  const conflicting = [
    BODY_NO_DEEP_DIVE,
    '## Deep-Dive Analysis',
    '',
    'hand-authored prose that mentions NOTHING about a comment-id',
    '',
  ].join('\n');
  const m = fakeMutateFactory(conflicting);
  await assert.rejects(
    mirrorDeepDiveFromComment({
      issueNumber: 331,
      repo: 'kburson/ai-task-manager',
      fromComment: COMMENT_ID,
      ts: TS,
      deps: { mutateIssueBody: m.fn, fetchCommentBody: fakeFetchFactory(COMMENT_BODY) },
    }),
    (err) => {
      assert.ok(err instanceof DeepDiveAlreadyInlineError);
      assert.match(err.message, /hand-authored.*Deep-Dive Analysis/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// heading strip (already covered in happy path, but explicit assertion)
// ---------------------------------------------------------------------------

test('mirrorDeepDiveFromComment: comment with leading heading produces single canonical heading', async () => {
  const m = fakeMutateFactory(BODY_NO_DEEP_DIVE);
  await mirrorDeepDiveFromComment({
    issueNumber: 331,
    repo: 'kburson/ai-task-manager',
    fromComment: COMMENT_ID,
    ts: TS,
    deps: { mutateIssueBody: m.fn, fetchCommentBody: fakeFetchFactory(COMMENT_BODY) },
  });
  // The comment body starts with `## Plan Deep-Dive Analysis`. The mirrored
  // body must contain exactly one `## Deep-Dive Analysis` heading (the
  // canonical one) and zero `## Plan Deep-Dive Analysis` headings.
  const canonical = (m.log.next.match(/^## Deep-Dive Analysis\b/gm) || []).length;
  const planVariant = (m.log.next.match(/^## Plan Deep-Dive Analysis\b/gm) || []).length;
  assert.equal(canonical, 1);
  assert.equal(planVariant, 0);
});

// ---------------------------------------------------------------------------
// back-pointer format
// ---------------------------------------------------------------------------

test('mirrorDeepDiveFromComment: back-pointer line matches spec format', async () => {
  const m = fakeMutateFactory(BODY_NO_DEEP_DIVE);
  await mirrorDeepDiveFromComment({
    issueNumber: 331,
    repo: 'kburson/ai-task-manager',
    fromComment: COMMENT_ID,
    ts: TS,
    deps: { mutateIssueBody: m.fn, fetchCommentBody: fakeFetchFactory(COMMENT_BODY) },
  });
  const expected =
    `> Mirrored from comment #issuecomment-${COMMENT_ID} (${COMMENT_URL}). ` +
    'Comment is the diff-history canonical; this body copy is the gate-canonical source.';
  assert.ok(m.log.next.includes(expected), `back-pointer line not found in body:\n${m.log.next}`);
});

// ---------------------------------------------------------------------------
// empty comment refusal
// ---------------------------------------------------------------------------

test('mirrorDeepDiveFromComment: refuses when comment body is empty', async () => {
  const m = fakeMutateFactory(BODY_NO_DEEP_DIVE);
  const result = await mirrorDeepDiveFromComment({
    issueNumber: 331,
    repo: 'kburson/ai-task-manager',
    fromComment: COMMENT_ID,
    ts: TS,
    deps: { mutateIssueBody: m.fn, fetchCommentBody: fakeFetchFactory('   \n  ') },
  });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'empty-comment-body');
  assert.equal(m.log.calls, 0);
});
