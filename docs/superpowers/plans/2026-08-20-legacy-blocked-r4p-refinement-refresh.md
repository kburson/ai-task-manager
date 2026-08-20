# Legacy Blocked R4P Refinement Refresh Implementation Plan

> **For implementation:** Follow test-driven development and execute each task
> in order. Commit only after the focused tests for that task pass.

**Goal:** Add a narrow, explicit Shelve migration that lets a valid legacy
schema-1 Ready-for-Planning snapshot with a later authoritative blocker return
to refinement without weakening stale-evidence rejection.

**Architecture:** Separate historical schema-1 validity from current blocker
agreement. Migration mode proves the former, strictly validates all live blocker
carriers, authenticates both truths in immutable history, and then reuses the
existing Shelve transaction. Ordinary Shelve and existing history records remain
unchanged.

**Issue:** #1341

**Spec:**
`docs/superpowers/specs/2026-08-20-legacy-blocked-r4p-refinement-refresh-design.md`

---

## Task 1: Characterize the migration boundary

**Files:**

- Create: `scripts/tests/unit/task-tracker/lib/shelve-stale-refinement-migration.test.mjs`
- Modify: `scripts/task-tracker/lib/refinement-snapshot.mjs`

1. Build a schema-1 fixture whose historical digest and provenance are valid
   while its serialized blocker list differs from one strict live marker.
2. Add failing tests for a pure legacy verification result that distinguishes:
   valid legacy core evidence, blocker-only mismatch, and unrelated staleness.
3. Add failing cases for schema 2, tampered digest/provenance, changed active
   fields, malformed/duplicate markers, and an empty live blocker set.
4. Implement the smallest pure verifier needed by Shelve. Do not alter
   `verifyRefinementSnapshot()` behavior for ordinary callers.
5. Run:

   ```text
   node --test scripts/tests/unit/task-tracker/lib/shelve-stale-refinement-migration.test.mjs scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs
   ```

6. Commit with issue attribution.

## Task 2: Authenticate migration evidence in history

**Files:**

- Modify: `scripts/task-tracker/lib/refinement-history.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/shelve-stale-refinement-migration.test.mjs`
- Modify: existing refinement-history tests as required

1. Add failing tests proving a migration record contains an explicit migration
   discriminator and canonical numeric live-blocker refs.
2. Prove those properties participate in the immutable digest and source match.
3. Prove existing ordinary records and partial-journal replay retain their old
   digests and behavior.
4. Implement a backward-compatible conditional representation: ordinary
   records remain unchanged; migration records require the new evidence.
5. Reject missing, malformed, duplicate, or altered migration refs.
6. Run the focused migration and refinement-history tests.
7. Commit with issue attribution.

## Task 3: Enforce carrier agreement in the Shelve transaction

**Files:**

- Modify: `scripts/task-tracker/lib/shelve-transaction.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/shelve-stale-refinement-migration.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/shelve-transaction.integration.test.mjs`

1. Add the migration intent to the transaction input and journal identity.
2. Extend the source snapshot read to include the configured Project
   `Blocked By` text field without treating it as an active field to clear.
3. Add failing tests for agreement among the strict marker, `BLOCKED` label,
   and canonical Project field.
4. Add refusal cases for every carrier divergence and for a retry whose recorded
   migration intent differs.
5. On success, capture migration history and then reuse the ordinary ordered
   transaction phases. Assert blocker marker, label, and Project field survive.
6. Re-run the unit and integration Shelve suites.
7. Commit with issue attribution.

## Task 4: Expose the explicit CLI contract

**Files:**

- Modify: `scripts/task-tracker/verbs/shelve.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: command parser/catalog tests that cover Shelve

1. Add failing parser tests for one accepted `--refresh-stale-blockers` flag,
   duplicate flag refusal, and unchanged unknown-argument refusal.
2. Pass the boolean intent into the transaction and include it in audit output.
3. Extend help with the narrow schema-1 blocker-migration semantics.
4. Verify that invoking ordinary Shelve without the flag produces the same
   transaction input and behavior as before.
5. Run the focused parser/help and migration suites.
6. Commit with issue attribution.

## Task 5: Prove the live recovery workflow

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/shelve-stale-refinement-migration.test.mjs`
- Modify: integration coverage if the live workflow needs a higher-level harness

1. Exercise the complete fixture flow: legacy R4P snapshot, governed blocker,
   explicit migration, Backlog, Refine, and schema-2 completion.
2. Assert the schema-2 snapshot blocker refs match the protected marker, label,
   and Project field.
3. Assert the epic admission reader recognizes the refreshed refinement
   evidence as current while the dependency remains open.
4. Run the issue verification command:

   ```text
   node --test scripts/tests/unit/task-tracker/lib/shelve-stale-refinement-migration.test.mjs scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs
   ```

5. Commit with issue attribution.

## Task 6: Repository verification and governed delivery

1. Run formatting and lint checks before the full suites:

   ```text
   npm run lint
   npm run format:check
   ```

2. Run the fast and slow lanes:

   ```text
   npm test
   npm run test:slow
   ```

3. Run `git log --oneline -1` and verify every change is committed with #1341
   attribution.
4. Stamp each acceptance criterion and Functional DoD item using its declared
   verifier; never hand-author evidence.
5. Advance #1341 through Test and Review. Request an independent code review,
   address findings, and repeat focused verification after changes.
6. Under Full-Auto, record the required audit provenance, integrate to trunk,
   close #1341, and independently verify GitHub state and remote/local refs.
7. Run the new live command on #1335 through #1338 in dependency order, then
   complete their sanctioned Refine-to-R4P refresh before resuming epic #1263.
