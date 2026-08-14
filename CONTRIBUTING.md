# Contributing

## Testing

All package tests live under `scripts/tests/<unit|integration|slow>/`, mirroring
their source path below `scripts/`.
See [ADR 0001 — Test Tree Convention](docs/decisions/0001-test-tree-convention.md)
for the full taxonomy, integration vs unit boundary, and the slow-lane split policy.

**Subdirectory taxonomy:**

| Path                                                | Contains                            |
| --------------------------------------------------- | ----------------------------------- |
| `scripts/tests/unit/<source-relative-path>/`        | Unit tests                          |
| `scripts/tests/integration/<source-relative-path>/` | Cross-stage E2E tests               |
| `scripts/tests/slow/<source-relative-path>/`        | Integration / slow tests (≥2s each) |

Co-located tests and domain-local `tests/` roots are rejected. Discovery scans all
of `scripts/` so `npm run lint:test-layout` can name a misplaced file instead of
silently omitting it.

**Story-ID tagging:** Every test file has a permitted `// @story #NNN` header identifying the issue that owns it. Run `npm run lint:story-tags` to verify all files carry the tag.

**Per-file line cap:** Review files above 400 code lines; 800 code lines is the hard limit. Run `npm run lint:line-cap` to check package-wide discovery. Split at a cohesive feature boundary before the hard limit.

**Audit commands:**

```
npm run lint:story-tags   # every *.test.mjs has // @story #NNN
npm run lint:test-layout  # every discovered test declares a canonical lane
npm run lint:line-cap     # no file exceeds 800 code lines
npm test                  # fast lanes (unit + integration)
npm run test:slow         # slow lane
```

**Worked example:** To add a test for issue #500 covering a change in `scripts/task-tracker/lib/foo.mjs`, create `scripts/tests/unit/task-tracker/lib/foo.test.mjs`. Start the file with `// @story #500`, write your tests using Node's built-in `node:test` runner, and keep the file below the 800-code-line hard limit. Run `npm run test:unit` to verify it passes in the unit lane.
