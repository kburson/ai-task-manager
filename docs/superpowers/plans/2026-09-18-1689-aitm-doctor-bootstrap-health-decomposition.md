# #1689 AITM Doctor Bootstrap Health Decomposition Plan

This execution view groups the seven ratified implementation tasks in
`docs/superpowers/plans/2026-09-18-1689-aitm-doctor-bootstrap-health.md` into
three sequentially dependent delivery issues. The detailed plan remains the
implementation authority for steps, interfaces, TDD cycles, and commit
boundaries.

### Task 1: Build Shared Install Contract and Publish Manifest

Deliver detailed-plan Tasks 1–3. Extract canonical provider-generated content
and semantic managed-fragment ownership, extend provider adapters with
declarative contract keys, inventory packaged templates/configuration, define
and validate `aitm.install-manifest/v1`, make project-contained symlinks
relative, and atomically publish `.ai-task-manager/install-manifest.json` only
after every explicit installer effect succeeds.

This child owns installer and manifest production. It must preserve unrelated
user configuration, existing installer exports, prompts, and uninstall
compatibility. It does not implement doctor observation, reporting, routing,
package-consumer CI, or documentation beyond code comments required by the
contract.

**Verification Commands:**

```sh
node --test scripts/tests/unit/package/install-content.test.mjs scripts/tests/unit/package/install-inventory.test.mjs scripts/tests/unit/package/install-contract.test.mjs scripts/tests/unit/package/install-manifest-store.test.mjs scripts/tests/integration/package/install-manifest.test.mjs
node --test scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/lib/memory-seed-install-menu.test.mjs scripts/tests/unit/task-tracker/lib/memory-index-hook.test.mjs scripts/tests/unit/task-tracker/lib/settings-hook-bootstrap.test.mjs scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs scripts/tests/integration/task-tracker/lib/coverage-cli.test.mjs
npm run format:check
```

### Task 2: Build Read-Only Doctor Engine and Standalone CLI

Deliver detailed-plan Tasks 4–5 after Task 1 reaches Review. Implement
read-only project, filesystem, Git-tracking, content, and symlink observations;
pure aggregate evaluation with the closed statuses `ok`, `missing`,
`untracked`, `stale`, `modified`, `invalid`, and `unsafe`; equivalent human and
`aitm.doctor/v1` JSON rendering; exact exits `0`, `1`, and `2`; complete
self-documentation; and standalone `aitm` registry routing.

This child must not import task state, locks, timers, GitHub, or workflow verbs.
It updates the deadlock regression to prove that doctor is a standalone script
and never a task-tracker verb. It does not own tarball matrix coverage or final
bootstrap documentation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/package/install-observer.test.mjs scripts/tests/unit/package/install-contract.test.mjs scripts/tests/unit/package/doctor.test.mjs scripts/tests/integration/package/install-health.test.mjs scripts/tests/integration/package/doctor-cli.test.mjs
node --test scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs
npm run format:check
```

### Task 3: Prove Packed Cloud Bootstrap and Document Adoption

Deliver detailed-plan Tasks 6–7 after Task 2 reaches Review. Add the packed
consumer that explicitly installs and commits project integration, removes
`node_modules`, runs `npm ci && npx aitm doctor`, proves representative drift
without repair, and executes in the Node 24/npm 11.8.0 and Node 26/npm 12.0.2
compatibility matrix. Update package-boundary assertions, README, setup/settings
guidance, and the installed shared task router.

Documentation must distinguish maintainer-owned explicit install from
read-only cloud verification, include migration guidance for missing/stale
manifests, and describe project `AGENTS.md` as portable while `~/.codex`
artifacts remain optional host state. This child owns final whole-repository
verification for the parent outcome.

**Verification Commands:**

```sh
node --test scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/slow/task-tracker/core/packaged-doctor-consumer.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```
