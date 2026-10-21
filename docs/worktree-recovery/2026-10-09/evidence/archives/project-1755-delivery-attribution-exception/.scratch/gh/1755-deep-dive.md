## Deep-Dive Analysis (2026-09-22)

The source-attribution builder rejects any commit subject without a canonical `[#N]` token. Delivery preflight receives only a subject list after `deliver.mjs` classifies source commits, so the present boundary cannot bind an exception to exact source SHAs or their order. The generic workflow-exception catalog intentionally excludes commit provenance and must remain unchanged.

Files to edit: `scripts/task-tracker/lib/delivery-attribution.mjs`, `scripts/task-tracker/lib/delivery-preflight.mjs`, `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/lib/delivery-records.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, new delivery-attribution exception modules and CLI verb, `scripts/lib/self-doc.mjs`, `skill/shared/rules/deliver.md`, operator docs, and focused unit/integration tests.

Implementation sequence: define canonical ordered inventory and strict mapping schema; add an authority record command that prepares an exact proposal and records only after host-verified explicit user authorization; integrate GitHub comment audit and active/revoked/superseded resolution; re-read PR source inventory and re-evaluate immediately before merge; build deterministic attribution tokens from canonical subjects plus authorized mappings; propagate truthful exception disposition through intent, receipt, and verification. Keep all existing delivery preflight and merge gates intact.

Test additions: `scripts/tests/unit/task-tracker/lib/delivery-attribution-exception.test.mjs` covers mixed-history success and every fail-closed scope, inventory, mapping, authority, and lifecycle case. `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs` covers preparation, recording, exact-head revalidation, retry, unrelated gates, and truthful receipt semantics. These tests bind to the issue's root verification commands.

Risks: the GitHub PR commit list and local ancestry can diverge during a race; the exception must bind to one canonical GitHub inventory and re-read it immediately before the provider merge action. Legacy delivery receipts and retry projections have exact-key schemas; any new disposition must be versioned or compatibly optional without downgrading existing verification. Ambiguous write outcomes must reconcile against immutable GitHub comments, never assume success.

## Dependency Map
Depends on: none.
Blocks: kburson/ai-peer-review#39 delivery, which remains a separate consumer operation and requires separate authorization.
