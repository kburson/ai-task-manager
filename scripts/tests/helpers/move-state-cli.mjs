#!/usr/bin/env node
// @story #764
// Test-only spawnable harness for scripts/gh/move-state.mjs.
//
// #764 retired move-state.mjs's own `isInvokedAsMain()` entrypoint shim so the
// production module is import-only. A handful of tests, however, must still drive
// a REAL move-state process end to end: the cross-process advisory-lock tests
// (two contending processes on the same per-issue lock dir) and the no-TTY /
// internal-gate tests both depend on move-state running as its own OS process,
// which an in-process function call can't reproduce. This harness is that process
// — the deleted shim relocated verbatim: it imports the exported runMoveStateHost,
// runs it with process defaults (argv/env/isTTY read from this real process), and
// maps the returned numeric code onto process.exit exactly as the old shim did.
//
// It lives under tests/ so it never ships (package-boundary.test.mjs enforces the
// pack boundary). Spawn-based tests point their move-state path constant here.
import { runMoveStateHost } from '../../gh/move-state.mjs';

runMoveStateHost()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    process.stderr.write(`move-state-cli.mjs: ${err?.stack || err}\n`);
    process.exit(1);
  });
