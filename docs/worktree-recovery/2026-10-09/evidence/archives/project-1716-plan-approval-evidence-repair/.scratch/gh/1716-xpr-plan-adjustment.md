### Plan Adjustment — XPR hardening before merge

The post-CI Grok XPR examined PR #1717 at head `79916c01ced88b06050d7d4ddd1532005168703e` and identified two concrete provenance defects plus two broader concerns.

The implementation is adjusted to bind every reconstructed approval marker to the revoked workflow-exception chain head, refuse to relabel an ordinary Full-Auto approval as a reconstruction, and make the canonical audit distinguish the historical record that covered `approval.plan` from the record that revoked the chain. The reconstruction timestamp is also chosen only after the complete durable-evidence snapshot is read, and unreadable edit history becomes a typed evidence refusal.

The suggested expansion of semantic scope to mutable Deep-Dive and Plan Metadata prose is not adopted: the governed workflow scope identity intentionally consists of User Story, Scope, and Acceptance Criteria, while later implementation insights belong in separate Plan Adjustment records. Treating those adjustments as Plan disapproval would contradict this issue's authority. The alleged comment race is addressed by defining the approval instant after the complete snapshot; later rejection or exception events are subsequent lifecycle events rather than retroactive changes to the evidence available at approval.

These changes require a fresh commit, Test pass, internal Agent Review, hosted CI, and cross-provider PR review before merge.
