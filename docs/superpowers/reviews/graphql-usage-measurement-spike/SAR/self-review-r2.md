---
review_type: SAR
reviewer: GPT-6 Astra author subagent
filepath: docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md
commit_sha: 8d835c4a86b212270fcc64e5be5cf21cac4dbc26
reviewed_file_sha256: 84736741752d62b94bec1338201b6b26be5610d2b0651655d5f37cc7f7da1099
turn_ordinal: SAR r2
finding_count: 2
verdict: revise
---

# GraphQL measurement spike SAR round 2

Fresh full pass of the committed round-1 specification, including interactions
between its new opaque-invocation and coverage contracts. This remains author
self-review; no independent acceptance is claimed.

## Findings and dispositions

1. **SAR-06, P1 — Partial invocation costs could appear complete.** Round 1
   distinguishes CLI invocations from HTTP attempts, but a non-null cost from
   the final visible response could still imply the entire CLI invocation was
   measured. Null-cost counts alone do not expose hidden retry/page costs.
   **Accepted:** add explicit cost coverage, unknown hidden-request counts,
   response-only attribution, conservative aggregation, and opaque kind/status
   semantics. This follows the same subprocess evidence at
   `scripts/gh/lib/github-projects.mjs:13-59` recorded in round 1; a stdout
   payload has no transport-level proof of every internal request.
2. **SAR-07, P2 — Failure diagnostics and acceptance still overpromise.** The
   no-lost-record concurrency criterion remains unqualified, and a crashed or
   disk-full writer cannot reliably persist its own final coverage warning.
   **Accepted:** limit no-loss acceptance to healthy normal exits; distinguish
   active/unclean writers using start/close metadata without asserting an exact
   crash or missing count; provide redacted stderr fallback and mark unreadable
   coverage metadata unknown. This resolves the interaction between fail-open
   collection, preserving business stdout, and the required coverage report.

## Other areas rechecked

Mutation requests stay unchanged; query augmentation remains conditional on
compatibility; inline literals are excluded from fingerprints; dispatch context
cannot fabricate per-issue costs for bulk queries; Git discovery is anchored to
the consuming worktree; storage is in the common directory; duplicate records
and malformed input do not inflate totals; baseline collection remains a
standalone deliverable ahead of epic prioritization. No new defects were found
in these areas during this pass.

## Verification

The previous revision committed as `8d835c4a` after targeted Markdown lint
and `git diff --check` returned exit 0. Prettier explicitly included normally
ignored SAR records via `--ignore-path /dev/null`. No code or epic edits occurred.
This round receives the same document checks before commit, followed by another
fresh full-spec pass.
