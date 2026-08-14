# Contributing

## Testing

All package tests live under `scripts/tests/<unit|integration|slow>/`, mirroring
their source path below `scripts/`.
See [ADR 0001 — Test Tree Convention](docs/decisions/0001-test-tree-convention.md)
for the full taxonomy, integration vs unit boundary, and the slow-lane split policy.

**Subdirectory taxonomy:**

| Path                                                | Contains                            |
| --------------------------------------------------- | ----------------------------------- |
| `scripts/tests/unit/task-tracker/`                  | Task-tracker unit tests             |
| `scripts/tests/unit/providers/`                     | Provider unit tests                 |
| `scripts/tests/integration/<source-relative-path>/` | Cross-stage E2E tests               |
| `scripts/tests/slow/<source-relative-path>/`        | Integration / slow tests (≥2s each) |

**Story-ID tagging:** Every test file begins with `// @story #NNN` on line 1 identifying the issue that owns it. Run `npm run lint:story-tags` to verify all files carry the tag.

**Per-file line cap:** Each test file must stay under 400 lines. Run `npm run lint:line-cap` to check. Split into separate files when you hit the limit.

**Audit commands:**

```
npm run lint:story-tags   # every *.test.mjs has // @story #NNN
npm run lint:line-cap     # no file exceeds 400 lines
npm test                  # fast lanes (unit + integration)
npm run test:slow         # slow lane
```

**Worked example:** To add a test for issue #500 covering a change in `scripts/task-tracker/lib/foo.mjs`, create `scripts/tests/unit/task-tracker/lib/foo.test.mjs`. Start the file with `// @story #500`, write your tests using Node's built-in `node:test` runner, and confirm the file is under 400 lines. Run `npm run test:unit` to verify it passes in the unit lane.
