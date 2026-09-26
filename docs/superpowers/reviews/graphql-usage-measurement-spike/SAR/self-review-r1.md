---
review_type: SAR
reviewer: GPT-6 Astra author subagent
filepath: docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md
commit_sha: 05f460dfeaa6275f341bbe02e201e4829f12ba8e
reviewed_file_sha256: 0011855e68ab650488bba62e50e676be9422530589264058f58dc738587b7702
turn_ordinal: SAR r1
finding_count: 5
verdict: revise
---

# GraphQL measurement spike SAR round 1

User-authorized iterative author self-review. The parent dispatched this native
subagent with model `gpt-6-astra`. This is not independent review or XPR protocol
acceptance. Only the spike specification and this SAR evidence are in scope.

## Findings and dispositions

1. **SAR-01, P1 — Mutation cost feasibility.** The requirement to prove the
   query-root `rateLimit { cost }` works for mutations invites invalid requests
   and gives no concrete success contract for unavailable mutation costs.
   **Accepted:** leave mutations unchanged with explicit unknown cost; supported
   queries alone receive safe augmentation. Tests must demonstrate this split.
2. **SAR-02, P1 — CLI invocation is not an HTTP attempt.** Existing wrappers
   observe subprocess results; claiming every hidden retry/page is one exact
   request would manufacture coverage. A nested wrapper can also double count.
   **Accepted:** explicit observation kinds, dispatch certainty, lowest-boundary
   ownership, visible retry/page attribution, and separate opaque counts.
3. **SAR-03, P1 — Telemetry compatibility and redaction gaps.** Query rewriting
   lacks alias/fragment/operation safeguards. Inline query literals can contain
   issue text; hashing the whole query preserves a dictionary-attack surface.
   Raw errors/debug logs can disclose bodies. **Accepted:** compatibility tests,
   structural fingerprints with literals removed, allowlisted error metadata,
   bounded local diagnostics, and original result/error preservation.
4. **SAR-04, P2 — Shared storage and coverage guarantees.** The spec does not
   anchor Git discovery to the consuming repository, serialize concurrent writes
   inside one process, distinguish process incarnations, or account for disabled
   collectors and failed writes. Its exactly-one language overpromises crash
   durability. **Accepted:** explicit project context, random writer IDs,
   serialized writes, normal-exit flushing, crash limits, coverage diagnostics,
   storage visibility, permissions, and controlled cleanup.
5. **SAR-05, P2 — Report and baseline ambiguity.** Hour/window attribution,
   incomplete point rankings, duplicate/corrupt input, mixed budget identities,
   and baseline completion/comparability lack operational definitions.
   **Accepted:** explicit intervals and samples, conservative lower-bound
   rankings, input validation, budget partitions, workload/collector provenance,
   and baseline evidence as an actual deliverable.

## Repository evidence

Inspected at the input commit:

- `scripts/gh/lib/github-projects.mjs:13-59`: `gh` uses execFile/spawn, returns
  stdout, and preserves nonzero errors with stdout/stderr; `gql` parses JSON and
  throws GraphQL errors. Merely observing this adapter cannot prove internal HTTP
  attempt count. Lines 90-103 show a real ProjectV2 mutation.
- `scripts/task-tracker/gh-timing-comment.mjs:693-718`: timing reads use opaque
  `gh issue view`; updates issue a direct `gh api graphql` mutation outside the
  shared wrapper. These paths require distinct inventory dispositions.
- `scripts/reports/generate-value-report.mjs:145-164`: report authentication is
  resolved lazily and GraphQL uses direct fetch. Instrumenting only the shared
  wrapper misses this production surface.
- `package.json` publishes `bin`, `scripts`, `hooks`, `statusline`, and other
  runtime assets; inventory must cover shipped surfaces, not just one wrapper.
- `docs/superpowers/reviews/1787/plan/SAR/self-review-r4.md` establishes a local
  precedent for committed artifact hashes, finding closure, and explicit SAR
  versus independent-review limitations.

## External evidence

Read on 2026-09-25:

- [GitHub rate and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api):
  same-response query cost is available; header context is cumulative; primary
  and secondary limits differ; GraphQL errors need not imply non-200 HTTP status.
- [GitHub schema mirror](https://github.com/octokit/graphql-schema/blob/master/schema.graphql):
  fetched the public schema and inspected the complete `Query` and `Mutation`
  type bodies with a script. Output: `Query rateLimit: True`,
  `Mutation rateLimit: False`. This verifies mutation augmentation is unsupported
  by that schema. Recheck target-host compatibility during implementation.

No authenticated GitHub requests or live mutations were made for this SAR.
The documentation's old queries/mutations URLs now redirect to the reference
index; the schema inspection supplies the actual type evidence.

## Verification and next pass

`node scripts/dev-env/verify-local-worktree.mjs` passed: Node 26.8.1 and the
`node_modules/ai-task-manager -> ..` self-link were verified. Changes are
specification-only. Format and Markdown checks run before this revision is
committed. A fresh full pass will test the corrected contracts for interaction.
