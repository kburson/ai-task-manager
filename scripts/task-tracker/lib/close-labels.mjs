// #705 — closed issues must drop the `ToDo` label. Dependency authority is
// GitHub's native graph; legacy BLOCKED labels are no longer mutated here.
//
// Pure arg-builder, mirroring `blockedLabelRemoveArgs` in blocked-marker.mjs:
// no network, no gh invocation here. Consumers run the returned args through
// their own gh wrapper.

export const CLOSE_STRIP_LABELS = ['ToDo'];

/**
 * CLI args to strip the `ToDo` label from an issue (run via the
 * consumer's gh wrapper).
 *
 * @param {number|string} issueNumber
 * @returns {string[]} `['issue','edit',<n>,'--remove-label','ToDo']`
 */
export function closeLabelRemoveArgs(issueNumber) {
  return [
    'issue',
    'edit',
    String(issueNumber),
    ...CLOSE_STRIP_LABELS.flatMap((label) => ['--remove-label', label]),
  ];
}
