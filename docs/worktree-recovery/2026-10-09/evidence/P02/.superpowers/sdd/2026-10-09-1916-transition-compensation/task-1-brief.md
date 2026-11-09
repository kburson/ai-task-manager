## Task 1: Preserve the bounded algorithm and truthful ordinary result

**Create:** `scripts/tests/integration/task-tracker/lib/criteria-revision-transition-compensation.test.mjs`.
**Modify:** only the result handling of `github-mutation.mjs::rollbackRecordedState` and compensation audit context in the retained recording program when actual tests require it.

**Consumes:** `writeIssueBodyWithRetry(input)` result `{status:'ok',attempts}` / `{status:'noop'}` / `{status:'failed',attempts,error,auditPosted}`.
**Produces:** existing stable-input rollback behavior, with failed writes returning `{rolledBack:false,priorState,reason:'state-recording-failed',recording}`; success/no-op remain distinct. This result is not a delivery receipt.

- [ ] Write an actual public rollback test whose two original `gh issue edit` calls fail, and whose audit command is captured by an isolated fake-gh executable. Use the real module and real temporary body files; assert both attempts, actual audit bytes and zero real network. Include audit transport failure. Do not replace the retry helper with a stub.

```javascript
const result = await rollbackRecordedState(ctx, 'develop');
assert.equal(editAttempts, 2);
assert.equal(result.rolledBack, false);
assert.equal(result.reason, 'state-recording-failed');
assert.equal(result.recording.auditPosted, auditSucceeded);
```

Run the focused ordinary cases. Expected: genuine RED because the current helper discards the failed recording result, not because fixture paths or audit setup failed.

- [ ] Retain the actual bounded helper result and condition the existing success return on it.

```javascript
const recording = await writeIssueBodyWithRetry(originalInput);
if (recording.status === 'failed')
  return { rolledBack: false, priorState, reason: 'state-recording-failed', recording };
return { rolledBack: recording.status === 'ok', priorState };
```

`originalInput` is the existing lexical object already passed by rollback, not a new public interface. Existing already-consistent handling remains before this call.

- [ ] Re-run the real failure/audit cases and all31 original recording/board/atomicity cases. Expected: ordinary GREEN without weakening original assertions or claiming a host write acknowledgment is native readback proof. Commit with1918/1916 attribution.

