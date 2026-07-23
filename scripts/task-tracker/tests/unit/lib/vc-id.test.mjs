// @story #772
// Stable hidden VC ids: parser capture, monotonic tombstone-aware allocation,
// and `## Verification Commands` blank-line hygiene.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';
import {
  renderVcLine,
  renderVcSection,
  spliceVcSection,
  highestVcId,
  nextVcId,
  tombstonedVcIds,
  appendVcCommands,
  deleteVcById,
} from '../../../lib/vc-emit.mjs';

// ---- AC2: parser captures the hidden id, next-unused allocation -------------

test('parser exposes id from the trailing <!-- id=N --> marker (AC2)', () => {
  const body = ['## Verification Commands', '', renderVcLine('npm test', 1), ''].join('\n');
  const [item] = parseVerificationCommands(body);
  assert.equal(item.command, 'npm test');
  assert.equal(item.id, 1);
});

test('a pre-#772 id-less VC line parses to id: null (AC2, backward-compat)', () => {
  const body = ['## Verification Commands', '', '- [ ] `npm test`', ''].join('\n');
  const [item] = parseVerificationCommands(body);
  assert.equal(item.command, 'npm test');
  assert.equal(item.id, null);
});

test('renderVcSection stamps consecutive ids from startId (AC1)', () => {
  const section = renderVcSection(['a', 'b', 'c'], 4);
  const ids = parseVerificationCommands(section).map((it) => it.id);
  assert.deepEqual(ids, [4, 5, 6]);
});

test('nextVcId is one past the highest LIVE id (AC1)', () => {
  const body = renderVcSection(['a', 'b'], 1);
  assert.equal(highestVcId(body), 2);
  assert.equal(nextVcId(body), 3);
});

// ---- AC1 + AC6: ids are monotonic and NEVER reused, tombstones -------------

test('appending a command assigns the next id, not a positional slot (AC1)', () => {
  const body = renderVcSection(['a', 'b'], 1);
  const grown = appendVcCommands(body, ['c']);
  const items = parseVerificationCommands(grown);
  assert.deepEqual(
    items.map((it) => [it.command, it.id]),
    [
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]
  );
});

test('deleting a VC entry leaves a tombstone recording its id (AC6)', () => {
  const body = renderVcSection(['a', 'b', 'c'], 1);
  const afterDelete = deleteVcById(body, 2);
  // 'b' is gone from the LIVE list...
  assert.deepEqual(
    parseVerificationCommands(afterDelete).map((it) => it.command),
    ['a', 'c']
  );
  // ...but its id is tombstoned, so the high-water mark still knows about it.
  assert.ok(tombstonedVcIds(afterDelete).has(2));
  assert.equal(highestVcId(afterDelete), 3);
});

test('deleting the LAST entry does not free its id for the next append (AC6)', () => {
  // The load-bearing case: naive max(live-ids)+1 would reissue the freed id.
  const body = renderVcSection(['a', 'b', 'c'], 1); // ids 1,2,3
  const afterDelete = deleteVcById(body, 3); // delete the last entry, id 3
  assert.deepEqual(
    parseVerificationCommands(afterDelete).map((it) => it.command),
    ['a', 'b']
  );
  // A naive allocator would hand back 3 here; the tombstone forces 4.
  assert.equal(nextVcId(afterDelete), 4);
  const grown = appendVcCommands(afterDelete, ['d']);
  const dItem = parseVerificationCommands(grown).find((it) => it.command === 'd');
  assert.equal(dItem.id, 4);
  // The retired id 3 never resurfaces on a live entry.
  assert.ok(!parseVerificationCommands(grown).some((it) => it.id === 3));
});

test('ids stay monotonic across an interleaved delete-then-append burst (AC1, AC6)', () => {
  let body = renderVcSection(['a', 'b'], 1); // 1,2
  body = appendVcCommands(body, ['c']); // 3
  body = deleteVcById(body, 3); // tombstone 3
  body = appendVcCommands(body, ['d']); // must be 4, never 3
  body = deleteVcById(body, 1); // tombstone 1
  body = appendVcCommands(body, ['e']); // must be 5, never 1
  const live = parseVerificationCommands(body).map((it) => [it.command, it.id]);
  assert.deepEqual(live, [
    ['b', 2],
    ['d', 4],
    ['e', 5],
  ]);
});

// ---- AC5: header carries a blank line ABOVE and BELOW -----------------------

function assertHeaderPadded(body) {
  const lines = body.split('\n');
  const h = lines.findIndex((l) => /^##\s+Verification Commands\s*$/.test(l));
  assert.ok(h !== -1, 'VC header present');
  assert.equal(lines[h - 1], '', 'blank line ABOVE the header');
  assert.equal(lines[h + 1], '', 'blank line BELOW the header');
}

test('spliced VC section has a blank line above and below, even when glued (AC5)', () => {
  // `before` deliberately ends with NO trailing newline — the latent bug.
  const before = '## Scope\n\nsome scope text';
  const after = '## Definition of Done\n\n- [ ] done';
  const section = renderVcSection(['npm test'], 1);
  const body = spliceVcSection(before, section, after);
  assertHeaderPadded(body);
  // and the following heading is still separated by a blank line
  assert.match(body, /<!-- id=1 -->\n\n## Definition of Done/);
});

test('spliced VC section at end-of-body is padded above (AC5)', () => {
  const before = '## Scope\n\ntext with a single trailing newline\n';
  const body = spliceVcSection(before, renderVcSection(['npm test'], 1), '');
  assertHeaderPadded(body);
});
