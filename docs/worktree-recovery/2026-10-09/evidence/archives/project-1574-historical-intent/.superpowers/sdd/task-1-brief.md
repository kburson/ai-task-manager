### Task 1: Version Retroactive Reconciliation Evidence

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-method-reconciliation.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs`

**Interfaces:**

- Consumes: the current v1 record builder and validator.
- Produces: exact v2 records with `intentOrigin: 'retroactively-reconstructed'` while retaining exact v1 behavior.

- [ ] **Step 1: Write failing v2 record tests**

Add tests that call `buildMethodReconciliation` with
`intentOrigin: 'retroactively-reconstructed'` and expect schema
`aitm.delivery-method-reconciliation/v2`, the exact additional key, frozen
output, tamper refusal, and visible retroactive wording. Retain an assertion
that the existing input still produces the exact v1 keys.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
```

Expected: the new v2 assertions fail because the builder currently ignores the
origin input and always emits v1.

- [ ] **Step 3: Implement exact v1/v2 validation and rendering**

Add a v2 schema constant and key list. Select v2 only for the exact retroactive
origin value; validate each schema against its own exact key set. Render v2 with
the explicit no-delivery-time-intent explanation. Keep v1 output byte-compatible.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command and require zero failures.

- [ ] **Step 5: Commit the slice**

```bash
git add scripts/task-tracker/lib/delivery-method-reconciliation.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
git commit -m "[#1574] Record retroactive intent reconstruction"
```

