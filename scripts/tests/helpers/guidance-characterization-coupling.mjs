// @story #1658
function fail() {
  throw new TypeError('guidance-candidate:human-request-coupling');
}

export function assertHumanRequestCoupling(decision) {
  const requests = decision.humanDecision?.requests ?? [];
  for (const blocker of decision.blockers) {
    if (blocker.code === 'cross-issue-plan-approval-missing') {
      const matched = requests.some(
        (request) =>
          request.kind === 'plan-approval' &&
          request.subject.issue === blocker.args.issue &&
          request.subject.actionId === blocker.args.actionId
      );
      if (!matched) fail();
    }
    if (blocker.code === 'authority-read-failed') {
      const matched = requests.some(
        (request) =>
          request.kind === 'manual-investigation' &&
          request.args.guardId === blocker.guardId &&
          request.args.code === blocker.code
      );
      if (!matched) fail();
    }
  }
}
