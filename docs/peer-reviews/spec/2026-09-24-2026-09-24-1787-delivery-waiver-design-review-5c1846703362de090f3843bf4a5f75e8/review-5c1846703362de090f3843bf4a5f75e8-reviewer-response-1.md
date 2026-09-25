<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5c1846703362de090f3843bf4a5f75e8"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "daaaacad13c7b2e4870823594682de533e87208e"
artifact_blob: "fb556b639d8c39d55ceecbf6699bbe890f8bb9d6"
artifact_digest: "sha256:5583eaf024bb5513b97e5b47f65b597ad9f524b07929ee41bf49e8237a972fb2"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:1bf95f25d0438754a0aab1190a195d819a88179354ae4c65e9aefc50a6026d6d"
  identity_source: "declared"
started_at: "2026-09-24T20:10:06.614Z"
submitted_at: "2026-09-24T20:14:08.695Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The core architectural judgment is sound and I agree with it. A generic,
evidence-bearing, human-authorized delivery waiver is the right primitive
instead of a second merge-method backdoor, and Option B (shared authority
contract, lane-specific proof and terminal records for #1787 and #1783) is the
correct boundary. `waived` as a first-class non-pass outcome that never
backfills pass markers is the right invariant, and the design states it
repeatedly and consistently.

I verified the design's factual claims against the current tree at
`daaaacad` and they hold:

- The #1784/#1785 diagnosis is accurate. `scripts/task-tracker/verbs/deliver.mjs:1095`
  gates the reconcile lane on `reconcile !== null && (live === null ||
  live.record.provider === 'external')`, so a pending AITM-authored intent
  genuinely cannot reach `--reconcile-merge-method`.
- The category-to-requirement-ID table in **Requirement Model** is complete.
  All 25 distinct `verificationError(...)` categories currently thrown in
  `scripts/task-tracker/lib/delivery-verification.mjs` are covered with no
  leftovers.
- The schema version choices are right. `scripts/task-tracker/lib/delivery-records.mjs:11-15`
  defines intent v1/v2 and receipt v1/v2/v3, so intent **v3** and receipt **v4**
  are the correct next versions, and keeping #1755's `attributionDisposition`
  as an attribution-only shape is the right call.

What blocks acceptance is not the architecture but five load-bearing
assumptions about the mechanism being reused. The design treats
`aitm.workflow-exception/v1` and the workflow-policy catalog as if they already
provide multi-host authority, extensible record scope, single-use operation
semantics, and a family-level waiver capability. Read against the code, three of
those do not exist and one would, taken literally, unlock ten hard delivery
gates that the same document elsewhere promises to preserve. These are
specification gaps, not implementation details: each one changes the scope,
the schema-version story, or the safety envelope of the issue, so each needs to
be settled in the design before planning.

## Findings

### R1-F001 — Opening the delivery *family* would unlock ten existing hard gates

**Decision**, item 2, says to "Open the delivery requirement family only as
`waivable-with-disclosure`."

`scripts/task-tracker/lib/workflow-policy/catalog.mjs:18-27` already defines a
family literally named `delivery-invariant`, containing ten requirements that
are all `waivable: false`:

`delivery.tests`, `delivery.verification-evidence`, `delivery.ownership`,
`delivery.dependencies`, `delivery.issue-binding`, `delivery.state-contiguity`,
`delivery.commit-provenance`, `delivery.ci`, `delivery.safe-delivery`,
`delivery.external-protection`.

Applied at family granularity as written, this change makes every one of them
waivable. That directly contradicts two other sections of the same document:

- **Verification Flow**: "Existing review, approval, CI, ownership, dependency,
  state, clean-tree, and provider-action gates remain required."
- **Scope**, out of scope: "weakening or deleting delivery predicates."

**Requirement Model** compounds the ambiguity rather than resolving it: it says
"Existing non-delivery hard requirements remain non-waivable." By omission that
sentence leaves exactly these ten delivery-family hard requirements
unprotected — they are delivery requirements, so the sentence does not cover
them.

This is the highest-severity issue in the document because the failure mode is
silent: `validateWaiverIds` (`catalog.mjs:75-89`) is the only thing standing
between a recorded exception and a waived requirement, and it consults nothing
but the per-item `waivable` flag.

### R1-F002 — `aitm.workflow-exception/v1` cannot carry the required delivery scope

**Waiver Authority** states that "Delivery waivers reuse `aitm.workflow-exception/v1`
records," and in the same list requires the record to carry exception kind,
pull request number, accepted head SHA, target/base ref and resolved trunk ref
identity, and the named delivery requirement ID.

Those two statements cannot both be true. `scripts/task-tracker/lib/workflow-policy/exception-record.mjs:22-34`
defines `PAYLOAD_KEYS` as a closed set, and line 151 enforces it through
`exact(payload, PAYLOAD_KEYS, 'payload-keys')`, which fails when the actual key
count or names differ at all. Adding any delivery scope field throws
`workflow-exception:payload-keys`. The existing payload has no field capable of
absorbing them: `scopeIdentity` and `operationId` are both constrained to
`sha256:<64 hex>` by lines 156-157.

The design must pick one and say so explicitly, because the two paths have very
different costs:

- declare `aitm.workflow-exception/v2` with the delivery scope fields, and
  specify readback/migration for existing v1 records (`exception-store.mjs`
  and `snapshot.mjs` both consume these); or
- keep v1 and define delivery scope as a digest preimage folded into
  `scopeIdentity` or `operationId`, in which case the design must define that
  preimage exactly.

This interacts with a second unaddressed point. The current
`computeScopeIdentity` (`workflow-policy/scope-identity.mjs:30-54`) hashes only
repository, issue, and the canonicalized `User Story` / `Scope` /
`Acceptance Criteria` body sections. It is body-derived, not
delivery-derived. **Risks** correctly identifies that "Reusing the ordinary
workflow-exception scope without delivery extensions would let unrelated PR/head
changes inherit the waiver" — but the design never says how the proposed
`waiverScopeDigest` (listed only as an intent v3 field under **Records and
Schemas**) composes with, supplements, or replaces `scopeIdentity`. For a design
whose stated primary engineering risk is scope identity being too broad, the
canonical scope digest and its preimage should be defined in **Waiver
Authority**, not left implicit in a field list.

### R1-F003 — Authority is Codex-only today, and the motivating case is a non-Codex human action

**Waiver Authority** requires "host-verified user-message authority where the
platform supports it," and the shared contract is presented as
provider-neutral. The current implementation is not.

- `exception-record.mjs:83-100` fails the record unless
  `origin === 'codex-session-transcript'` **and**
  `verificationLevel === 'host-verified-user-message'` **and** the reference
  matches `^codex:\/\/sessions\/[^/\s]+\/messages\/[^/\s]+$`.
- `workflow-policy/authority-resolver.mjs:34` refuses any source whose
  `adapter !== 'codex-session/v1'`, and the only loader shipped is
  `createCodexSessionSourceLoader`, which reads a Codex transcript file.

So the sole way to mint a valid waiver today is from inside a Codex session. The
triggering case in **Problem** is a human merging a PR in the GitHub UI, and
delivery waivers will be requested from whatever session is driving `deliver`,
which is not always Codex. The clause "where the platform supports it" is doing
a great deal of unexamined work: it does not say whether an unsupported host
means the waiver is simply unavailable (fail-closed, correct but a significant
usability limitation worth stating plainly) or whether a weaker verification
level is acceptable (which would undercut the whole authority model).

Neither **Scope** nor **Implementation Notes** budgets adapter work.
**Implementation Notes** lists `exception-record.mjs` only "for delivery-specific
waiver validation," which understates the change if a new origin enum,
reference grammar, and adapter are needed.

### R1-F004 — "Single-use operation ID" is assumed to exist; nothing enforces it

**Waiver Authority** lists "a single-use operation ID or bounded expiry" among
what it calls the "ordinary workflow-exception protections," implying single-use
is already available and inherited.

It is not. `operationId` is only shape-checked as a `sha256:` hash at
`exception-record.mjs:157`. The evaluator's `validateRecord`
(`workflow-policy/evaluator.mjs:19-52`) checks disposition, repository, issue,
`scopeIdentity`, expiry, authority presence, requirement IDs, and constraints —
and never reads `operationId` at all. There is no consumption ledger, no
burn-on-use, and no replay defense anywhere in the module.

Consequence: absent a bounded `expiresAt`, an active delivery waiver for a given
scope stays usable across repeated `deliver` invocations. For a waiver of a
delivery invariant that is meant to authorize one exceptional delivery, that is
a real safety gap, not a nicety.

The **Tests** list reflects the same blind spot. It covers wrong-issue,
wrong-repository, wrong-PR, wrong-head, wrong-base, wrong-invariant, and
wrong-operation cases — all of which are *scope* mismatches — but has no case
for replaying a correctly-scoped waiver a second time.

### R1-F005 — `indeterminate` is defined but has no specified consumer behavior

**Waiver Authority** defines a four-value typed result including
`indeterminate - authority or evidence cannot be read safely`. Nothing in
**Verification Flow**, **Records and Schemas**, **Command Surface**, or
**Tests** says what `deliver` or `close` must do when they receive it.

**Verification Flow** enumerates a five-step sequence that branches only on
"no exact waiver exists" versus "an exact waiver exists," which leaves
`indeterminate` to fall through to whichever branch the implementer picks. For a
design whose first sentence in that section is "The delivery verifier stays
fail-closed," the required behavior — refuse, with a distinguishable
non-`blocked` reason so an operator can tell "authority unreadable" from "no
waiver" — should be stated, and it should appear in **Tests**.

## Required changes

1. **R1-F001** — Change **Decision** item 2 and **Requirement Model** to grant
   `waivable-with-disclosure` per requirement, never per family. State
   explicitly that the ten existing `delivery-invariant` requirements listed in
   `catalog.mjs:18-27` remain `waivable: false`, and place the new PR-verifier
   requirement IDs in their own named family so the two sets cannot be opened
   together by a future family-level change. Add a test to **Tests** asserting
   those ten IDs stay non-waivable.
2. **R1-F002** — Resolve the contradiction between "reuse `aitm.workflow-exception/v1`"
   and the delivery scope field list, given the closed `PAYLOAD_KEYS` validation
   at `exception-record.mjs:22-34,151`. Either declare
   `aitm.workflow-exception/v2` (and specify readback for existing v1 records
   through `exception-store.mjs` and `snapshot.mjs`), or define the exact digest
   preimage by which delivery scope binds into the existing `scopeIdentity` or
   `operationId`. In the same section, define how `waiverScopeDigest` relates to
   the body-derived `computeScopeIdentity` rather than introducing it only as an
   intent v3 field.
3. **R1-F003** — State the host-authority position explicitly. Record that
   `exception-record.mjs:83-100` and `authority-resolver.mjs:34` currently admit
   only Codex-session authority, then decide and document whether #1787 (a)
   refuses delivery waivers outside Codex, or (b) extends the origin enum,
   reference grammar, and adapter set. If (b), add that work to **Scope** and
   **Implementation Notes**, which presently budget neither.
4. **R1-F004** — Stop describing the single-use operation ID as an inherited
   protection. Specify it as new work: where consumption is recorded, at what
   point in `deliver` it burns, and how a burned ID is detected on retry. Note
   that **Command Surface** currently says `deliver` "must not ... infer approval
   from the retry," which only holds if replay is actually prevented. Add a
   replay test — same waiver, same correct scope, second delivery attempt must
   refuse — to **Tests**.
5. **R1-F005** — Specify `indeterminate` handling in **Verification Flow**: it must
   refuse, and it must be distinguishable in operator output and in the record
   projection from an ordinary `blocked`. Add the corresponding test.

## Optional suggestions

1. The **Tests** bullet "every delivery requirement ID has a consumer mapping"
   is already implemented. `workflow-policy/consumer-coverage.mjs:30-50`
   (`assertConsumerCoverage`) throws `workflow-policy:unmapped-requirements` for
   any catalog ID absent from `CONSUMER_DECLARATIONS`. Reword the bullet as
   "extend `CONSUMER_DECLARATIONS` with the new delivery IDs" so the plan does
   not build a duplicate mechanism. The sibling bullet — every
   `verificationError(...)` category maps to a requirement ID — genuinely has no
   existing equivalent and should stay as written.
2. The proposed result vocabulary (`passed` / `waived` / `blocked` /
   `indeterminate`) diverges from the adjacent `POLICY_OUTCOMES` in
   `evaluator.mjs:8-13` (`satisfied` / `waived` / `missing` / `not-applicable`)
   for what is substantially the same decision. Either reuse the existing names
   or add an explicit mapping table, so consumers reading both modules do not
   have to infer that `passed` and `satisfied` are the same thing.
3. Two proposed IDs sit uncomfortably close to existing ones:
   `delivery.commit-attribution` against the existing
   `delivery.commit-provenance`, and `delivery.pr-scope` against
   `delivery.safe-delivery`. Since both sets live in the flat `delivery.*`
   namespace and both are consulted by close-path code, a distinguishing prefix
   such as `delivery.verification.*` for the verifier-predicate family would
   make misuse visible at a glance and reinforce the R1-F001 separation.
4. **Requirement Model** folds `waived-evidence`, `waived-inventory`, and
   `waived-authority` into a single `delivery.waiver-authority` guardrail. Those
   three categories today
   (`delivery-verification.mjs:523-564`) are specifically #1755's
   *attribution*-waiver self-checks. Once #1787 adds a second waiver kind with
   its own self-checks, say whether one guardrail ID covers both kinds or each
   kind gets its own — otherwise a future failure message will not identify
   which waiver's authority was malformed.
5. Worth preserving explicitly in the planning hand-off, since I verified them
   and a later reader should not have to re-derive them: the category table is
   complete against all 25 current `verificationError(...)` categories; intent
   v3 and receipt v4 are the correct next versions per
   `delivery-records.mjs:11-15`; and the unreachability of
   `--reconcile-merge-method` for a pending AITM intent is confirmed at
   `deliver.mjs:1095`.

## Decision

revisions-requested
