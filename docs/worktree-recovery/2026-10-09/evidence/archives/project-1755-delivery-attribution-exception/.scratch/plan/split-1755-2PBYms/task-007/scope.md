Deliver Task 7: Operator guide, package smoke, and release gates from `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`.

Bounded source section (Task 7: Operator guide, package smoke, and release gates):

#### Implementation

Run: `node --test scripts/tests/integration/task-tracker/lib/package-delivery-attribution-exception-smoke.test.mjs scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`

**Files:** Modify `skill/shared/rules/deliver.md`, `docs/guides/workflow.md`, and `scripts/task-tracker/verbs/help-data.mjs`; extend `scripts/tests/integration/task-tracker/verbs/delivery-attribution-exception.test.mjs`; create `scripts/tests/integration/task-tracker/lib/package-delivery-attribution-exception-smoke.test.mjs` with `// @story #1755` on its first line.

**Interfaces:** Documentation states the two-pass `prepare` flow, explicit exact Codex user statement, `record`/`show`/`revise`/`revoke`, delivery retry, receipt meaning, and that `workflow-preflight` does not report this separate exception. Preparation grants nothing. Packaged CLI/runtime and guide match the source checkout.

No `package.json` change is required: the existing `scripts/`, `skill/`, and `docs/guides/` entries cover the new runtime modules, rule, and guide. The design spec is a repository planning artifact and is not packed; the package smoke test checks runtime files and the guide, not the spec.

- [ ] **Red:** Add a package smoke assertion that the packed file list contains the new verb, both libraries, and operator guide; add help assertions for every command and the unsupported-host diagnostic. Run the focused test and expect the missing-guide/help failure.
- [ ] **Green:** Update the operator text and help examples; keep the Task 4 command catalog, ordinary workflow, and generic policy descriptions accurate. Run the package smoke and doc parity tests to green.
- [ ] Run `npm run format:check`, `npm run lint`, `npm test`, `npm run test:integration`, and `npm run test:slow`; fix only evidenced failures and rerun each affected gate. `npm test` and `npm run quality` omit the integration lane. Run package content validation and an install smoke from the local tarball. Record exact commands and results.
- [ ] Audit existing branch commit subjects before delivery. The single-parent spec revisions `f761a9cc` and `0fc890a9` lack `[#1755]`, so this branch's mixed history needs the new scoped exception to pass its own delivery attribution gate. Preserve their SHAs; prepare and record an exception for this branch's exact live inventory and operation only after a fresh, explicit Codex user authorization. The delivering session must run on a supported Codex host with a resolvable user-message transcript. If that authorization is unavailable, stop before provider merge. No authorization for ai-peer-review #39 is implied.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs`, then commit the tested docs and package boundary with a `[#1755]` subject.
- [ ] Before any eventual merge, push the implementation branch and verify hosted CI against that exact pushed head. Use the governed delivery and human approval flow; do not activate an exception for ai-peer-review #39 during this issue's implementation.
