<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-1ea55e3127774ff3817f44752efcbc79"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "6891473eb0dca09b0c88d0745f2039c35c82249a"
artifact_blob: "d8f71469bdc37e23aa9f1546946f95698f367ec9"
artifact_digest: "sha256:5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-5.6-sol"
  model_display: "GPT-5.6 Sol"
  session_fingerprint: "sha256:63dde00893c2bcc6a55bed7f6d9424a621a97ecca480a80bedd6a9bdaed7b826"
  identity_source: "runtime"
started_at: "2026-09-20T20:28:22.128Z"
submitted_at: "2026-09-20T20:31:53.451Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Review provenance requested by the coordinator:

- model: `gpt-5.6-sol` (`GPT-5.6 Sol`)
- effort: `medium`
- filepath: `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`
- commit_sha: `6891473eb0dca09b0c88d0745f2039c35c82249a`
- reviewed_file_sha256: `5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b`
- turn_ordinal: `SPR r1`
- turn_description: `Same Provider Review revision 1`

The specification is strong on transport parity, request identity, response-loss
recovery, authority fencing, approval provenance, migration cutover, and local
Git target binding. The repository evidence supports its description of the
current baseline: ADR 0002 makes GitHub records the durable authority, requires
append-first read-back and epoch-fenced coordination, and explicitly recognizes
manual deletion and retention as failure modes; the current capsule reader also
fails closed on missing predecessors and forks.

Four load-bearing boundaries remain underspecified. In-process plugins can use
all AITM process capabilities despite the stated prohibition on governance
bypass; tracked workspace plugin executable bytes are not bound by the proposed
installation fingerprints; finite provider retention can erase the only
durable request and recovery history; and the universal `evidence` ABI method
does not identify the sole adapter allowed to write canonical evidence in a
mixed-provider deployment. These are correctness and assurance issues rather
than editorial preferences.

Scope and limitations: I reviewed the pinned architecture artifact and the
relevant repository baseline, including `package.json`, ADR 0002, and the
single-predecessor capsule-chain implementation. I did not execute provider
operations, validate live GitHub/Jira/GitLab/Bitbucket behavior, or evaluate a
phase implementation, because this review concerns the proposed architecture
and no such implementation is part of the reviewed artifact.

## Findings

### R1-F001 — High — In-process plugins can bypass the governance boundary the architecture claims to enforce

**Affected sections:** Goals 3 and 9; Adapter ABI and plugin model; Open plugin
discovery; Host enforcement and Full-Auto; Acceptance criterion 12.

**Evidence:** Goal 3 requires provider extensions without allowing them to
bypass AITM governance. The plugin model then states that selected Node plugin
code executes with the permissions of the AITM process. Strict assurance places
provider credentials, network access, filesystem access, and governed local Git
write capability inside that same process boundary. Manifest declarations,
schema validation, and a conformance runner constrain calls routed through the
ABI, but they cannot stop imported JavaScript from issuing a provider request,
editing Git metadata, or reading another adapter's credentials directly. The
repository currently ships as an ESM Node package with no plugin isolation
boundary in `package.json`; this is a new boundary the design must define rather
than an existing property it can inherit.

**Consequence:** A buggy or malicious selected adapter can perform an undeclared
mutation outside `execute`, omit the request/outcome journal, or cross a port
boundary while the host still reports `strict`. That contradicts the stated
governance goal and makes strict Full-Auto receipts overstate what was enforced.
Calling plugin selection a code-trust decision explains the risk but does not
resolve the contradiction between full in-process authority and prevention of
governance bypass.

**Correction requested:** Define the plugin trust boundary explicitly and make
the assurance model consistent with it. Either isolate external adapters behind
a capability-limited process/RPC boundary with per-port credentials, network
and filesystem restrictions, and authenticated effect calls, or state that
selected plugin code is part of the fully trusted computing base and cannot be
prevented from bypassing governance. In the latter case, narrow Goal 3 and the
`strict` claim, record the exact trusted adapter code identity in assurance
receipts, and make any adapter lacking the required trust/isolation grade
ineligible for strict Full-Auto. Add an adversarial certification case in which
an adapter attempts a mutation outside its declared port and method.

### R1-F002 — High — Workspace plugin executable code is not included in the proposed staleness identity

**Affected sections:** Open plugin discovery; Tracked portable output; Cloud and
clone contract; Installation staleness; Portable-install test; Acceptance
criteria 7 and 8.

**Evidence:** The design correctly says a package-lock entry alone is not proof
of reproducibility and allows tracked workspace or relative-filesystem adapters.
It then defines the content-addressed install manifest in terms of adapter
package name/version/integrity, manifest hash, and generated-file hashes.
Registry tarballs can have lockfile integrity, but a workspace/link dependency
normally has no tarball integrity covering its tracked entry module and runtime
assets. A maintainer can therefore change `dist/adapter.mjs` or an imported
workspace file without changing the package version or static adapter manifest.
The startup comparison described in the specification would still see the same
version and manifest while executing different code. The portable-install test
only proves that the files exist in a clone; it does not prove that the runtime
matches the code reviewed and selected during setup.

**Consequence:** Capability locks, learning fingerprints, host mutation guards,
and strict-assurance receipts can all describe one adapter while AITM executes
different bytes. This is both a stale-installation blind spot and a recovery
hazard because a pending action records only adapter identity/version and
recovery-contract version, not the executable implementation that supplied
those semantics.

**Correction requested:** Define and persist an executable adapter identity that
covers the resolved entry module and its complete runtime closure/assets. For a
published package this may be the verified package integrity plus validated
entry/asset paths; for a tracked workspace package it needs a deterministic
content digest over the declared runtime closure or an equivalent reviewed build
artifact. Validate that identity at startup, mutation admission, dispatch, and
recovery, and enter diagnostic/intervention mode on mismatch. Extend the
portable-install and recovery-compatibility tests with a workspace adapter whose
entry bytes change without a version or manifest change.

### R1-F003 — High — Reported retention limits do not protect the only durable authority from losing required history

**Affected sections:** Adapter ownership; Durable authority, journals, and
receipts; Append-only integrity; Request identity and retry; Adapter conformance
kit; Acceptance criteria 9, 10, and 17.

**Evidence:** The selected work-items authority is the sole durable store for
request-key reservations, action inputs, outcomes, approvals, tombstones, and
recovery records. The design requires an adapter only to report visibility and
retention characteristics; it does not state a minimum retention capability or
what blocks when the provider expires an old record. Yet request-key safety says
missing or unreadable history must not be treated as an unused key, and recovery
must work after local state is deleted. ADR 0002 already lists manual deletion
and provider retention as hazards, while the current capsule reader throws
`capsule-chain:missing-predecessor` when any linked record is absent. Hashes can
detect missing history but cannot reconstruct a deleted request payload,
approval, tombstone, or recovery contract.

**Consequence:** A provider with finite comment/property retention can eventually
make replay impossible and every old request key unknowable. Continuing to admit
mutations after that point risks duplicate effects or forged freshness; failing
closed without a defined archival/rebind path can permanently disable a project.
Either outcome violates the durable-authority and cross-process retry acceptance
criteria.

**Correction requested:** Define the minimum evidence-retention and retrieval
capabilities required for a writable work-items binding, including how deletes,
expired records, and retention-policy changes are detected before admission.
Specify whether inadequate retention blocks activation/mutation or is satisfied
by a provider-native immutable archive that remains within the one-authority
model. Define a reviewed authority migration/rebind path that preserves complete
replay and request-key tombstones. Add conformance cases for expiry/deletion of
an intermediate request, approval, outcome, and tombstone; detection alone is
not a passing result unless the specified recovery path retains the canonical
payload.

### R1-F004 — Medium — The adapter ABI leaves canonical evidence writable through every bound provider

**Affected sections:** Capability-specific ports; Adapter ABI and plugin model;
Durable authority, journals, and receipts; Governed action and recovery flow;
Acceptance criteria 2 and 9.

**Evidence:** The architecture says exactly one `work-items` adapter is the
writable backlog authority and that forge, CI, repository, and identity records
are represented there as typed references. The generic adapter contract,
however, gives every adapter an `evidence` method to append and retrieve
canonical envelopes, and the durable-authority section says "Each adapter stores
the exact envelope." In a Jira plus Bitbucket deployment, both adapter objects
therefore appear ABI-capable of persisting canonical evidence, while the action
flow does not name which binding writes `action.requested`, per-effect progress,
and the final outcome for a cross-port action.

**Consequence:** Independent implementers can reasonably split evidence between
Jira and Bitbucket, let a forge adapter treat its own log as authoritative, or
duplicate envelopes in both systems. Any of those interpretations breaks the
single writable authority, produces ambiguous replay, and weakens request-key
deduplication and recovery.

**Correction requested:** Make evidence persistence a capability of the active
`work-items` authority binding only, or define a separate exclusive
`authority/evidence` port with exactly one writable binding. Other adapters
should return typed observations/effect receipts to the kernel, which then
persists canonical request, progress, outcome, and recovery envelopes through
that exclusive binding. Clarify the wording currently saying "Each adapter"
and add a mixed Jira-plus-Bitbucket composition test proving that only Jira
receives authoritative envelopes while Bitbucket supplies referenced
observations.

## Required changes

1. Resolve R1-F001 by making plugin isolation/trust and Full-Auto assurance
   claims mutually consistent.
2. Resolve R1-F002 by binding selected and recovery adapter identities to the
   executable runtime content, including tracked workspace plugins.
3. Resolve R1-F003 by defining a minimum durable-retention contract and a safe
   response to record expiry, deletion, or retention-policy drift.
4. Resolve R1-F004 by assigning all canonical evidence writes to one exclusive
   authority binding in mixed-provider deployments.

## Optional suggestions

None.

## Decision

revisions-requested
