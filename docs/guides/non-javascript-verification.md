# Non-JavaScript Verification

AI Task Manager runs on Node.js, but the project it governs does not have to be
JavaScript. A thin `package.json` can expose native lint and test commands to the
complete Test-stage lanes, while `developVerification.iterationSteps` declares
the faster checks that run during Develop.

This is the Phase-1 bridge. The swappable provider contract tracked by #1218
will eventually own richer toolchain discovery and structured environment
failures.

## Complete Test-stage lanes

Create a zero-dependency `package.json` and lockfile in the governed project.
Map the five canonical scripts to project-owned wrappers:

```json
{
  "private": true,
  "scripts": {
    "lint": "scripts/verify/swift-lint.sh",
    "format:check": "scripts/verify/swift-format-check.sh",
    "test:unit": "scripts/verify/xcode-unit-tests.sh",
    "test:integration": "scripts/verify/xcode-integration-tests.sh",
    "test:slow": "scripts/verify/xcode-slow-tests.sh"
  }
}
```

Run `npm install --package-lock-only` once and commit both files. AITM's
sandboxed `npm ci --no-audit --no-fund` setup then remains deterministic even
when the lockfile has no dependencies.

The wrappers own native details. For example, a build-only Xcode check can keep
its products under an ignored project scratch tree:

```sh
#!/bin/sh
set -eu

exec xcodebuild build-for-testing \
  -project OCPMobile.xcodeproj \
  -scheme OCPMobileTests \
  -destination 'generic/platform=iOS' \
  -derivedDataPath .tmp/aitm/xcode-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO
```

Add `.tmp/` to the consuming project's `.gitignore` so verification artifacts
cannot make the governed worktree dirty.

A test wrapper should name the project's real simulator destination. Keep
build-for-testing and test as separate wrappers: an installed Xcode toolchain
can compile successfully while simulator setup fails before any project test
runs. Separate commands preserve that distinction in AITM's results.

## Develop iteration steps

Add an ordered declaration to `.ai-task-manager/task-tracker.json`:

```json
{
  "developVerification": {
    "iterationSteps": [
      {
        "classification": "swift-lint",
        "command": "scripts/verify/swift-lint.sh",
        "label": "Swift lint"
      },
      {
        "classification": "xcode-build-for-testing",
        "command": "scripts/verify/xcode-build-for-testing.sh",
        "label": "Xcode build-for-testing"
      },
      {
        "classification": "xcode-tests",
        "command": "scripts/verify/xcode-unit-tests.sh",
        "label": "Xcode unit tests"
      }
    ]
  }
}
```

The table replaces only Develop iteration planning. When it is absent, AITM
retains its built-in JavaScript lint, format, and affected-test selection.

Every entry must have a unique lowercase-slug `classification`, an allowlisted
`command`, and an optional non-empty `label`. AITM validates the complete table
before running its first step. Commands execute in declaration order with
`shell: false`; the existing verification allowlist performs tokenization and
rejects shell metacharacters, unknown binaries, and unsafe subcommands. Direct
project scripts must live under `scripts/` and end in `.mjs` or `.sh`.

## Empty and unsupported changes

An empty Git changeset is the only iteration that can succeed without executing
a command. Its result carries the explicit `no-changes` reason.

A non-empty changeset that produces no executable step fails with
`iteration-no-commands`. This is intentionally fail closed. Documentation is
not automatically exempt: a configured project decides which declared check
covers documentation, and the built-in Node fallback already formats supported
documentation files.

If the project has no affected-test selector, point the Develop test step at a
broader native suite. That costs time but remains honest. Do not omit every step
or rely on a silent green result.

## Trust boundary

AITM proves which wrapper command ran, in what order, and with what exit code. It
cannot prove that arbitrary project-owned wrapper logic is meaningful. A script
that replaces `xcodebuild test` with `exit 0` can still lie successfully, just as
a package script can.

Keep wrappers small and reviewable, commit them with the project, and have CI
invoke the same native commands independently. The future provider contract can
add structured capabilities and results, but it cannot remove the need to trust
the governed project's own verification definitions.
