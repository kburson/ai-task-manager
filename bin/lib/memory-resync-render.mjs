// #978 — the `npm-check`-style scrollable, arrow-key-navigable resync list.
//
// Split into a pure state/render core (`buildListItems`,
// `createInteractiveState`, `renderFrame`) and an impure terminal driver
// (`runInteractive`) that wires real keypress events to that core — mirroring
// the injected-`ask`/`log` seam `configurePreferences` uses (bin/cli.mjs,
// #651) so the interaction logic is unit-testable without a real TTY: tests
// drive the pure core directly, or emit synthetic 'keypress' events on a
// plain EventEmitter stood in for `input`.

import { emitKeypressEvents } from 'node:readline';

// Fixed group order: actionable statuses first (in review priority), then
// the informational `unchanged` group last.
export const STATUS_ORDER = ['new', 'changed', 'locally-modified', 'deprecated', 'unchanged'];

export const STATUS_LABELS = {
  new: 'New',
  changed: 'Changed upstream',
  'locally-modified': 'Locally modified',
  deprecated: 'Deprecated',
  unchanged: 'Unchanged',
};

const ACTIONABLE = new Set(['new', 'changed', 'locally-modified', 'deprecated']);

// Classification → flat, grouped, decision-annotated item list. Nothing is
// pre-accepted: `new`/`changed`/`locally-modified` default to 'skip',
// `deprecated` defaults to 'keep' (both no-ops until explicitly toggled).
export function buildListItems(classification) {
  return STATUS_ORDER.flatMap((status) =>
    classification
      .filter((c) => c.status === status)
      .map((c) => ({
        file: c.file,
        status,
        actionable: ACTIONABLE.has(status),
        decision: status === 'deprecated' ? 'keep' : 'skip',
      }))
  );
}

// Cursor only ever visits actionable rows — `unchanged` items are
// informational and never need a decision.
export function createInteractiveState(items) {
  const actionableIdx = items.reduce((acc, it, i) => {
    if (it.actionable) acc.push(i);
    return acc;
  }, []);
  let cursorPos = 0;

  return {
    items,
    get cursor() {
      return actionableIdx.length ? actionableIdx[cursorPos] : -1;
    },
    moveCursor(delta) {
      if (!actionableIdx.length) return;
      cursorPos = (cursorPos + delta + actionableIdx.length) % actionableIdx.length;
    },
    toggle() {
      const idx = actionableIdx.length ? actionableIdx[cursorPos] : -1;
      if (idx < 0) return;
      const item = items[idx];
      if (item.status === 'deprecated') {
        item.decision = item.decision === 'remove' ? 'keep' : 'remove';
      } else {
        item.decision = item.decision === 'accept' ? 'skip' : 'accept';
      }
    },
    getDecisions() {
      const out = {};
      for (const it of items) out[it.file] = it.decision;
      return out;
    },
  };
}

export function renderFrame(state) {
  const lines = [];
  let lastStatus = null;
  state.items.forEach((item, idx) => {
    if (item.status !== lastStatus) {
      lines.push('');
      lines.push(`${STATUS_LABELS[item.status]}:`);
      lastStatus = item.status;
    }
    if (!item.actionable) {
      lines.push(`    ${item.file}`);
      return;
    }
    const pointer = idx === state.cursor ? '>' : ' ';
    const checked = item.decision === 'accept' || item.decision === 'remove';
    lines.push(`${pointer} [${checked ? 'x' : ' '}] ${item.file}`);
  });
  return lines.join('\n').replace(/^\n/, '');
}

// Impure terminal driver. Resolves with the final `{file: decision}` map on
// Enter, or `null` on Escape/Ctrl-C (abort, apply nothing). `draw` defaults
// to writing frames to `output`; tests inject a capturing `draw` instead.
export async function runInteractive({ classification, input, output, draw } = {}) {
  const items = buildListItems(classification);
  const state = createInteractiveState(items);
  const paint =
    draw ||
    ((frame) =>
      output.write(`${frame}\n\n(up/down move, space toggle, enter confirm, esc cancel)\n`));

  paint(renderFrame(state));

  return new Promise((resolve) => {
    if (typeof input.setRawMode === 'function') input.setRawMode(true);
    if (typeof emitKeypressEvents === 'function' && input.isTTY) emitKeypressEvents(input);

    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        state.moveCursor(-1);
        paint(renderFrame(state));
      } else if (key.name === 'down') {
        state.moveCursor(1);
        paint(renderFrame(state));
      } else if (key.name === 'space') {
        state.toggle();
        paint(renderFrame(state));
      } else if (key.name === 'return') {
        cleanup();
        resolve(state.getDecisions());
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
      }
    };
    function cleanup() {
      input.removeListener('keypress', onKey);
      if (typeof input.setRawMode === 'function') input.setRawMode(false);
    }
    input.on('keypress', onKey);
    if (typeof input.resume === 'function') input.resume();
  });
}
