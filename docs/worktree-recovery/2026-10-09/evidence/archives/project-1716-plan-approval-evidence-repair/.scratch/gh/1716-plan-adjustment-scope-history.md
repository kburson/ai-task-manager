### Plan Adjustment — distinguish semantic scope from evidence churn

The first live replay against `kburson/ai-peer-review#61` found that the revoked workflow-exception head carries the exact scope identity that existed at revocation, while later AC verification stamps changed the current scope hash without changing the User Story, Scope, or Acceptance Criteria prose. Treating that mechanical hash drift as semantic scope drift would incorrectly refuse the intended repair.

The implementation will therefore require GitHub-native issue edit history to contain a body whose exact scope identity matches the revoked exception head, then compare that historical body's semantic User Story, Scope, and Acceptance Criteria with the current body while ignoring checkbox state and AITM workflow-evidence comments only. A real prose change, missing historical match, unreadable history, ambiguous exception chain, or active exception still fails closed.

This adjustment does not relax the Full-Auto-only rule, planning-evidence requirements, lifecycle ordering, cancellation/rejection refusals, or the requirement that the exception chain be currently revoked. It changes only how post-revocation evidence-marker churn is distinguished from material scope drift.
