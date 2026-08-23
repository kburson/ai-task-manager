# #1389 GitHub Comment Timestamp Normalization

## Goal

Allow live GitHub issue comments to enter the strict delivery-record model by converting valid provider timestamps to canonical millisecond ISO form at the adapter boundary.

## Design

Keep `parseDeliveryComment` unchanged. Add a small strict normalizer beside the GitHub default delivery dependencies in `deliver.mjs`. It accepts only a non-empty provider timestamp that parses to a valid instant and round-trips to the same second-level time, returning `Date#toISOString()` canonical bytes. `listIssueComments` uses it when mapping REST `created_at` to internal `createdAt`.

## Test-first sequence

1. Extend `deliver-default-deps.test.mjs` with a live-style ordinary comment whose `created_at` is `YYYY-MM-DDTHH:mm:ssZ`; require the internal dependency to return `.000Z`.
2. Add malformed and impossible provider timestamp cases that must reject before delivery projection.
3. Implement the boundary normalizer and wire only `listIssueComments`.
4. Re-run strict `delivery-records.test.mjs` to prove its noncanonical rejection remains intact.
5. Run focused tests, lint, format, full fast and slow suites, then independent review.
6. Push the new reviewed head to PR #1385 and prove live `/task deliver` advances past timestamp parsing.

## Boundaries

- Do not relax `isCanonicalInstant` or `parseDeliveryComment`.
- Do not discard ordinary comments or defer timestamp validation until after marker parsing.
- Do not synthesize times for missing or invalid provider values.
- Do not change delivery record schemas, intent bytes, or provider action envelopes.

## Verification

- `node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`
- `node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`
- `npm test`
- `npm run test:slow`
- `npm run lint`
- `npm run format:check`
- live governed delivery retry on PR #1385
