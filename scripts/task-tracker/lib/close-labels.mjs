// #705 — closed issues must drop the `ToDo` and `BLOCKED` labels: once an
// issue is closed it is no longer tracked by the board or blocking anything,
// so carrying either label is stale board-state.
//
// Pure arg-builder, mirroring `blockedLabelRemoveArgs` in blocked-marker.mjs:
// no network, no gh invocation here. Consumers run the returned args through
// their own gh wrapper.

export const CLOSE_STRIP_LABELS = ['ToDo', 'BLOCKED'];

/**
 * CLI args to strip the `ToDo` and `BLOCKED` labels from an issue (run via the
 * consumer's gh wrapper).
 *
 * @param {number|string} issueNumber
 * @returns {string[]} `['issue','edit',<n>,'--remove-label','ToDo','--remove-label','BLOCKED']`
 */
export function closeLabelRemoveArgs(issueNumber) {
  return [
    'issue',
    'edit',
    String(issueNumber),
    ...CLOSE_STRIP_LABELS.flatMap((label) => ['--remove-label', label]),
  ];
}
