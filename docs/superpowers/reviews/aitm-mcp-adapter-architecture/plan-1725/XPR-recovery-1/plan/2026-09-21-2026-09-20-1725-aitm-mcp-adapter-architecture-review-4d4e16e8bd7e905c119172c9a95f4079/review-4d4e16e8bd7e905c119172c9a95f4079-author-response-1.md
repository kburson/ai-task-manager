<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4d4e16e8bd7e905c119172c9a95f4079"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md"
artifact_commit: "a05579470712d256e0f7aecec0817037807d8517"
artifact_blob: "ec62580ea3faaf61cc71463b74092144cff6a505"
artifact_digest: "sha256:ebf579e3a1c3e93be3f1943476e29d0053b18cc8740db9eaf367409eb6b9955a"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:877852f77c3f9ff5c23684f54e264e16ac7811aed4ac74f445590f4425bc977c"
  identity_source: "runtime"
started_at: "2026-09-21T05:11:10.216Z"
submitted_at: "2026-09-21T09:31:02.580Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the umbrella plan in response to all seven required changes. The six numbered findings and the separate packed-ceiling requirement are addressed. All five optional suggestions are incorporated as plan obligations or an explicit provenance exception. The governing specification, source code, archived review documents, and existing approval gates remain unchanged.

The author also closed the unattended request-key migration gap recorded in the preserved original review: the new kernel refuses key-less unattended calls, Task 9 owns caller migration, and Task 10 requires migration or verified writer shutdown before activation. This is a plan correction under the existing specification, not a relaxation of its identity contract.

Revised plan SHA-256: `085fe0853bba0b768743d1a755e660da1aae5bed2df433cda594a2acb05249a4`.

## Finding dispositions

### Required change 1 / Finding 1 — integration regression coverage

Accepted. `package.json` and `scripts/run-tests-lanes.mjs` confirm that `npm test` selects unit only and `test:integration` is separate. The final program gate and gate-closing Tasks 10, 13, 16, and 20 now explicitly run unit, integration, and slow lanes. The Global Constraints reference ADR 0001 §6 and distinguish targeted iteration checks from the complete Test pass required for every new committed implementation. They also preserve stage ownership: Develop finalization owns lint/format; Review verifies exact-revision receipts rather than rerunning unchanged checks.

This intentionally does not adopt the stale sentence in ADR 0001 §5 that says unit and integration form the fast lane. The current runner and scripts are the executable evidence; Task 4's source/test decision work can align the surrounding decision text without changing lane semantics.

### Required change 2 / Finding 2 — existing installer ownership

Accepted. `bin/cli.mjs:1589` is the current production use of the install-manifest publisher and imports the contract being extended. Task 7 now explicitly adapts that producer and preserves installer compatibility with the versioned manifest contract. Task 14 retains the published `ai-task-manager` bin as a compatibility transport over the same setup services used by `aitm setup`; only the shared service publishes generated integration and manifests. The plan requires both entry points to be exercised against that service so separate competing writers cannot emerge.

Tasks 7 and 14 both name and execute the existing `install-manifest.test.mjs`, `install-health.test.mjs`, and `doctor-cli.test.mjs` regression suites. No installer source is changed during this plan review.

### Required change 3 / Finding 3 — per-child quality gates

Accepted. All in-repository code-producing Tasks 2–16 and 20 now have explicit `npm run lint` and `npm run format:check` commands, including Tasks 3, 11, and 12. The global child contract carries the permitted lanes, story attribution, 800-code-line hard limit and 400-line review target. Tasks 17–19 remain external projects; their bounded plans must name equivalent mandatory gates for their own packages rather than assume this repository's npm scripts exist there.

The plan continues to require one complete Test pass for each committed implementation, independently of whether the task's targeted command happens to include every lane.

### Required change 4 / Finding 4 — ADR 0001 source/test mapping

Accepted with scope clarification. The actual mismatch is ADR 0001 §2's mapping relative to `scripts/`, not an exemption from the canonical test root. Moving modules to `src/` does not create a separately published package, so the quoted separately-published-subtree sentence is not itself triggered. Nevertheless, explicit approved source-root and bucket mappings are required and are now scheduled.

Task 4 names the production ADR amendment, retained `scripts/` mappings, `src/` module mappings, and package/conformance feature buckets. It preserves all three lanes, support exclusions, and fail-closed package-wide discovery. Task 2 already creates Phase 0 `src/feasibility/` code before Task 4, so Task 1 additionally approves the narrower feasibility mapping before Task 2 starts. This avoids introducing a new ordering gap while fixing the production taxonomy.

### Required change 5 / Finding 5 — fixture packaging

Accepted as ambiguity clarification. The intended public fixtures remain under `src/adapter-sdk/fixtures/`. Task 16 now says explicitly that the independently installable consumer under `scripts/tests/fixtures/adapters/reference/` is local-only and never part of the core tarball. Its temporary fixture package is assembled by the test harness. The installed-runner check's shipped-fixture requirement refers solely to the public runtime fixtures.

Task 16 explicitly extends and runs `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` to prove both public inclusion and complete `scripts/tests/**` exclusion. Its path-based prohibition is preserved rather than weakened.

### Required change 6 / Finding 6 — public CLI refusal

Accepted. Task 9 now owns CLI and compatibility-alias rejection of `orchestrator-only` actions, including forged names and evidence-append requests. The named `cli-kernel-parity.test.mjs` test must assert zero provider effects and zero protocol writes on refusal; internal primitives remain available only through their governed parent action. Traceability row 5 now names the CLI suite. The stronger plan acceptance criterion remains in place with explicit verification ownership.

### Required change 7 — packed-surface ceiling

Accepted and measured. Using the repository's `parseNpmPackReport` helper with `npm pack --dry-run --json`, the current package has **798 entries**, equal to the **798 effective ceiling** derived from the checked-in base and allowances. This is a measured baseline, not a prediction of future entry counts.

Task 4 now requires a per-child allowance following the repository's established review style: actual before/after inventory, exact intentional delta, and the allocated issue ID. Later tasks adding shipped files inherit that requirement and the package-boundary gate. Blanket headroom and weakening forbidden-path assertions are explicitly disallowed. The baseline must be measured again for each child.

## Changes made

In addition to the required dispositions:

1. Optional suggestion 1: Task 4 names `.c8rc.json` and includes production `src/` alongside `scripts/`, with test/support and Phase 0 prototype exclusions.
2. Optional suggestion 2: Global Constraints now state the unit-only `npm test` semantics and the complete three-lane Test requirement.
3. Optional suggestion 3: Task 4 explicitly excludes `scripts/benchmarks/**` from the package, together with `src/feasibility/**`, while retaining the production closure.
4. Optional suggestion 4: The Spec header explains that the already-reviewed umbrella specification retains its original filename for provenance and is not the pattern for new child artifacts. The spec is not renamed or edited.
5. Optional suggestion 5: Task 4 names both reach-lint source files for description alignment with the actual package-wide import-literal behavior; the check is not weakened.
6. Preserved-review finding: Task 9 owns stable request-key plumbing in skills, templates, and inventoried automation callers; Task 10 blocks cutover until callers migrate or are stopped. The legacy route remains selected before cutover; the new kernel deliberately rejects missing unattended keys after activation. This resolves compatibility wording without fabricating new keys on retry.

## Declined changes and rationale

No required change was declined. The ADR mapping rationale is qualified above because `src/` is still part of the same npm deliverable. The source spec filename is preserved, with an explicit exception note, rather than changing a previously reviewed artifact during plan review. External packages receive project-specific quality gates in their bounded plans instead of invented npm script contracts here.

## Verification

- Checked the current package scripts, lane selector, ADR 0001, install-manifest producer, package-boundary assertions, and coverage configuration before revising the plan.
- Verified the governing spec's bytes against pinned commit `267b91b9218b59342a0d70e0859a0e38523a3923`; they match exactly.
- Measured the current packed inventory with the repository parser: 798 entries, matching the effective ceiling. No package was published.
- Prettier, scoped CSpell, and Markdown lint passed on the revised plan. Markdown checks for this response cover the editable body separately; protected protocol frontmatter remains unchanged.
- Structural audit passed: 20 tasks retained; lint/format commands present in all 16 in-repository code tasks; complete lanes present at Gates B–E and the final gate; both installer tasks name the three existing integration regression suites; CLI refusal is traced; fixture exclusions are explicit.
- `git diff --check` passed for the plan revision.
- This is documentation-only work. Planned implementation suites were not run or represented as existing/passing. Existing restored protocol templates have the separately recorded Markdown-format limitations in `XPR/WORKSPACE-RECOVERY.md`; they were not rewritten.

Please review the revised artifact and these dispositions. Acceptance remains a reviewer decision; this response grants no implementation or hydration authority.
