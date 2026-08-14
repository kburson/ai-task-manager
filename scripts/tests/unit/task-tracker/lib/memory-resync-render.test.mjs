// @story #978
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  STATUS_ORDER,
  buildListItems,
  createInteractiveState,
  renderFrame,
  runInteractive,
} from '../../../../../bin/lib/memory-resync-render.mjs';

const SAMPLE_CLASSIFICATION = [
  { file: 'feedback_z.md', status: 'unchanged' },
  { file: 'feedback_a.md', status: 'new' },
  { file: 'feedback_b.md', status: 'changed' },
  { file: 'feedback_c.md', status: 'locally-modified' },
  { file: 'feedback_d.md', status: 'deprecated' },
];

test('buildListItems groups by fixed status order and defaults decisions to no-op', () => {
  const items = buildListItems(SAMPLE_CLASSIFICATION);
  assert.deepEqual(
    items.map((i) => i.status),
    STATUS_ORDER.filter((s) => SAMPLE_CLASSIFICATION.some((c) => c.status === s))
  );
  const byFile = Object.fromEntries(items.map((i) => [i.file, i]));
  assert.equal(byFile['feedback_a.md'].decision, 'skip');
  assert.equal(byFile['feedback_b.md'].decision, 'skip');
  assert.equal(byFile['feedback_c.md'].decision, 'skip');
  assert.equal(byFile['feedback_d.md'].decision, 'keep');
  assert.equal(byFile['feedback_z.md'].actionable, false, 'unchanged items are not actionable');
});

test('createInteractiveState: cursor only visits actionable rows and wraps', () => {
  const items = buildListItems(SAMPLE_CLASSIFICATION);
  const state = createInteractiveState(items);
  const firstActionableFile = items[state.cursor].file;
  assert.equal(firstActionableFile, 'feedback_a.md');

  // Walk forward through every actionable item and confirm it wraps back.
  const actionableCount = items.filter((i) => i.actionable).length;
  for (let i = 0; i < actionableCount; i++) state.moveCursor(1);
  assert.equal(items[state.cursor].file, firstActionableFile, 'cursor wraps around');
});

test('createInteractiveState: toggle flips accept/skip for new/changed/locally-modified, keep/remove for deprecated', () => {
  const items = buildListItems(SAMPLE_CLASSIFICATION);
  const state = createInteractiveState(items);
  // cursor starts on feedback_a.md (new)
  state.toggle();
  assert.equal(state.getDecisions()['feedback_a.md'], 'accept');
  state.toggle();
  assert.equal(state.getDecisions()['feedback_a.md'], 'skip');

  state.moveCursor(1); // feedback_b.md (changed)
  state.moveCursor(1); // feedback_c.md (locally-modified)
  state.moveCursor(1); // feedback_d.md (deprecated)
  state.toggle();
  assert.equal(state.getDecisions()['feedback_d.md'], 'remove');
  state.toggle();
  assert.equal(state.getDecisions()['feedback_d.md'], 'keep');
});

test('renderFrame lists every item and marks the cursor row', () => {
  const items = buildListItems(SAMPLE_CLASSIFICATION);
  const state = createInteractiveState(items);
  const frame = renderFrame(state);
  assert.match(frame, /New:/);
  assert.match(frame, /Changed upstream:/);
  assert.match(frame, /Locally modified:/);
  assert.match(frame, /Deprecated:/);
  assert.match(frame, /Unchanged:/);
  assert.match(frame, /> \[ \] feedback_a\.md/, 'cursor row is marked with >');
  assert.match(frame, /feedback_z\.md/, 'unchanged item is listed');
});

test('runInteractive resolves the decision set on Enter, driven by a fake input stream', async () => {
  const input = new EventEmitter();
  input.isTTY = false;
  const frames = [];
  const promise = runInteractive({
    classification: SAMPLE_CLASSIFICATION,
    input,
    draw: (frame) => frames.push(frame),
  });

  input.emit('keypress', null, { name: 'space' }); // accept feedback_a.md (new, cursor starts there)
  input.emit('keypress', null, { name: 'return' });

  const decisions = await promise;
  assert.equal(decisions['feedback_a.md'], 'accept');
  assert.equal(decisions['feedback_b.md'], 'skip');
  assert.ok(frames.length >= 2, 'frame is redrawn on toggle');
});

test('runInteractive resolves null on Escape (cancel, apply nothing)', async () => {
  const input = new EventEmitter();
  input.isTTY = false;
  const promise = runInteractive({
    classification: SAMPLE_CLASSIFICATION,
    input,
    draw: () => {},
  });

  input.emit('keypress', null, { name: 'space' });
  input.emit('keypress', null, { name: 'escape' });

  const decisions = await promise;
  assert.equal(decisions, null);
});
