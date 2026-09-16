# Verification Provider Contract Design

**Issue:** #1218

**Status:** Approved in chat on 2026-09-01 after Xcode dogfooding and #1250
delivery.

## Goal

Move project-specific verification planning behind a deterministic built-in
provider contract without moving lifecycle, exact-SHA, execution-policy, or
evidence authority out of AITM core.

## Boundary

AITM core continues to own:

- changed-SHA and sandbox identity;
- lifecycle state and rollback decisions;
- command allowlist enforcement and `shell: false` execution;
- receipt creation, validation, persistence, and reuse;
- timing, audit comments, and fail-closed policy.

A verification provider owns:

- project-specific Develop iteration and final command plans;
- Test setup identity and ordered Test command plans;
- stable classifications and the set of classifications required for green;
- a semantic step kind: `format`, `lint`, `build`, `test`, or `environment`;
- affected-test discovery for the default Node provider.

Providers return data only. They do not spawn processes, write issue bodies,
move state, create receipts, claim cache hits, or decide whether evidence is
accepted.

## Built-in providers

### Node

`node` is the default when no provider is configured. It preserves today's
behavior:

- JavaScript/formattable changed-path selection;
- Node import-graph affected-test selection;
- `npm run lint` and `npm run format:check` Develop finalization;
- `npm ci --no-audit --no-fund` sandbox setup;
- unit, integration, and slow Test lanes plus the existing legacy aggregate
  derivation.

The #1250 `developVerification.iterationSteps` setting remains a compatibility
adapter. It changes only Node-provider iteration planning and does not silently
activate the project provider.

### Project

`project` is an explicit built-in declarative provider. Configuration is strict:

```json
{
  "verificationProvider": {
    "id": "project",
    "develop": {
      "iterationSteps": [
        {
          "classification": "swift-format",
          "kind": "format",
          "command": "scripts/verify/swift-format.sh"
        }
      ],
      "finalSteps": [
        {
          "classification": "xcode-build",
          "kind": "build",
          "command": "scripts/verify/xcode-build.sh"
        }
      ]
    },
    "test": {
      "setup": "npm-ci",
      "steps": [
        {
          "classification": "simulator-ready",
          "kind": "environment",
          "command": "scripts/verify/simulator-ready.sh"
        },
        {
          "classification": "xcode-tests",
          "kind": "test",
          "command": "scripts/verify/xcode-tests.sh"
        }
      ]
    }
  }
}
```

Unknown keys, provider IDs, kinds, duplicate classifications, unsafe commands,
empty required stages, and malformed values refuse the full plan before the
first process starts. `npm-ci` remains the only setup identity in this slice;
the zero-dependency package shim keeps it deterministic for non-Node products.
Dynamic module loading is intentionally absent.

## Normalized plan

Every provider returns an immutable plan:

```js
{
  providerId: 'node',
  stage: 'develop-iteration',
  setup: 'npm-ci',
  steps: [{
    classification: 'test-affected',
    kind: 'test',
    command: 'node',
    args: ['--test', 'path/to/test.mjs'],
    label: 'node --test path/to/test.mjs',
    allowlistSource: 'core'
  }],
  derivedSteps: [],
  requiredClassifications: ['test-affected']
}
```

`derivedSteps` describe verdicts computed from named executed classifications;
they preserve the existing Node legacy aggregate behavior without pretending a
process ran. The core executor is generic: execute `steps` in order, abort on
the first red result, then evaluate `derivedSteps` only from actual results.

## Test-stage composition

The provider's Test steps are the project-wide floor. Root issue Verification
Commands remain story-specific evidence declarations. Core appends any declared
command not already present in the provider plan as a targeted step with a
deterministic `test-targeted-N` classification. Exact duplicates execute once.

For the Node provider, the current docs-only lane-drop policy remains in core
because issue kind and lifecycle evidence are core authority. Core passes the
resulting `includeCompleteLanes` decision into the provider; the provider plans
the surviving commands. A project provider's configured Test floor is never
dropped by Node-specific docs-only logic.

## Receipts

Receipt schema remains `aitm.verification-receipt/v1`. New optional metadata is
additive:

```js
provider: {
  id: 'project',
  requiredClassifications: ['xcode-build', 'simulator-ready', 'xcode-tests']
}
```

Command records may additionally retain `providerId`, `kind`, and
`allowlistSource`. Core validates these values when present and requires every
provider-declared classification exactly once and green. Legacy receipts without
provider metadata retain the existing five Node requirements. Providers cannot
remove receipt requirements after execution because the required set is copied
into the immutable core-created receipt.

## Xcode failure boundary

Xcode prose is not parsed to guess failure meaning. Project configuration names
three different steps:

- an `environment` readiness probe;
- a `build` step using `build-for-testing`;
- a `test` step using the selected destination.

If the readiness probe fails, the result is `command-red` with
`kind: environment`; build and test do not run. A build failure remains
`kind: build`; a test-process failure remains `kind: test`. This matches the
observed machine: generic iOS build-for-testing succeeds while simulator
execution is independently blocked by the CoreSimulator patch mismatch.

## Compatibility and migration

- No configuration means byte-equivalent Node argv and legacy receipt checks.
- #1250 `developVerification` continues to affect iteration mode only.
- `verificationProvider.id = project` is explicit opt-in and requires complete
  Develop-final and Test floors.
- The existing package-script shim remains supported and documented.
- Existing issue Verification Commands and AC evidence semantics do not change.

## Out of scope

Nx affected graphs and cache evidence, learned TIA, Android discovery, coverage
providers, arbitrary package loading, provider-supplied lifecycle decisions,
and a receipt schema version change are excluded.

## Verification

Unit tests prove strict resolution and plan normalization. Integration tests
prove Node compatibility, project-provider composition, Xcode-shaped distinct
outcomes, and first-red abort. Existing Develop, Test, receipt, fast, slow,
lint, and format suites protect the unchanged authority boundary.
