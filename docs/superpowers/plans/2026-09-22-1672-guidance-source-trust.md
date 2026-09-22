# #1672 Guidance Source Trust and Recovery Admission

## Scope

Implement the #1558 WBS Task 20 source/trust boundary, offline recovery CLI, pinned release identity, and B2-absent consumer-release refusal. Do not wire the exhaustive operational route inventory or annotation (#1673) and do not implement the cache (#1674).

## Context

The accepted design is `2026-09-15-1558-ask-the-script-guidance-design.md` §§8, 10, 11, 22. #1671 supplies `validateGuidance`, strict source decoding, and raw/semantic fingerprints. Runtime source resolution must derive the package root from the running module, not the project's `node_modules`. Project source selection is all-or-nothing. A tracked, modified override remains project-owned. A malformed or unsupported source/manifest fails by name rather than falling back. The release manifest is checked-in publisher metadata; runtime never regenerates it.

## Acceptance Criteria

- [ ] Active project override selection and tracking, module-relative package selection, trust classifications, whole-catalog shadowing, and fail-closed source errors pass the focused tests.
- [ ] One exported classifier gives offline validate/source/help/version recovery and denies human explain; admission returns the compact refusal before any caller effects, including network-skip variants.
- [ ] A generated manifest pins raw catalog and separate parser/compiler identity; CI checks agreement without restamping, package contents are asserted, and a B2-absent consumer release is refused.

## Plan Metadata

- Priority: P2
- Size: L
- Estimate: 22 hours
- Labels: epic-1558, guidance

## Story Intent

- **Beneficiary:** Maintainer adopting guidance in a project
- **Capability:** Select and validate an explicitly trusted catalog while retaining offline recovery
- **Need:** An invalid or tampered project catalog could otherwise be silently replaced by package guidance or reach operational effects
- **Value or failure prevented:** Operations fail before effects and a partial loader cannot ship without its required cache certification

## Implementation Tasks

### Task 1: Resolve source and classify trust

#### Story Intent

- **Beneficiary:** Maintainer adopting guidance in a project
- **Capability:** Select only the running package catalog or a tracked whole-project override
- **Need:** Resolution across worktrees and installed layouts can otherwise pick the wrong copy or silently fall back
- **Value or failure prevented:** The selected source has a named, auditable trust status before use

#### Files

Add `guidance/source.mjs` and source/layout tests in `scripts/tests/integration/task-tracker/lib/guidance-source-trust.test.mjs`. Test checkout, linked/relocated/symlinked package, missing/unreadable source, ignored root catalog, tracked modified/staged/untracked override, and whole-catalog shadowing. Use injected filesystem/Git seams only where they represent real runtime observations, and retain at least one actual CLI fixture. Compose existing `validateGuidance` without creating a permissive alternate parser.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/guidance-source-trust.test.mjs
```

### Task 2: Add recovery and effect-free admission

#### Story Intent

- **Beneficiary:** Operator repairing an invalid guidance catalog
- **Capability:** Inspect and validate the selected source offline while ordinary actions remain blocked
- **Need:** A broken catalog must not lock out repair or permit skip flags to bypass source validation
- **Value or failure prevented:** Recovery remains usable without performing operational effects

#### Files

Add `guidance/admission.mjs`, `scripts/task-tracker/guidance.mjs`, and tests in the source-trust integration file. Export a single recovery classification for #1673. Validate default, candidate, and published profiles; support JSON/human, `--file`, `--published`, `--refresh`, and source inspection. Exclude human explain. Verify no GitHub, context, lock, session, guard, or provider call occurs on refusal. Do not enumerate or wire all routes here.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/guidance-source-trust.test.mjs
```

### Task 3: Pin release and package boundary

#### Story Intent

- **Beneficiary:** Release operator
- **Capability:** Refuse an operational-loader consumer release until catalog identity and B2 cache certification agree
- **Need:** B1 development code can otherwise be shipped without its required warm-load and invalidation guarantees
- **Value or failure prevented:** Consumers receive only the jointly certified loader/cache release

#### Files

Add `instructions/aitm-guidance.release.json`, `scripts/maintenance/generate-guidance-release.mjs`, `docs/guides/aitm-guidance-source.md`, release-refusal integration tests, `package.json` asset allowlist, and package-boundary assertions. Generator writes only when explicitly invoked; its check mode is read-only and fails disagreement. Record exact packed-entry delta and adjust ceiling only to measured intentional assets. Release assertion must reject absent/invalid B2 certification rather than accepting a declaration-only placeholder.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/guidance-release-refusal.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
npm run lint
npm run format:check
npm test
npm run test:slow
```
