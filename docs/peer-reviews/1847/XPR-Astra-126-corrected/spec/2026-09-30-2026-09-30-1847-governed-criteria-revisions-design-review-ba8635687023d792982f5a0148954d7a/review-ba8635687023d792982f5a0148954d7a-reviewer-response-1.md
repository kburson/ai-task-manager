<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ba8635687023d792982f5a0148954d7a"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
artifact_commit: "29bd66e799633f784be324e34c728ee2cf4721a6"
artifact_blob: "c7c0781431199e022a5764916e435b50f1b412fa"
artifact_digest: "sha256:de62f0b2045d5ffb48561ba083b2800825d345b44ce296d3d74620d1ac3c1ddb"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:9ab594da82e932c23d67af728809f0f2d2f4128f616ae2d30fdd407809de45b5"
  identity_source: "runtime"
started_at: "2026-09-30T08:23:55.073Z"
submitted_at: "2026-09-30T08:25:37.465Z"
finding_ids: ["R1-F001","R1-F002","R1-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`
at blob `c7c07814` (digest `sha256:de62f0b2…`). The prior same-agent SAR rounds are
treated as the author's drafting record, not as review authority.

Method: full read of the artifact, then direct inspection of the baseline seams
it names:

- `scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs`
- `scripts/task-tracker/verbs/plan-approve.mjs`
- `scripts/task-tracker/lib/github-records/delivery-contract.mjs`
- `scripts/task-tracker/lib/github-records/record-envelope.mjs`

Baseline claims verified as accurate:

- `plan-approve.mjs:152-161` refuses directory authority with
  `directory-authority-unsupported`. The spec's statement that canonical revision
  support must include a canonical Plan-approval adapter is correct.
- `amendContract` exists as a pure export (`delivery-contract.mjs:422`). The
  claim that semantic amendment lacks a persistence operation is consistent with
  the spec's framing.
- `authority-resolver.mjs` implements `aitm.authorization-source/v1`,
  `codex-session/v1`, injection filtering via `isInjection`, a statement hash, and
  the `host-verified-user-message` level (`authority-resolver.mjs:30-88`). It also
  records `principal: null` from the Codex loader, which matches the spec's "record
  that absence" rule.

The design is coherent and unusually careful about the separation between
revision authorization and Plan approval, about not reviving retired proof, and
about scoping its concurrency claims to one cooperative local writer domain. The
honesty boundaries (no server-side atomicity, trusted host history, append-only
by protocol only) are right and should survive revision.

Three findings need revision before Refine. One is a feasibility gap that can
block the motivating use case outright. Two are places where the specification
names a required binding in prose but not in the byte-exact artifact the human
actually approves, so a faithful implementer could satisfy the prose and still
bind approval to less than the spec intends.

## Findings

### R1-F001 — Single-comment archive publication conflicts with GitHub's comment size limit

The spec requires the `prepared` event to publish "the complete sealed proposal
and archive" (Durable revision log), and requires the archive to contain the
complete original body, contract, declarations, proof, approval, and authority
bytes (Current-proof invalidation). Archives that cannot be preserved completely
refuse before preparation.

GitHub limits both issue bodies and issue comments to 65,536 characters. A
legacy issue body can therefore approach the same limit that the carrying comment
has. The `prepared` comment must hold that entire body *plus* the proposal
(`before`, `edits`, `identityMap`, `invalidation`, `writeSet`, `after`), the event
envelope, and archived proof/approval bytes. For any heavily stamped AITM body
past roughly half the limit, the single-comment form cannot fit. The operation
then refuses by design, precisely on the kind of mature, proof-laden issue the
motivating #124 case describes.

The baseline does not catch this early. `record-envelope.mjs:38` bounds record
comment bodies at `MAX_COMMENT_BODY_BYTES = 1024 * 1024`, which is far above
GitHub's actual limit. The spec's "verify all rendered record/body size ...
policies" step would pass the local check and fail only at publication. That
happens after interlock acquisition, but the design has no recovery row for "the
prepared publication was rejected for size".

The spec is silent on whether an event payload may span multiple comments. It
says only that "No event overwrites an earlier one" and that the loader
"enumerates all relevant comments".

**Required:** choose and specify one of these:

- (a) A content-addressed multi-part payload. The `prepared` or
  `recovery-authorized` event references ordered part comments by digest. Parts
  are published and read back before the event that references them. The loader
  treats a missing or mismatched part as indeterminate. Interruption between
  parts and event is a defined, untouched, abortable state.
- (b) Keep single-comment publication, but state the effective ceiling against
  GitHub's 65,536-character limit (not the 1 MiB envelope bound). Require
  `prepare` to compute the rendered event size and refuse read-only. Add a
  verification case with a near-limit #124-shaped body. Record at Refine
  whether that ceiling is acceptable for the intended consumer.

Either way, align the size check with GitHub's real limit so refusal happens
during read-only `prepare`, not at the first durable write.

### R1-F002 — The approval statement does not bind the recovery observation, and its byte form is ambiguous

Two related gaps sit in "Exact human authorization":

1. **Byte form.** The rendered statement is shown as an inline code span that
   wraps across a source line break ("... transaction" / "<transactionId> ...").
   The existing resolver hashes the entire joined `input_text` of one user message
   (`authority-resolver.mjs:115-127`) and compares that to `statementHash`. So the
   human's message must consist of exactly the rendered bytes, with no
   surrounding words and the same whitespace. The spec says "exact rendered
   approval statement". It does not state:
   - that the statement is a single line;
   - that the message must contain nothing else;
   - which value renders `<mode>`, given that `revision` is the proposal mode,
     while request `action` is `apply`/`recover`.

   These are the details an operator gets wrong and the details an implementer
   might "helpfully" relax to substring matching, which would reopen the
   injected-text path the resolver is designed to close.
2. **Recovery observation.** "Recovery, abort, and forward repair" requires a
   recovering session's approval to name "the original transaction, the observed
   resource-vector digest, the exact recovery proposal, and the new executor".
   The single statement template names transaction, proposal digest, and
   executor, but not the observed resource-vector digest. The proposal field
   list also does not list an observed-vector field. `before` holds pre-state
   observations, and `priorTransaction` holds only "an exact transaction and event
   reference". The observed vector is therefore bound only if an implementer
   decides to put it inside `before`. Nothing requires that.

**Required:**

- Specify the statement as a single line with a fixed, documented separator. State
  that the authorizing user message must equal it byte-for-byte (whole-message
  match, consistent with the existing resolver). Name the exact `<mode>`
  vocabulary.
- Add an explicit `observedResourceVector` (or equivalently named) digest field
  to the closed proposal shape for `resume`, `abort`, and `forward-repair` modes,
  and require it to be null for `revision`. It is then covered by
  `proposalDigest` and, transitively, by the approved statement. Alternatively,
  add it to the recovery statement template. Either way the approval must bind
  the specific observation, not just the transaction.

### R1-F003 — Revising in place while Develop continues leaves an unguarded interval

The stage table permits `apply` in Develop. The spec then says every revision
invalidates Plan approval, and that "From Develop, demote normally to Plan and
obtain fresh approval before returning to Develop". It does not say what happens
between a successful Develop `apply` and that demotion.

During that interval the issue sits in Develop with:

- a corrected contract;
- no valid Plan approval;
- `WRITE_CODE` and `COMMIT_CODE` still permitted by the activity matrix.

Commits carrying the `[#N]` token can land against an unapproved contract. They
then feed commit-trace and delivery attribution later. The Develop-exit guard
eventually refuses, but code authored under the stale contract is already in the
trail. This contradicts the spec's own premise that authorization binds to the
revised contract before work proceeds against it.

Test and Review already require demotion *before* application. Develop is the
odd one out, and the spec gives no rationale for the asymmetry.

**Required:** pick one and state it:

- (a) Require demotion from Develop to Plan before `apply`, making the table row
  "No; demote to Plan first". This matches the Test/Review treatment and
  removes the interval.
- (b) Keep Develop apply, but specify that a verified revision whose Plan approval
  is stale is a Develop activity-policy refusal for `WRITE_CODE`/`COMMIT_CODE`,
  until demotion and re-approval. Add it to the consumer inventory table and to
  the lifecycle verification cases.

## Required changes

1. Resolve event-payload size against GitHub's 65,536-character comment limit.
   Use either content-addressed multi-part publication with defined interruption
   states, or a read-only `prepare` refusal at the real limit with a near-limit
   test case and a Refine acceptability check. (R1-F001)
2. Fix the approval statement to a single-line, byte-exact, whole-message form
   with a named `<mode>` vocabulary. Bind the observed resource-vector digest into
   the proposal digest or the statement for all recovery modes. (R1-F002)
3. Remove the Develop apply/demote interval: require demotion before apply, or
   make stale-Plan-approval-after-revision an explicit Develop code-write/commit
   refusal with inventory and test coverage. (R1-F003)

## Optional suggestions

1. **Header revision line is stale.** The artifact says "Revision: SAR round 2
   revision by the same reviewing agent", while the branch history records a
   converged SAR round 3 (`29bd66e`). Update the line, or say round 3 made no
   artifact change, so later readers don't mistake which text converged.
2. **Name the supported host explicitly.** Version one accepts only the
   `codex-session/v1` adapter. Claude Code sessions, including the host
   producing this review, therefore cannot execute `apply` or `recover` and must
   refuse. That follows from the text, but one sentence in the trust-boundary
   section avoids a surprise at Refine when the host-adapter validation
   obligation is exercised.
3. **Consumer cost of chain validation.** Every Plan/Test/Review/close consumer
   for a revised issue must page through and validate the full revision-event
   chain, and incomplete reads are indeterminate. That is the right fail-closed
   choice. Refine sizing should account for the added GitHub reads per gate, and
   the protected body pointer's role as an accelerator should be specified
   enough to bound that cost.
4. **Preservation manifest location.** Consumers accept a legacy
   `preserved-individual` proof only through the derived disposition in the
   invalidation manifest. State whether consumers read that disposition from
   the `prepared` event payload or from a body projection. If from a projection,
   state that it is validated against the event, so the one carry-forward
   exception cannot be satisfied by a body edit alone.

## Decision

revisions-requested
