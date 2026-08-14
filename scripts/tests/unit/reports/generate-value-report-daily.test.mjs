#!/usr/bin/env node
// @story #770
// Tests for the report-facing pieces of the Daily Work Activity chart:
// timing-log comment capture, chart rendering, and the widened comment fetch.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { extractTimingBody, renderDailyChart } from '../../../reports/lib/daily-activity.mjs';

test('extractTimingBody returns the timing-log comment body, else null', () => {
  const comments = [
    { body: 'just a normal comment' },
    { body: '### ⏱ Timing Log\n\n| Timestamp | Event |' },
  ];
  assert.match(extractTimingBody(comments), /⏱ Timing Log/);
  assert.equal(extractTimingBody([{ body: 'no log here' }]), null);
  assert.equal(extractTimingBody(undefined), null);
});

test('renderDailyChart on empty buckets returns the tl-note placeholder', () => {
  const html = renderDailyChart([]);
  assert.match(html, /tl-note/);
  assert.match(html, /No timing-log activity/i);
});

test('renderDailyChart on all-zero buckets returns the placeholder', () => {
  const html = renderDailyChart([{ date: '2026-03-10', durationSec: 0, issueCount: 0 }]);
  assert.match(html, /tl-note/);
});

test('renderDailyChart renders bars and an issue-count polyline for real data', () => {
  const html = renderDailyChart([
    { date: '2026-03-10', durationSec: 3600, issueCount: 1 },
    { date: '2026-03-11', durationSec: 7200, issueCount: 2 },
  ]);
  assert.match(html, /<svg/, 'has an inline svg for the count series');
  assert.match(html, /<polyline/, 'connects the count points');
  assert.match(html, /Daily Work Activity/, 'labels the chart');
  // Both day labels present.
  assert.match(html, /Mar 10/);
  assert.match(html, /Mar 11/);
});

test('report widens the timing-log comment fetch to first: 100', () => {
  const src = readFileSync(new URL('../../../reports/generate-value-report.mjs', import.meta.url), 'utf8');
  assert.match(src, /comments\(first:\s*100\)/, 'GraphQL comment fetch widened to 100');
});

test('report imports and calls the daily-activity module', () => {
  const src = readFileSync(new URL('../../../reports/generate-value-report.mjs', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/lib\/daily-activity\.mjs'/, 'imports the module');
  assert.match(src, /bucketRowsByDay\(/, 'calls bucketRowsByDay');
  assert.match(src, /renderDailyChart\(/, 'calls renderDailyChart');
});
