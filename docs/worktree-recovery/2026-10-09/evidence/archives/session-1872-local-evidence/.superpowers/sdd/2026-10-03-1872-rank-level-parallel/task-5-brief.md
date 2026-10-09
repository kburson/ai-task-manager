## Task 5: Registered publication, resume and refresh

Files:

- Create `scripts/task-tracker/lib/epic-rank-wave-store.mjs`.
- Create `scripts/task-tracker/verbs/epic-wave.mjs`.
- Modify canonical command routing/catalog/entrypoints, task dispatch and `verbs/help-data.mjs`.
- Extend only the registered action's scoped protected body-marker transaction and `epic-orchestration-plan.mjs` schema-2 reading.
- Create `scripts/tests/integration/task-tracker/lib/epic-rank-wave-recovery.test.mjs` and verb unit tests.

Implement prepare/show read-only first. Record/revoke/refresh/resume require genuine parent orchestration authority and the common lock. Record appends one immutable authentic GitHub comment, reconciles its exact schema-2 body pointer and verifies read-back. Existing schema-1 accepted documents remain immutable; only the current governed parent contract is reconciled.

Write failure-injection tests before mutations: comment succeeds/body fails; body succeeds/read-back fails; comment outcome unknown; exact same-operation resume; repeated resume is idempotent; graph drift, newer revocation, expiry, tamper and changed body contract refuse. Resume uses the exact already-existing comment/record/source and cannot post another authorization or invent a new ID. Unknown write outcome remains indeterminate under the original operation ID.

Test all verbs' help/routing and role checks, malformed input, current actor/session, and body invariant preservation. No input boolean or raw marker is authority.

