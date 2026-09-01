// @story #937

import { parseVerificationReceipt } from '../verification-receipt.mjs';

function valueOf(record) {
  return record && typeof record === 'object' && 'value' in record ? record.value : record;
}

function receiptIsCurrent(receipt, snapshot) {
  const headSha = valueOf(snapshot?.headSha);
  return (
    receipt?.stage === 'develop-final' &&
    typeof headSha === 'string' &&
    receipt.commitSha === headSha &&
    ['lint-full', 'format-full'].every((classification) =>
      receipt.commands?.some(
        (command) => command.classification === classification && command.exitCode === 0
      )
    )
  );
}

export const developVerificationAction = Object.freeze({
  id: 'develop-verification',
  serialization: 'issue-lock',

  async verify(context, snapshot) {
    const body = String(valueOf(snapshot?.body) || '');
    const receipt =
      (await context?.develop?.readReceipt?.({ snapshot })) ||
      parseVerificationReceipt(body, 'develop-final');
    return receiptIsCurrent(receipt, snapshot)
      ? {
          status: 'complete',
          evidence: { receiptId: receipt.receiptId, commitSha: receipt.commitSha },
        }
      : { status: 'incomplete', reason: 'fresh-develop-receipt-missing' };
  },

  async run(context, snapshot, { correlation } = {}) {
    if (
      typeof context?.develop?.finalize !== 'function' ||
      typeof context?.develop?.persistReceipt !== 'function'
    ) {
      return { status: 'paused', reason: 'develop-capabilities-unavailable' };
    }
    const issueNumber = Number(valueOf(snapshot?.issue) ?? snapshot?.invocation?.issue);
    const result = await context.develop.finalize({ issueNumber, snapshot, correlation });
    if (!result?.ok || !result.receipt) {
      return { status: 'failed', reason: result?.reason || 'develop-verification-failed' };
    }
    await context.develop.persistReceipt({
      issueNumber,
      snapshot,
      receipt: result.receipt,
      correlation,
    });
    return { status: 'complete', evidence: { correlation, receipt: result.receipt } };
  },
});
