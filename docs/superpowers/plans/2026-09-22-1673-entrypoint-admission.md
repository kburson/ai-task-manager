# #1673 Exhaustive Entrypoint Admission and Annotation Implementation Plan

> **For agentic workers:** Execute the three tasks in order with test-first steps and a review checkpoint after each. The accepted #1558 WBS and issue gates govern state changes.

**Goal:** Admit every supported operational route before effects, then add one serialized divergence annotation after a successful issue mutation.

**Architecture:** Reuse #1672's single source resolver and recovery classifier at the front router, direct task hub, package CLI, and routed support scripts. A registry-derived, checked-in inventory enumerates routes, aliases, direct entrypoints, first effects, and exceptions; a post-success hook under existing issue serialization handles annotation. B2 cache and final joint-release certification remain #1674's work.

**Tech Stack:** Node.js ESM, Git/GitHub CLI, `node:test`, AITM command catalog, `js-yaml@5.4.2` through #1672's validated loader.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` §§10–11, 17, 19–22; accepted WBS Task 21 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Scope

Implement #1673 only. Keep #1672 source selection and recovery semantics unchanged. Do not implement the #1674 cache or describe B1 as publishable.

## Context

The current registry exposes 72 verb/alias tokens and 20 routed support scripts besides two front routers; adding `guidance` creates the accepted 21-support-route baseline. All routes need classification, including package CLI subcommands, direct supported entrypoints, help/version recovery, and explicitly excluded internal/hook/migration paths. #1672 currently places its B2-absent consumer assertion inside ordinary lint; separate development-time manifest agreement from release-time consumer refusal so exact-HEAD Test can run while prepublish continues to reject B1 alone.

## Acceptance Criteria

- [ ] Every exposed route, alias, package subcommand, and supported direct entrypoint has a checked-in inventory row and invalid-catalog refusal before effects; newly exposed unclassified routes fail CI.
- [ ] All dispatchers and direct paths use `classifyGuidanceRoute()`/`admitGuidance()` from #1672; recovery remains offline and no skip flag bypasses validation.
- [ ] A successful issue lifecycle mutation under diverged guidance posts at most one serialized, paginated annotation. Read-only/failing commands post none; post-success audit failure is visible without rollback.
- [ ] Production-only downstream install, exact package delta, cold command timings, manifest agreement, and B2-absent publish refusal are tested.

## Plan Metadata

- Priority: P2
- Size: L
- Estimate: 22 hours (accepted WBS three-unit allocation: 10+6+6)
- Labels: epic-1558, guidance

## Story Intent

- **Beneficiary:** Operational CLI user and issue maintainer
- **Capability:** Have every supported command admitted before effects and record one divergence notice after a successful mutation
- **Need:** Aliases, direct entrypoints, and startup imports could otherwise bypass source trust or duplicate audit comments
- **Value or failure prevented:** Invalid guidance cannot act through an unclassified route, and a diverged source leaves a single visible audit trail

## Global Constraints

- The catalog never grants execution; existing guards, locks, and provider authorization remain authoritative.
- Only validate/source/help/version are recovery; human explain and read-only operational commands are not recovery.
- Invalid guidance blocks before network, lock, session, guard, or provider effects, including with `TT_SKIP_NETWORK=1`.
- B1 and B2 ship together; keep the B2-absent publish refusal until #1674 supplies certification.
- Retain Node compatibility, production-only package assets, scratch isolation, and existing mutation exit codes.

## Implementation Tasks

### Task 1: Inventory and admit the complete command surface

#### Story Intent

- **Beneficiary:** Operational CLI user
- **Capability:** Receive the same source-trust admission on every supported route and alias
- **Need:** Dispatch aliases, package subcommands, or direct scripts could bypass the main hub
- **Value or failure prevented:** An invalid selected catalog prevents any operational effect regardless of invocation form

#### Files

Create `scripts/tests/fixtures/1558/admission-surface.json` and `scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs`. Modify `bin/aitm.mjs`, `bin/aitm-registry.mjs`, `bin/cli.mjs`, `scripts/task-tracker/task-tracker.mjs`, `scripts/task-tracker/lib/command-surface/{catalog,entrypoints,routing}.mjs`, `scripts/lib/self-doc.mjs`, and the 20 routed direct support scripts classified in `entrypoints.mjs`. Add one shared direct-admission helper under `scripts/task-tracker/lib/` if needed, with no alternate allowlist. The inventory records canonical route, aliases, entrypoint, pre-admission imports, first effect, gate call, exception classification, and fixture ID. Its parity test derives the live command set from the registry and fails on any missing/new route. Parameterized invalid-catalog fixtures exercise each token and direct form, including startup flags and `TT_SKIP_NETWORK=1`. Check static-import side effects explicitly before moving the gate inward.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs
```

### Task 2: Annotate only successful diverged mutations

#### Story Intent

- **Beneficiary:** Issue maintainer
- **Capability:** See one durable notice that project guidance diverged during a successful lifecycle mutation
- **Need:** Read-only or failed attempts must not add misleading comments, while retries and edits must not duplicate the notice
- **Value or failure prevented:** The issue has a concise and idempotent audit trail without altering the committed mutation

#### Files

Create `guidance/annotation.mjs`; modify the common lifecycle success boundary or the smallest set of success callbacks that still runs inside issue mutation serialization. Add paginated comment lookup for `aitm-guidance-override:v1`, with one visible notice and hidden source/digest metadata. All later source edits reuse the existing annotation. Expose a named `guidance-annotation-failed` warning on post-success read/write failure, never rollback. Extend `guidance-admission.test.mjs` with success, failed/read-only, pagination, retry, concurrency and failure cases; reject any design relying on a distributed GitHub compare-and-swap claim.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs
```

### Task 3: Certify package and development/release boundaries

#### Story Intent

- **Beneficiary:** Release operator and installed-package user
- **Capability:** Verify B1 admission from a production-only install while refusing publication until B2 cache evidence exists
- **Need:** A development branch must run exact-head tests without being mistaken for a shippable loader-only release
- **Value or failure prevented:** Packaged assets and parser work, and no consumer receives an uncertified partial loader

#### Files

Modify `package.json`, `.github/workflows/ci.yml`, `scripts/maintenance/generate-guidance-release.mjs`, `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`, and `scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs`. Keep read-only manifest agreement in ordinary lint. Keep `--assert-consumer-release` in `prepublishOnly` and a release-targeted CI check, with an explicit negative test against the B2-absent consumer tree. Measure cold per-command B1 time separately from live GitHub latency. Use `npm pack --dry-run --json` to record exact packaged additions before adjusting any count. Verify `init` never writes `.ai-task-manager/aitm-guidance.yml`.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/guidance-admission.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs
npm run lint
npm run format:check
npm test
npm run test:slow
```
