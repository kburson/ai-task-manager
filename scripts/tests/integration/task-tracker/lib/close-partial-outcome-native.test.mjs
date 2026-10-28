// @story #2100
import assert from 'node:assert/strict';
import test from 'node:test';
import { partialCloseFixture } from '../../../helpers/2100-partial-close-outcome.mjs';
import { TERMINAL_CLOSE_STEPS } from '../../../../task-tracker/lib/close-convergence.mjs';
import { activeEstimationOutcomes } from '../../../../task-tracker/lib/estimation/outcome-chain.mjs';
test('ordinary two-hop partial Close appends a real exact-source Unknown outcome and finishes all eight steps', async () => {
  const f = await partialCloseFixture();
  try {
    const result = await f.invoke();
    assert.equal(result.exitCode, 0, JSON.stringify(result.calls));
    assert.deepEqual(f.transaction().completedSteps, [...TERMINAL_CLOSE_STEPS]);
    assert.equal(result.records.length, 2);
    assert.deepEqual(result.records[0], f.original);
    const active = activeEstimationOutcomes(result.records);
    assert.equal(active.length, 1);
    assert.equal(active[0].envelope.supersedes, f.original.envelope.recordId);
    assert.equal(active[0].envelope.payload.telemetry.verificationSha, f.acceptedSha);
    assert.equal(active[0].envelope.payload.actual.engagedHours, null);
  } finally {
    f.cleanup();
  }
});
test('publication interruption retries the same current outcome without rewriting old Unknown evidence', async () => {
  const f = await partialCloseFixture();
  try {
    await assert.rejects(
      f.invoke({ interrupt: true }),
      /interrupt after actual outcome publication/
    );
    assert.equal(f.records.length, 2);
    assert.deepEqual(f.transaction().completedSteps, []);
    const published = structuredClone(f.records[1]);
    const retry = await f.invoke();
    assert.equal(retry.exitCode, 0);
    assert.deepEqual(f.transaction().completedSteps, [...TERMINAL_CLOSE_STEPS]);
    assert.equal(retry.writes, 2); // seed plus one correction; no duplicate on retry
    assert.deepEqual(f.records, [f.original, published]);
  } finally {
    f.cleanup();
  }
});
test('changed canonical timing refuses before writing a replacement', async () => {
  const f = await partialCloseFixture();
  try {
    await assert.rejects(f.invoke({ alterTiming: true }), /telemetry-source-lineage/);
    assert.deepEqual(f.records, [f.original]);
    assert.deepEqual(f.transaction().completedSteps, []);
  } finally {
    f.cleanup();
  }
});
test('journal changed between preparation and publication refuses before outcome or terminal writes', async () => {
  const f = await partialCloseFixture();
  try {
    f.setAuthorityHook((input, ports) => {
      if (input.phase === 'publication') ports.changeJournal();
    });
    await assert.rejects(f.invoke(), /close-partial-outcome:journal/);
    assert.deepEqual(f.records, [f.original]);
    assert.deepEqual(f.transaction().completedSteps, []);
  } finally {
    f.cleanup();
  }
});
test('a predecessor replaced while waiting for the real writer claim refuses without another append', async () => {
  const f = await partialCloseFixture();
  try {
    f.setClaimHook((records) => {
      const changed = structuredClone(records[0]);
      changed.envelope.recordId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      changed.envelope.supersedes = records[0].envelope.recordId;
      changed.commentNodeId = 'IC_concurrent_outcome';
      records.push(changed);
    });
    await assert.rejects(f.invoke(), new RegExp('outcome-partial-correction-predecessor'));
    assert.equal(f.records.length, 2);
    assert.deepEqual(f.records[0], f.original);
    assert.deepEqual(f.transaction().completedSteps, []);
  } finally {
    f.cleanup();
  }
});
test('journal drift in the runtime final delivery refresh refuses before the immutable append', async () => {
  const f = await partialCloseFixture();
  try {
    let changed = false;
    f.setDeliveryHook((ports) => {
      if (!changed) {
        changed = true;
        ports.changeJournal();
      }
    });
    await assert.rejects(f.invoke(), new RegExp('journal|proof authority'));
    assert.deepEqual(f.records, [f.original]);
    assert.deepEqual(f.transaction().completedSteps, []);
  } finally {
    f.cleanup();
  }
});
test('canonical timing changed while waiting for the writer claim refuses before the immutable append', async () => {
  const f = await partialCloseFixture();
  try {
    f.setClaimHook(() => f.changeTiming());
    await assert.rejects(f.invoke(), new RegExp('telemetry-source-lineage'));
    assert.deepEqual(f.records, [f.original]);
    assert.deepEqual(f.transaction().completedSteps, []);
  } finally {
    f.cleanup();
  }
});
test('repeated interruptions before each of the eight checkpoints reuse the one corrected outcome', async () => {
  const f = await partialCloseFixture();
  try {
    let corrected;
    for (let next = 1; next <= 8; next++) {
      await assert.rejects(
        f.invoke({ interruptBeforeCheckpoint: next }),
        new RegExp('checkpoint interruption ' + next)
      );
      assert.deepEqual(f.transaction().completedSteps, TERMINAL_CLOSE_STEPS.slice(0, next - 1));
      assert.equal(f.records.length, 2);
      corrected ??= structuredClone(f.records[1]);
      assert.deepEqual(f.records, [f.original, corrected]);
    }
    const result = await f.invoke();
    assert.equal(result.exitCode, 0);
    assert.deepEqual(f.transaction().completedSteps, [...TERMINAL_CLOSE_STEPS]);
    assert.deepEqual(f.records, [f.original, corrected]);
  } finally {
    f.cleanup();
  }
});
