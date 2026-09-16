# Declarable Develop Verification Design

**Issue:** #1250
**Status:** approved

## Problem and boundary

Develop iteration verification currently derives JavaScript-only lint, format,
and affected-test commands. A non-empty Swift changeset can therefore execute
zero commands and return green. Phase 1 closes that fail-open seam without
introducing #1218's provider/plugin contract or changing Test-stage receipts,
lane taxonomy, coverage, or the command allowlist.

The Xcode dogfood target is the real `OCPMobile.xcodeproj`. With Xcode 26.6 and
Swift 6.3.3, `build-for-testing` succeeds for its `OCPMobileTests` scheme while
test execution reports an independently actionable CoreSimulator version
mismatch. This proves that a single opaque hook would lose useful step and
failure boundaries.

## Configuration contract

AITM adds one optional project-local configuration key:

```json
{
  "developVerification": {
    "iterationSteps": [
      {
        "classification": "xcode-build-for-testing",
        "command": "scripts/verify/xcode-build-for-testing.sh",
        "label": "Xcode build-for-testing"
      },
      {
        "classification": "xcode-tests",
        "command": "scripts/verify/xcode-tests.sh",
        "label": "Xcode tests"
      }
    ]
  }
}
```

`iterationSteps` is ordered. Each entry has exactly `classification`, `command`,
and optional `label`. Classifications are unique lowercase slugs. `command` is a
command string accepted by the existing verification allowlist; its returned
argv is spawned with `shell: false`. An unknown key, malformed classification,
duplicate classification, empty command, rejected command, or non-array step
table returns `iteration-config-invalid` before any command runs.

The declared table replaces only iteration planning. Final Develop verification
and Test/Review behavior remain unchanged. When the key is absent, AITM retains
the current JavaScript derivation for backward compatibility.

## Execution semantics

Iteration first collects the complete changed-path set.

- Zero changed paths returns green with the explicit `no-changes` reason and no
  command. This is the only valid green zero-command result.
- A configured project executes every declared step in order, stopping at the
  first nonzero exit.
- An unconfigured project uses the existing JavaScript lint, format, and
  affected-test derivation.
- Any non-empty changeset that yields zero executable steps returns red with
  `iteration-no-commands`. Documentation is not a blanket exemption: the legacy
  Node fallback already formats supported documentation, and configured projects
  decide which declared verification covers it.

Each executed command record preserves classification, normalized argv, label,
allowlist source, exit code, timing, and optional timestamps. Built-in fallback
steps carry `allowlistSource: "core"`; declared steps carry
`allowlistSource: "verification-allowlist"`. Command failures retain
`command-red`; invalid configuration and zero-step refusal are distinguishable
from project-code failures.

## Implementation boundaries

- `scripts/task-tracker/config.mjs` admits `developVerification` as an optional
  object without manufacturing a default step table.
- A focused `lib/develop-verification-steps.mjs` validates and normalizes the
  declaration into immutable `{ classification, command, args, label,
allowlistSource }` steps.
- `verify-develop.mjs` chooses declared or legacy planning, applies explicit
  empty/non-empty semantics, and records the step metadata. Its final mode is
  unchanged.
- `docs/guides/non-javascript-verification.md` documents a minimal
  `package.json` shim for complete Test lanes, the declarable Develop steps, and
  the irreducible fact that a project-owned script can lie by exiting zero.

The declaration does not load project modules or provider code. It does not add
new executable bins: every command must pass the same allowlist already used for
issue-declared verification.

## Verification

Tests must first reproduce the current silent green with a non-JavaScript path,
then prove zero-step refusal. Focused tests cover valid ordered steps, distinct
records, first-red abort, malformed shapes, duplicate classifications,
allowlist rejection, legacy fallback parity, empty changes, and non-empty
unsupported changes. An integration test exercises real spawned project scripts
from a temporary non-JavaScript fixture. Config completeness, documentation,
fast, slow, lint, and format gates remain required.

## Out of scope

- Provider discovery, capability negotiation, structured environment failures,
  or swappable language/test-framework modules (#1218).
- Affected-file graphs outside the current Node fallback.
- Test-stage receipt, cache, sandbox setup, allowlist-bin, or lane changes.
- Editing the external Xcode dogfood project.
