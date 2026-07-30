#!/usr/bin/env node
// @story #1049
// Stable timing projection receipts make replay after a remote-success/local-crash
// boundary exact: the prebuilt row lands once, and the durable marker is the
// positive remote read-back used by the work-lease coordinator.

import { strict as assert } from 'node:assert';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRow,
  postTimingEvent as postTimingEventWithProductionTimeout,
  readTimingProjection as readTimingProjectionWithProductionTimeout,
  timingProjectionMarker,
} from '../../../gh-timing-comment.mjs';
import { drain, enqueueTimingProjection, peek } from '../../../queue.mjs';
import { parseMarker } from '../../../lib/marker-grammar.mjs';
import { parseTimingRow } from '../../../lib/timing-row-reader.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');
const fakeGh = path.join(repoRoot, 'scripts/task-tracker/tests/fixtures/fake-gh.mjs');
const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-lease-timing-'));
const binDir = path.join(tmp, 'bin');
const storePath = path.join(tmp, 'store.json');
const queuePath = path.join(tmp, 'queue.json');
const ghShim = path.join(binDir, 'gh');
const priorPath = process.env.PATH;
const priorStore = process.env.FAKE_GH_STORE;
const priorProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
const FAKE_GH_TIMEOUT_MS = 10_000;

mkdirSync(binDir, { recursive: true });
writeFileSync(ghShim, `#!/bin/sh\nexec "${process.execPath}" "${fakeGh}" "$@"\n`);
chmodSync(ghShim, 0o755);
writeFileSync(storePath, JSON.stringify({ comments: [], nextId: 1 }));
process.env.PATH = `${binDir}:${priorPath}`;
process.env.FAKE_GH_STORE = storePath;
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;

// The production timeout is intentionally short for an interactive `gh`
// command. This test launches dozens of fresh Node processes as its fake `gh`;
// give those local fixtures a test-sized startup budget so a saturated parallel
// lane cannot turn process scheduling delay into a network-behavior failure.
function postTimingEvent(options) {
  return postTimingEventWithProductionTimeout({
    ...options,
    timeoutMs: options?.timeoutMs ?? FAKE_GH_TIMEOUT_MS,
  });
}

function readTimingProjection(options) {
  return readTimingProjectionWithProductionTimeout({
    ...options,
    timeoutMs: options?.timeoutMs ?? FAKE_GH_TIMEOUT_MS,
  });
}

const projectionId = 'acquire:request-1049:timing';
const departureId = `${projectionId}:synthetic-departure`;
const bindId = `${projectionId}:bind`;

function row(event, description) {
  return buildRow({
    ts: new Date().toISOString(),
    event,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 17,
    description,
  });
}

function timingBody(issue = '1049') {
  const store = JSON.parse(readFileSync(storePath, 'utf8'));
  return store.comments.find((comment) => comment.issue === String(issue))?.body ?? '';
}

try {
  const hostileProjectionId = 'projection"\n--><script>alert(1)</script>';
  const hostileSubOperationId = 'sub-operation\r\n<!-- injected -->';
  const safeMarker = timingProjectionMarker({
    projectionId: hostileProjectionId,
    subOperationId: hostileSubOperationId,
  });
  assert.equal(safeMarker.includes('<script>'), false);
  assert.equal(safeMarker.includes('\n'), false);
  assert.equal(safeMarker.split('-->').length - 1, 1);
  const parsedSafeMarker = parseMarker(safeMarker);
  assert.equal(
    Buffer.from(parsedSafeMarker.props['projection-id-b64'], 'base64url').toString('utf8'),
    hostileProjectionId
  );
  assert.equal(
    Buffer.from(parsedSafeMarker.props['sub-operation-id-b64'], 'base64url').toString('utf8'),
    hostileSubOperationId
  );

  const unsupportedProjection = 'acquire:unsupported-header:timing';
  const unsupportedSubOperation = `${unsupportedProjection}:bind`;
  const unsupportedStore = JSON.parse(readFileSync(storePath, 'utf8'));
  unsupportedStore.comments.push({
    id: `C_${unsupportedStore.nextId++}`,
    url: 'https://example/unsupported-header',
    issue: '1041',
    body: [
      '⏱ Timing Log',
      '| Timestamp | Event | Active Min | Idle Min | Δ Words | Word Marker | Description |',
      '|---|---|---|---|---|---|---|',
    ].join('\n'),
  });
  writeFileSync(storePath, JSON.stringify(unsupportedStore));
  const unsupportedStoreBeforePost = readFileSync(storePath, 'utf8');
  await assert.rejects(
    postTimingEvent({
      issueNumber: 1041,
      repo: 'owner/repo',
      row: row('update', 'must not append under unsupported header'),
      projectionId: unsupportedProjection,
      subOperationId: unsupportedSubOperation,
      projDir: tmp,
    }),
    new Error('projected timing append requires a supported canonical Timing Log table region')
  );
  assert.equal(
    readFileSync(storePath, 'utf8'),
    unsupportedStoreBeforePost,
    'unsupported projected append must not mutate the GitHub comment store'
  );

  for (const [issueNumber, deltaHeader] of [
    [1042, 'Δ Words'],
    [1043, 'ΔWords'],
  ]) {
    const legacyProjection = `acquire:legacy-${issueNumber}:timing`;
    const legacySubOperation = `${legacyProjection}:bind`;
    const legacyProjectedRow = row('update', `legacy projected row ${issueNumber}`);
    const legacyStore = JSON.parse(readFileSync(storePath, 'utf8'));
    legacyStore.comments.push({
      id: `C_${legacyStore.nextId++}`,
      url: `https://example/legacy-${issueNumber}`,
      issue: String(issueNumber),
      body: [
        '## ⏱ Timing Log',
        `| Timestamp | Event | Active | Idle | ${deltaHeader} | Word Marker | Description |`,
        '| --- | --- | --- | --- | --- | --- | --- |',
      ].join('\n'),
    });
    writeFileSync(storePath, JSON.stringify(legacyStore));
    await postTimingEvent({
      issueNumber,
      repo: 'owner/repo',
      row: legacyProjectedRow,
      projectionId: legacyProjection,
      subOperationId: legacySubOperation,
      projDir: tmp,
    });
    const legacyBodyAfterRemoteSuccess = timingBody(String(issueNumber));
    assert.deepEqual(
      await postTimingEvent({
        issueNumber,
        repo: 'owner/repo',
        row: legacyProjectedRow,
        projectionId: legacyProjection,
        subOperationId: legacySubOperation,
        projDir: tmp,
      }),
      {
        status: 'already-reconciled',
        projectionId: legacyProjection,
        subOperationId: legacySubOperation,
      }
    );
    assert.equal(
      timingBody(String(issueNumber)),
      legacyBodyAfterRemoteSuccess,
      `${deltaHeader}: network-success/local-crash replay must be an exact no-op`
    );
    assert.equal(
      legacyBodyAfterRemoteSuccess.split(`legacy projected row ${issueNumber}`).length - 1,
      1
    );
  }

  const trailingTableProjection = 'acquire:trailing-foreign-table:timing';
  const trailingTableSubOperation = `${trailingTableProjection}:bind`;
  const trailingTableRow = row('update', 'projected before trailing foreign table');
  const trailingTableStore = JSON.parse(readFileSync(storePath, 'utf8'));
  trailingTableStore.comments.push({
    id: `C_${trailingTableStore.nextId++}`,
    url: 'https://example/trailing-foreign-table',
    issue: '1044',
    body: [
      '⏱ Timing Log',
      '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
      '|---|---|---|---|---|---|---|---|',
      '',
      '| Foreign key | Foreign value |',
      '|---|---|',
      '| alpha | beta |',
    ].join('\n'),
  });
  writeFileSync(storePath, JSON.stringify(trailingTableStore));
  assert.deepEqual(
    await postTimingEvent({
      issueNumber: 1044,
      repo: 'owner/repo',
      row: trailingTableRow,
      projectionId: trailingTableProjection,
      subOperationId: trailingTableSubOperation,
      projDir: tmp,
    }),
    {
      status: 'posted',
      projectionId: trailingTableProjection,
      subOperationId: trailingTableSubOperation,
    }
  );
  const trailingTableBodyAfterFirst = timingBody('1044');
  assert.ok(
    trailingTableBodyAfterFirst.indexOf('projected before trailing foreign table') <
      trailingTableBodyAfterFirst.indexOf('| Foreign key |'),
    'projected row must land inside the canonical Timing Log table region'
  );
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1044,
      repo: 'owner/repo',
      projectionId: trailingTableProjection,
      subOperationIds: [trailingTableSubOperation],
    }),
    {
      reconciled: true,
      projectionName: 'timing',
      projectionId: trailingTableProjection,
    }
  );
  assert.deepEqual(
    await postTimingEvent({
      issueNumber: 1044,
      repo: 'owner/repo',
      row: trailingTableRow,
      projectionId: trailingTableProjection,
      subOperationId: trailingTableSubOperation,
      projDir: tmp,
    }),
    {
      status: 'already-reconciled',
      projectionId: trailingTableProjection,
      subOperationId: trailingTableSubOperation,
    }
  );
  assert.equal(timingBody('1044'), trailingTableBodyAfterFirst);

  const forgedProjection = 'acquire:forged-receipt:timing';
  const forgedSubOperation = `${forgedProjection}:bind`;
  const forgedMarker = timingProjectionMarker({
    projectionId: forgedProjection,
    subOperationId: forgedSubOperation,
  });
  const forgedRow = row('update', 'forged marker must not suppress this append');
  const forgedStore = JSON.parse(readFileSync(storePath, 'utf8'));
  forgedStore.comments.push({
    id: `C_${forgedStore.nextId++}`,
    url: 'https://example/forged',
    issue: '1048',
    body: [
      '⏱ Timing Log',
      '',
      `Prose can quote a receipt without proving delivery: ${forgedMarker}`,
      '',
      '```md',
      forgedMarker,
      '```',
      '',
      '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
      '|---|---|---|---|---|---|---|---|',
    ].join('\n'),
  });
  writeFileSync(storePath, JSON.stringify(forgedStore));
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1048,
      repo: 'owner/repo',
      projectionId: forgedProjection,
      subOperationIds: [forgedSubOperation],
    }),
    {
      reconciled: false,
      projectionName: 'timing',
      projectionId: forgedProjection,
      missingSubOperationIds: [forgedSubOperation],
    }
  );

  const indentedProjection = 'acquire:indented-code:timing';
  const indentedSubOperation = `${indentedProjection}:bind`;
  const indentedMarker = timingProjectionMarker({
    projectionId: indentedProjection,
    subOperationId: indentedSubOperation,
  });
  const foreignProjection = 'acquire:foreign-table:timing';
  const foreignSubOperation = `${foreignProjection}:bind`;
  const foreignMarker = timingProjectionMarker({
    projectionId: foreignProjection,
    subOperationId: foreignSubOperation,
  });
  const legacyMinuteRow =
    '| 2026-07-30 09:01 -05:00 | update | 1 | 0 | 0 | 17 | legacy minute row | |';
  const beforeRejectedProjection = readFileSync(storePath, 'utf8');
  await assert.rejects(
    postTimingEvent({
      issueNumber: 1045,
      repo: 'owner/repo',
      row: legacyMinuteRow,
      projectionId: 'acquire:missing-row-sec:timing',
      subOperationId: 'acquire:missing-row-sec:timing:bind',
      projDir: tmp,
    }),
    /projected timing row.*row-sec/
  );
  assert.equal(
    readFileSync(storePath, 'utf8'),
    beforeRejectedProjection,
    'invalid projected row must be rejected before GitHub mutation'
  );
  await postTimingEvent({
    issueNumber: 1045,
    repo: 'owner/repo',
    row: legacyMinuteRow,
    projDir: tmp,
  });
  assert.equal(timingBody('1045').includes('legacy minute row'), true);

  const adversarialStore = JSON.parse(readFileSync(storePath, 'utf8'));
  adversarialStore.comments.push(
    {
      id: `C_${adversarialStore.nextId++}`,
      url: 'https://example/indented-code',
      issue: '1046',
      body: [
        '⏱ Timing Log',
        '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
        '|---|---|---|---|---|---|---|---|',
        `    | 2026-07-30 09:00:00 -05:00 | update |  |  |  | 17 | indented code | ${indentedMarker} <!-- row-sec: a=0 i=0 -->`,
      ].join('\n'),
    },
    {
      id: `C_${adversarialStore.nextId++}`,
      url: 'https://example/foreign-table',
      issue: '1047',
      body: [
        '⏱ Timing Log',
        '| Recorded at | Kind | A | B | C | Count | Notes | Extra |',
        '|---|---|---|---|---|---|---|---|',
        `| 2026-07-30 09:00:00 -05:00 | update |  |  |  | 17 | foreign table | ${foreignMarker} <!-- row-sec: a=0 i=0 -->`,
      ].join('\n'),
    }
  );
  writeFileSync(storePath, JSON.stringify(adversarialStore));
  for (const [issueNumber, adversarialProjection, adversarialSubOperation] of [
    [1046, indentedProjection, indentedSubOperation],
    [1047, foreignProjection, foreignSubOperation],
  ]) {
    assert.deepEqual(
      await readTimingProjection({
        issueNumber,
        repo: 'owner/repo',
        projectionId: adversarialProjection,
        subOperationIds: [adversarialSubOperation],
      }),
      {
        reconciled: false,
        projectionName: 'timing',
        projectionId: adversarialProjection,
        missingSubOperationIds: [adversarialSubOperation],
      }
    );
  }

  await postTimingEvent({
    issueNumber: 1048,
    repo: 'owner/repo',
    row: forgedRow,
    projectionId: forgedProjection,
    subOperationId: forgedSubOperation,
    projDir: tmp,
  });
  assert.equal(
    timingBody('1048').split('forged marker must not suppress this append').length - 1,
    1
  );
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1048,
      repo: 'owner/repo',
      projectionId: forgedProjection,
      subOperationIds: [forgedSubOperation],
    }),
    { reconciled: true, projectionName: 'timing', projectionId: forgedProjection }
  );

  // A real numeric issue id crosses the public helper boundary and reaches the
  // fake gh process without `.replace` throwing.
  const startRow = row('start', 'first projected bind');
  const first = await postTimingEvent({
    issueNumber: 1049,
    repo: 'owner/repo',
    row: startRow,
    projectionId,
    subOperationId: bindId,
    projDir: tmp,
  });
  assert.deepEqual(first, {
    status: 'posted',
    projectionId,
    subOperationId: bindId,
  });

  // Simulate remote success followed by a local checkpoint crash: the exact
  // retry must read the marker before duplicate-start policy and perform no
  // second append.
  const replay = await postTimingEvent({
    issueNumber: '1049',
    repo: 'owner/repo',
    row: startRow,
    projectionId,
    subOperationId: bindId,
    projDir: tmp,
  });
  assert.deepEqual(replay, {
    status: 'already-reconciled',
    projectionId,
    subOperationId: bindId,
  });
  assert.equal(timingBody().split('first projected bind').length - 1, 1);
  assert.equal(
    timingBody().split(timingProjectionMarker({ projectionId, subOperationId: bindId })).length - 1,
    1
  );
  const projectedStartLine = timingBody()
    .split('\n')
    .find((line) => line.includes('first projected bind'));
  assert.match(parseTimingRow(projectedStartLine).marker, /row-sec: a=0 i=0/);

  // A repeated projected `resumed` row is also suppressed by exact identity,
  // rather than by event-shape heuristics.
  const resumedProjection = 'acquire:request-resumed:timing';
  const resumedSubId = `${resumedProjection}:bind`;
  const pauseRow = row('pause:other', 'open interruption');
  await postTimingEvent({ issueNumber: 1049, repo: 'owner/repo', row: pauseRow, projDir: tmp });
  const resumedRow = row('resumed', 'projected resumed');
  await postTimingEvent({
    issueNumber: 1049,
    repo: 'owner/repo',
    row: resumedRow,
    projectionId: resumedProjection,
    subOperationId: resumedSubId,
    projDir: tmp,
  });
  await postTimingEvent({
    issueNumber: 1049,
    repo: 'owner/repo',
    row: resumedRow,
    projectionId: resumedProjection,
    subOperationId: resumedSubId,
    projDir: tmp,
  });
  assert.equal(timingBody().split('projected resumed').length - 1, 1);

  // Two required sub-operations reconcile only after both exact markers exist,
  // and read-back verifies their required order.
  const twoRowProjection = 'acquire:request-two-rows:timing';
  const twoDeparture = `${twoRowProjection}:synthetic-departure`;
  const twoBind = `${twoRowProjection}:bind`;
  await postTimingEvent({
    issueNumber: 1050,
    repo: 'owner/repo',
    row: row('pause:auto-detected-gap', 'synthetic departure'),
    projectionId: twoRowProjection,
    subOperationId: twoDeparture,
    projDir: tmp,
  });
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1050,
      repo: 'owner/repo',
      projectionId: twoRowProjection,
      subOperationIds: [twoDeparture, twoBind],
    }),
    {
      reconciled: false,
      projectionName: 'timing',
      projectionId: twoRowProjection,
      missingSubOperationIds: [twoBind],
    }
  );
  await postTimingEvent({
    issueNumber: 1050,
    repo: 'owner/repo',
    row: row('resumed', 'bind after synthetic departure'),
    projectionId: twoRowProjection,
    subOperationId: twoBind,
    projDir: tmp,
  });
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1050,
      repo: 'owner/repo',
      projectionId: twoRowProjection,
      subOperationIds: [twoDeparture, twoBind],
    }),
    { reconciled: true, projectionName: 'timing', projectionId: twoRowProjection }
  );
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1050,
      repo: 'owner/repo',
      projectionId: twoRowProjection,
      subOperationIds: [twoBind, twoDeparture],
    }),
    {
      reconciled: false,
      projectionName: 'timing',
      projectionId: twoRowProjection,
      missingSubOperationIds: [],
      outOfOrder: true,
    }
  );
  assert.ok(
    timingBody('1050').indexOf(
      timingProjectionMarker({
        projectionId: twoRowProjection,
        subOperationId: twoDeparture,
      })
    ) <
      timingBody('1050').indexOf(
        timingProjectionMarker({
          projectionId: twoRowProjection,
          subOperationId: twoBind,
        })
      )
  );

  const sharedRowProjection = 'acquire:shared-row:timing';
  const sharedFirst = `${sharedRowProjection}:departure`;
  const sharedSecond = `${sharedRowProjection}:bind`;
  const sharedFirstMarker = timingProjectionMarker({
    projectionId: sharedRowProjection,
    subOperationId: sharedFirst,
  });
  const sharedSecondMarker = timingProjectionMarker({
    projectionId: sharedRowProjection,
    subOperationId: sharedSecond,
  });
  const duplicateProjection = 'acquire:duplicate-row:timing';
  const duplicateSubOperation = `${duplicateProjection}:bind`;
  const duplicateMarker = timingProjectionMarker({
    projectionId: duplicateProjection,
    subOperationId: duplicateSubOperation,
  });
  const malformedStore = JSON.parse(readFileSync(storePath, 'utf8'));
  malformedStore.comments.push(
    {
      id: `C_${malformedStore.nextId++}`,
      url: 'https://example/shared-row',
      issue: '1052',
      body: [
        '⏱ Timing Log',
        '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
        '|---|---|---|---|---|---|---|---|',
        `| 2026-07-30 09:00:00 -05:00 | resumed |  |  |  | 17 | two receipts on one row | ${sharedFirstMarker} ${sharedSecondMarker} <!-- row-sec: a=0 i=0 -->`,
      ].join('\n'),
    },
    {
      id: `C_${malformedStore.nextId++}`,
      url: 'https://example/duplicate-row',
      issue: '1053',
      body: [
        '⏱ Timing Log',
        '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
        '|---|---|---|---|---|---|---|---|',
        `| 2026-07-30 09:00:00 -05:00 | update |  |  |  | 17 | duplicate one | ${duplicateMarker} <!-- row-sec: a=0 i=0 -->`,
        `| 2026-07-30 09:00:01 -05:00 | update |  |  |  | 17 | duplicate two | ${duplicateMarker} <!-- row-sec: a=0 i=0 -->`,
      ].join('\n'),
    }
  );
  writeFileSync(storePath, JSON.stringify(malformedStore));
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1052,
      repo: 'owner/repo',
      projectionId: sharedRowProjection,
      subOperationIds: [sharedFirst, sharedSecond],
    }),
    {
      reconciled: false,
      projectionName: 'timing',
      projectionId: sharedRowProjection,
      missingSubOperationIds: [sharedFirst, sharedSecond],
    }
  );
  assert.deepEqual(
    await readTimingProjection({
      issueNumber: 1053,
      repo: 'owner/repo',
      projectionId: duplicateProjection,
      subOperationIds: [duplicateSubOperation],
    }),
    {
      reconciled: false,
      projectionName: 'timing',
      projectionId: duplicateProjection,
      missingSubOperationIds: [],
      duplicateSubOperationIds: [duplicateSubOperation],
    }
  );

  // Queueing preserves the exact prebuilt row and both identities. Queue
  // acknowledgement is deliberately not shaped like a reconciliation proof.
  const queuedRow = row('update', 'queued projected row');
  const queued = enqueueTimingProjection(
    {
      issue: 1051,
      row: queuedRow,
      projectionId,
      subOperationId: departureId,
    },
    queuePath
  );
  assert.deepEqual(queued, {
    ok: false,
    queued: true,
    projectionId,
    subOperationId: departureId,
  });
  assert.equal(Object.hasOwn(queued, 'reconciled'), false);
  assert.deepEqual(
    peek(queuePath).map(({ queuedAt: _queuedAt, ...event }) => event),
    [
      {
        kind: 'timing',
        issue: 1051,
        row: queuedRow,
        projectionId,
        subOperationId: departureId,
      },
    ]
  );
  await drain(
    (event) =>
      postTimingEvent({
        issueNumber: event.issue,
        repo: 'owner/repo',
        row: event.row,
        projectionId: event.projectionId,
        subOperationId: event.subOperationId,
        projDir: tmp,
      }),
    queuePath
  );
  assert.deepEqual(peek(queuePath), []);
  // Re-delivery of the same durable queue payload remains safe.
  enqueueTimingProjection(
    {
      issue: 1051,
      row: queuedRow,
      projectionId,
      subOperationId: departureId,
    },
    queuePath
  );
  await drain(
    (event) =>
      postTimingEvent({
        issueNumber: event.issue,
        repo: 'owner/repo',
        row: event.row,
        projectionId: event.projectionId,
        subOperationId: event.subOperationId,
        projDir: tmp,
      }),
    queuePath
  );
  assert.equal(timingBody('1051').split('queued projected row').length - 1, 1);
} finally {
  process.env.PATH = priorPath;
  if (priorStore === undefined) delete process.env.FAKE_GH_STORE;
  else process.env.FAKE_GH_STORE = priorStore;
  if (priorProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  else process.env.AI_TASK_MANAGER_PROJECT_DIR = priorProjectDir;
  rmSync(tmp, { recursive: true, force: true });
}

console.log('work-lease-timing-projection.test.mjs: all passed');
