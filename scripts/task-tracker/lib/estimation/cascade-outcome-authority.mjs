// Cascade uses the already-authorized parent Close transaction. Child work
// evidence is still fresh and exact; no independent child approval is invented.
import { parseValidatedVerificationReceipts } from '../verification-receipt.mjs';
import { isIssueResidentDeliveryKind, parseDeliverablePosted } from '../issue-kind.mjs';
import { outcomeProofDigest } from './outcome-delivery-proof.mjs';
function refuse(reason) {
  throw new TypeError('cascade-outcome-authority:' + reason);
}
export function createCascadeOutcomeAuthority({ repository, parentIssue, issue, deps }) {
  let acceptedSha = null;
  return {
    resolveVerificationSha({ issueNumber }) {
      if (Number(issueNumber) !== issue || !acceptedSha) refuse('unresolved');
      return acceptedSha;
    },
    async resolveDeliveryAuthority({ issueNumber }) {
      if (Number(issueNumber) !== issue || issue === parentIssue) refuse('issue');
      const parent = await deps.refreshParent();
      if (
        parent?.gateInput?.repository !== repository ||
        parent.gateInput.issueNumber !== parentIssue ||
        !['human', 'full-auto'].includes(parent.authorization?.mode) ||
        !new RegExp('^[0-9a-f]{40}$').test(parent.gateInput.acceptedSha) ||
        parent.testReceiptSha !== parent.gateInput.acceptedSha ||
        parent.acceptedReviewSha !== parent.gateInput.acceptedSha
      )
        refuse('parent');
      const children = await deps.readChildCensus();
      if (
        !Array.isArray(children) ||
        children.some(
          (child) =>
            !Number.isSafeInteger(Number(child.num)) ||
            Number(child.num) <= 0 ||
            !['review', 'done'].includes(child.state)
        )
      )
        refuse('census');
      const childIssues = children.map((child) => Number(child.num)).sort((a, b) => a - b);
      if (
        new Set(childIssues).size !== childIssues.length ||
        !childIssues.includes(issue) ||
        (await deps.readChildParent()) !== parentIssue
      )
        refuse('relation');
      const body = await deps.readChildBody();
      const receipts = parseValidatedVerificationReceipts(body, { expectedIssue: issue });
      const tests = receipts.filter((receipt) => receipt.stage === 'test');
      const reviews = receipts.filter((receipt) => receipt.stage === 'review');
      if (tests.length !== 1 || reviews.length !== 1 || tests[0].commitSha !== reviews[0].commitSha)
        refuse('child-verification');
      const childSha = tests[0].commitSha;
      let lineageEvidence;
      if (isIssueResidentDeliveryKind(body)) {
        if (!parseDeliverablePosted(body)) refuse('resident-deliverable');
      } else {
        const lineage = await deps.readLineage({ body, acceptedSha: childSha });
        if (
          !lineage?.ok ||
          lineage.skipped ||
          !lineage.evidence ||
          lineage.evidence.parentIssue !== parentIssue ||
          lineage.evidence.acceptedSha !== childSha
        )
          refuse('lineage');
        lineageEvidence = lineage.evidence;
      }
      if (acceptedSha !== null && acceptedSha !== childSha) refuse('child-head-changed');
      acceptedSha = childSha;
      const cascadeAuthorization = {
        schema: 'aitm.cascade-outcome-authorization/v1',
        repository,
        parentIssue,
        parentAcceptedSha: parent.gateInput.acceptedSha,
        approvalMode: parent.authorization.mode,
        parentProofDigest: outcomeProofDigest({
          repository,
          parentIssue,
          acceptedSha: parent.gateInput.acceptedSha,
          authorization: parent.authorization,
          receipt: parent.receipt,
          testReceiptSha: parent.testReceiptSha,
          acceptedReviewSha: parent.acceptedReviewSha,
        }),
        childIssues,
      };
      return {
        gateInput: {
          repository,
          issueNumber: issue,
          acceptedSha,
          body,
          lineage: { parentIssueNumber: parentIssue },
        },
        deliveryBody: body,
        testReceiptSha: acceptedSha,
        acceptedReviewSha: acceptedSha,
        ...(lineageEvidence ? { lineageEvidence } : {}),
        cascadeAuthorization,
      };
    },
  };
}
