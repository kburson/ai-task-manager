// @story #670
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileBetaReportTitle,
  reconcileIssueTitle,
  LADYBUG,
  SPARKLE,
} from '../../../lib/beta-report-title-reconcile.mjs';

test('label-driven reconciliation uses every canonical kind prefix', () => {
  assert.equal(reconcileIssueTitle('Crash on save', ['bug']), '🐞 [BUG] Crash on save');
  assert.equal(reconcileIssueTitle('Crash on save', ['beta-defect']), '🐞 [Defect] Crash on save');
  assert.equal(
    reconcileIssueTitle('Add dark mode', ['beta-feature']),
    '🙏 [Feature Request] Add dark mode'
  );
  assert.equal(reconcileIssueTitle('Try queues', ['idea']), '🤓 [Idea] Try queues');
});

test('label-driven reconciliation is idempotent and strips stale prefixes without a signal', () => {
  assert.equal(reconcileIssueTitle('🐞 Crash on save', ['bug']), '🐞 [BUG] Crash on save');
  assert.equal(reconcileIssueTitle('🐞 [BUG] Crash on save', ['bug']), '🐞 [BUG] Crash on save');
  assert.equal(reconcileIssueTitle('🐞 [BUG] Crash on save', []), 'Crash on save');
});

test('legacy bracket prefix + beta-feature signal reconciles to sparkle, prefix stripped', () => {
  const result = reconcileBetaReportTitle('[BETA-FEATURE] Add dark mode', SPARKLE);
  assert.equal(result, `${SPARKLE} Add dark mode`);
});

test('legacy bracket prefix + beta-defect/bug signal reconciles to ladybug, prefix stripped', () => {
  const result = reconcileBetaReportTitle('[BETA-DEFECT] Crash on save', LADYBUG);
  assert.equal(result, `${LADYBUG} Crash on save`);
});

test('already-correct emoji title is left unchanged (idempotent)', () => {
  const title = `${SPARKLE} Add dark mode`;
  const result = reconcileBetaReportTitle(title, SPARKLE);
  assert.equal(result, title);
});

test('already-correct ladybug title is left unchanged (idempotent)', () => {
  const title = `${LADYBUG} Crash on save`;
  const result = reconcileBetaReportTitle(title, LADYBUG);
  assert.equal(result, title);
});

test('already-double-prefixed title (emoji stacked ahead of legacy bracket) self-heals', () => {
  const result = reconcileBetaReportTitle(`${SPARKLE} [BETA-FEATURE] Add dark mode`, SPARKLE);
  assert.equal(result, `${SPARKLE} Add dark mode`);
});

test('no wanted emoji strips any existing prefix and leaves bare title', () => {
  const result = reconcileBetaReportTitle('[BETA-DEFECT] Crash on save', '');
  assert.equal(result, 'Crash on save');
});
