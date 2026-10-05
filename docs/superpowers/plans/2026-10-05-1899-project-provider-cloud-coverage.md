# Explicit project-provider cloud coverage — #1899

**Goal:** Allow delivery operators to explicitly fulfill declared whole-suite commands through validated CI coverage while the host executes only affected tests.

## Story Intent

- **Beneficiary:** AITM delivery operator.
- **Capability:** Map declared suites to validated CI coverage.
- **Need:** Full host suites rerun after cloud proof.
- **Value or failure prevented:** Full verification with TIA-only host tests.

## Design

**Architecture:** Extend the existing declarative project provider with optional `test.declaredCommandCoverage`. Validate each closed `{ command, requires }` record through the allowlist and against real configured Test steps; matching declared commands become derived results. Use the existing native Test derivation seam, which records real configured executions and never creates an execution receipt for a derived command. No implicit cloud classification convention.

**Authority:** #1899 Scope and the posted deep dive; full authorization to resolve delivery blockers. #1897 and downstream #144 approved Scope are unchanged.

**Global constraints:** Host affected tests only; exact-head full CI unit/integration/slow receipts; no node_modules patches, gate bypass, invented execution results or blanket command skips. Preserve default Node and unconfigured project behavior. Full-Auto approvals must identify machine provenance.

**Review focus:** Normalized aliases and duplicate mappings; prerequisites of non-test kind; absent or failed prerequisites; mapping an already executed command; unused mappings and unmapped affected commands. Each has a regression below.

## Task 1: Explicit coverage and honest native outcomes

Files: modify `scripts/task-tracker/lib/verification-provider-registry.mjs`, `scripts/task-tracker/lib/verification-providers/project.mjs`, `scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`, `scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs`, and `docs/guides/non-javascript-verification.md`.

Interface: `resolveVerificationProvider({config, projectDir}).planTest({declaredCommands})` keeps its public signature. Optional coverage entries contain a command string and nonempty unique prerequisite classification strings. Return covered declarations as `{classification: "test-covered-N", command, requires}` in `derivedSteps`; required configured classifications remain unchanged.

1. Add registry tests using a real cloud-verifier configuration and real command normalization. Assert that declared npm fast/slow commands are absent from executable steps but present in derived steps; uncovered affected commands remain executable. Assert immutable normalized plans, alias duplicate refusal, invalid commands, empty requirements, duplicate and unknown references, non-test references, unknown keys, already-executed-command overlap and unchanged no-coverage/default Node plans.
2. Add native Test tests at `runVerbTest`'s existing external I/O injection boundary. Exercise cloud success and failure and multiple prerequisites with one failing. Assert actual executed argv contains the cloud verifier and affected commands, never covered suites; outcomes follow every required result. Parse the real emitted receipt and verify it contains only actual/reused command identities and genuine cloud classification. These are fixtures, not native delivery evidence.
3. Run `node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs`. Expected: new tests fail on missing optional coverage before production edits; existing tests pass. Preserve complete RED output.
4. Permit optional coverage in the closed Test config. Normalize all coverage before creating a provider: reject unknown keys, duplicate canonical commands, invalid commands, requirements that are empty/duplicate/unknown/non-test, and mappings overlapping configured executable commands. Freeze each declaration and its requirements.
5. In project `planTest`, partition declared commands using the same allowlist tokenizer/canonical argv representation used by coverage. Only explicit matching mappings become derived entries; unrecognized/rejected/uncovered declarations continue through existing targeted validation. Deduplicate repeated identical coverage declarations in a plan. Preserve source command spelling for issue result matching and derive unique deterministic classifications.
6. Run the affected group to GREEN. Expected: successful cloud proof yields passing derived results, cloud failure yields failed results, no derived execution receipt exists, all uncovered affected checks execute, and defaults remain green.
7. Add a documented JSON example covering `npm test` and `npm run test:slow` via `test-cloud-complete`. Explain that the wrapper must actually validate exact-head, same-attempt, complete successful CI receipts; the declaration does not prove arbitrary wrapper correctness. Adopt this mapping in local repository configuration for native Test. Preserve all existing config and issue declarations.
8. Run lint, format checks and diff validation; commit using [#1899], push, create a draft PR with Refs #1899 and enable ci-slow. Obtain genuine independent whole-branch review through the existing reusable reviewer, resolve actionable findings with RED→GREEN, then require green full exact-head CI and native Test before delivery.
9. Inspect the public current provider plan BEFORE native Test: all full host suites must appear only as derived; execute one serialized native Test with streamed output. Stop on any unintended full host command. Preserve actual receipts, Review, approval, deliver and Close through AITM. Then normally install delivered trunk in #1897 and #144 and retry their gates.

**Expected deliverable:** Explicit opt-in mapping, fail-closed validation, honest native Test outcomes and provenance, compatibility retained, green affected tests and exact-head full hosted CI; no approved downstream content rewrite.
