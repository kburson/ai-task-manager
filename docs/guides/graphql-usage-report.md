# Offline GraphQL usage reports

The report reads one explicitly supplied Git-common usage root. It never contacts
GitHub, starts collection, scans another clone, or enables payload capture.

```sh
node scripts/task-tracker/graphql-usage-report.mjs \
  --root /absolute/git-common/aitm/graphql-usage \
  --start 2026-09-28T00:00:00.000Z --end 2026-09-29T00:00:00.000Z \
  --time-zone America/Chicago --format markdown
```

Use `--format json` for the full machine-readable report. Redirect stdout to a
local export when needed. The usage root must be the existing canonical
`<Git-common>/aitm/graphql-usage` directory. Root identity comes from its real
Git-common parent; foreign-root observations are excluded and disclosed.
Without explicit bounds, the interval covers UTC days containing supplied
observations, diagnostics and controls. Bounds are UTC half-open intervals based
on observation starts. Local labels retain offsets, including repeated DST hours.

## Reading the report

Dispatched HTTP attempts, uncertain dispatch, not-sent observations and opaque CLI
invocations are separate counters. Opaque invocation counts cannot be interpreted
as HTTP request counts. Retries repeat a logical operation and page within the
same worktree/session; distinct pages are separate attempts. Failures count
failure outcomes independently of dispatch.

Every aggregate shows its **known-point subtotal**, unknown-cost observation count
and incomplete-cost observation count. Visible-response-only costs are known
samples with incomplete coverage. The mean, median and nearest-rank P95 use known
cost samples; HTTP latency and whole CLI duration have separate distributions and
sample counts. An unavailable statistic has no sample, rather than a zero value.

Hourly and daily Markdown Mermaid charts show dispatched HTTP volume, opaque
volume and known-point lower bounds separately. Bucket tables preserve exact UTC
starts and local offsets. Only nonempty buckets appear; missing buckets cannot
prove that collection was enabled. Charts show at most 168 buckets each, disclose
that limit, and retain all buckets in the table and JSON. Rolling 60-minute peaks
use `(t - 60 minutes, t]` at actual starts, including all simultaneous starts.

Budget context preserves returned `x-ratelimit-*` values by endpoint host and
known scope. These describe a shared account budget, not AITM consumption. Unknown
scope stays separate; shim-only headers are transport-unavailable, never zero.

Coverage exposes denied/unknown participants, out-of-root participants, foreign
observations, unknown attribution, mixed collector versions, malformed/unsupported
records, identical/conflicting duplicates, partial tails, storage diagnostics,
pause/cleanup gaps and active or unclean writers. Conflicting calls contribute no
value. Active/unclean writers imply uncertainty, not a measured lost-call count.
Usage-file opens, read elapsed time and hashed per-file readable extents describe
read overhead; each held descriptor is bounded by its snapshotted size.

## Predeclared scoped comparisons

With no comparison declaration, the report is preliminary and certifies no
ranking. Supply `--declaration declaration.json` to assess explicitly declared
candidate groups. Preserve the declaration before collection. The report checks
the declared interval, root, unique participants, candidate operations, sites and
comparable signal. Its hash is included for provenance; an operator-supplied
`declaredAt` timestamp is an assertion, not independently authenticated evidence.

A declaration has this shape (synthetic identifiers and source location):

```json
{
  "schema": "aitm.graphql-usage.comparison/v1",
  "declaredAt": "2026-09-27T23:00:00.000Z",
  "startedAt": "2026-09-28T00:00:00.000Z",
  "endedAt": "2026-09-29T00:00:00.000Z",
  "commonRootId": "sha256:CANONICAL_ROOT_HASH",
  "participants": [{ "worktreeId": "tree-a", "sessionId": "sha256:SESSION_HASH" }],
  "groups": [
    {
      "id": "queries",
      "operations": ["GetIssue"],
      "observationKind": "http-attempt",
      "signal": "point-cost",
      "sites": ["scripts/gh/lib/example.mjs:12"]
    }
  ],
  "inventory": [
    {
      "schemaVersion": "aitm.graphql-usage.inventory/v1",
      "source": "scripts/gh/lib/example.mjs",
      "line": 12,
      "classification": "direct-http",
      "reason": "direct GraphQL HTTP endpoint",
      "coverage": "covered"
    }
  ]
}
```

Use actual root/session identities and the independently reviewed relevant
inventory. For denied or unreachable sessions which cannot write centrally,
provide `--participants participant-manifests.json`: an array of the existing
`aitm.graphql-usage.manifest/v1` records, including enrollment outcomes. Central
and supplied manifests are both considered. Missing manifests, enrollment after
collection starts and conflicting outcomes remain insufficient.

Every declared operation needs observations and every declared relevant site
needs adequate coverage. Total-point ranking requires all candidate observations
to be sent HTTP queries with known complete-observation costs and zero hidden
attempts. Relevant enrollment, attribution, unknown versions, malformed records,
conflicts, partial tails, storage gaps or unclosed writers prevent certification.
Known costs for recorded rows alone cannot certify completeness. Mutations and
opaque costs cannot pass the current total-point policy.

Declare `http-attempt-volume` with `http-attempt`, or `opaque-invocation-volume`
with `opaque-cli-invocation`, before collection to permit comparable volume
ranking when point coverage is insufficient. A `point-cost` group does not
silently switch to an undeclared volume signal. Empty or inadequately covered
samples stay preliminary. Rankings and denominators apply only to the named
candidate group and participant sample. Excluded participants remain disclosed;
no scoped result proves fleet completeness or whole-epic point savings.

This report does not qualify the real baseline. The long baseline story must
separately prove a real creation-to-planning workflow, intended fleet enrollment,
a genuine declared 60-minute overlap and comparable activity from two worktrees.
Synthetic fixtures establish reporting behavior only.
