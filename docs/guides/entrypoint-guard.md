# Entry-point guard for GitHub-writing scripts

Any `scripts/task-tracker/*.mjs` file whose `main()` (or module scope) calls
`mutateIssueBody`, `versionedWriteBody`, or shells out to `gh issue edit|create
... --body` **must** gate the live call behind an entry-point check. ES module
top-level statements execute on `import()` regardless of whether the module is
later invoked as a CLI — a script that fires a write unconditionally at module
scope, or calls an unconditional `main()` at the bottom of the file, performs
that write the instant anything `import()`s the module for inspection, testing,
or reuse. That is a real incident class, not a hypothetical: see #723.

## The pattern

```js
async function main() {
  /* ... does the write ... */
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

or the `fileURLToPath`-normalized equivalent (handles path differences on some
platforms):

```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${scriptName}: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
```

Either form is acceptable. What is **not** acceptable is an unconditional
`main();` or `main().catch(...)` at the bottom of a file whose `main` performs
a GitHub write — that fires on `import()`.

Read-only scripts (only `gh issue view`, only `process.stdout.write`) don't
need this guard — there's nothing for an accidental `import()` to trigger.

## Enforcement

`scripts/task-tracker/lib/entrypoint-guard-lint.mjs` exports
`lintEntrypointGuard(source)`, a heuristic source-text scanner that flags any
file with write capability and no guard pattern present. It is exercised by:

- `scripts/tests/unit/task-tracker/lib/entrypoint-guard-convention.test.mjs` —
  proves the rule against synthetic fixtures (a violating file, a compliant
  file via each guard form, a read-only file).
- `scripts/tests/unit/task-tracker/lib/audit-top-level-writes.test.mjs` — runs the
  lint against every real file under `scripts/task-tracker/*.mjs` and asserts
  zero violations, locking in the current clean state and catching future
  regressions.
