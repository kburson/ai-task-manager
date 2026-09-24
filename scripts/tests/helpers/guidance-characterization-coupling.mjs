// @story #1658
function fail() {
  throw new TypeError('guidance-candidate:human-request-coupling');
}

export function assertHumanRequestCoupling(decision) {
  const requests = decision.humanDecision?.requests ?? [];
  const required = [];
  for (const blocker of decision.blockers) {
    if (blocker.code === 'cross-issue-plan-approval-missing') {
      required.push({
        kind: 'plan-approval',
        issue: blocker.args.issue,
        actionId: blocker.args.actionId,
      });
    }
    if (
      blocker.code === 'authority-read-failed' ||
      blocker.code === 'authority-read-skipped' ||
      blocker.code === 'unclassified-refusal' ||
      blocker.code === 'state-unavailable'
    ) {
      required.push({
        kind: 'manual-investigation',
        issue: decision.issue,
        actionId: decision.actionId,
        guardId: blocker.guardId,
        code: blocker.code,
      });
    }
    if (blocker.code === 'plan-approval-missing') {
      required.push({ kind: 'plan-approval', issue: decision.issue, actionId: 'promote' });
    }
    if (blocker.code === 'review-approval-missing') {
      required.push({
        kind: 'review-approval',
        issue: decision.issue,
        actionId: decision.actionId,
        head: decision.snapshot.head,
      });
    }
  }
  if (requests.length !== required.length) fail();
  required.forEach((expected, index) => {
    const request = requests[index];
    if (
      request.kind !== expected.kind ||
      request.subject.issue !== expected.issue ||
      request.subject.actionId !== expected.actionId ||
      (expected.guardId !== undefined && request.args.guardId !== expected.guardId) ||
      (expected.code !== undefined && request.args.code !== expected.code) ||
      (expected.head !== undefined && request.args.head !== expected.head)
    ) {
      fail();
    }
  });
}
