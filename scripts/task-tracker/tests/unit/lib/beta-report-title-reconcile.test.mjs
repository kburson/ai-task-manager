// @story #670
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileBetaReportTitle,
  LADYBUG,
  SPARKLE,
} from '../../../lib/beta-report-title-reconcile.mjs';

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
