<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-bf339e74f46697b4da5d2d19cb3c822e"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "93a2c790be8c771324ae51eaf35b41bf029dd6ea"
artifact_blob: "a076d41e917efa17d7a23de75d139f1d898cef43"
artifact_digest: "sha256:7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
  identity_source: "runtime"
started_at: "2026-09-20T21:48:14.761Z"
submitted_at: "2026-09-20T22:00:06.168Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the architecture in response to the seven sealed findings and three
optional suggestions in Reviewer round 1. The original reviewed artifact was
`7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783`
at commit `93a2c790be8c771324ae51eaf35b41bf029dd6ea` (the setup commit;
the original artifact bytes came from the recorded experiment baseline).
All changes are design text. No proposed kernel, adapter, host boundary, or
runtime conformance test has been implemented.

## Finding dispositions

### R1-F001 — Accepted

Verified the original MCP tool list and extension-only invocation gap against the
spec and current verb inventory. Added `aitm_invoke_action` for the complete
portable vocabulary, using the exact action schema and the same policy path as
typed tools. `work-item.create` is a concrete example. Typed tools provide static
host intent; the generic tool requires runtime intent and effects, with governed
approval or refusal if the host cannot display the needed detail. Generic tool
permission does not authorize arbitrary payload effects. Core and extension
registries remain separate and both refuse orchestrator-only IDs. Expanded
parity to the inventory of every externally callable portable action and the
extension contract, rather than only common actions.

The fresh checkout has 65 verb files according to `rg --files
scripts/task-tracker/verbs | wc -l`, rather than the report's 66. That count does
not affect the finding; no attempt is made to compress them into seven actions.

### R1-F002 — Accepted; coordinator model retained

Read ADR 0002 in full and checked `github-comment-store.mjs` and the existing
`coordination-authority.mjs` resolver/authorization code. The comment mutation
has only `id` and `body`; the existing resolver blocks forked history and validates
grant, epoch, scope, and identity. The spec now explicitly retains all nine ADR
mitigations, including scoped coordinators and epoch-fenced assignments, in
Phase 1. It does not supersede them with optimistic fork-join.

The added project control scope has one coordinator. Parallel actors submit
independent durable requests; only its executor advances accepted authority.
Read/verify is explicitly detection, not CAS. A non-CAS adapter requires one
serialized executor, a quiescent maintainer-controlled handoff or an externally
enforced serialized boundary, and no automatic failover from a timeout alone.
Local locks cannot establish exclusion across clones. Conflicts pause mutations
and require restored unique coordination and effect reconciliation. These are
required conformance gates, not claims that the present code already implements
the new project control stream.

### R1-F003 — Accepted with narrower attribution categories

Checked the actual ProjectV2 write/read-back path in
`lib/move-state/github-mutation.mjs`; the field is a value and cannot carry an
action marker. Added marker-attributable, exclusively attributable transition,
state-only observable, and unobservable/conflicting classes with outcomes.
An equal value alone never proves authorship, even under an AITM coordinator,
because humans and external clients can still write.

A desired-state-only contract can reconcile without a duplicate write using
`state-satisfied`, unknown attribution, and unknown execution. Actor-sensitive
approvals, integrations, accounting, or lifecycle evidence cannot use that
observation to satisfy an attribution gate. Replaying a value write requires
proof it will not overwrite another actor's decision. The conformance examples
include identical human writes, changes and reversals, and crash-after-write.

I did not adopt the label "value-attributable" without a stronger proof
condition: a known prior value and a later desired value still do not establish
causation. The exclusive-transition class requires provider audit identity or an
enforced exclusive writer boundary.

### R1-F004 — Accepted problem; version proposal adjusted

Verified `package.json`: version 0.1.0, no exports map, and no adapter SDK entry.
The example is now explicitly a future first-stable API: Phase 5 publishes core
1.0.0 and adapter ABI 1 after package/export gates; Phases 1-4 stay unstable 0.x
and Phases 6-7 target compatible 1.x additions. Public SDK/schema exports, package
file inclusion, compatibility entries, and a packed-package consumer fixture
are explicit Phase 5 deliverables and gates.

There is no architectural reason to promise an intermediate 1.0 followed by
2.0 merely to preserve the original illustrative number. The example now uses
`^1.0.0` and `coreApi: ^1`. Both package peer compatibility and separately
versioned ABI compatibility must pass; neither overrides the other. CLI support
is defined through 0.x, 1.x, and 2.x, with removal no earlier than a separately
approved 3.0 migration.

### R1-F005 — Accepted

The original text did not establish a provable isolation boundary. Added a
bounded strict mechanism: agent process-tree sandbox without credentials or
credential-helper access, a separately isolated AITM executor, enforced egress,
and a validated action-only write route. Host attestation identifies current
boundary configuration; positive and negative probes corroborate it. Expiry or
boundary change disables strict execution pending reevaluation. Receipts include
boundary and assurance fingerprints. A hostile host administrator is outside the
stated trust boundary.

Ordinary desktop bridges initially report guarded or behavioral. Accessible
Bash plus authenticated gh cannot claim strict, and unsetting GH_TOKEN is not
proof. Phase 7 strict certification requires the named mechanism and tests.
This is a proposed host integration contract, not an assertion that this review
session or existing host already provides it.

### R1-F006 — Accepted with compatibility preservation

Verified the existing ProviderAdapter typedef explicitly describes an AI vendor
or local agent. Added external-system adapter versus agent-host bridge
terminology, Phase 1 mapping to AgentHostBridge, and preservation of compatibility
exports/configuration keys where necessary. Verification-provider and delivery
provider concepts are separately qualified and inventoried by responsibility;
this is not a blind rename of every occurrence of "provider".

### R1-F007 — Accepted

Discovery now returns a bounded summary subset; describe owns the full record.
Updated the example, added a 50-action / 32-KiB inclusive response cap, filters,
query/fingerprint-bound pagination, stale-cursor restart, field-length bounds,
and oversize-record validation failure. Unavailable actions remain reachable
without all being inlined on page one. The full capability resource obeys the
same pagination rule, and release gates exercise limits and stale cursors.

### Optional suggestions — All addressed

1. Recorded the limit of hash-linked reference evidence: commit/object digests
   protect the recorded content identity, not retention or live retrievability.
   Missing evidence cannot be presented as freshly verified.
2. Defined binding-generation and stable-identity retention for historical typed
   references. Renames require continuity proof; deletion or unverifiable moves
   produce typed diagnostics; new bindings do not redirect old evidence.
3. Added setup phase operation IDs, input fingerprints, read-back, retry
   classification, staged activation, and truthful partial-failure handling.
   External effects remain recorded, and an incompatible partial external effect
   pauses mutation instead of falsely promising full previous operability.

## Changes made

Changed only the architecture artifact and this generated author response in the
active protocol. Required design additions are localized to invocation,
discovery, ABI/versioning, authority/recovery, host assurance, verification,
rollout, and migration sections. Formatting normalized existing spec tables and
examples as part of its targeted Prettier pass.

## Declined changes and rationale

No finding is rejected wholesale. Partial disagreements are preserved above:
65 versus 66 verb files; no forced two-major-version release sequence;
value equality cannot independently establish authorship; and qualified
provider vocabulary is migrated with compatibility rather than indiscriminately
renamed. None of these disagreements reduces the requested safety or coverage
contract.

## Verification

- Targeted Prettier check on the revised spec passed after formatting.
- Targeted CSpell initially found "retarget"; changed it to "redirect" and reran.
- Repository doc-anchor lint passed: 38 anchors across 3 existing guide documents.
- Parsed all 6 JSON examples in the artifact and checked local Markdown link
  targets; no schema implementation is claimed.
- The first Markdown CLI2 invocation inherited repository globs (550 files, no
  issues). A later intended targeted CLI2 invocation also inherited globs (554
  files) and reported 19 formatting issues in this run's protocol responses,
  because sealed frontmatter follows a template comment. The immutable protocol
  metadata was not changed. Used standalone markdownlint with the same rule
  configuration for an exact-file spec check instead.
- Local seeded dependencies lacked the three document-tool executables; npx
  resolved the check tools. No package manifest or lockfile was changed.
- No whole-repository runtime tests were run for these document-only revisions.
- Read only allowed checkout sources and this run's report. The broad lint
  discovery is an isolation limitation of tool file access; it did not return
  prior review prose or prior findings to the Author. No perfect blinding claim
  is made. No other observed isolation breach is known.

Final exact-file Markdown, spelling, and formatting check results are confirmed
before protocol submission; protocol submission records the revised artifact
hash and result commit. Human approval, implementation approval, and a decision
to proceed to SPR/SAR are not implied.
