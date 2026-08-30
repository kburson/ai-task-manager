#!/usr/bin/env node
// @story #1095

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  collectResumeActivityEvidence,
  verificationActivityTimestamps,
} from '../../../../task-tracker/lib/resume-activity-evidence.mjs';

const sandbox = mkdtempProjectIsolated('resume-auto-gap-activity-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = sandbox;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(sandbox, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });
const { verbResume } = await import('../../../../task-tracker/verbs/resume.mjs');

let stateSequence = 0;
function makeState() {
  const statePath = path.join(sandbox, `state-${stateSequence++}.json`);
  writeFileSync(statePath, JSON.stringify({ active: null, lastActive: '#1077' }));
  return statePath;
}

function timingBody(startedAt) {
  return [
    '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${startedAt} | develop:started |  |  |  | 12,345 | row |`,
  ].join('\n');
}

test('verificationActivityTimestamps accepts only established verification headings', () => {
  const comments = [
    {
      body: '### Verification report — final implementation checkpoint',
      createdAt: '2026-08-04T06:13:44-05:00',
    },
    {
      body: '## ✓ Sandboxed verification passed\n\nHEAD: `abc1234`',
      createdAt: '2026-08-04T06:20:00-05:00',
    },
    {
      body: '## New Automated Tests\n\n- one focused regression',
      createdAt: '2026-08-04T06:25:00-05:00',
    },
    { body: 'ordinary discussion comment', createdAt: '2026-08-04T06:30:00-05:00' },
    { body: '### Verification report', createdAt: 'not-a-date' },
  ];

  assert.deepEqual(verificationActivityTimestamps(comments), [
    '2026-08-04T11:13:44.000Z',
    '2026-08-04T11:20:00.000Z',
    '2026-08-04T11:25:00.000Z',
  ]);
});

test('collectResumeActivityEvidence combines and deduplicates comment and attributed commit times', async () => {
  const result = await collectResumeActivityEvidence({
    issueNumber: 1095,
    projectDir: '/repo',
    comments: [
      {
        body: '### Verification report — checkpoint',
        createdAt: '2026-08-04T06:13:44-05:00',
      },
    ],
    attributingCommits: async (issueNumber, options) => {
      assert.equal(issueNumber, 1095);
      assert.deepEqual(options, { cwd: '/repo' });
      return [
        { ts: '2026-08-03T20:23:23-05:00' },
        { ts: '2026-08-04T06:13:44-05:00' },
        { ts: 'invalid' },
      ];
    },
  });

  assert.equal(result.status, 'found');
  assert.deepEqual(result.timestamps, ['2026-08-04T01:23:23.000Z', '2026-08-04T11:13:44.000Z']);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.timestamps));
});

test('collectResumeActivityEvidence reports none after a complete empty lookup', async () => {
  const result = await collectResumeActivityEvidence({
    issueNumber: 1095,
    projectDir: '/repo',
    comments: [{ body: 'not verification', createdAt: '2026-08-04T06:13:44-05:00' }],
    attributingCommits: async () => [],
  });

  assert.deepEqual(result, { status: 'none', timestamps: [] });
});

test('collectResumeActivityEvidence reports unknown when commit attribution fails without comment proof', async () => {
  const result = await collectResumeActivityEvidence({
    issueNumber: 1095,
    projectDir: '/repo',
    comments: [],
    attributingCommits: async () => {
      throw new Error('git unavailable');
    },
  });

  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.timestamps, []);
  assert.equal(result.reason, 'commit-attribution-failed');
});

test('verification comment proof remains found when commit attribution is unavailable', async () => {
  const result = await collectResumeActivityEvidence({
    issueNumber: 1095,
    projectDir: '/repo',
    comments: [
      { body: '## ✗ Sandboxed verification failed', createdAt: '2026-08-04T06:13:44-05:00' },
    ],
    attributingCommits: async () => {
      throw new Error('git unavailable');
    },
  });

  assert.equal(result.status, 'found');
  assert.deepEqual(result.timestamps, ['2026-08-04T11:13:44.000Z']);
});

test('verbResume does not synthesize idle over a #1077-shaped gap with durable activity', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = `resume-activity-${stateSequence}`;
  const bindNow = new Date();
  const startedAt = new Date(bindNow.getTime() - 11 * 60 * 60_000).toISOString();
  const activityAt = new Date(bindNow.getTime() - 5 * 60_000).toISOString();
  const posts = [];
  let collectorCalls = 0;
  await verbResume({
    rest: ['#1077'],
    cfg: { repo: 'owner/repo' },
    statePath: makeState(),
    projectDir: sandbox,
    role: 'agent',
    drainQueueIfAny: async () => {},
    claimBindingOccupancy: () => ({ status: 'claimed' }),
    safePostTiming: async (issue, row) => posts.push({ issue, row }),
    nowIso: () => bindNow.toISOString(),
    seedKanban: async () => {},
    readTimingCommentBody: async () => ({
      status: 'found',
      body: timingBody(startedAt),
      error: null,
      comments: [],
    }),
    collectResumeActivityEvidence: async () => {
      collectorCalls += 1;
      return {
        status: 'found',
        timestamps: [activityAt],
      };
    },
  });

  assert.equal(collectorCalls, 1);
  assert.equal(
    posts.some(({ row }) => row.includes('pause:auto-detected-gap')),
    false
  );
  assert.equal(
    posts.some(({ row }) => row.includes('| resumed |')),
    true
  );
});

test('verbResume preserves synthetic recovery for a complete no-activity lookup', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = `resume-no-activity-${stateSequence}`;
  const bindNow = new Date();
  const startedAt = new Date(bindNow.getTime() - 11 * 60 * 60_000).toISOString();
  const posts = [];
  await verbResume({
    rest: ['#1077'],
    cfg: { repo: 'owner/repo' },
    statePath: makeState(),
    projectDir: sandbox,
    role: 'agent',
    drainQueueIfAny: async () => {},
    claimBindingOccupancy: () => ({ status: 'claimed' }),
    safePostTiming: async (issue, row) => posts.push({ issue, row }),
    nowIso: () => bindNow.toISOString(),
    seedKanban: async () => {},
    readTimingCommentBody: async () => ({
      status: 'found',
      body: timingBody(startedAt),
      error: null,
      comments: [],
    }),
    collectResumeActivityEvidence: async () => ({ status: 'none', timestamps: [] }),
  });

  assert.equal(
    posts.some(({ row }) => row.includes('pause:auto-detected-gap')),
    true
  );
  assert.equal(
    posts.some(({ row }) => row.includes('| resumed |')),
    true
  );
  assert.equal(posts.length, 2);
});

test('verbResume warns and refuses idle synthesis when same-issue activity is unknown', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = `resume-unknown-activity-${stateSequence}`;
  const bindNow = new Date();
  const startedAt = new Date(bindNow.getTime() - 11 * 60 * 60_000).toISOString();
  const posts = [];
  let stderr = '';
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk, ...args) => {
    stderr += String(chunk);
    return true;
  };
  try {
    await verbResume({
      rest: ['#1077'],
      cfg: { repo: 'owner/repo' },
      statePath: makeState(),
      projectDir: sandbox,
      role: 'agent',
      drainQueueIfAny: async () => {},
      claimBindingOccupancy: () => ({ status: 'claimed' }),
      safePostTiming: async (issue, row) => posts.push({ issue, row }),
      nowIso: () => bindNow.toISOString(),
      seedKanban: async () => {},
      readTimingCommentBody: async () => ({
        status: 'found',
        body: timingBody(startedAt),
        error: null,
        comments: [],
      }),
      collectResumeActivityEvidence: async () => ({
        status: 'unknown',
        timestamps: [],
        reason: 'commit-attribution-failed',
      }),
    });
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.equal(
    posts.some(({ row }) => row.includes('pause:auto-detected-gap')),
    false
  );
  assert.equal(
    posts.some(({ row }) => row.includes('| resumed |')),
    true
  );
  assert.match(stderr, /same-issue activity evidence unavailable/);
});

test.after(() => rmSync(sandbox, { recursive: true, force: true }));
