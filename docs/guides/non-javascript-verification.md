# Non-JavaScript Verification

AI Task Manager runs on Node.js, but the project it governs does not have to be
JavaScript. The default `node` verification provider preserves AITM's canonical
lint, format, and test lanes. An explicit `project` provider can instead declare
the ordered verification floor for a native toolchain while AITM keeps command
validation, sandbox execution, exact-SHA receipts, and lifecycle decisions.

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

## Project verification provider

Add an ordered declaration to `.ai-task-manager/task-tracker.json`. Every step
declares a stable classification and one semantic kind: `format`, `lint`,
`build`, `test`, or `environment`.

```json
{
  "verificationProvider": {
    "id": "project",
    "develop": {
      "iterationSteps": [
        {
          "classification": "swift-lint",
          "kind": "lint",
          "command": "scripts/verify/swift-lint.sh",
          "label": "Swift lint"
        }
      ],
      "finalSteps": [
        {
          "classification": "xcode-build",
          "kind": "build",
          "command": "scripts/verify/xcode-build-for-testing.sh"
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
          "command": "scripts/verify/xcode-unit-tests.sh"
        }
      ]
    }
  }
}
```

When `verificationProvider` is absent, AITM selects the built-in `node`
provider. The older `developVerification.iterationSteps` declaration remains a
Node-provider compatibility input, but new native projects should use the full
project contract so Develop finalization and Test share one provider identity.

Every entry must have a unique lowercase-slug `classification`, an allowlisted
`command`, a supported `kind`, and an optional non-empty `label`. AITM validates
the complete provider before running its first step. Commands execute in declaration order with
`shell: false`; the existing verification allowlist performs tokenization and
rejects shell metacharacters, unknown binaries, and unsafe subcommands. Direct
project scripts must live under `scripts/` and end in `.mjs` or `.sh`.

Issue-specific Verification Commands are appended to the Test plan as targeted
checks. An exact command already present in the provider floor runs only once.
Receipts retain the provider ID, required classifications, and each command's
semantic kind, so an unavailable simulator is not misreported as a build or
test failure.

## Empty and unsupported changes

An empty Git changeset is the only iteration that can succeed without executing
a command. Its result carries the explicit `no-changes` reason.

A non-empty changeset that produces no executable step fails with
`iteration-no-commands`. Empty final or Test floors, unsupported setup values,
unknown keys or providers, duplicate classifications, and rejected commands are
refused before provider execution. This is intentionally fail closed.

If the project has no affected-test selector, point the Develop test step at a
broader native suite. That costs time but remains honest. Do not omit every step
or rely on a silent green result.

## Trust boundary

AITM proves which wrapper command ran, in what order, and with what exit code. It
cannot prove that arbitrary project-owned wrapper logic is meaningful. A script
that replaces `xcodebuild test` with `exit 0` can still lie successfully, just as
a package script can.

Keep wrappers small and reviewable, commit them with the project, and have CI
invoke the same native commands independently. The provider boundary improves
classification and auditability; it cannot remove the need to trust the
governed project's own verification definitions.
