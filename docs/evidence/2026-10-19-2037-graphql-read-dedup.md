# Issue #2037: command-local GraphQL read reduction

The fix reuses coherent observations within one invocation. It retains fresh
authority after writes, on retry, and during later publication verification.
It introduces no persistent cache.

## Measured point cost

The [raw measurement](2026-10-19-2037-graphql-read-dedup-measurement.json) compares
the actual baseline and candidate `evaluateSessionReadiness` functions against
the same live issue, `kburson/ai-peer-review#226`, using one authenticated account.
Only the issue-body GraphQL port is live. Other readiness ports are held local
and fixed, and the probe performs no lifecycle effects.

| Readiness action  | Baseline requests / points | Candidate requests / points | Point reduction |
| ----------------- | -------------------------- | --------------------------- | --------------- |
| Bind body phase   | 2 / 2                      | 1 / 1                       | 50%             |
| Resume body phase | 2 / 2                      | 1 / 1                       | 50%             |

The order is baseline bind, candidate bind, candidate resume, baseline resume.
The experiment spent six points across six HTTP requests. Every response returned
`rateLimit.cost = 1`; every request has a matching direct HTTP telemetry record
with complete cost coverage and zero hidden requests. All body and query hashes
match, and the paired readiness outcomes agree.

The response headers contain two reset windows. They are preserved in the raw
artifact. Costs are summed from each response's own cost field; no remaining-quota
delta or shared-budget identity is inferred. The account identity is recorded
separately from the unknown budget identity.

Baseline source commit: `a32e08245d2ae243e7922c4bfb287695edd0c251`.
The candidate was measured before committing; its module hash binds the measured
bytes. The offline verifier rejects a candidate whose current module hash differs.
The raw artifact contains hashes and metadata, without credentials or issue prose.

This is a measured reduction for the isolated readiness body phase. It is not a
measurement of a whole bind/resume command, other lifecycle stages, or fleet cost.

## Deterministic read-count coverage

| Path                                                       | Before | After |
| ---------------------------------------------------------- | ------ | ----- |
| Readiness body reads per invocation                        | 2      | 1     |
| Extra collection after a confirmed decomposition refresh   | 1      | 0     |
| Snapshots for rank discovery and initial legacy inspection | 2      | 1     |
| Child loads for complete legacy WIP observation            | 3      | 1     |

The last row includes the rank-snapshot reduction; these rows are not additive.
The latter three rows count read-port calls and do not claim measured point costs.
Regression checks also cover a fresh next invocation, failed body reads,
malformed authority, unconfirmed refresh, later snapshot reads, missing dependency
enrichment, and the existing advisory WIP warning. Required pagination, readback,
source verification, and locking code remains in place.

## Reproduce and verify

Run the bounded live probe from the candidate checkout with a separate unchanged
baseline checkout and an active attributable AITM session:

```sh
AITM_GRAPHQL_USAGE=1 node scripts/maintenance/measure-graphql-read-dedup.mjs \
  --baseline-root /path/to/baseline/ai-task-manager \
  --repo kburson/ai-peer-review --issue 226 \
  --output .scratch/inspect/graphql-read-comparison.json
```

The probe uses at most twelve GraphQL requests and stops on missing evidence or
an insufficient remaining-quota reserve. It makes no automatic retry. A single
REST identity read is excluded from GraphQL request and point totals.

Verify the checked-in result without network access:

```sh
node scripts/maintenance/measure-graphql-read-dedup.mjs \
  --verify docs/evidence/2026-10-19-2037-graphql-read-dedup-measurement.json
node --test scripts/tests/unit/task-tracker/lib/graphql-read-dedup.test.mjs \
  scripts/tests/unit/task-tracker/lib/graphql-read-measurement.test.mjs
```
