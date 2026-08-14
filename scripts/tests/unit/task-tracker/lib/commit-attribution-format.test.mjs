// @story #730
// #730 — canonical commit-message issue-ID attribution format.
//
// The token `[#N]` leads the commit subject, is greppable via a stable regex,
// composes before the conventional-commit type (so a `chore:` gate reads the
// type AFTER the bracket run), and is auto-injected idempotently. This suite is
// the demonstrable proof bound to epic #727 AC1/AC2 and to #730's own ACs:
// present / absent / malformed prefix, chore-compose, idempotent inject,
// multi-ID parse, and a round-trip of the grep regex against a `git log
// --oneline` line.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ISSUE_PREFIX_RE,
  ISSUE_ID_GLOBAL_RE,
  hasIssuePrefix,
  injectIssuePrefix,
  parseIssueIds,
  classifyType,
  lintCommitSubject,
} from '../../../../task-tracker/lib/commit-attribution-format.mjs';

test('hasIssuePrefix — present, single leading token', () => {
  assert.equal(hasIssuePrefix('[#730] feat(commit-attr): add lint gate'), true);
});

test('hasIssuePrefix — present, multiple leading tokens', () => {
  assert.equal(hasIssuePrefix('[#730] [#731] feat: shared change'), true);
});

test('hasIssuePrefix — tolerates leading whitespace', () => {
  assert.equal(hasIssuePrefix('  [#730] feat: x'), true);
});

test('hasIssuePrefix — absent', () => {
  assert.equal(hasIssuePrefix('feat(commit-attr): add lint gate'), false);
});

test('hasIssuePrefix — malformed variants are rejected', () => {
  assert.equal(hasIssuePrefix('#730] feat: x'), false); // no opening bracket
  assert.equal(hasIssuePrefix('[730] feat: x'), false); // missing hash
  assert.equal(hasIssuePrefix('[#] feat: x'), false); // no digits
  assert.equal(hasIssuePrefix('[# 730] feat: x'), false); // space between hash and digits
  assert.equal(hasIssuePrefix(''), false);
  assert.equal(hasIssuePrefix(undefined), false);
});

test('hasIssuePrefix — a mid-subject token does not count as a prefix', () => {
  assert.equal(hasIssuePrefix('feat: fixes [#730] regression'), false);
});

test('ISSUE_PREFIX_RE captures the leading id digits', () => {
  const m = '[#730] feat: x'.match(ISSUE_PREFIX_RE);
  assert.ok(m);
  assert.equal(m[1], '730');
});

test('injectIssuePrefix — prepends when absent (number form)', () => {
  assert.equal(injectIssuePrefix('feat: x', 730), '[#730] feat: x');
});

test('injectIssuePrefix — accepts "#730" and "730" string forms', () => {
  assert.equal(injectIssuePrefix('feat: x', '#730'), '[#730] feat: x');
  assert.equal(injectIssuePrefix('feat: x', '730'), '[#730] feat: x');
});

test('injectIssuePrefix — idempotent when the same id already leads', () => {
  const s = '[#730] feat: x';
  assert.equal(injectIssuePrefix(s, 730), s);
  assert.equal(injectIssuePrefix(injectIssuePrefix(s, 730), 730), s);
});

test('injectIssuePrefix — idempotent when the id is elsewhere in the leading run', () => {
  const s = '[#731] [#730] feat: x';
  assert.equal(injectIssuePrefix(s, 730), s);
});

test('injectIssuePrefix — prepends a distinct id ahead of an existing one', () => {
  assert.equal(injectIssuePrefix('[#731] feat: x', 730), '[#730] [#731] feat: x');
});

test('injectIssuePrefix — never doubles the same token', () => {
  const once = injectIssuePrefix('feat: x', 730);
  assert.equal(once, '[#730] feat: x');
  assert.equal(injectIssuePrefix(once, 730), '[#730] feat: x');
});

test('injectIssuePrefix — throws on an unparseable issue number', () => {
  assert.throws(() => injectIssuePrefix('feat: x', 'abc'));
  assert.throws(() => injectIssuePrefix('feat: x', ''));
});

test('parseIssueIds — single id', () => {
  assert.deepEqual(parseIssueIds('[#730] feat: x'), [730]);
});

test('parseIssueIds — multiple leading ids in order', () => {
  assert.deepEqual(parseIssueIds('[#730] [#731] feat: x'), [730, 731]);
});

test('parseIssueIds — none when no leading token', () => {
  assert.deepEqual(parseIssueIds('feat: x'), []);
});

test('parseIssueIds — only the contiguous leading run, not mid-subject tokens', () => {
  assert.deepEqual(parseIssueIds('[#730] feat: also touches [#999]'), [730]);
});

test('classifyType — reads the conventional-commit type after the bracket run', () => {
  assert.equal(classifyType('[#730] feat(commit-attr): add gate'), 'feat');
});

test('classifyType — chore composes through the bracket', () => {
  assert.equal(classifyType('[#730] chore(deps): bump c8'), 'chore');
});

test('classifyType — reads through a multi-id leading run', () => {
  assert.equal(classifyType('[#730] [#731] fix: shared'), 'fix');
});

test('classifyType — bang-breaking type', () => {
  assert.equal(classifyType('[#730] feat!: breaking'), 'feat');
});

test('classifyType — plain conventional commit with no bracket', () => {
  assert.equal(classifyType('chore: bump'), 'chore');
});

test('classifyType — null when there is no conventional-commit type', () => {
  assert.equal(classifyType('[#730] just a sentence'), null);
  assert.equal(classifyType('just a sentence'), null);
});

test('lintCommitSubject — null when the bound prefix is present', () => {
  assert.equal(lintCommitSubject('[#730] feat: x', 730), null);
});

test('lintCommitSubject — null when the id is elsewhere in the leading run', () => {
  assert.equal(lintCommitSubject('[#731] [#730] feat: x', 730), null);
});

test('lintCommitSubject — finding when the prefix is absent, carries injected fix', () => {
  const finding = lintCommitSubject('feat: x', 730);
  assert.ok(finding);
  assert.equal(finding.code, 'missing-issue-prefix');
  assert.equal(finding.injected, '[#730] feat: x');
});

test('lintCommitSubject — a different-id prefix still flags the bound id', () => {
  const finding = lintCommitSubject('[#731] feat: x', 730);
  assert.ok(finding);
  assert.equal(finding.injected, '[#730] [#731] feat: x');
});

test('lintCommitSubject — non-throwing on unparseable id or non-string subject', () => {
  assert.equal(lintCommitSubject('feat: x', 'abc'), null);
  assert.equal(lintCommitSubject(undefined, 730), null);
});

test('grep regex round-trips against a git log --oneline line', () => {
  const line = 'a1b2c3d [#730] feat(commit-attr): add lint gate';
  const ids = [...line.matchAll(ISSUE_ID_GLOBAL_RE)].map((m) => Number(m[1]));
  assert.deepEqual(ids, [730]);
});

test('grep regex finds every id on a multi-id oneline line', () => {
  const line = '9f3c1a0 [#730] [#731] feat: shared change';
  const ids = [...line.matchAll(ISSUE_ID_GLOBAL_RE)].map((m) => Number(m[1]));
  assert.deepEqual(ids, [730, 731]);
});
