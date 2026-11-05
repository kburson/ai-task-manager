// @story #2161 — shared pure assertion; no source or lifecycle authority grant.
export function assertGovernedMutationSession(state, issueNumber) {
  const match = String(issueNumber || '').match(/^#?(\d+)$/);
  const number = match ? Number(match[1]) : 0;
  if (!Number.isInteger(number) || number <= 0) throw new Error('issue-body:issue-number');
  const active = String(state?.active || '').replace(/^#/, '');
  if (active !== String(number))
    throw new Error(
      `issue-body:session: active issue #${active || 'none'} differs from target #${number}`
    );
  if (!state?.entryStartTs || state?.pausedAtTs)
    throw new Error('issue-body:session: an open timing session is required');
}
