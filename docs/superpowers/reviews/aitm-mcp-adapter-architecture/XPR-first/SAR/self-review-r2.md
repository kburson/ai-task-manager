---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 8e5fb7cf5886f8577f4de53d254ae26bd32fa2c5
reviewed_file_sha256: 72b8730f8e4b41db6c3f7e888403428f363ef66555278a8b4176b9ec4dde0613
turn_ordinal: SAR r2
turn_description: Single Agent Review revision 2
role: author/self-review
input_worktree_status: clean
reviewed_input_matches_commit: true
review_recorded_at: '2026-09-20T22:45:39Z'
substantive_findings: 1
spec_changed: true
---

# SAR r2: full pass and correction record

## Input and coverage

Reviewed the entire committed artifact from beginning to end, including all
acceptance criteria, against the same scoped repository evidence and ADR
constraints established in r1. The input was clean and matched the committed
hash above. This is the same Author's subsequent pass, with retained XPR, SPR,
and SAR r1 context, not an independent review.

Traced the kernel/adapter ownership, exclusive action routes, plugin ABI and
source portability, bounded discovery and memory, setup/activation, durable
identity admission and lost-response boundaries, authority/fencing, host
assurance, migration, and verification gates. The r1 corrections to promoted
routes, diagnostic-only readback, project-scoped invocation admission, and plugin
portability are consistent with those contracts. One interaction in the newly
added repository binding requires correction below.

## SAR-R2-F1: repository retry can change an unbound execution context

**Finding.** R1 introduced an explicit repository execution context resolved
before dispatch, but the invocation-binding field list does not include its
clone/worktree identity, target ref, or original expected repository state.
Unlike a transport connection, these determine where a local Git effect occurs.
A pending action retried through another server directory could therefore
resolve a different target while presenting the same canonical payload/key.
The common invocation contract forbids different bound input but does not make
this newly introduced context part of that input. Saying that local Git follows
the common recovery contract leaves this critical boundary implicit.

The new blanket changed-context refusal also needs to distinguish dispatch from
read-only receipt retrieval: a successful commit naturally changes HEAD. A lost
response must remain recoverable without requiring the original HEAD to remain
current. These are two aspects of the same immutable execution-target/replay
contract, counted as one finding, not two.

**Provenance.** This is an interaction introduced by SAR r1's repository-port
correction, not a claimed surviving defect in the SPR-accepted baseline. No
other experiment's correction or report was consulted.

**Disposition.** Bind resolved repository identities, target ref, and original
expected state into the canonical request before effects. Verify runtime paths
against those identities. Retry cannot substitute the current directory or
silently replace expected state. Historical receipt lookup does not require the
pre-effect HEAD to remain current. Recovery observes the original target and
requires fresh validation for further effects; a changed target or precondition
needs a new authorized invocation or explicit linked recovery action. Extend
repository conformance with changed-directory/worktree/ref and successful-HEAD-
change/lost-response cases.

## Other assessments and limits

No other substantive defect was found in this full pass. Exact implementation
schemas, canonical serialization algorithm, provider retention constraints, and
mechanism-specific host attestation remain phase-specification details bounded
by the umbrella's existing gates. Cosmetic wrapping is not a finding. The
review does not verify the proposed runtime mechanisms through execution.

No disagreements or optional design requests are added. No new isolation breach
was observed; scoped reads remained on the target and this side's SAR evidence.
This is a same-author assessment and does not confer human approval.

## Validation

The correction changes only the specification and this round's evidence. The
next pass must use a committed result. Actual result SHA is recorded in the
subsequent experiment-log mapping. Validation results follow before commit.

Exact-file Prettier, Markdown lint, CSpell, embedded JSON parsing (seven objects),
local links, doc-anchor lint (38 anchors in three unchanged guides), and diff
whitespace checks passed. Prior XPR/SPR evidence is unchanged against the
SAR-start HEAD. No tool or validation failure occurred in r2. No runtime test
was implemented or run. The resulting artifact SHA256 is
`99c5ca567e533e6b1b7913dc98b2723b1f561ab5a0903cfa5d6fe227b449fddf`.
The original input was clean; only the recorded correction/evidence is dirty
before its commit. Result commit mapping follows in the next evidence update.
