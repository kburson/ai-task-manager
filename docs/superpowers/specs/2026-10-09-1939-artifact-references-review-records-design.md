# Unified planning artifact references and durable review records

Issue: [#1939](https://github.com/kburson/ai-task-manager/issues/1939)

Status: Draft for specification review; no acceptance or Plan approval claimed.

Source baseline: AITM `43e8d35d`; live #1939 and #1901 records inspected October 9, 2026.

## Purpose and Story Intent

Operators should see one meaningful artifact reference and one concise history per actual artifact/review type. Agents must resolve the same authoritative evidence without relying on duplicated visible fields or loading every review response. Historical repair must preserve evidence, human content and lifecycle state.

- **Beneficiary:** workspace operator reviewing planned and historical work
- **Capability:** navigate concise artifact and review records while agents resolve the same authoritative evidence
- **Need:** duplicated metadata and per-round issue comments obscure reviewed versions and clutter story histories
- **Value or failure prevented:** assess readiness and review changes without losing durable evidence or breaking automated workflow consumers

Issue #1939 is the normative requirements source. #1768 and #1723 retain ownership of review algorithms and provenance terminology. This specification selects representations and transactions; it does not authorize historical mutation.

## Current behavior

`plan-metadata.mjs` wraps the flat-label parser in `metadata-section.mjs`. `decomposition-policy.mjs::linkedPlanReference` selects the first substantive Implementation-plan, Source-plan or Plan field. `resolvePlanPath` expects a relative filesystem path, not an Accepted-plan Markdown URL. Retain its containment and symlink safeguards.

`governed-plan-policy.mjs` produces a validated observation of linked plan bytes; `story-intent-source.mjs` depends on that observation. `decomposition-wbs-coverage.mjs` directly reads Source-plan, Source-plan-commit and Source-plan-section. `split-plan.mjs` emits those fields and resolves Governing-spec separately, with a generic default. These consumers must migrate together.

`scripts/task-tracker/backfill-plan-metadata.mjs` performs legacy normalization with dry-run as default; it is not a complete artifact/comment migration. Governed `aitm issue-body` and `aitm comment` provide fresh-base transactions and stable owned keys. Extend these boundaries rather than creating raw body or comment writers.

Issue #1901 establishes the requested three metadata groups and four review summaries. Its manual specification SAR must remain manual SAR. Earlier plan SPR accepted predecessor bytes; later XPR accepted a revised plan. Substantive deep-dive prose remains in the issue body. The pinned reference index and consolidation mapping are under `docs/peer-reviews/1901/` at `5f35cf08c41bb8d9c482963e16a5313f44a973f6`.

## Scope and design choice

Include the common artifact contract/resolver, consumer migration, rendering, lightweight discovery, consolidated publication, governed exact-ID retirement, historical inventory/preview/backup/apply/resume/rollback, canonical guidance and standalone ai-peer-review integration. Exclude algorithm redesign, automatic human approval, lifecycle bypass, arbitrary Markdown execution, automatic mass migration and timing-calculation changes.

1. **Selected: bounded machine record with generated display.** One issue-body HTML comment holds validated bindings and immutable record references. Visible links are its projection. Legacy keys remain readable during migration. Human reordering cannot alter authority.
2. **Alternative: visible Markdown as authority.** Rejected because prose edits become machine semantics and arbitrary links cannot safely express roles and revision lineage.
3. **Alternative: Git-only authority registry.** Rejected as the sole discovery mechanism because consumers require another mutable lookup before finding its pinned revision. Git remains the durable evidence store.

## Artifact-reference contract v1

Exactly one live `aitm-artifact-references` JSON marker is allowed within root Plan Metadata. Fenced examples and quoted historical markers are not live records. Use a comment-aware structural parser; current helpers that discard comments cannot parse this authority.

Top-level fields are schema `aitm.artifact-references/v1`, repository, issue number, monotonically increasing record revision, artifacts and role bindings. Reject unsupported schemas, duplicate JSON keys, duplicate IDs/roles, malformed identities, multiple markers and unsupported authority fields. A documented extensions object may retain non-authoritative data. Limits: 16 KiB of UTF-8 bytes for the complete serialized marker, 32 artifact entries and 64 lightweight review-record references. Check whole-body budget before remote effect reservation; overflow refuses rather than truncates. Git-only review manifests have separate budgets below.

Each artifact contains a stable issue-local ID; kind (specification, implementation-plan, hydration-plan); tracked repository-relative path; full commit; raw-blob SHA-256; revision status (draft, reviewed, accepted); review references; and durable evidence references. Evidence references carry repository, full commit, path, digest and optional display anchor. No line-ending normalization precedes hashing.

Roles are governing-specification, accepted-specification, implementation-plan, source-plan, accepted-plan and decomposition-plan. Roles may share an entry only when repository, path, commit and digest all match; equal bytes alone cannot erase provenance. Distinct governing/accepted revisions and source/decomposition plans remain explicit. Display groups, label order, model and provider never infer roles.

A child source-plan binding includes the exact task heading and task number, uniquely selected through the canonical task extractor against the pinned plan. Duplicate tasks, mismatched heading/number, changed titles and stale digests refuse. Governing specification and decomposition provenance remain explicit.

Reviewed or accepted status requires applicable authentic evidence. A digest proves integrity, not acceptance. Predecessor review evidence must name its predecessor identity and lineage; it cannot accept later bytes. Authentic human artifact acceptance remains a distinct supported evidence type under existing policy. Reviewer consensus and AITM Plan approval remain independent.

## Digest and wire conventions

Every new contract digest is sha256: followed by 64 lowercase hex digits. Validate/normalize legacy bare-hex only at explicit adapter boundaries while preserving its original form. Artifact and document hashes cover raw Git blob or captured input bytes.

PreviousRecordDigest hashes the entire raw prior publication-manifest file blob at its pinned repository/commit/path, including its own previousRecordDigest and final newline. Never hash a recreated semantic JSON object or exclude fields. The current manifest also carries previousRecord as that immutable document reference, null only at genesis, agreeing with previousRecordDigest. Its own digest is external, calculated from the committed blob; no self-hash cycle.

Producer and adapter share golden JSON manifest/chain fixtures with exact UTF-8 bytes and newline cases. JSON-equivalent files with different bytes have different hashes; readers validate the referenced file. The publication envelope is a JSON document; protocol/manual evidence documents remain separately referenced. Inline JSON marker serialization Unicode-escapes literal less-than, greater-than and ampersand before HTML-comment framing, preventing embedded terminators.

## Protected authority marker

Register aitm-artifact-references as a protected single marker in body-invariants.mjs and mirror it in gh-edit-guard.mjs. Ordinary normalizers preserve it or fail MarkerLossError. A dedicated validated writer may insert genesis revision 1 or advance exactly one revision against a fresh exact base. Lower revisions, reused revisions with different content, duplicates or unverified rebinding refuse through marker-advance validation. Unchanged content/revision is an idempotent no-op.

Revalidate marker loss/advance and artifact authority inside the canonical transaction. Known enrolled issues cannot treat lost authority as absence permitting generic fallback: report artifact-authority-lost from durable enrollment/publication evidence. Initial-creation defaults are a separate explicit policy. Extend body-invariants.test.mjs, gh-edit-guard-body.test.mjs and artifact-reference-contract.test.mjs with drop, regression, same-revision divergence, unchanged, genesis, valid-next and metadata-normalization cases, preserving all unrelated lifecycle markers.

## Common authority resolver

Return a branded immutable observation scoped to exact issue body, repository, requested role, path, commit, digest, task selection and validated content. Preserve the observation anti-forgery pattern in `governed-plan-policy.mjs`. Consumers use that observation, not separate string precedence.

1. Parse the structural body, v1 marker and all recognized legacy keys.
2. Validate schema and immutable objects. Require normalized relative paths, no traversal/control characters/absolute paths, and no symlink components. Validate full commit identity and exact blob mode/type; refuse symlinks, gitlinks, absent objects and mismatched digests. Read Git objects with argument arrays, never shell-interpreted paths.
3. Resolve the requested role and child selection. Distinguish absent authority from malformed or unavailable authority.
4. Reconcile coexisting legacy fields. Identical duplicates may generate migration diagnostics; conflicting substantive values refuse. Legacy path aliases must match their corresponding role. Accepted commit/digest fields cannot be matched to an unrelated predecessor.
5. Validate any required working copy against pinned bytes. Drift is explicit; it is never a new accepted revision. Historical reads may read the immutable object without checking out that version.
6. Validate applicable review/policy evidence and return the observation or typed diagnostics. No generic fallback after a declared reference fails.

Legacy-only bodies normalize to an in-memory legacy observation without automatic writes. Preserve every supplied commit/digest/role/selector. A path without a commit may retain current working-copy behavior only where the existing consumer permits it, labeled `legacy-unpinned`. It is not immutable acceptance. Preserve existing approval pin requirements. Backheal obtains verifiable historical evidence or reports unresolved; it never chooses today's HEAD as historical authority.

Generic specification fallback is permitted only when no reference is declared and existing creation policy explicitly supplies the default. Declared invalid, conflicting, stale or unreadable references block fallback. Status reports actionable diagnostics without asserting readiness.

Adopt this authority across renderer, governing-spec discovery, plan selection, governed plan validation, Story Intent, split-plan inheritance, WBS coverage, decomposition exit/readiness, Plan approval and backfill. Maintain a checked-in consumer/writer inventory; completion requires every listed operational reader to use the common observation.

## Active plan and legacy role mapping

The implementation-plan role is the active executable plan, including its draft revision. Source-plan is inherited decomposition provenance. Accepted-plan is an accepted revision that may precede the current draft. A v1 writer explicitly binds active selection; display order never selects authority.

| Legacy field                                                | Normalized authority                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Governing-spec                                              | governing-specification                                                                                                           |
| Accepted-specification / Accepted specification             | accepted-specification; Specification-reference-commit pins that revision                                                         |
| Implementation-plan                                         | implementation-plan                                                                                                               |
| Plan                                                        | implementation-plan alias in v1; legacy-only Source-plan/Plan disagreements follow the explicit conflict policy below             |
| Source-plan / Source-plan-commit                            | source-plan; also supplies implementation-plan only when neither Implementation-plan nor Plan declares an independent active plan |
| Source-plan-section                                         | exact source-plan task selection; obtain task number from the canonical heading without changing it                               |
| Accepted-plan / Accepted-plan-commit / Accepted-plan-digest | accepted-plan, retaining its independent revision                                                                                 |
| Decomposition-plan                                          | decomposition-plan; root/epic absence uses implementation-plan                                                                    |

Recognize existing case, bold-label and whitespace normalization. Preserve original fields and unknown non-authoritative values in lossless round-trip material or the exact archived original. Accepted Markdown links are recognized only after their complete configured-repository immutable blob identity validates and agrees with explicit fields. Branch URLs and arbitrary URLs cannot pin acceptance. Missing commits remain unpinned.

| Consumer                                   | Root or epic                                  | Child                                                                                            |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Executable plan/policy and Plan approval   | implementation-plan                           | implementation-plan, with source fallback only as above                                          |
| Story Intent and selected executable scope | active plan root intent                       | source task intent only when active identity equals selected source identity; otherwise conflict |
| split-plan enumeration                     | decomposition-plan, with active-plan fallback | explicitly chosen decomposition-plan; never silently hydrate the entire inherited WBS            |
| Parent WBS coverage                        | parent's decomposition-plan and child claims  | child's source-plan, commit and selected task                                                    |
| Specification inheritance                  | governing-specification                       | explicitly inherited governing-specification                                                     |
| Acceptance display/readiness               | accepted-specification / accepted-plan        | same roles; predecessor acceptance cannot satisfy review of new active bytes                     |

Consumers resolve the same observation for the same semantic role; distinct roles legitimately refer to different artifacts. A child with inherited plan A/Task 2, new active plan B and accepted predecessor C refuses executable intent/approval while A's selector conflicts with B. WBS retains A's provenance and display retains C's acceptance. This feature does not silently deactivate inherited selectors or introduce an own-plan switch. A future explicit switch needs separately designed rebind semantics. Equal bytes at different paths/commits remain distinct. Include the A/B/C fixture and root/epic variants.

## Legacy conflict and inline pins

Legacy-only Source-plan A plus Plan B without Implementation-plan intentionally receives legacy-precedence-conflict. Current code selects Source-plan before Plan; the new reader reports both values and that former selection, rather than silently activating B or rewriting either field. This explicit stricter diagnostic resolves contradictory authority while preserving unambiguous legacy behavior. Inventory live A/B shapes before writer rollout, preview normalization and require authorized repair before v1 enrollment. Add distinct and identical-alias fixtures.

Recognize path followed by @ and 7–40 hex digits on legacy Implementation-plan, Source-plan, Plan, Governing-spec and Decomposition-plan. Preserve the original value/pin. Resolve abbreviations by unique-prefix commit-object resolution in the configured repository's observed object inventory; record abbreviation, full expansion, repository and inventory observation in diagnostics/migration provenance. Missing, ambiguous or non-commit objects refuse pin-dependent resolution. Do not turn a supplied unresolved pin into absence, guess HEAD or claim global uniqueness beyond the observed inventory. Later ambiguity cannot silently replace a persisted full binding.

Inline and separate corresponding commit fields must expand to the same full commit against the same observation; otherwise artifact-reference-pin-conflict. Validate the exact blob/digest independently: abbreviation expansion alone proves no historical acceptance. New writers emit full commits and remove inline duplication only through validated lossless migration. Cover full/abbreviated forms, ambiguity/missing objects, equal/conflicting separate pins and retained expansion on rerun.

## Whole-body and summary budgets

Use conservative internal ceilings independent of provider compression/counting: the final issue body must fit 57,344 UTF-8 bytes and 57,344 Unicode scalar characters, including all prose, substantive deep dive, AC/VC/DoD, lifecycle/authority markers and canonical body-version change. This is below the 65,536-character ceiling seen in [GitHub API error reports](https://github.com/googleapis/release-please/issues/1034); no live probe or stronger official-documentation claim is made. Multibyte text is intentionally bounded more strictly.

Measure complete final bytes and marker size before effect reservation or transport. Return artifact-reference-body-budget-exceeded or artifact-reference-marker-budget-exceeded with measured values and required reduction. These are deterministic pre-write refusals, not indeterminate transport or retriable drift. Never truncate protected prose, invent link-only deep dives, split the authority marker or silently discard bindings to fit.

A summary including its owned marker must fit 32,768 UTF-8 bytes and 32,768 scalar characters; reserve 1,024 bytes for ownership framing. Choose the first fitting deterministic tier: full ordered rounds across instances; active rounds plus one ordered immutable-record row per superseded instance; or latest actual round response/disposition links plus ordered history ranges linked into the complete immutable manifest. Each tier retains File Under Review, actual outcome/identities/effort, qualified timing when available, complete record/manifest links and a compacted-history label. Every original round, final no-change note and disposition remains reachable in Git.

No second summary, truncated links, deleted evidence or invented responses. If the minimal tier cannot fit, refuse review-summary-budget-exceeded before effects and preserve current publication. Add large/multibyte bodies, oversized marker, many-round/instance summaries, tier determinism/reachability and zero-provider-write budget-failure fixtures.

## Human metadata

Render bold Design Specification, Implementation Plan and Backlog Hydration Plan labels inside Plan Metadata. Reviews precede accepted artifact metadata. Show one linked artifact for each distinct role/revision operators need to understand. Hide duplicate bare operational fields only after every consumer supports v1.

If source and accepted plan share the complete repository/path/commit/digest identity, display one link. If governing specification or hydration plan differs, display distinct labeled links. Draft/unresolved status remains visible. Human reordering and decorative links do not change bindings. Conflicting substantive legacy keys still refuse.

Generate immutable blob links from validated identities, with encoded path segments. Allow the configured repository and explicitly validated external evidence repositories. Anchors change display location, not blob identity. Arbitrary Markdown is not parsed into a filesystem path or command. Preserve unrelated prose and lifecycle evidence.

## Concrete flat display grammar

Groups are standalone bold labels, never nested Markdown headings. Beneath each, use root flat bullets in metadata-section.mjs grammar: a bold field label followed by a colon and meaningful links.

Design Specification renders Specification-review-SAR (or SPR), Specification-review-XPR, then Accepted-specification, omitting reviews that did not occur. Review values contain summary comment, immutable record and manifest links. Implementation Plan uses Plan-review-SPR, Plan-review-XPR, then Accepted-plan. Backlog Hydration Plan uses Hydration-record and Decomposition-plan when present. Summary URLs have numeric comment IDs; durable URLs have validated repository/full commit/path identities. The single machine marker follows the projection within root Plan Metadata.

Each populated group has a real substantive flat field. No nested lists/headings or prose-only replacement, and no fabricated fields to pass gates. Recognized visible labels remain cross-checks; machine roles supply authority. Inventory metadata-section, plan-exit-plan-metadata-guard, agent-review body-sections and issue-body shape/verifier consumers. Preserve flat/substantive rules in plan-metadata-exit-guard.test.mjs and agent-review/validators/body-sections.test.mjs with v1-only grouped and mixed fixtures. A hidden record does not waive planning-output checks.

## Durable review record

A Git-tracked index and versioned manifest provide lightweight discovery. The body points to their immutable published bytes. Full reviewer notes, author dispositions, artifact revisions/snapshots, findings, timing-event tables and recovery records remain tracked and linked.

Review identity includes issue, artifact kind, actual method (SAR/SPR/XPR), protocol ID where present, identities and their evidence sources, requested and observed model/effort separately when available, assurance level, artifact lineage, ordered rounds, outcome and evidence pointers. Manual SAR stays manual; model/provider alone never determine method. Multiple genuine review instances retain their IDs and lineage within the one artifact/type summary.

Each round binds reviewed commit/digest, response, author disposition when one exists, decision, finding dispositions and next revision. Final no-change notes remain reachable. Optional/deferred findings are retained. A no-change author action is explicit and does not fabricate an author document.

Support draft, in-progress, revisions-requested, accepted, interrupted, failed, cancelled and superseded outcomes. Retain superseded evidence. Requested settings and launch acknowledgment do not prove every turn's actual selection; unavailable observations stay unavailable.

Joint elapsed timing uses recorded start/end events and explicit interval definitions. Record basis/exclusions; missing or contradictory events produce unavailable/qualified timing. Never add separate author/reviewer wall clocks or invent timestamps.

## Selected review producer/consumer envelope

Select the shared JSON envelope ai-peer-review.review-publication/v1, implemented by the standalone producer and AITM manual-record adapter. The immutable manifest contains this envelope; requests reference its repository/commit/path/digest. This is the chosen payload contract, not a later choice between incompatible manifests.

Required fields:

- schema: exact schema string; repository: configured owner/name; issueNumber: positive safe integer.
- recordId: nonempty stable logical record string; artifactKind: specification, implementation-plan or hydration-plan; recordKind: review or human-artifact-acceptance. A review record has method SAR, SPR or XPR. A human-only artifact-acceptance record has method null and instances empty; it never creates a review summary or invents a protocol method.
- publicationRevision: positive safe integer; previousRecordDigest: SHA-256 or null only for first publication; activeInstanceId: existing instance ID or null when current selection is unresolved.
- instances: ordered review-instance array; each has instanceId, protocolId (string or null), evidenceKind, assurance, participants, revisions, rounds, outcome, acceptance (object or null), and supersedes (instance ID or null).
- documents: unique-ID immutable references carrying repository/full commit/path/raw digest. All response, disposition and validation references resolve here.
- jointElapsed: null or recorded start/end evidence IDs, nonnegative integer elapsed milliseconds, interval rule and exclusions.

Identifiers are unique nonempty strings of at most 128 characters matching letters, digits, dot, colon, underscore and hyphen. The Git-only JSON publication manifest has a separate 256 KiB UTF-8 cap, at most 128 instances and 64 document references; identifiers are at most 128 characters and paths at most 1,024 UTF-8 bytes; duplicate keys, unsupported fields and unresolved references refuse. Null fields must have an explicit unavailable/no-change reason when they represent missing observations or dispositions.

Each revision has revisionId, logical artifactId, reviewedInput, preservation (immutable document reference or null before publication), and explicit parent revision IDs. ReviewedInput has the pinned-git or uncommitted variant defined below. A round retains its attempted input even before a response: positive integer round, exact revisionId, responseDocumentId or null with responseAbsence, authorDispositionDocumentId or null with dispositionAbsence, decision or null with decisionAbsence, required finding IDs, dispositions and next revision ID or null. Round numbers are unique and increasing per instance. Absence is never an invented document or decision. Dispositions identify the finding, required/optional/deferred classification, action and evidence. Participants separately record requested and observed selections; missing observations have reasons.

A review instance acceptance is the reviewer-consensus variant: exact revisionId and reviewedInput subject, finalRound, reviewer decision evidence ID and validation evidence ID. It requires an explicit final reviewer acceptance of those bytes with no unresolved required findings. Human-only acceptance uses its own record/acceptance variant below, with no fictional reviewer or finalRound. Outcome and its applicable evidence agree. Accepted, failed, cancelled and superseded are terminal; draft, in-progress, revisions-requested and interrupted are nonterminal. Supersession retains prior acceptance and lineage without accepting new bytes. Unrelated active instances refuse selection pending a governed explicit selection; older terminal instances remain linked.

Closed evidence variants:

1. manual-consensus: actual distinct-participant response, exact input digest and complete dispositions. Current native review uses the observed incoming reviewer response and its recorded identity source. Historical sources need attributable originals with exact subject/version and preserved provenance. Validate explicit acceptance and required finding closure. This proves recorded manual consensus only; unavailable native assurance stays recorded/unavailable and cannot satisfy a stronger gate.
2. sealed-protocol: require the standalone verifier's event-authoritative finalized acceptance, exact protocol/instance/round/subject and complete validated manifest. A manifest assertion, unfinalized accepted claim or launch acknowledgment is insufficient. Preserve actual assurance and refuse unsupported verifier versions.
3. human-artifact-acceptance: require a verified direct host transcript statement or authenticated GitHub human record uniquely binding identity, exact artifact and acceptance scope. General approval without exact revision is ambiguous. Artifact acceptance never supplies Plan/merge/Close approval implicitly.

Unknown evidence variants or missing authentic subjects remain unresolved historical discovery and cannot confer reviewed/accepted status. Assurance records verified, recorded or unavailable with its validation source; it never upgrades missing participant/model observations. Lifecycle consumers independently retain their existing policy.

Negotiation returns compatible-v1, legacy-only or unsupported, with exact versions. Compatible-v1 alone enables replacement publication and disables legacy emitters. Legacy-only retains prior publishing and visible operational fields without claiming consolidation. Unsupported refuses new publication while preserving evidence; newer opaque schemas never become an acceptance fallback. Test predecessor SPR R1/later XPR R2, mismatched manual subjects, unfinalized protocol claims, unavailable observations and incompatible versions. Standalone work implements this agreed envelope and a real verifier integration test.

## Conditional input, absence and acceptance variants

A reviewedInput is one of:

- pinned-git: kind, repository, original path, sourceCommit and raw SHA-256. The source commit must have existed as the reviewed source; verify its exact blob.
- uncommitted: kind, repository, original path and raw SHA-256, sourceCommit null, capture evidence ID and capturedAt (actual timestamp or null with an unavailable reason). Capture evidence identifies the actual input received by the reviewer; a later snapshot cannot supply a fabricated earlier timestamp or source commit.

Preservation is a separate immutable snapshot reference carrying archival repository/path/commit/digest, acquisition provenance and actual known archive time (or null with reason). Its digest must equal the reviewed raw input digest. The snapshot may be published later, but its commit is archival authority only, never the original sourceCommit. Verified exact original bytes are required; a similar later document is not an acceptable substitute. A pending local review can have preservation null. Before public File Under Review links or historical backheal apply, publish and verify the exact snapshot. Link an uncommitted subject as File Under Review: archived exact uncommitted input, naming its original path/digest and explaining that the linked commit preserves later-archived bytes. Existing pinned inputs keep exact source links.

Artifact-reference entries retain their own immutable durable blob identity. Their associated reviewInput identity/chronology remains separate. A historical uncommitted input and verified later preservation can establish recorded review of those exact bytes without asserting review of the archival commit. Current executable plan/approval gates still require their normal current pinned canonical source and applicable exact-content evidence; an archival path cannot silently become an active plan. If no admissible operational source exists, discovery remains historical-only with an explicit diagnostic.

ResponseAbsence is pending, not-produced or unavailable, with actual cause/event evidence where available. DispositionAbsence is pending, not-produced, not-required, unavailable or explicitly-no-change. Explicitly-no-change requires an actual recorded author decision/evidence; absence after interrupted findings does not mean no-change. DecisionAbsence similarly distinguishes pending/not-produced/unavailable. Missing-reference reason fields exist only when the associated field is null; non-null references forbid contradictory absence. No-response failed/cancelled attempts retain attempted input and actual lifecycle events; do not omit the attempt or create response prose. An interruption after findings keeps the real response and a pending/not-produced disposition.

Human-only artifact acceptance has recordKind human-artifact-acceptance, method null, instances empty, activeInstanceId null, and a required humanAcceptance object: exact reviewedInput or pinned artifact subject, humanAcceptanceEvidenceId, validationEvidenceId and authenticated issuer/scope. It has no finalRound, reviewerDecisionEvidenceId or reviewer consensus. It is linked from accepted artifact metadata, never titled a review summary or emitted as a duplicate acceptance comment. Existing human source records remain preserved. If human acceptance accompanies a review, retain it as separate artifact evidence and do not rewrite the review outcome or close its unresolved findings. Any bypass of an independently required review/approval gate still requires that gate's ordinary policy/exception authority.

Add fixtures for failure before the first response; interruption after findings before author action; exact-subject human acceptance without rounds; and this SAR's uncommitted r0 archived later. Verify real absence, chronology and raw bytes, and refuse missing originals or retroactive sourceCommit claims.

## Consolidated publication

Derive stable owned keys from issue/artifact kind/method, for example `review.specification.sar`, `review.specification.xpr`, `review.implementation-plan.spr` and `review.implementation-plan.xpr`. Never mint keys per round or restart. All logical artifacts/instances of one kind/method share that summary with explicit activeInstanceId and lineage. Path renames and replacement IDs do not mint comments. A hydration-plan review uses its own kind only if actually performed; no extra review is invented for the four-summary #1901 fixture. GitHub numeric IDs identify exact remote comments.

Each summary has the requested issue/artifact/type title, then File Under Review linked to exact reviewed bytes, outcome, known identities/effort, qualified joint elapsed, ordered round table with immutable response/disposition links, and complete record/manifest links. Earlier SPR keeps its predecessor link when later XPR revises the artifact; no transferred acceptance.

Publication is a resumable transaction:

1. Commit all evidence and verify its remote blobs/manifests at an immutable origin commit. A local commit or successful push response alone is insufficient.
2. Derive the summary from the verified record.
3. Exhaustively discover the owned key and validate current bytes/ownership; create, update or no-op through the governed comment writer.
4. Read back exact identity and bytes. Reconcile an ambiguous response before another mutation. Duplicate markers and unrecognized human modifications refuse overwrite.
5. Update issue discovery against a fresh body base after comment verification. Journal partial completion so retries resume safely.

Nonterminal summaries may cite published drafts labeled accordingly. Unpublished local evidence cannot appear as a durable accepted artifact. Publication failures retain evidence and report pending state. Permit at most three guarded attempts per effect; persistent drift is a conflict.

Standalone ai-peer-review must emit the selected ai-peer-review.review-publication/v1 envelope and versioned verifier result. AITM consumes that interface, with capability/version handshake and deduplication identity. Disable separate round, author-response, manifest and acceptance comment emitters only after compatible replacement publication is active. Define old/new producer compatibility tests and verify the actual standalone package integration. Updating an AITM skill alone cannot satisfy this requirement. Standalone work needs its own explicit repository deliverable; enable new default publication only after the compatible integration is available.

## Publication ordering and concurrency boundary

Every request binds manifest identity, publicationRevision, previousRecordDigest, expected comment ID or explicit absence, expected prior body digest and proposed body digest. Extend the governed owned-comment transaction with these preconditions; marker-only updates are insufficient.

Serialize managed effects through one configured authority host per repository, using authenticated runtime identity, existing shared physical authority and its canonical mutation lock across worktrees. Other hosts can prepare evidence but refuse publication with publication-authority-host-mismatch. Unavailable shared storage/identity refuses instead of creating a private lock. No automatic failover while an effect is unresolved: transfer requires verified termination/fencing of the old publisher, reconciled remote action and explicit new authority. A lease expiry alone cannot fence an uncertain in-flight write.

Under the lock, validate lineage and exact remote baseline, then durably reserve one effect before transport. Identical revision/manifest/body is a live-verified no-op. Lower revisions are stale; reused revisions with different bytes or mismatched previousRecordDigest are divergent. Refuse both. Higher revisions must extend the accepted previous record and match remote identity/digest. Unknown markers or changed human bytes refuse. Reconcile pending effects before another transport call or authority handoff.

This prevents delayed round 2 from overwriting round 3 among managed writers. GitHub provides no supported multi-object CAS here: arbitrary human/API edits can race between read and write. Fresh-base/read-back detects available drift but cannot guarantee absolute no-overwrite across that gap. Preserve observed originals and pending proposal bytes, report detected post-write drift/conflict, and never claim global exactly-once. Exactly-one is a managed-writer invariant under the designated authority; external concurrent creates can produce duplicates that ordinary publication refuses and authorized preserved exact-ID migration resolves. Tests cover two managed publishers, stale requests, ambiguous-create restart, blocked authority transfer, external concurrent creation and human-edit races. No silent cleanup.

## Historical backheal transaction

The operator selects explicit issue IDs. Repository discovery cannot implicitly select all issues for apply. Closed issues remain closed, and board/lifecycle evidence is protected.

Inventory and preview capture exact body bytes/version/digest, exhaustive comment IDs/bytes/edit timestamps/ownership, state, artifact identities and available evidence, diagnostics, body diff, summary changes and proposed exact-ID retirements. Bind stable operation identity to selected scope and proposal digest. Preview grants no mutation authority.

Before writes, archive exact original body and every affected comment with IDs, URLs, timestamps, acquisition provenance and digests in committed records. Verify the published backup at immutable origin. Missing sources, incomplete pagination or failed backup verification refuse apply. Keep a durable journal in existing configured runtime storage; scratch is not the completed journal.

Apply requires authorization bound to reviewed scope and proposal digest. Retirement additionally requires explicit exact-ID authorization. Fresh-read the entire live scope immediately before each effect. Changed bodies/comments/ownership/state require a new preview, never a silently rebased authorized diff. Use governed transactions and exact read-back. GitHub has no multi-object CAS; expose partial state and revalidate under canonical local mutation locking before each effect.

Journal stages: inventoried, previewed, backup-published, applying, applied, retiring, verified, complete, conflict, rollback-pending and rolled-back. Record effect before/after digests, remote IDs, read-back and backup pointers. Recovery reconciles uncertain remote effects before retries. A second completed run is a no-op after live verification; later human edits are drift, not success.

Retirement is a dedicated governed exact-ID operation. It requires verified preservation, refuses protected comments/unknown content, and records deletion/read-back receipts. Preserve every referenced original before link rewriting. Resolve duplicate owned markers only through this migration lane; normal publication still refuses them.

Rollback restores original body or surviving comments only against expected current digests with fresh authorization and read-back. A deleted comment ID cannot be restored: explicitly authorized recreation preserves original ID in its receipt and never claims unchanged identity/timestamp. Never rewind protected lifecycle evidence or unrelated later edits. One issue's conflict does not invalidate completed independent operations.

Missing artifacts, incomplete review history, ambiguous ownership/acceptance, invalid digests/revisions, unknown user content and transport uncertainty produce non-destructive diagnostics. Never fabricate findings, timing, approval or provenance. Historical formatting needs no reopen, demotion, re-review or state advancement.

## Narrow migration admission and authorization

Ordinary issue-body/comment writers retain active-target/open-timer guards. Introduce a separate artifact-backheal service under one open, bound maintenance task and a branded migration capability. Only that owning task accrues timing; historical targets are never bound/resumed or lifecycle-mutated. An issue number, request file or reason cannot confer this capability.

A protected durable aitm.artifact-migration-authorization/v1 record on the owning task binds repository, operation ID, owning task, authentic human issuer/receipt, exact target IDs, proposal digest, published-backup manifest identity, permitted effect IDs/types, exact retirement comment IDs, issuedAt, expiresAt and active/revoked status. The supported host verifies a fresh human statement against that prepared scope. Unsupported hosts refuse; Full-Auto cannot mint destructive historical authorization. The human statement must match the printed exact scope/proposal/backup request rather than unrelated approval.

Before every effect, freshly validate authorization, authenticated owner session/worktree, deadline/revocation, unchanged scope/proposal/published backup and journal baseline. Mint an internal non-exportable branded capability for one effect, then invoke canonical transaction cores with exact expected bytes and protected-content checks. Ordinary callers cannot inject raw capability JSON or bypass session guards. Allowed effects are metadata-only body transformation, authorized owned-summary create/update and separately listed exact-ID retirement. Timing, commit, transition, AC/VC/DoD, approval and delivery mutations remain forbidden.

Consumption is per effect ID. Verified effects cannot rerun; indeterminate effects reconcile first. Partial resume may finish unchanged remaining scope before expiry. Expiry/revocation blocks new writes while retaining evidence and unresolved operations. Renewal requires a fresh authenticated statement and preview validation; external drift requires a new proposal and authorization. Rollback needs separate authorization binding originals, expected current after-state and explicit recreation/restoration effects. Apply never implicitly permits rollback/deletion/recreation.

Journal transitions run under the shared authority lock. Each verified own effect advances expected baseline from before to exact after digest, including canonical body version and created IDs. Later effects compare against that evolved baseline, not indefinitely against the initial snapshot. Never adopt unrelated drift. State/closure and protected evidence remain equal to originals before and after every effect. A target conflict preserves other completed receipts.

Tests must invoke canonical admission for two closed targets under a different active maintenance task, ordinary wrong-target refusal, wrong/expired/revoked scope, invalid backup/proposal/retirement IDs, own-effect partial resume, unrelated drift, ambiguous transport and separately authorized rollback. This is a narrow new capability, not a state exception or general guard bypass.

## Runtime seams and reproducible reference fixtures

Seed the inventory with user-story-quality.mjs planReference/selectStoryIntentTask/resolveStoryIntent, decomposition-plan-exit-guard.mjs and decomposition-delivery-readiness.mjs, as well as previously named readers. None keeps separate precedence after migration.

Reuse runtime-storage.mjs physical-root/activation/path checks, evidence-v2/execution-context.mjs installed context, runtime-capabilities.mjs capability validation and issue-mutator-lock.mjs canonical serialization at the resolved shared root. Publication admission/pending-effect fencing is a new bounded integration, requiring genuine native authority identity rather than a caller's UUID. Current evidence-v2/journal-authority.mjs calls assertSyntheticContext and is rehearsal-only; do not call it for real issue 1939 or label it authenticated production authority. runtime-adapter.mjs's enrollment-specific lock is not the publication lock. Prove cross-worktree mutual exclusion, held-process safety and unresolved-effect refusal with the production facade; no private replacement lock or implicit store activation.

Capture #1901 fixture inputs from exact commit 5f35cf08c41bb8d9c482963e16a5313f44a973f6 through the GitHub API into tracked test fixtures, rather than requiring their paths on trunk. The author verified these raw source digests:

- docs/peer-reviews/1901/2026-10-09-durable-record-index.md: sha256:42b09b9beab7860ef795f6f7b38fe953aa0ac7c3d212c194151d8a4b61b54214.
- docs/peer-reviews/1901/2026-10-09-review-comment-consolidation.md: sha256:53e8854c78bec8c8ea16e1590418bdb280cbcb668462ee60bb7ea04cd8a60a55.

Retain exact source path/commit/digest and referenced archive inputs. Derived synthetic body/summary fixtures label the derivation and preserve original IDs/revisions; they are not exact historical body snapshots or live authority. Missing sources/hash mismatches refuse fixture capture. Capture is an implementation deliverable, not a claim this spec already added fixture files.

Historical backheal stays in this governing spec because #1939 requires it. Decompose admission/retirement/transactions into bounded later stories, after read/render/publication and with independent JIT review. Publication rollout never enables historical apply or waives its authorization/pilot gates.

## Rollout

Ship read support/conflict diagnostics first with legacy writers retained. Then ship dual-compatible writers and migrate every inventoried consumer. Remove redundant visible fields only after consumer parity and standalone integration pass. Update canonical templates/shared task guidance/supported Codex and Claude adapters. Legacy issues remain readable without forced migration.

Historical apply is opt-in. Use offline #1901-derived fixtures before any live pilot. A pilot needs its own preview/authorization, published backups, read-back, tested resume/rollback/conflict behavior and no-op second run. This planning session does not authorize it.

Substantive deep-dive body prose remains required. Durable links supplement it; linked-only gate support is outside this feature.

## Acceptance and verification

| #1939 criteria | Required evidence                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1, AC3       | Legacy/new/mixed contract and consumer parity; roles/revisions/task selection retained; invalid sources refuse                                     |
| AC2            | Three groups, review-first rendering and immutable links; display ordering cannot change authority                                                 |
| AC4, AC5       | Every review outcome/restart/round; exactly one owned summary per artifact/method; complete evidence and predecessor acceptance retained           |
| AC6, AC8       | Published backups, guarded apply, exact-ID retirement, resume, rollback limits, unchanged lifecycle, read-back and second-run no-op                |
| AC7            | Missing sources, ambiguity, concurrent edits, bad digests/paths/commits, unknown human content and partial pagination cause no destructive effects |
| AC9            | Writer/template/provider regressions and real standalone producer compatibility coverage                                                           |
| AC10           | #1901 fixture with grouped metadata and four summaries; every original round reachable; body deep dive retained                                    |

The vc:1–vc:4 suites in #1939 are acceptance coverage, not existing pass claims. Several named suites must be implemented. Retain current plan-metadata, decomposition, Story Intent, split-plan, comment, backfill and protected-comment tests. Add artifact-reference-contract, artifact-record-renderer, review-record-publication and artifact-record-backheal suites. Cover duplicate JSON keys, malicious Markdown/path/link input, stale accepted bytes, partial mixed migration, legacy-unpinned state, unpublished evidence, human edits and ambiguous remote outcomes.

Use isolated fake GitHub transport, real Git objects and a disposable remote to prove publication/backup availability and canonical guarded transactions. Assert effects and refusals, not only snapshot text. Include standalone payload fixtures and an actual compatible producer integration test in its deliverable.

Implementation Test retains npm test, test:slow, lint and format gates. This draft does not claim these commands ran or that feature ACs are complete.

## Decomposition and workflow preparation

This feature exceeds the current decomposition threshold of 24 hours or four independent tasks. Prepare a root WBS with bounded units: artifact contract/resolver; consumer migration; rendering/templates; durable review producer/publication; exact-ID retirement; backheal; integration/rollout. Exact estimates follow plan review. The initial XL/96 joint hours is provisional, not measured execution time.

The root owns integration. Each task needs specific Story Intent, owned paths, commands, dependencies and immutable source provenance. Standalone work must have an explicit cross-repository deliverable. Enumerate native children before hydration and use governed split-plan/create-issue paths, never duplicate task sets.

Follow spec review/revision to convergence, spec XPR, current Refine completion/R4P, JIT Plan, implementation-plan SPR and XPR, accepted-plan deep dive, hydration/refinement, current Story Intent and forecast/Plan approval, then guarded Plan-to-Develop admission. Preserve exact reviewed revisions. Full-Auto can satisfy ordinary approval boundaries under AITM policy; it cannot waive provider, decomposition, forecast, provenance or lifecycle guards.
