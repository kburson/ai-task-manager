<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b6dab872f635853580a968c0ca954352"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md"
artifact_commit: "b6cf83c490eaf7f692a3396080ebd9b589c47deb"
artifact_blob: "e6960867ad38530c6143fa2cb37ee75adc157967"
artifact_digest: "sha256:71cd2c7864bcc0aedf9d8d7129c65ea826d4b62e07b0d403c7fdee317a5d15e6"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:9289af6373656e819643b5ba41787b2c686a71de5fbeed4455e1330583534b19"
  identity_source: "runtime"
started_at: "2026-11-05T10:36:53.054Z"
submitted_at: "2026-11-05T10:38:22.323Z"
finding_ids: ["R1-F001","R1-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of `docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md`
at blob `e6960867` (digest `sha256:71cd2c78…`).

Method: full read of the artifact, then direct inspection of the seams it names:

- `scripts/task-tracker/lib/issue-kind.mjs` (`parseDeliverablePosted:228`,
  `setDeliverablePosted:259`, `hasDeliverableMarker:223`,
  `isIssueResidentDeliveryKind:133`)
- `scripts/task-tracker/verbs/epic-reconcile.mjs` (arg parsing, comment fetch and
  `validateEpicDeliverableComment:77`, epic-only refusal inside the mutate closure)
- `scripts/task-tracker/lib/decomposition-effect-admission.mjs`
  (`assertScopedDecompositionEffect`, `classifyDecompositionBodyRevision`)
- `scripts/task-tracker/lib/code-complete-gate.mjs:355-363`
- `scripts/task-tracker/lib/delivery-preflight.mjs:477-500`
  (`validateNoCommitDeliveryPreflight`)

Baseline claims verified as accurate:

- `setDeliverablePosted` is the only marker writer, and its only production
  caller is `epic-reconcile.mjs:175`, which refuses every non-epic kind. The
  stated gap is real.
- `setDeliverablePosted` is conflict-intolerant as described: same-URL returns
  the body unchanged (so the original `ts` survives), any other existing marker
  (including a bare legacy one with no `url`) throws `deliverable-marker-conflict`.
- `gateCodeComplete` blocks the Develop exit of every no-commit kind without
  `hasDeliverableMarker`. The spec's statement that the marker is a prerequisite
  to Test, and therefore that Develop is the correct and only stage for this
  writer, is correct.
- `classifyDecompositionBodyRevision` classifies a change confined to the AITM
  Progress Markers section as `scoped-deliverable`, so the named admission
  activity matches what the classifier would derive. Note this differs from
  `epic-reconcile`, which asserts `scoped-completion`; the spec's choice is the
  consistent one for this effect.
- `validateNoCommitDeliveryPreflight` reads the marker with the strict
  `parseDeliverablePosted` and binds delivery to `testReceiptSha ===
  acceptedReviewSha`, not to anything in the marker. Downstream source binding is
  owned by Test/Review receipts, as the spec says.

The design is sound, narrowly scoped, and correctly refuses to broaden existing
readers or loosen `epic-reconcile`. The before-write/after-write revalidation and
"no success on uncertainty" rules are right. Two findings need revision: one
statement promises a source binding the preserved wire format cannot carry, and
the strict marker-validation rule is underspecified at exactly the point where
the existing readers disagree with each other.

## Findings

### R1-F001 — "Publication is bound to HEAD" cannot be honored by the preserved `(url, ts)` marker

"Public behavior" says: "publication is bound to the actual operator's clean
current source HEAD." "Before-write evidence" then requires a clean tracked
worktree and revalidates exact HEAD before every write, and "Mutation, conflicts
and readback" compares source/operator again after the write.

But "Source-grounded existing interfaces" requires preserving the marker wire
format (`url`, `ts`). The marker records no SHA, and the spec adds no other
persisted record. So after the command exits, nothing durable says which HEAD the
publication was checked against. HEAD is a precondition of the invocation, not a
binding of the publication. The spec itself states that Test, Review and delivery
remain "independent exact-source gates", and `validateNoCommitDeliveryPreflight`
confirms delivery never consults the marker for source.

This matters for implementation fidelity. A faithful implementer reading "bound
to HEAD" has two bad options: add a `sha` property to the marker (violating the
wire-format rule and every existing reader's expectations), or silently treat the
word "bound" as "checked" (leaving the spec's claim unmet). It also leaves the
rationale for the clean-worktree requirement implicit: for a spike whose
deliverable is a comment, it is not obvious why a dirty tracked file should
refuse publication.

**Required:** replace "bound to" with the actual contract, e.g. "publication
requires, and revalidates around the write, a clean tracked worktree at the
operator's current HEAD; that HEAD is not persisted in the marker, and source
acceptance remains solely with Test/Review receipts." State in one sentence why
the clean-source precondition exists for a no-commit spike (for example: it
prevents the writer from running against unreviewed runtime/source edits in the
spike checkout, or it ensures the later Test receipt sees the same HEAD). If
persisting HEAD is actually intended, say so explicitly and specify the new
record and how existing readers tolerate it.

### R1-F002 — Strict marker validation does not define its counting scope against divergent existing readers

The spec requires the writer to "strictly validate its own marker claims in the
authoritative AITM Progress Markers section": duplicate, malformed, bare legacy or
conflicting-URL claims refuse; after write, "exactly one valid marker with the
expected URL".

The existing readers do not agree on what a marker is:

- `hasDeliverableMarker` (used by `gateCodeComplete` and `review-preflight`) is
  a loose regex test over the Progress Markers section. A malformed marker passes
  it.
- `parseDeliverablePosted` (used by `delivery-preflight`, `close`,
  `close-delivery-receipt`, estimation) takes only the **first** regex match and
  returns null if that one is malformed. A valid second marker is invisible; a
  malformed first one hides a valid second one.
- `setDeliverablePosted` also inspects only the first match.

So "exactly one" and "duplicate" must be defined by the new writer's own scan,
and the spec does not say what that scan is. Concretely unspecified:

1. Whether "duplicate" means every `aitm-deliverable-posted` occurrence the
   `DELIVERABLE_MARKER_RE` family would match within the section (including
   malformed ones that `parseDeliverablePosted` would reject), or only
   well-formed ones.
2. Whether occurrences **outside** the Progress Markers section (e.g. a marker
   quoted in prose or a fenced block) are ignored, refused, or counted. Existing
   readers ignore them; the spec should say the writer does too, or refuse them
   deliberately.
3. Whether a single pre-existing marker with the same URL but a non-canonical
   `ts` (which `setDeliverablePosted` would accept as a no-op, but
   `parseDeliverablePosted` would reject as null) is a no-op or a refusal. Under
   the current text it is "malformed" and should refuse; that should be stated,
   because the underlying helper would otherwise silently "succeed" and leave a
   marker that passes Develop exit but fails delivery preflight.

Item 3 is the important case: it is exactly the gap between the loose
code-complete gate and the strict delivery reader, and the writer is the one
place that can close it for spikes.

**Required:** define the writer's marker scan precisely: the scope (section-only
and how out-of-section occurrences are treated), what counts toward "duplicate"
(all occurrences, regardless of well-formedness), and that idempotent no-op
requires the single occurrence to round-trip through `parseDeliverablePosted`
with the expected URL. Add the non-canonical-`ts` same-URL case to the
verification list.

## Required changes

1. Replace "publication is bound to HEAD" with the actual precondition contract
   (clean tracked source at current HEAD, revalidated around the write, not
   persisted), and state why the precondition exists for a no-commit spike; or
   explicitly specify a persisted record if binding is intended. (R1-F001)
2. Define the writer's own marker scan: section scope and out-of-section
   handling, duplicate counting over all occurrences, and no-op only when the
   single occurrence parses via `parseDeliverablePosted` with the expected URL.
   Add the same-URL/non-canonical-`ts` refusal to verification. (R1-F002)

## Optional suggestions

1. **Reuse the existing comment validator rather than forking it.**
   `validateEpicDeliverableComment` and `parseFromCommentArg` already implement
   repository/issue/ID URL matching. The spec says to "preserve its public
   contract"; say explicitly whether `lib/spike-deliverable.mjs` reuses these
   (extending with author/timestamps) or deliberately reimplements them, so two
   URL validators do not drift. Note the existing default fetch uses
   `--jq '{body,html_url}'`, which drops `user`, `id`, `created_at` and
   `updated_at` that this spec requires; the new adapter needs its own field set.
2. **Author identity rule.** "Current authenticated author's login" refuses a
   report posted by the human (or another account) on the agent's behalf. That is
   a defensible provenance rule, but name the source of the authenticated login
   (provider `user` endpoint vs. config `assignee`) and confirm the existing #2146
   report comment satisfies it before implementation, since the command exists
   primarily to serve that comment.
3. **Audit and research kinds share the same gap.** They are also issue-resident
   no-commit kinds blocked by the same `code-complete-deliverable-missing` gate
   and have no registered writer either. Refusing them is a fine first-version
   scope choice; one sentence recording that the gap remains for them (and
   whether a follow-up issue exists) would prevent the restriction from reading
   as a semantic judgement.
4. **Refusal exit codes.** "Nonzero with a stable category" is untestable as a
   contract unless the code(s) are named. State the exit code for supported
   refusals (distinct from usage exit 2) and the category vocabulary format
   (e.g. `spike-deliverable:<category>`, matching `epic-reconcile:<category>`).
5. **Operational content in a design spec.** "Scope and authority" and "Review
   and activation" carry session-specific coordination (coordinator chat ID, the
   #2147 Test slot, Claude launch flags, #2146 activation sequencing). Those are
   correct as process constraints but will age quickly; consider moving them to
   the plan or issue body and keeping the spec to the durable design.

## Decision

revisions-requested
