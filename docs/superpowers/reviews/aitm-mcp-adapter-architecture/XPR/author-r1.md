---
record_type: 'publication-copy'
model: 'gpt-6-astra'
effort: 'high'
filepath: 'docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md'
commit_sha: '98bdbb4ea6dd00468886a38c4150d9d8049a44c3'
uncommitted_changes: false
reviewed_file_sha256: '58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125'
turn_ordinal: 'XPR r1'
turn_description: 'Cross Provider Review revision 1'
role: 'author'
identity_source: 'runtime'
source_file: '2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-author-response-1.md'
source_sha256: 'c9a91c2d1bdc0d340e56f1601ebcea85bf58e231656606024f360fb2ace08a74'
submitted_at: '2026-09-20T21:04:15.738Z'
result_commit_sha: 'db28996eeeaa3e290d2b2c18457becaf4f462607'
---

# XPR r1: Author response

Publication copy of the [sealed protocol response](2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-author-response-1.md).
The source hash identifies the original. This copy adds the requested frontmatter
and does not replace protocol authority. The original response prose follows unchanged.

Mode: `normal`

## Summary

Author model: `gpt-6-astra`; effort: `high`; ordinal: `XPR r1`;
description: Cross Provider Review revision 1. The protected metadata records
the reviewed input. The protocol submission will identify the committed result.
Reviewer launch selected `claude-opus-5` at `medium` effort.

I accepted actionable changes for all nine findings, while qualifying several
premises and declining recommendations that would weaken safety or require the
kernel to infer unknowable intent. The most consequential change is an explicit
Phase 0 feasibility gate before default-provider rollout. This architecture does
not claim that an execution topology, immutable loader, or operating budget has
already been proven. I added scoped recovery during staleness, compatibility
classification, quota semantics, advisory-only memory drift, principal and port
resolution, a staging-loader reference approach, and learning/traceability tests.

Scope remains architecture only. No provider calls were made for certification
and no runtime behavior was implemented. Findings and original reviewer text
remain immutable, including premises qualified below.

## Finding dispositions

### R1-F001 — Accepted as an early feasibility gate; no weaker execution tier

The architecture inherited invariants rather than a demonstrated GitHub
execution proof. The new Phase 0 makes that gap explicit before Phase 1 is
approved. It describes the reference candidate: one provisioned dispatcher per
conflicting scope, real exclusion of other governed write channels, supervisor
proof of non-overlapping lifetimes, and settlement of in-flight provider effects.
It requires a bounded prototype and hostile pause/takeover/cross-clone tests.
The candidate is not asserted to pass today, and a recorded epoch or local lock
cannot substitute for the proof.

If no allowed topology passes, new mutations stay unavailable and architecture
revision precedes rollout; existing installations are not migrated or retroactively
certified. Fresh installations expose diagnostics and explicit provisioning
requirements. This answers the requested failure policy without fabricating a
GitHub primitive or claiming zero-configuration write readiness. I declined a
reduced safety tier allowing unfenced effects.

Independent source check: GitHub's [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
states that conditional unsafe-method requests are unsupported unless an
endpoint documents an exception. That supports not assuming comment-level
conditional writes. I did not certify every GitHub endpoint or adopt the
Reviewer's blanket claim about the only possible compare-and-swap surface.

### R1-F002 — Accepted recovery-path clarification; deadlock inevitability qualified

The original setup rule already allowed verification of a continuing recovery
path instead of prior settlement, so permanent deadlock was not its only possible
interpretation. The unconditional mutating-tools disablement still left an
important gap. Diagnostic mode now has a narrow evidence-only recovery route
using trusted, verified, compatible code, authenticated authority, and exclusive
recovery ownership. It enumerates reconciliation, retry authorization,
intervention, and observed-outcome completion, including uncertain appends.
It permits no new business effects. A retry-authorized record cannot execute
until normal admission becomes valid again.

Setup may stage and validate a compatible recovery runtime without activating
new destinations or generations; the last verified runtime is another option.
If neither works, intervention is explicit. Stale metadata alone no longer
prevents this repair. Unknown schemas or untrusted executables do not gain an
exception, and cloud consumers still cannot rewrite tracked setup files.

### R1-F003 — Accepted certified compatibility classification

A core version difference alone is advisory within an explicit certified setup
compatibility declaration when all semantic schema, ABI, policy, capability,
and executable checks pass. Producer-version provenance is separate from the
learning fingerprint's compatibility identity. Semver ranges alone are not
sufficient proof. Workspace or other adapter executable changes still require
verified selection, preserving the SPR content-identity correction. A compatible
core update cannot excuse a changed adapter closure. Tests cover both harmless
producer-version change and genuine incompatible drift.

### R1-F004 — Accepted operational budgets and throttle classification; ambiguous retry remains blocked

The new quota section requires measured per-action call/write/byte/replay profiles
and explicit numeric budgets in provider certification, with the GitHub profile
established during Phase 0. Shared-principal backpressure, coarse domain actions,
batched reads, coalesced derived projections, retained-volume thresholds, and
safe archive rotation are specified. Request and outcome verification remain
mandatory.

The Reviewer conflates a received throttle rejection with a lost response and
calls a throttle-after-commit sequence ordinary documented behavior without
supporting evidence. GitHub's [rate-limit guidance](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
requires respecting retry delays and bounded backoff; it does not prove that
all lost append responses can be retried safely. The design now distinguishes
unsent requests, certified no-effect rejections, temporary read unavailability,
and unknown writes. Unknown writes may undergo bounded deferred observation;
blind retries remain prohibited. Stable event markers and envelopes were already
required and are reiterated. Persistently unknowable effects still require
intervention; performance goals cannot waive that safety limit.

### R1-F005 — Accepted advisory-only learning drift with enforcement separation

An advisory artifact may be a deployment-health dependency without becoming
state authority, so the original wording was not necessarily a logical
contradiction. Its blast radius was nevertheless unnecessarily broad. Pure
learning drift now warns and leaves business actions available when authoritative
configuration and actual enforcement remain valid. Co-located hooks or policy
are independently classified and still block on drift. The kernel never uses
stale memory to satisfy a gate, and tracked targets remain read-only at boot.

### R1-F006 — Accepted authentication definition; rejected inference of distinct intent from identical requests

The spec now defines issuer/subject-based principal references authenticated by
an identity adapter or a trusted OS/host mapping, including the required mapping
for a future remote transport. It blocks absent or ambiguous identity rather
than falling back to an anonymous namespace. Roles are separate, but the same
verified identity may occupy multiple roles without proving human approval.
Provider-authenticated identity is therefore not categorically forbidden as an
initiator source by the approval-provenance rule.

Sessions using one service identity intentionally share a key namespace.
Independent intent requires collision-resistant caller-retained keys with at
least 122 bits of randomness. Identical principal/key/input must replay the same
action; changed input must conflict. The requested assertion that intentionally
identical keys for distinct actions never conflict is incompatible with the
existing idempotency contract and cannot be guaranteed without an additional
intent identifier. The tests now state achievable outcomes explicitly. The
sample key was replaced by a UUID rather than an easily reused descriptive label.

### R1-F007 — Accepted explicit role and destination rules

This version has one active writable binding for each configured `work-items`,
`repository`, `forge`, and `ci` role. Identity observers are non-mutating and may
be multiple. Clone/worktree targets are targets of one local Git binding, not
extra writable provider bindings. Optional ports may be unconfigured. Omitted
forge/CI targets resolve only through the sole active binding and an unambiguous
configured mapping; conflicting or missing mappings block. Explicit targets
must belong to that binding. Multi-forge concurrent writes are outside this
version, and provider changes use existing generation and recovery rules.
Implicit selection does not logically require multiple candidates; it is safe
when the sole configured choice is explicit in durable execution context.

### R1-F008 — Accepted reference loader and feasibility requirement

The reference implementation materializes and verifies a private content-addressed
closure, atomically publishes it, loads only from that snapshot, constrains
imports/assets to it, and retains it while active. Mutating the source checkout
cannot change those loaded bytes. Phase 0 must prove a supported host/loader
combination; Phase 4 cannot merely promise a portable primitive that does not
exist.

Staging-directory ownership is only a valid guarantee if the host actually
excludes other writers under its stated threat model. A content-addressed name,
chmod, or advisory lock alone is insufficient when another writer retains access.
Strict hosts need real access isolation; other hosts must certify their narrower
trusted-writer assumptions. Unsupported lazy/native/dynamic loading blocks the
runtime until an alternative passes. This qualifies the Reviewer's suggested
staging approach rather than treating a new directory as an automatic fence.

### R1-F009 — Accepted learning verification and complete criterion mapping

Added learning-plane tests for marker preservation, malformed/duplicate/nested
markers, tracked/untracked behavior, secret/live-state exclusion, advisory drift,
and co-located enforcement. Ambiguous marker ownership fails without writes.
Added a learning release gate and a table mapping all 21 acceptance criteria to
verification obligations. Phase specifications must replace category-level
obligations with named tests and results before approval; the table does not
claim existing implementations pass.

## Changes made

The spec now contains an explicit Phase 0, new initiating-principal and quota
sections, a concrete snapshot-loading approach, complete binding rules, a
stale-state evidence repair contract, narrower staleness classifications,
learning-plane tests, and acceptance-to-verification traceability. Related
release gates, phase exit conditions, consequences, and acceptance criteria
were updated together.

All five optional suggestions were addressed: the SDK versions are labeled
illustrative with a required package/ABI compatibility matrix; Phase 1 must split
into independently approved increments; orchestrator-only classification now
requires core review and a named portable parent; clock-skew tests and
predecessor/epoch ordering are explicit; and write amplification and fail-closed
operational costs appear in the consequences. These are scoped architecture
requirements, not extra findings or implemented features.

## Declined changes and rationale

No actionable finding was discarded. I declined weaker execution safety, blind
retry after uncertain writes, semver-only trust, and a promise to distinguish
identical authenticated requests by unstated intent. I qualified the claimed
inevitable staleness deadlock, the interpretation of non-authoritative memory,
and the sufficiency of staging-directory ownership. Detailed reasons and the
chosen corrections are retained in the dispositions.

## Verification

Spec formatting and spelling pass. Author response spelling passes via stdin,
which avoids the repository exclusion for protected protocol responses. Markdown
lint reports zero issues across 565 files; indexed documentation anchors pass
(38 anchors across three documents). The package parser accepts this response,
and all nine finding IDs have exactly one disposition. Six JSON examples parse;
the traceability table covers all 21 acceptance criteria. Git whitespace checks
pass. Human review of the changes checked consistency with the retained fencing,
unknown-effect, executable-identity, and sole-authority guarantees.

These checks validate documentation only. The feasibility, quota, recovery,
loader, identity, and learning tests added to the spec are future obligations,
not runtime results claimed by this revision.
