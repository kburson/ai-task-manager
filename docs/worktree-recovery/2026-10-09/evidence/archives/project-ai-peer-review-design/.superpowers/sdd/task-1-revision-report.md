# Task 1 Corrective Revision Report

## Scope

Implemented the approved corrective suite-scoping change for issue #1577. The
implementation file changed was only
`scripts/tests/integration/task-tracker/verbs/bind.test.mjs`.

## Baseline RED

At the dispatched HEAD `f67f04218f5ed807de67a5e7a6d5a6106f890fc3`, ran:

```text
node --version
v25.6.0
node --test scripts/tests/integration/task-tracker/verbs/bind.test.mjs
```

The focused test exited nonzero with 8 tests, 7 passing and 1 failing. The
final integration case failed with ENOENT while writing
`.scratch/test/tt-bind-hint-*/state-1.json`, as expected.

## Change

Imported `describe`, wrapped only the two post-await `verbResume` integration
tests in the named `verbResume review-remediation hints` suite, and registered
the existing `rmSync(tmp, ...)` cleanup callback with `after` inside that
suite. Test bodies and assertions are unchanged apart from required
indentation.

## Verification

- Focused `node --test scripts/tests/integration/task-tracker/verbs/bind.test.mjs`: PASS, 8/8; no ENOENT.
- `git diff --check`: PASS.
- `node scripts/task-tracker/verify-develop.mjs --mode iteration`: PASS.
- Committed only the target test file with the required subject.
- Final `git status --short`: clean (the ignored report is not tracked).
- `node scripts/task-tracker/verify-develop.mjs --mode final --issue 1577`: PASS at the committed SHA.

## Concerns

The test runner emits pre-existing configuration and transcript-resolution
warnings; they do not affect exit status or the requested assertions.
