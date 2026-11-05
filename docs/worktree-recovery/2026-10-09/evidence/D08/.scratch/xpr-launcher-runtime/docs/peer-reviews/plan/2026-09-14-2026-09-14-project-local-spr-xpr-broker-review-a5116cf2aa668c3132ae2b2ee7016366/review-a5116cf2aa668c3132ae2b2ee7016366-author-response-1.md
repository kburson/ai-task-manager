<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a5116cf2aa668c3132ae2b2ee7016366"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-project-local-spr-xpr-broker.md"
artifact_commit: "305953f55614bc93891ba11cea709c7d663cdb00"
artifact_blob: "1e6569185ba198965249cd15fee49fd4e5871cb7"
artifact_digest: "sha256:4742159c2d8abd2345096e034754a49012a91368228ec828841c5f77c35afba1"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:fc95f81c8e508a58981089677bc1253e151a27e1d266474e39b1fef6fa2b617f"
  identity_source: "runtime"
started_at: "2026-09-14T04:01:59.786Z"
submitted_at: "2026-09-14T04:34:29.298Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the implementation plan to address all eight required changes and all six optional suggestions from the first reviewer response. This is a plan-only revision; no broker implementation, issue lifecycle change, or publication is included.

## Finding dispositions

The sealed reviewer response used numbered prose findings and has an empty `finding_ids` array. The dispositions below refer to its original finding numbers; they do not invent protocol IDs or alter the sealed reviewer response.

1. **Finding 1 — accepted.** Verified all fifteen direct `startReview` caller files with a repository search. Task 8 now explicitly owns each one, the intervention helper, and the internal API re-export, and requires the complete integration suite. Task 1 separately owns current CLI argv callers (including the additional Claude identity and installed CLI smoke cases). The preamble distinguishes Task 1 parser enforcement from Task 8 direct-service enforcement. Production never supplies an implicit reviewer; legacy compatibility fixtures load old authority rather than issuing an invalid new start.
2. **Finding 2 — accepted.** Task 1 now owns help data, help tests, and both hash fixtures. It updates rendered help in the same commit as the grammar and runs the golden help suite plus `npm test`. All task commits now require the default suite to remain green; the plan no longer leaves known help fallout to Task 11.
3. **Finding 3 — accepted.** Task 10 explicitly owns parser tests, the coordinator-specific help test, both golden help hashes, and the closed CLI result schema. Its verification command includes those tests with phase/wake/packaging/MCP coverage. Historical coordinator implementation modules remain internal while the public command/export surface retires.
4. **Finding 4 — accepted.** Task 4 owns packaging tests and updates both the exact package inventory and exact production-dependency/tree assertions. The package lists only the four native source/build-definition files and exact build script, keeping generated compiler outputs out of the source-distributed tarball. It runs packaging checks in the same task.
5. **Finding 5 — accepted.** Chose one complete distribution path before Task 4: an explicit opt-in `build:broker-security` npm script, with `node-gyp@12.4.0` available as an exact production dependency. No lifecycle/startup build or prebuilt-binary branch remains. The operator provisions Python, the compiler, and matching local Node development files. `--nodedir` is mandatory, missing inputs fail without download, and the installed-package command/output path is specified. Doctor reports the prerequisite; broker-dependent starts fail until it is satisfied, while legacy manual operations remain available. Task 12 tests npm installs without devDependencies or lifecycle scripts, then builds and starts the broker with network disabled after explicit prerequisite provisioning.
6. **Finding 6 — accepted.** Task 11 introduces a separate concept-help registry, permits its names only within the help grammar, and extends named help/search/index/all rendering without adding `spr` or `xpr` to `COMMANDS`. Concept records have their own schema, while existing complete command-topic tests continue to cover the command catalog. Task 11 now owns the parser and its tests as well as the help implementation.
7. **Finding 7 — accepted.** Unsupported model/effort uses `APR_REVIEWER_SELECTION_UNSUPPORTED`; conflicting broker registration uses `APR_BROKER_REGISTRATION_CONFLICT`. Tasks 1 and 6 introduce their explanations when the corresponding behavior lands; Task 10 verifies all seven startup/registration explanations. Existing transport-unavailable and review-output-collision semantics remain unchanged.
8. **Finding 8 — accepted.** Replaced the incorrect count with seven disposition rows covering twelve retained flags.
9. **Finding 9 — clarification accepted.** The phrase “protocol creation service” described responsibility rather than claiming a source location, but the plan now explicitly identifies `src/cli/run.mjs:626`. Task 8 explains that `src/protocol/service.mjs` is scoped to status/recovery evidence and does not own `startReview`.
10. **Finding 10 — accepted.** Replaced the nonexistent generation procedure with a complete executable help-hash update snippet. Task 11 also defines a concrete template-golden updater sharing an extracted fixture-value object with the existing tests; both new files are explicitly owned. No existing generator is assumed.

## Changes made

In addition to the required corrections:

- Optional suggestion 3: both digest examples now specify UTF-8 explicitly.
- Optional suggestion 4: Task 3 identifies its injected platform doubles and defers production OS resolution to Task 4.
- Optional suggestion 5: Task 12 names the actual CI jobs. The Node 24 job retains three operating systems; the preferred-Node job gains the same three-OS matrix. npm compatibility stays focused on npm versions, and the historical boundary job retains its provenance checks.
- Optional suggestion 6: Task 2 identifies the outer startup `exactKeys` check at `src/protocol/events.mjs:338`. Runtime is a sibling of `context`; the nested context check at `:367` remains unchanged. The manifest schema/test files are now explicitly owned too.
- Task 12 also owns package-version rendering and resulting golden fixture changes, preventing a version bump from creating another unowned default-suite failure.

## Declined changes and rationale

None. The minor wording qualification for Finding 9 does not change the requested clarification.

## Verification

- Compared all numbered findings against current source: parser/help catalog, help hash tests, package inventory/dependency assertions, startup event exact-key checks, direct start callers, template fixture construction, and named CI jobs.
- Automated plan coverage check confirmed that all fifteen current direct `startReview` caller files appear explicitly in Task 8's file list.
- `prettier --write` and `prettier --check` on the plan: passed.
- `markdownlint-cli2` on the plan: passed, zero issues.
- `cspell --no-progress` on the plan: passed, zero issues.
- `git diff --check`: passed.
- `peer-review doctor --mode manual --json`: healthy for the current author session. Human-authority assurance remains unavailable; no automatic-delivery claim is made.
- Verified published metadata for `node-gyp@12.4.0` reports Node engines `^20.17.0 || >=22.9.0`, compatible with the package's Node >=24 floor. The plan links the primary node-gyp documentation for local development files and toolchain requirements.
- No source tests were run or claimed: only the plan and this author response changed. The implementation commands described by the plan remain future work.
