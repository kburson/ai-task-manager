# #1410 Fail-Closed GitHub Test Boundary Implementation Plan

**Goal:** Make any test that reaches a real default `gh` process fail with an
actionable call-site diagnostic, and provide a lane census that proves the
unit, integration, and slow populations make zero such calls.

## Task 1: Pin the fail-closed contract

- Add `scripts/tests/unit/gh/gh-fail-closed-guard.test.mjs`.
- Prove `pexec`, callback `execFile`, promise-based `execFile`, and `spawn` refuse
  only when they are still the real defaults and `TT_SKIP_NETWORK=1`.
- Require the diagnostic to include the first external module/call site, the
  exact argument vector, and guidance to install the offline double.
- Prove substituted client functions still run under the signal and production
  calls remain byte-for-byte forwarded when the signal is absent.
- Run the new test and confirm it fails against the current client.

## Task 2: Guard the shared real-client defaults

- Extend `scripts/gh/lib/gh-client.mjs` with one shared guard and call-site
  formatter.
- Wrap the real default `pexec`, `execFile`, and `spawn` functions; retain the
  `execFile[promisify.custom]` result shape used by `github-projects.mjs`.
- Keep `ghClient` mutable so `installStubGh` and narrow test doubles bypass the
  guard by replacing the appropriate property.
- Preserve executable, arguments, options, environment, stdin, return values,
  and production error behavior when `TT_SKIP_NETWORK` is unset.

## Task 3: Add the lane census

- Add `scripts/tests/tools/gh-call-census.mjs` with repeatable `--lane` flags for
  `unit`, `integration`, and `slow`.
- Materialize a project-scratch `gh` sentinel, prepend it to each child lane's
  PATH, record every invocation, and refuse each intercepted call without
  contacting GitHub.
- Run lanes through the canonical `scripts/run-tests.mjs --lane` entry point.
- Print a deterministic per-lane census and exit nonzero when a lane fails or
  any real `gh` resolution is observed.
- Add focused integration coverage for argument parsing, report formatting, cleanup,
  and the zero/nonzero result contract.

## Task 4: Verify and deliver

- Run the guard contract and census-tool unit coverage.
- Run the declared three-lane census and require zero invocations in every lane.
- Run aggregate and slow verification, lint, formatting, and whitespace checks
  in the governed sandbox.
- Complete independent review, Full-Auto approval, hosted CI, governed delivery,
  and close only from the exact accepted SHA.
