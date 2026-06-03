// #273 — extracted from activity-guard.mjs so tests can pin the block-message
// shape without importing the hook script (which has top-level side effects
// that read stdin and call process.exit).
//
// `buildReason` composes the human-readable refusal text for the activity
// guard. `suggestTransition` finds the earliest canonical state that would
// permit the requested activity. Both are pure: no I/O, no globals beyond
// the supplied STATE_MATRIX.

export function buildReason({ activityClass, target, state, activeIssue, toolName, STATE_MATRIX }) {
  const targetLabel = toolName === 'Bash' ? `\`${truncate(target, 80)}\`` : target;
  const stateLabel = state ?? 'no-active-task';
  const issueLabel = activeIssue ?? 'none';

  if (state == null) {
    if (activeIssue) {
      const id = activeIssue.replace(/^#/, '');
      return [
        `activity refused: ${activityClass} on ${targetLabel} — active task ${activeIssue} has no recorded kanban state.`,
        `  Active task: ${activeIssue}`,
        `  To proceed: Run \`/task reconcile accept-live ${id}\` to sync local state with the board.`,
      ].join('\n');
    }
    return [
      `activity refused: ${activityClass} on ${targetLabel} is not permitted with no active task.`,
      `  Active task: none`,
      `  To proceed: Run \`/task start <issue#>\` (or \`/task plan\` for untracked work) before editing code.`,
    ].join('\n');
  }

  const allowed = STATE_MATRIX[state] ?? [];
  const suggestion = suggestTransition(activityClass, state, activeIssue, STATE_MATRIX);

  return [
    `activity refused: ${activityClass} on ${targetLabel} is not permitted in state ${stateLabel}.`,
    `  Active task: ${issueLabel}`,
    `  Allowed in ${stateLabel}: ${allowed.join(', ') || '(none)'}`,
    `  To proceed: ${suggestion}`,
  ].join('\n');
}

export function suggestTransition(activityClass, currentState, activeIssue, STATE_MATRIX) {
  const id = activeIssue ? activeIssue.replace(/^#/, '') : '<id>';
  const order = ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done'];
  for (const s of order) {
    if (s === currentState) continue;
    const allowed = STATE_MATRIX[s] ?? [];
    if (allowed.includes(activityClass)) {
      return `\`/task move ${id} ${s}\``;
    }
  }
  return `(no kanban state permits ${activityClass}; review activity-policy.json)`;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
