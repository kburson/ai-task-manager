const LIFECYCLE_OWNER = 'state-engine-policy-characterization.test.mjs';
const TIMING_OWNER = 'timing-event-emitter-characterization.test.mjs';
const CLI_OWNER = 'executable-entrypoint-classification.test.mjs';
const AUDIT_OWNER = '#1006 JIT audit and existing corrective regression suite';
const DELIVERY_OWNER = 'repository lint, format, fast, integration, and slow quality gates';

const ROWS = [
  [819, 'GE', '1006-audit-input', '#1006 lifecycle DoD migration audit', AUDIT_OWNER],
  [845, 'LP', 'direct-child', '#1009 lifecycle action and bootstrap policy', LIFECYCLE_OWNER],
  [848, 'LP', 'direct-child', '#1009 lifecycle action and park policy', LIFECYCLE_OWNER],
  [853, 'TI', 'verification-constraint', 'C1-C6 package-version delivery gates', DELIVERY_OWNER],
  [854, 'CLI', 'direct-child', '#1011 agentic CLI maintenance contract', CLI_OWNER],
  [855, 'TI', 'verification-constraint', 'C1-C6 untracked-test reach gate', DELIVERY_OWNER],
  [879, 'CLI', 'direct-child', '#1011 agentic CLI maintenance scope', CLI_OWNER],
  [891, 'GE', 'already-centralized', 'demonstrable AC policy and verifier', AUDIT_OWNER],
  [899, 'GE', '1006-audit-input', '#1006 issue-kind body migration audit', AUDIT_OWNER],
  [900, 'TI', 'verification-constraint', 'C1-C6 trunk quality gates', DELIVERY_OWNER],
  [901, 'TI', 'verification-constraint', 'C1-C6 test-discovery gate', DELIVERY_OWNER],
  [902, 'GE', '1006-audit-input', '#1006 DoD verifier reconciliation audit', AUDIT_OWNER],
  [904, 'TP', 'direct-child', '#1010 canonical timing-event policy', TIMING_OWNER],
  [921, 'OM', '1006-audit-input', '#1006 epic fan-out and mutation audit', AUDIT_OWNER],
  [922, 'TI', 'verification-constraint', 'C1-C6 sandbox timeout budget', DELIVERY_OWNER],
  [923, 'GE', 'already-centralized', 'issue-kind commit-requirement policy', AUDIT_OWNER],
  [927, 'OM', '1006-audit-input', '#1006 trunk-reference resolution audit', AUDIT_OWNER],
  [928, 'GE', 'already-centralized', 'AC evidence-reference policy', AUDIT_OWNER],
  [931, 'LP', 'direct-child', '#1009 lifecycle action home-state policy', LIFECYCLE_OWNER],
  [932, 'GE', '1006-audit-input', '#1006 demotion evidence cleanup audit', AUDIT_OWNER],
  [933, 'GE', 'already-centralized', 'lifecycle DoD marker parser', AUDIT_OWNER],
  [934, 'TI', 'verification-constraint', 'C1-C6 functional DoD runtime budget', DELIVERY_OWNER],
  [941, 'TI', 'verification-constraint', 'C1-C6 documentation test-reach gate', DELIVERY_OWNER],
  [942, 'TI', 'verification-constraint', 'C1-C6 spelling dictionary gate', DELIVERY_OWNER],
  [943, 'TI', 'verification-constraint', 'C1-C6 kind-aware DoD regression gate', DELIVERY_OWNER],
  [947, 'OM', '1006-audit-input', '#1006 closed-child board reconciliation audit', AUDIT_OWNER],
  [949, 'TI', 'verification-constraint', 'C1-C6 full-history provenance gate', DELIVERY_OWNER],
  [952, 'GE', '1006-audit-input', '#1006 Test verifier migration audit', AUDIT_OWNER],
  [953, 'OM', '1006-audit-input', '#1006 issue-kind parser boundary audit', AUDIT_OWNER],
  [963, 'OM', '1006-audit-input', '#1006 issue-kind section parser audit', AUDIT_OWNER],
  [964, 'CLI', 'direct-child', '#1011 agentic CLI safety inventory', CLI_OWNER],
  [968, 'OM', '1006-audit-input', '#1006 Review-to-Done trunk resolution audit', AUDIT_OWNER],
  [970, 'GE', 'already-centralized', 'no-commit issue-kind review policy', AUDIT_OWNER],
  [972, 'TP', '1006-audit-input', '#1006 timing-writer sequence audit', AUDIT_OWNER],
  [973, 'GE', 'already-centralized', 'VC evidence outcome policy', AUDIT_OWNER],
  [974, 'TI', 'verification-constraint', 'C1-C6 transitive parallel-safety gate', DELIVERY_OWNER],
  [975, 'GE', 'already-centralized', 'honest unverified evidence policy', AUDIT_OWNER],
  [979, 'GE', 'already-centralized', 'explicit human approval policy', AUDIT_OWNER],
  [981, 'TP', '1006-audit-input', '#1006 interrupted-session timing audit', AUDIT_OWNER],
  [983, 'TP', '1006-audit-input', '#1006 terminated-agent span audit', AUDIT_OWNER],
  [984, 'GE', '1006-audit-input', '#1006 agent-review forensic audit', AUDIT_OWNER],
  [991, 'TI', 'verification-constraint', 'C1-C6 documentation quality gates', DELIVERY_OWNER],
  [992, 'TI', 'verification-constraint', 'C1-C6 GitHub timeout budget', DELIVERY_OWNER],
  [993, 'TI', 'verification-constraint', 'C1-C6 fast-lane ceiling', DELIVERY_OWNER],
  [994, 'OM', '1006-audit-input', '#1006 marker-normalization audit', AUDIT_OWNER],
  [996, 'TP', 'direct-child', '#1010 canonical timing-event grammar', TIMING_OWNER],
  [997, 'LP', 'direct-child', '#1008 executable self-loop topology', LIFECYCLE_OWNER],
  [998, 'LP', 'direct-child', '#1008 Review drift topology', LIFECYCLE_OWNER],
  [999, 'LP', 'direct-child', '#1008 executable lifecycle topology', LIFECYCLE_OWNER],
  [1001, 'LP', 'direct-child', '#1009 lifecycle history policy', LIFECYCLE_OWNER],
  [1002, 'TP', 'direct-child', '#1010 canonical timing-event strict-reader policy', TIMING_OWNER],
  [1003, 'TP', '1006-audit-input', '#1006 timing-log healing audit', AUDIT_OWNER],
  [1004, 'OM', '1006-audit-input', '#1006 review-failure parser boundary audit', AUDIT_OWNER],
];

export const BUG_BASH_DISPOSITIONS = Object.freeze(
  ROWS.map(([issue, theme, disposition, target, regressionOwner]) =>
    Object.freeze({ issue, theme, disposition, target, regressionOwner })
  )
);
