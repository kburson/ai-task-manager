<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cc015b243c3fe236325ac37f5899783f"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md"
artifact_commit: "a496af11f1112aca56fb97e89f0a756ce6a5beee"
artifact_blob: "ada83657013e8f57880978fbd1283fa9ad6b2c70"
artifact_digest: "sha256:9e7ebe80d3387a6e36e5c063ec95bc84737a2c722dfa64d8801adf60db107402"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3d308737198917155b2b574c699c7e626240c501fd5b1fa909c9ecc5234fb9a4"
  identity_source: "declared"
started_at: "2026-09-22T19:07:33.619Z"
submitted_at: "2026-09-22T19:13:10.822Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010","R1-F011","R1-F012"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The architecture is right and I endorse the shape: a separate, default-closed,
single-PR/single-operation delivery attribution exception is strictly better than
widening `aitm.workflow-exception/v1`, and refusing to rewrite accepted history to
preserve exact-head Test/Review/CI evidence is the correct trade. The authority
model (host-verified user message, digest-bound statement, fail-closed chain) and
the `attributionDisposition` truthfulness requirement are both sound.

I am requesting revisions because the spec describes a delivery pipeline that does
not match the one in this repository. I read it against the implementation rather
than against its own description of the implementation, and they diverge in four
places that would surface on the first implementation task:

1. The authorization adapter is Codex-only at the code level, and the spec never
   says so (R1-F001).
2. On the open-PR path - the only path that matters for #1755 - the subject list
   handed to preflight comes from local `origin/trunk..HEAD`, carries no SHAs, and
   is not the GitHub inventory the spec's evaluator is defined over (R1-F002).
3. A merge-commit exemption already exists and silently removes commits from the
   attributable set before the parser runs; a scope prepared over the raw GitHub
   inventory will be rejected by the spec's own "no extra mappings" rule
   (R1-F003).
4. The record and schema shapes named in the spec collide with live exact-key
   validators and byte bounds (R1-F004, R1-F005, R1-F006).

R1-F007 and R1-F008 are correctness-of-description issues in the authority and
governance sections. R1-F009 through R1-F012 are optional.

## Findings

### R1-F001 — The authorization adapter is Codex-only; the spec does not say so (required)

The spec says authority is resolved "through a supported Codex host user message."
Read against the code, that is not a preference - it is a hard exclusion:

- `validateAuthorizationSource` (`scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs:34`)
  requires `source.adapter === 'codex-session/v1'` exactly.
- `createCodexSessionSourceLoader` (same file, line 90) parses Codex rollout JSONL
  shape only: `event.type === 'response_item'`, `payload.type === 'message'`,
  `content[].type === 'input_text'`. A Claude Code transcript matches none of
  these, so `matches.length !== 1` and the loader throws
  `workflow-exception-authority:message-ambiguity`.
- `validateAuthorization` in `workflow-policy/exception-record.mjs:82-90` hard-codes
  `origin === 'codex-session-transcript'` and a `codex://sessions/...` reference
  regex.

AITM delivery is not Codex-exclusive - this repository ships a `claude` host
adapter and `.ai-peer-review.json` registers both. Consequence: an operator driving
delivery from a Claude Code session can never record this exception, and the
failure surfaces as an opaque `authorization-source-unavailable` blocker rather
than a statement of the constraint.

Required: state the Codex-only constraint explicitly in "Authority and operator
sequence"; specify the exact refusal an unsupported host produces; and say whether
a second adapter is out of scope for #1755 (acceptable) or in scope. If out of
scope, `prepare` should detect an unsupported host up front rather than producing a
request template that can never be recorded.

### R1-F002 — The open-PR path has no GitHub inventory and no SHA-to-subject pairing (required)

The spec defines the evaluator over "the entire ordered GitHub source inventory"
and requires "exactly one authorized mapping for every invalid subject," keyed by
SHA. On the open (unmerged) delivery path, that data does not reach preflight:

- `scripts/task-tracker/verbs/deliver.mjs:833-841` - when the PR is not merged,
  `commitSubjects` is
  `openSourceCommitSubjects(await listCommitSubjects({ range: 'origin/trunk..HEAD' }), ...)`.
  The inventory is local git, not the GitHub PR commit connection.
- `openSourceCommitSubjects` (`deliver.mjs:257`) returns a bare `string[]` of
  subjects with no SHAs attached; it filters by subject-string count, not by SHA.
- `validatePreflight` and `buildDeliveryCommitText` consume `commitSubjects` as
  `string[]` only (`delivery-attribution.mjs:3`, `INPUT_KEYS`).

A SHA-keyed mapping therefore cannot be resolved on the open path without plumbing
`(oid, subject)` pairs end to end: `listCommitSubjects` -> `openSourceCommitSubjects`
-> `preflightInput.commitSubjects` -> the evaluator. That is not "integrate
narrowly into `deliver.mjs`"; it is a change to the preflight input contract.

Two identical unattributed subjects on different SHAs are also unresolvable today
for the same reason, and a 111-commit branch is exactly where that happens.

Required: (a) name the authoritative inventory for each path (open, merged,
historical-reconstruction); (b) if GitHub is authoritative on the open path, say
that the local range and the GitHub inventory must be reconciled and that any
divergence fails closed; (c) add the `(oid, subject)` plumbing to the
implementation-files list with the input-contract change called out.

### R1-F003 — An existing merge-commit exemption is not accounted for (required)

`classifySourceCommitSubjects` (`deliver.mjs:208-250`) already removes some
unattributed commits from the attributable set: for any subject matching
`isUnattributedMergeCandidate` (contains neither `[` nor `#`), it inspects the
commit and, if it is a verified true merge (2+ distinct valid parents, title
matches), drops it from the subject list entirely. The strict parser never sees it.

This interacts badly with the spec's mapping rules in both directions:

- A scope prepared from the raw GitHub inventory will include those SHAs. If the
  operator maps them, the evaluator sees mappings with no corresponding invalid
  subject -> "extra mappings" -> refusal. If the evaluator instead runs
  pre-classification, they are unmapped invalid subjects -> refusal. Either
  ordering fails unless the spec pins it.
- The heuristic is narrow: `isUnattributedMergeCandidate` returns false for any
  subject containing `#`. A merge subject like
  `Merge PR #1724: MCP adapter architecture and review experiment evidence` (an
  actual commit on this trunk, `94c32e12`) is therefore not exempted, reaches
  `tokensFromSubject`, finds no `[#N]` marker, and throws. Merge commits of that
  shape need real mappings.

Required: state explicitly that the excepted set is computed after
`classifySourceCommitSubjects`, over the post-classification subject list; state
that verified-merge-exempted SHAs must not appear in the mapping; and note that
`#`-bearing merge subjects are not exempted and do require mappings. Without this,
`prepare` will emit a scope that `deliver` refuses.

### R1-F004 — Intent/receipt schema versions are unnamed and collide with exact-key validators (required)

The spec says "versioned delivery intent and receipt schemas carry
`attributionDisposition`." The live surface:

- `INTENT_SCHEMA = 'aitm.delivery-intent/v1'` - there is no v2
  (`delivery-records.mjs:7`).
- `validateIntent` enforces `hasExactlyKeys(intent, INTENT_KEYS)`; any added field
  on v1 is a hard `intent-keys` error (line 229).
- Receipts are v1/v2, where v2 is selected solely by the presence of
  `metadataWarnings` (`buildDeliveryReceipt`, lines 330-340).

Unspecified and load-bearing:

- The new schema ids (`aitm.delivery-intent/v2`, `aitm.delivery-receipt/v3`?).
- Whether `attributionDisposition: 'passed'` is written on every new record (which
  changes bytes for all ordinary deliveries and forces every reader forward) or
  only on waived ones (which keeps v1 emission unchanged). I recommend the latter
  and ask the spec to say so.
- How a waived record composes with receipt v2's `metadataWarnings`, since a
  merged-path delivery can already carry `missing-source-attribution`. Can a
  receipt be both `waived` and warning-bearing, and under which schema?

Required: name the schemas, state the emission rule, and state the
waived-plus-metadataWarnings composition.

### R1-F005 — Retry equivalence must include the new fields (required)

"Retry is allowed only when these bytes and the preexisting intent are unchanged"
is enforced today by `AUTHORIZED_INTENT_KEYS`, duplicated in two places:
`delivery-records.mjs:78-87` and `deliver.mjs:85`. Neither includes any
attribution-disposition or exception-reference field.

If the new fields are not added to both lists, a pending `passed` intent and a
`waived` re-evaluation hash-match as "unchanged," and the retry proceeds under the
wrong disposition - precisely the truthfulness property the spec's last section
exists to protect.

Required: state that the exception record id, operation id, scope digest, and
disposition participate in intent equivalence, and that both
`AUTHORIZED_INTENT_KEYS` sites are updated (or unified).

### R1-F006 — The full source inventory will not fit a GitHub comment (required)

The record is specified to carry the "ordered `(SHA, subject)` source inventory and
digest." For the 111-commit case the spec itself names, with
`MAX_SOURCE_SUBJECT_BYTES = 1024` (`delivery-attribution.mjs:6`), that is up to
~118 KB of inventory before envelope and JSON escaping.

Local bounds do not catch this: `MAX_COMMENT_BODY_BYTES = 1024 * 1024` and
`MAX_RECORD_JSON_BYTES = 256 * 1024` (`delivery-records.mjs:20-21`). GitHub itself
rejects issue-comment bodies over 65,536 characters, so the failure lands at the
`gh api` POST as an opaque 422 after the operator has already produced a
host-verified authorization statement - the most expensive possible place to fail.

Required: bound the record. Recommendation: persist the digest plus the excepted
`(SHA, subject, issue)` entries only, and define the digest over the full inventory
(which is recomputed live at delivery anyway, so the full list need not be stored).
If the full inventory must be stored, specify explicit spill/segmentation and a
precomputed-size refusal that fires during `prepare`, not during `record`.

### R1-F007 — "Refuses any injected statement" misstates the implementation (required)

`createCodexSessionSourceLoader` does not refuse an injected statement. It filters
blocks for which `isInjection(block.text)` is true out of the concatenation, then
hashes the remainder (`authority-resolver.mjs:113-121`). Refusal is indirect: the
filtered statement hashes differently from what the operator hashed, producing
`authorization-source-mismatch`.

That is still fail-closed, but it has an operator consequence the spec must pin
down: which digest does the operator put in the authorization statement, and which
does `record` compare? If the operator hashes the text as typed while the loader
hashes the filtered text, every statement containing an injection-flagged fragment
blocks with a mismatch that reads like a typo. If the operator hashes the filtered
form, an injected statement can verify.

Required: describe the filter-then-hash semantics accurately, and state that the
canonical proposal digest quoted in the user statement is the one `prepare` prints
and that `record` compares it against the loader-derived hash.

### R1-F008 — Governance framing and visibility (required)

Two problems in "Problem and boundary":

1. Conflation. `delivery.commit-provenance` in `workflow-policy/catalog.mjs:24` is
   not the gate being waived. That requirement covers move-state transition-commit
   provenance (`task-snapshot.mjs:122`, `move-state-core.mjs:460`, diagnostics
   `commit-provenance-missing` / `-mismatch`). The gate this feature waives is the
   unconditional preflight predicate `source-attribution-conflict`
   (`delivery-preflight.mjs:164-180`), which is not a catalog requirement at all.
   The spec's sentence is true but for the wrong reason, and the wrong reason will
   send the implementer looking for a catalog hook that does not apply.

2. Visibility. Because the new exception lives outside `aitm.workflow-policy/v1`,
   `assertConsumerCoverage` (`workflow-policy/consumer-coverage.mjs`),
   `snapshot.mjs`, and the `workflow-preflight` verb will continue to report
   delivery as fully gated while an active waiver exists. That is a governance
   blind spot in a feature whose whole premise is truthful records.

Required: correct the framing, and state how an active delivery attribution
exception is surfaced to `workflow-preflight` / policy snapshot consumers - or
state explicitly that it is deliberately out-of-band, and why.

### R1-F009 — Which preflight entry points are in scope (optional but load-bearing)

`delivery-preflight.mjs` has four attribution call sites, not one:
`validatePreflight` open (line 366), `validatePreflight` merged (same line, via
`buildExternalRecoveryCommitText`), `validateHistoricalRecoveryPreflight` (line
444), and `validateHistoricalReconstructionPreflight` (line 530). The spec says
"integrate narrowly into `delivery-preflight.mjs`" without naming which.

Suggest: state that the exception applies only to `validateDeliveryPreflight`
(open, governed merge), and that the merged/historical recovery paths retain their
existing `metadataWarnings` behavior unchanged. Otherwise two independent waiver
mechanisms overlap on the same record.

### R1-F010 — Lifecycle vocabulary drift (optional)

The established surface is `record|show|revise|revoke`
(`command-surface/catalog.mjs:861-864`). The spec says "revoke and supersede" and
documents "prepare, explicit authorization, record, show, revoke" - dropping
`revise` and introducing `supersede` as a lifecycle verb. Align with the existing
vocabulary, or say deliberately why this record type differs.

### R1-F011 — Pin the inventory order (optional)

The digest is defined over an "ordered" inventory but the order is never named.
GitHub's `commits(first:100, after:)` connection yields oldest-to-head
(`deliver.mjs:1280`, confirmed by the `commits.at(-1)?.oid === expectedHeadSha`
assertion at line 1357); `git log`-derived local subjects are newest-first unless
reversed. Name the canonical order (suggest oldest-to-head, matching the GitHub
connection) so the digest is reproducible across paths.

### R1-F012 — Canonical-but-wrong tokens (optional)

The spec classifies subjects as "lacking valid canonical attribution," which maps
to what `tokensFromSubject` throws on: no marker, malformed marker (`[#0]`,
`[#abc]`), or duplicate semantic token. A subject carrying a well-formed but wrong
token (`[#999]` on a #1755 branch) parses fine, takes no mapping, and leaks `#999`
into the resulting `attributionTokens` and into the merge commit message.

Suggest one sentence saying wrong-but-canonical tokens are out of scope and are
retained verbatim, so the implementer does not invent a second mapping mode.

## Required changes

1. R1-F001 - State the Codex-only authorization constraint and the
   unsupported-host refusal; decide in/out of scope for a second adapter.
2. R1-F002 - Name the authoritative inventory per delivery path; require
   local/GitHub reconciliation on the open path; add `(oid, subject)` plumbing and
   the preflight input-contract change to the implementation scope.
3. R1-F003 - Pin the evaluator to the post-`classifySourceCommitSubjects` subject
   list; exclude verified-merge-exempted SHAs from the mapping; note that
   `#`-bearing merge subjects still require mappings.
4. R1-F004 - Name the new intent/receipt schema ids; state whether `passed` is
   emitted on ordinary deliveries; define waived-plus-`metadataWarnings`
   composition.
5. R1-F005 - Add exception record id, operation id, scope digest, and disposition
   to intent equivalence, covering both `AUTHORIZED_INTENT_KEYS` sites.
6. R1-F006 - Bound the record: store digest plus excepted entries, or specify spill
   plus a size refusal that fires at `prepare`.
7. R1-F007 - Describe filter-then-hash authority semantics accurately and pin which
   digest the operator quotes.
8. R1-F008 - Correct the `delivery.commit-provenance` framing and state how an
   active exception is surfaced to policy reporting.

## Optional suggestions

1. R1-F009 - Scope the integration to `validateDeliveryPreflight` only and say the
   merged/historical paths are unchanged.
2. R1-F010 - Align lifecycle vocabulary with `record|show|revise|revoke`.
3. R1-F011 - Name the canonical inventory order (oldest-to-head).
4. R1-F012 - State that wrong-but-canonical tokens are out of scope and retained.

## Decision

revisions-requested
