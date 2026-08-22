// @story #939
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  buildDeliveryCommitText,
  MAX_DELIVERY_COMMIT_MESSAGE_BYTES,
} from '../../../../task-tracker/lib/delivery-attribution.mjs';

const expectedHeadSha = 'a'.repeat(40);

function input(overrides = {}) {
  return {
    issueNumber: 939,
    prNumber: 1400,
    expectedHeadSha,
    commitSubjects: [
      '[#1275] Deliver second child',
      '[#939] Deliver governed PR workflow',
      '[#1274] Deliver first child',
      '[#1274] Follow up on first child',
    ],
    ...overrides,
  };
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('builds exact deterministic title, message, sorted tokens, and stable SHA-256 hashes', () => {
  const result = buildDeliveryCommitText(input());

  assert.deepEqual(result, {
    attributionTokens: ['#1274', '#1275', '#939'],
    commitTitle: '[#939] Governed PR delivery',
    commitMessage:
      `PR #1400\nSource: ${expectedHeadSha}\n\n` + 'Attribution: [#939] [#1274] [#1275]',
    commitTitleSha256: createHash('sha256').update('[#939] Governed PR delivery').digest('hex'),
    commitMessageSha256: createHash('sha256')
      .update(`PR #1400\nSource: ${expectedHeadSha}\n\n` + 'Attribution: [#939] [#1274] [#1275]')
      .digest('hex'),
  });
  assertDeepFrozen(result);
});

test('deduplicates tokens across subjects and sorts the durable token set', () => {
  const result = buildDeliveryCommitText(
    input({
      issueNumber: 2,
      commitSubjects: ['[#10] Child ten', '[#2] Parent', '[#3] [#10] Child dependencies'],
    })
  );

  assert.deepEqual(result.attributionTokens, ['#10', '#2', '#3']);
  assert.equal(result.commitTitle, '[#2] Governed PR delivery');
  assert.match(result.commitMessage, /Attribution: \[#2\] \[#10\] \[#3\]$/);
});

test('rejects malformed input, missing source subjects, and missing top-level attribution', () => {
  for (const invalid of [
    input({ extra: true }),
    input({ issueNumber: 0 }),
    input({ prNumber: 0 }),
    input({ expectedHeadSha: 'A'.repeat(40) }),
    input({ expectedHeadSha: 'a'.repeat(39) }),
    input({ commitSubjects: [] }),
    input({ commitSubjects: ['[#939] Parent', 'child without attribution'] }),
    input({ commitSubjects: ['[#1274] Child only'] }),
    input({ commitSubjects: ['[#939] Parent\nInjected body'] }),
  ]) {
    assert.throws(() => buildDeliveryCommitText(invalid), /delivery-attribution:/);
  }
});

test('rejects duplicate semantic tokens within one source subject', () => {
  for (const commitSubjects of [
    ['[#939] Parent [#939] repeated'],
    ['[#939] Parent [#0939] alias'],
  ]) {
    assert.throws(
      () => buildDeliveryCommitText(input({ commitSubjects })),
      /delivery-attribution:(duplicate-token|source-subject)/
    );
  }
});

test('rejects a generated commit message above the exported byte bound', () => {
  const commitSubjects = ['[#939] Parent'];
  for (let index = 0; index < MAX_DELIVERY_COMMIT_MESSAGE_BYTES; index += 1) {
    commitSubjects.push(`[#${1_000_000 + index}] Child`);
  }

  assert.throws(
    () => buildDeliveryCommitText(input({ commitSubjects })),
    /delivery-attribution:commit-message-too-large/
  );
});
