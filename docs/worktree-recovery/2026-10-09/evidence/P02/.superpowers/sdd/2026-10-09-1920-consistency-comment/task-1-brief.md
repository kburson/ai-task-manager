## Task 1: Execute all actual retained step16 cases

**Create:** `scripts/tests/integration/task-tracker/lib/criteria-revision-consistency-comment.test.mjs`, `criteria-revision-consistency-comment-custody.test.mjs`.

**Consume:** `discoverOriginalCases()` and `qualifyOriginalCases(cases,t)` from `scripts/tests/helpers/criteria-revision-transition-profiles.mjs`; read-only reuse of the reviewed1912 helper. Each child process executes one unchanged original test with fixture-valid actor, complete count and zero fail/cancel/skip,600000ms timeout.

**Produce:** genuine scoped receipts for ten persisted comment/history/transport cases and twelve live consistency/custody cases. No production API or authority is produced.

- [ ] Independently assert the full23-mode universe and explicit classification. Transport assertions must equal the Cartesian product of failBefore/failAfter and intent-write/intent-readback/effect-write/effect-readback, not only a numeric count.

```javascript
const related = discoverOriginalCases().filter(
  ({ mode }) => mode.startsWith('transition-') || mode.startsWith('consistency-')
);
assert.equal(related.length, 23);
assert.equal(related.filter(({ mode }) => mode === 'transition-native').length, 1);
```

- [ ] Execute each of the22 owned original native files intact, grouped by semantic boundary with at most four workers per sequential file. Add the complete original native-stage-execution, native-stage-data and native-stage-source-data unit profiles, with a minimum of56 intact original cases from their actual baseline. Expected: full cases with intact assertions; source changes are unnecessary if retained behavior already passes.
- [ ] Run the actual focused command below. Expected: no omitted/empty/cancelled/skipped original case; all eight faults and the actual positive control execute. A missing production protection must fail before Task2.

