# Contributing

## Testing

Tests for the task-tracker subsystem live under `scripts/task-tracker/tests/`.
Provider tests are co-located under `scripts/providers/tests/`.
See [ADR 0001 — Test Tree Convention](docs/decisions/0001-test-tree-convention.md)
for the full taxonomy, integration vs unit boundary, and the slow-lane split policy.

**Subdirectory taxonomy:**

| Path                                      | Contains                            |
| ----------------------------------------- | ----------------------------------- |
| `scripts/task-tracker/tests/`             | Unit tests (fast lane)              |
| `scripts/task-tracker/tests/slow/`        | Integration / slow tests (≥2s each) |
| `scripts/task-tracker/tests/integration/` | Cross-stage E2E tests               |
| `scripts/providers/tests/`                | Provider package tests (co-located) |

**Story-ID tagging:** Every test file begins with `// @story #NNN` on line 1 identifying the issue that owns it. Run `npm run lint:story-tags` to verify all files carry the tag.

**Per-file line cap:** Each test file must stay under 400 lines. Run `npm run lint:line-cap` to check. Split into separate files when you hit the limit.

**Audit commands:**

```
npm run lint:story-tags   # every *.test.mjs has // @story #NNN
npm run lint:line-cap     # no file exceeds 400 lines
npm test                  # fast lane (unit tests + providers)
npm run test:all          # all lanes including slow
```

**Worked example:** To add a test for issue #500 covering a change in `scripts/task-tracker/lib/foo.mjs`, create `scripts/task-tracker/tests/foo.test.mjs`. Start the file with `// @story #500`, write your tests using Node's built-in `node:test` runner, and confirm the file is under 400 lines. Run `npm test` to verify it passes in the fast lane.
