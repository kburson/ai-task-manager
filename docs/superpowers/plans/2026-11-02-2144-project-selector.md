# Explicit GitHub project selector source repair

### Story Intent

- **Beneficiary:** release operator binding a consumer to the existing issue board.
- **Capability:** resolve an existing project by explicit owner login and project number.
- **Need:** the combined User and Organization roots fail when the other owner type does not exist, discarding a valid project.
- **Value or failure prevented:** supported setup preserves exact project identity without creating a replacement board.

### Diagnosis and bounded design

The owning function resolve_existing_project in scripts/gh/init-project-config.sh parses selectors through the existing config-init.mjs CLI, then issues one GraphQL query with user(login) and organization(login). A nonzero gh exit is swallowed into empty project data. GitHub can return the valid User project together with an error for absent Organization; the successful partial data is therefore lost. The existing shell caller refuses unresolved explicit selectors before the create-board branch. Preserve that behavior and the existing selector parser. Owner enumeration also uses combined roots but is not needed to repair explicit resolution; leave it unchanged.

Use repositoryOwner(login), documented by GitHub as resolving either a User or Organization, and concrete User/Organization fragments selecting projectV2(number). This single owner root avoids requiring an absent other type to exist. Preserve exact ID, number and title outputs and validate their types plus matching requested number before assignment. An error exit, missing owner or project, malformed project response, denied authentication or transport failure must remain a clear failure without selecting or creating another board. Do not query alternate credentials or weaken failure handling.

### Files and steps

Add scripts/tests/integration/config-init-project-selector.test.mjs, a subprocess harness invoking the real supported setup adapter with a controlled external gh fixture, following existing config-init workflow fixture conventions. The first regression expects User project PVT_user_fixture, title Selector fixture, number 23 while the combined old lookup returns the observed partial-data/error shape and nonzero exit. Save the RED receipt before editing production. Add successful Organization and already-linked config scenarios plus malformed/missing owner/project, authorization and transport cases with no creation or wrong-board writes. Existing mapping persistence must be tested through the setup writer, not a second selector.

Then repair only resolve_existing_project. Run targeted GREEN, fast and slow source suites, lint and formatting, and retained #2142 recovery/#2143 planning regressions. Commit exact allowlisted source/test and this planning evidence, freeze SHA and send source checkpoint with logs to the orchestrator. Independent source review must precede packaging; no installed node_modules patch is allowed. Source upstream release and consumer package integration remain separate claims.

### Dependency Map

This source issue #2144 is the owning component of already-authorized Project-Estimator #204, not another product defect under epic #37. Base 984cdc9f296c2a9e9d2896d5f269b4eb8a90e725 retains #2142 native recovery and #2143 bounded Plan analysis. Consumer #204 has normally entered Develop and is paused during source implementation to avoid duplicate active timing. Root owns independent review, native Test/Review, merge and close. No subagents or unrelated discovery are authorized.

### Risks and limits

Regression fixtures replace only external gh transport and exercise actual script parsing/config writing. They cannot prove real GitHub setup; that later proof runs only after independent source review in a disposable consumer selecting existing kburson:23, preserving active workspace config. Package bytes must be audited against frozen accepted source within the existing 971-file ceiling; retained tests are excluded from npm archive. Preserve historical archives and actual planning/recovery receipts. Retain S at three human hours for this narrow selector repair and targeted source verification, separating package integration, upstream release and waiting. Preserve native identity, locks, stashes and Unknown timing; use fresh Explain and exact retry on refusal without raw state overrides.

## Execution amendment — canonical verification companions

The orchestrator authorized relocating the originally named root integration test to `scripts/tests/integration/task-tracker/lib/config-init/project-selector.test.mjs` because the current canonical test layout requires a nested path. The earlier published Plan analysis retains its original path as historical evidence. The root verifier declaration is updated through the registered issue-body operation, retaining ID 1. Only line coordinates for the changed setup script are refreshed in the existing GraphQL usage inventory; site counts, classifications, scanner and policy remain unchanged. These are verification companions of #2144/#204, not another product defect or waiver.

The first full slow run completed without timeout, with only `init-status-palette.test.mjs` failing: its existing transport fixture returned linked project number 2 for an explicit request for owner project number 5. The orchestrator authorized returning its existing owner fixture (PVT_OWNER, Owner Board, 5) only for that request while retaining linked project 2 and every palette/no-mutation assertion. This expected fixture mismatch is not an unrelated baseline bug.

Official API reference: [repositoryOwner resolves a User or Organization by login](https://docs.github.com/en/graphql/reference/repos#repositoryowner); concrete owner fragments preserve the existing project selection fields.
