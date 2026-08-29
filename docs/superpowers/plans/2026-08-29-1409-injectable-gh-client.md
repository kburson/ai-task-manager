# #1409 Injectable GitHub Client Implementation Plan

**Goal:** Route the 29 scoped hardcoded GitHub process bindings through one
late-resolving injectable client without changing production process semantics.

## Task 1: Pin the client contract

- Add `scripts/tests/unit/gh/gh-client-injection.test.mjs`.
- Characterize the exact 29-module population and require it to resolve through
  the shared client.
- Prove substitution after imports reaches callers and preserves executable,
  arguments, timeout/options, and per-call override precedence.
- Run the new test and confirm it fails against the current implementation.

## Task 2: Add the shared production seam

- Add `scripts/gh/lib/gh-client.mjs` with the sole default
  `promisify(execFile)` binding.
- Export a mutable client object and a stable wrapper that performs property
  lookup at invocation time.
- Re-run the new unit test.

## Task 3: Rewire the scoped population

- Replace the 28 module-local false-injection bindings with imports of the
  shared wrapper.
- Make `issue-body-push` and `review-derive-rescan` fall back to the wrapper while
  preserving explicit `deps.pexec` overrides.
- Keep all existing argument vectors, environments, timeouts, stdin handling,
  and error behavior unchanged.
- Run the new unit test and focused tests for touched verbs/libraries.

## Task 4: Verify and deliver

- Run the declared promote verifier and the lane-wide GitHub call census.
- Run full unit/integration/slow and aggregate verification, lint, and format in
  the governed sandbox.
- Complete independent review, full-auto approval, governed delivery, and close
  only from the exact accepted SHA.
