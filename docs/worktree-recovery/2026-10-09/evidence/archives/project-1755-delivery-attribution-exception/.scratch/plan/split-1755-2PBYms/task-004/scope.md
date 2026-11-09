Deliver Task 4: Two-pass CLI and Codex-only user authority from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 4: Two-pass CLI and Codex-only user authority):

#### Implementation

Run: `node --test scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`

**Files:** Create `scripts/task-tracker/verbs/delivery-attribution-exception.mjs` and `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`; modify `scripts/task-tracker/task-tracker.mjs`, `scripts/task-tracker/lib/command-surface/routing.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs` (command record, `VERB_CONTRACTS`, `VERB_RELATED_COMMANDS`, `VERB_POSITIONAL_ARGUMENTS`), and `scripts/task-tracker/verbs/help-data.mjs` (`VERB_REFERENCE`) following `workflow-exception`.

**Interfaces:** `prepare #N` is read-only and emits raw digest, post-classification mapping candidates, and a template with generated exception and operation IDs. `prepare #N --input-file <path>` validates a filled candidate and prints its canonical proposal digest and exact user statement. `record #N --input-file <path>` verifies `aitm.authorization-source/v1` through `createCodexSessionSourceLoader` and `resolveWorkflowExceptionAuthority`, recomputes live scope/proposal, and appends with exact readback. `show`, `revise`, and `revoke` expose/read or append chain state; `show` can run on other hosts.

Leave `delivery-attribution-exception` out of `PREFLIGHT_MODE` in `task-tracker.mjs`, as `workflow-exception` is: `prepare` and `show` must not trigger shared issue preflight or binding side effects. Each mutating subcommand enforces its own authority and scope checks.

- [ ] **Red:** Create the new test file with `// @story #1755` on its first line. Test both prepare passes and `show` without shared issue preflight, binding, timing, or comment writes. The first template has no authorizing digest; the filled pass rejects absent/changed IDs, an issue number that is not positive, invalid expiry, bad mappings, oversized rendered body, and changed PR inventory.
- [ ] Add authority tests: unsupported host is refused by `prepare` and `record` using the resolved provider adapter/transcript locator; a host-name override is insufficient. A valid Codex user message succeeds only if its loader-derived filtered statement hash equals `source.statementHash`, its embedded proposal digest equals the fresh digest, and its remaining text exactly equals the printed statement. An injection-flagged block alone, agent role, ordinary issue comment, and mismatched statement all refuse.
- [ ] Run `node --test scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`; expect the new command/authority cases to fail and both command-surface gates to identify missing registration.
- [ ] **Green:** Wire the commands, explicit help, full paginated GitHub PR source inventory, Codex-only guard, append/readback reconciliation, and separate `revise`/`revoke` records. Re-fetch issue and PR before the write; never trust the request file as authority.
- [ ] Re-run all three Task 4 test files; include exact idempotent record retry and transport ambiguity. Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested CLI with a `[#1755]` subject.
