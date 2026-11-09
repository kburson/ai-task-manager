## Task 1: Qualify the retained dispatcher and phase boundary

**Create:** scripts/tests/integration/task-tracker/lib/criteria-revision-local-transition-tail.test.mjs.
**Reuse:** scripts/tests/integration/task-tracker/lib/move-state-native-command.test.mjs.
**Review/modify only if real failures require:** audit-timing.mjs native error boundary; post-commit-tail.mjs and move-state-core.mjs private sequence window; original native fixture's explicit requested frontier.

**Consumes:** genuine original transition-comment16 return and private original tail call window.
**Produces:** independently selected complete original dispatch/reentry cases, truthful stopped phase failures and unchanged ordinary dispatcher/tail behavior.

- [ ] Run the original native-stage-tail-dispatch and native-stage-tail-dispatch-reentry files plus phase12-after-effect-readback, phase-pair and phase-adversarial. Expected: characterize actual current failures; never count setup/empty selections as RED.
- [ ] Independently discover their literal registrations using the existing AST helper and assert the exact five descriptors. Qualify the original files through isolated processes with intact fixtures and limits.
- [ ] If the actual native phase emitter swallows an interrupted callback and advances entry13, preserve ordinary warning-only behavior but rethrow in native scope before continuation. If a phase-only fixture previously relied on the next unimplemented route as its frontier, replace that implicit stop only with an explicit actual next-stage intent fault; preserve all original assertions/effects and ledger the reasoning/cost.

```javascript
} catch (err) {
  process.stderr.write(`[move-state] #${issueArg}: phase-pair emission failed: ${err.message}\n`);
  if (nativeMemory) throw err;
}
```

- [ ] Run the five original native cases and all44 original ordinary regressions. Expected: requested durable prefixes and private reentry refusal, no extra effects and no changed ordinary behavior. Commit with #1918/#1913 attribution.

