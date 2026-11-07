# Exact audit authority for new estimate inflation

## Intent and boundaries

Issue #2163 prevents a new registered `inflate-estimate` publication from reporting drift caused by its own audit comment. Preserve exact comment bytes as source authority, normal admission, real final collection, immutable sealed intent and ordinary drift refusal. This independently useful 3h author forecast precedes #2159's separate 6h legacy recovery. These forecasts are not human estimates or measured promises.

Native owner: chat `01a1a434-10b4-7000-b141-081c19146a3b`, managed worktree `2163-inflation-intent/ai-task-manager`, branch `codex/2163-draft`, baseline `927c53d415102d75955cc66cc9ffc7a4774b9205`. Canonical bootstrap, genuine Start, supported missing-state reconciliation, draft-branch renewal, Refine and Plan entry completed. The first artifact-write attempt was refused because that active turn retained #2149's cwd. No artifact was written; supported attachment and the next native turn restored the aligned cwd, followed by ordinary resume. Preserve that refusal. The old #2149 checkout remains stopped. No #2155 mutation or activation belongs here.

The accepted governing specification is `docs/superpowers/specs/2026-11-05-2159-estimate-publication-reconciliation-sar-design.md`, r3 at commit `506a8580b05cf00ee1375572a2d44bb9abfd9ab9`, blob `c6b245e1bb82ce2b245e796b9a754535cf3cc978`, 41,600 bytes, raw SHA-256 `46c7207e6d31f6551a9971da776d08d84d9c80cbeaa863f1f1bba320eae2dd3f`. The author independently read its Git object and verified the digest, and read the final round-04 reviewer and author notes retained at `ac141e5fe`. This replaces the pending r2 intake reference without relabeling r2 accepted. R3's history anchor and nine-write recovery contract belong only to #2159. Production work still requires independent acceptance of this specification and its concrete plan, then actual native Full-Auto Plan approval.

## Source-grounded failure

At baseline, `scripts/task-tracker/verbs/inflate-estimate.mjs` reads REST comment `id/body`, prepares a full audit body in its effects callback and patches that numeric target. `scripts/task-tracker/lib/decomposition-authority.mjs::collectDecompositionCommentProposals` identifies a Planned Estimate proposal using the GraphQL opaque ID and hashes the entire comment. `scripts/task-tracker/lib/estimate-writer-publication.mjs::intendedPublishedRevisionInput` projects estimate/size but retains the old proposal source digest. The real final collector therefore observes the audit's new hash and refuses `final-authority-drift`.

Existing verb tests replace the forecast reader with an observation lacking that contributing proposal. The older `publication-subprocess.fixture.mjs` invokes internal functions and substitutes authority readers. Neither establishes the required registered-entry failure or correction.

Audit preparation chooses a timestamp separately from manifest creation in `decomposition-publication.mjs`. Crossing a date boundary can make a retry prepare different bytes. One creation timestamp must serve both boundaries and remain unchanged on retry.

These findings are the reproduction hypothesis. The mandatory original-source public-entry RED, captured before production edits, must confirm the named failure after actual effects. Setup, admission, parser and transport errors do not qualify.

## Chosen design

Keep the registered command and writer identity. Add the pure `scripts/task-tracker/lib/inflation-intent.mjs`, strict provider identity observation in the verb, a backward-compatible derive callback context, and propagation of the once-selected creation timestamp to publication. No reconciliation flag, archive, history reader, new writer, lifecycle permission or recovery behavior is introduced.

Removing audit bytes from source hashing would weaken authority. Accepting the final observed digest would bless unrelated drift. Instead, predict only the exact prepared comment's digest change and retain ordinary final collection.

### Provider identity correlation

`correlateInflationComment({subject, restComment, graphqlComments})` is pure and throws a specific inflation refusal on invalid input. `subject` is the existing repository/issue/project/item identity. The REST comment retains positive safe-integer `id`, nonempty opaque `node_id`, string `body` and `issue_url` naming the same repository/issue. The GraphQL array is the complete collected array; nodes retain opaque `id`, positive safe-integer `databaseId`, string `body` and `issue.number/repository.nameWithOwner`.

The transport reader proves complete pagination; an array or caller-supplied completeness flag does not prove it. The pure helper validates shapes, same-subject containment, duplicate opaque/numeric identities, unique dual-domain correspondence (`rest.id === graphql.databaseId` and `rest.node_id === graphql.id`) and byte-exact bodies. Missing, conflicting, foreign or ambiguous identities refuse. Equal bodies on distinct comments never establish identity. Return a closed `{repository, issue, restId, graphqlId}` object. Preserve numeric REST effect targets and opaque GraphQL proposal IDs.

The REST reader must stop swallowing malformed pages. Retain all required fields and parse every page strictly. The GraphQL observer reuses `loadForecastProjection` and its real pagination/record parsing, capturing raw comment nodes through its transport callback, without replacing `readForecast`. Validate comment issue identities on the first page and later pages. Incomplete/error/duplicate pagination refuses before any write. Recheck correlation against the freshly read comment used to prepare the audit. Existing initial-input and effect checkpoints remain responsible for read races.

### Predictive intended input

`deriveInflationIntendedInput({initial, proposal, commentIdentity, beforeBody, intendedBody})` returns a new intended input, without I/O or mutation of `initial`. Bodies are exact UTF-8 strings. For a new operation, the intended body retains the complete before-body prefix and appends only the package-prepared audit. Preparation rejects duplicate current-operation lines and ambiguous injected operation markers.

Parse both full bodies through `collectDecompositionCommentProposals`, with the original GraphQL ID and identical subject, issue-body and projection context. Use a fixed comparison context that exposes the Planned Estimate proposal even if confirmed publication metadata would retire it: no publication retirement and no published forecast for this semantic comparison. Require parser availability and equal proposal fields except sourceDigest. Added/removed proposals, changed hours/size/identity, duplicate headings and ambiguous Markdown refuse. This comparison does not grant authority or change actual retirement semantics. Actual contribution comes only from the initial authoritative forecast observation.

For actual initial proposals belonging to the mapped GraphQL comment, require their source digests to equal the full before-body hash and replace only those digests with the full intended-body hash. Preserve all other proposals and observations. Do not locate a proposal by equal body/digest, rename it or retire it. If the target contributes no proposal, still validate semantics but invent no source observation. Apply `intendedPublishedRevisionInput` to a cloned initial observation carrying only that substitution; recompute the forecast observation digest from its complete resulting value. The real post-write collector decides completion.

### Preparation, timestamp and retry

Extend the existing `deriveIntendedInput(initial)` callback with optional second context `{subject, operationId, createdAt, effects}`; one-argument consumers remain compatible. Effects are the already prepared package adapters. Select creation time once (`prior.createdAt` for a matching retry, otherwise one current ISO timestamp), pass it to effects and derivation, and pass the same value to `publishEstimateRevision` for the manifest. Other callers retain the default behavior. Validate a supplied timestamp. Update timestamps continue to describe actual writes.

The verb retains the exact before body, mapped identity and prepared audit in one invocation; derivation consumes the prepared audit effect value, without building it again. A matching prior's sealed intended digest continues to win before derivation. Never repair an old pending intent by replacing its digest. Audit generation preserves the original operation key/date; before-record and effect identity checks enforce exact intended bytes. Partial retries before/after audit, fields and metadata avoid duplicate business effects. Completed repeat remains write-free after existing readback. All-confirmed legacy pending operations continue to refuse with their sealed bytes intact for #2159.

### File ownership

Owned new files: `inflation-intent.mjs`, `scripts/tests/fixtures/inflation-public-entry-fixture.mjs`, `scripts/tests/fixtures/inflation-transport-provider.mjs` and `scripts/tests/integration/task-tracker/inflate-estimate-authority.test.mjs`. Sequential shared edits: `inflate-estimate.mjs`, `estimate-writer-publication.mjs`, targeted tests and the narrow supporting timestamp change in `decomposition-publication.mjs`. No concurrent #2159 edits; #2159 consumes delivered #2163 interfaces. No changes to generic hashing, publication ownership, final drift rules or lifecycle admission.

## Strict public-entry fixture

The reusable fixture exposes `run(argv, options?)`, `readState()`, `readLedger()`, `fault(spec)` and `close()`. Construction chooses an immutable original/candidate source tree and creates its own physical isolated Git family with a main repository and registered linked checkout. Real package code and physically present issue-numbered planning documents are used. Fictional repository/issue/provider/session data are explicitly automated fixture data. The registered Start establishes fixture binding/timing through production code; manually serialized state does not stand in for Start. Constructed guard subprocess payloads are not native host receipts.

Run executes that source's actual `bin/aitm.mjs` and retains argv, cwd, source identity, exit, stdout/stderr and timeout/termination status. Parser, Start/admission, collector, owner, adapters, versioned body writer and projection remain real. Only GitHub subprocess transport is replaced, within that fixture's environment. No host-wide transport/PATH, network fallback, canned guard verdict or authority/parser/publisher injection is permitted. Trusted bootstrap executables use their supported environment; fixture transport is installed only for isolated provider runs, not as host bootstrap proof.

The stateful provider validates each supported operation, variables and target. It models REST/GraphQL views of the same comments, complete pagination, issue/body versions, membership/fields, viewer and assignees. Unknown operations, fields, cursors and targets fail loudly. Every request and applied write has an ordered ledger entry with before/after state and outcome; both API views update consistently. A fault identifies a named request/effect checkpoint and one-shot phase: before application, after application before response, or controlled source mutation. Unsupported faults refuse. Reads return copies; close removes only its isolated resources after evidence export.

## Original RED and legacy handoff

Before any production edit, retain the failing original-source run in issue-numbered review evidence: commit/tree and executed-file hashes, fixture/source hashes, argv/cwd, exit/stdout/stderr, initial/final provider bytes and complete ordered write ledger. The test expects successful exact authority and must fail because the real command reports `final-authority-drift`, with actual audit/field effects and all six confirmed effects in a pending publication. Save exact publication marker, before-record marker, full audited comment and provider state for #2159. These bytes must be emitted by the original public command, never assembled by an independent encoder. Run an exact retry and prove unchanged sealed intent and no duplicate business effects.

Keep original RED immutable and candidate GREEN separate. Evidence hashes establish source identity, not native host admission. #2155 recovery remains outside this issue.

## Verification

Mandatory public cases: uninterrupted success and exact final collected/sealed digest equality; write-free completed repeat; partial retry around audit/size/estimate/fields and metadata boundaries; lost response after a possible write; legacy pending refusal with unchanged sealed bytes; contributing-comment, plan, scope, policy, project and effect drift; and zero unauthorized next writes. Assert exact bytes, targets and counts, not merely exits.

Identity/parser coverage: realistic distinct REST/GraphQL IDs, distinct comments with equal bodies, missing/mismatched/duplicate IDs, foreign subject, malformed/incomplete pagination, changed body bytes, legitimate prior audits, changed Planned Estimate fields, duplicate headings, injected operation markers and date-boundary retry. Pure calculations may have unit tests; required public cases use transport substitution only.

Run the issue's targeted integration/verb command, `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check` and commit verification. Focused pure intent/timestamp tests supplement these commands. No mandatory case may skip because its setup is difficult.

## Review and delivery

Use independent manual SAR requested as `gpt-6-astra` / `xhigh`, a fresh distinct reviewer with no inherited conversation, retaining the reviewer across revisions. Preserve exact input commit/blob/raw SHA-256, complete findings, author dispositions and final no-change response/disposition, then review the concrete plan. Requested settings do not attest observed per-turn model/effort; unavailable observations and authenticated joint timing remain unavailable. This is manual SAR, not sealed SPR/XPR or human Plan approval.

After applicable exact-byte acceptance and native Plan approval, execute TDD natively, fresh independent whole-branch Astra/xhigh review, required checks/CI and sanctioned delivery. Notify the coordinator before native Test; it serializes Test and owns Review/Close. If the fixture cannot reach the required failure without weakening admission, preserve and report the exact blocker. Do not call an admission error RED or drop coverage to fit the forecast.
