// @story #937

import { parseVerificationReceipt } from '../verification-receipt.mjs';

function valueOf(record) {
  return record && typeof record === 'object' && 'value' in record ? record.value : record;
}

export const testQuickCiAction = Object.freeze({
  id: 'test-pr-quick-ci',
  serialization: 'correlation',

  async verify(context, snapshot) {
    if (typeof context?.test?.observe === 'function') {
      const observed = await context.test.observe({ snapshot });
      if (observed?.complete === true && observed.headSha === valueOf(snapshot?.headSha)) {
        return { status: 'complete', evidence: observed };
      }
      return { status: 'incomplete', reason: observed?.reason || 'quick-ci-incomplete' };
    }
    const receipt = parseVerificationReceipt(String(valueOf(snapshot?.body) || ''), 'test');
    const headSha = valueOf(snapshot?.headSha);
    return receipt && typeof headSha === 'string' && receipt.commitSha === headSha
      ? {
          status: 'complete',
          evidence: { receiptId: receipt.receiptId, commitSha: receipt.commitSha },
        }
      : { status: 'incomplete', reason: 'fresh-test-receipt-missing' };
  },

  async run(context, snapshot, { correlation } = {}) {
    if (typeof context?.test?.startOrObserve !== 'function') {
      return { status: 'paused', reason: 'test-capabilities-unavailable' };
    }
    const observed = await context.test.startOrObserve({ snapshot, correlation });
    if (observed?.kind === 'complete') return { status: 'complete', evidence: observed };
    if (observed?.kind === 'waiting' || observed?.kind === 'infrastructure') {
      return { status: 'waiting', deadline: observed.deadline, correlation };
    }
    if (observed?.kind === 'source-failure') {
      return { status: 'failed', reason: `source-rework-required:${observed.reason || 'unknown'}` };
    }
    return { status: 'paused', reason: observed?.reason || 'test-result-indeterminate' };
  },
});
