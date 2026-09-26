<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e9e2aa0015cbae662dfb0e828179b031"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "34ccf5450d56b0e973c1aeb298759f070493fb13"
artifact_blob: "5650a855fa5117dfcfbca926519c5aeecaba13e3"
artifact_digest: "sha256:61145d35efc7b0404d39a0bd26bf61620bd98206dbac4b32e9ae2f5af3a22475"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:290f380b468b3c8b3ed7fcb5ee7a936dccade3481b185d9c0614cd38f3826e76"
  identity_source: "runtime"
started_at: "2026-09-25T21:12:37.511Z"
submitted_at: "2026-09-25T21:26:32.850Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted all five findings' underlying defects and revised the spike specification.
The design now extends the existing action-capture interception boundary with a
separate metadata-only usage sink, specifies shell/synchronous launch coverage,
and requires shared-root reachability and a participant manifest. The user-required
Git common-directory root is retained with an explicit narrow repository-rule
exception assigned to implementation.

## Finding dispositions

- **R1-F001 — Accepted.** Added "Relationship to existing action capture" with a
  concrete extension decision: one reused PATH shim, separate usage sink and
  schema, repository-level usage enablement without active-issue dependency,
  explicit no-body behavior, independent legacy capture policy, and a four-mode
  compatibility matrix. Reuse executable resolution, argv/stdin extraction, signal
  and exit handling. Do not reuse payload writers or global sequence locks.
  Classification requires safe handling of unsupported documents instead of
  inheriting the legacy regex's default-to-query behavior. Usage reports never
  import action-capture records as additional calls.
- **R1-F002 — Accepted as a rule-conflict finding; alternative root declined.**
  The user expressly requires `.git` common-directory storage. That instruction
  overrides the general repository convention. Goal 2 now acknowledges that the
  main-worktree `.tmp` root is shared. The spec states why the requested root
  is retained and supplies the exact narrow `CLAUDE.md` exception to implement.
  No other `.git` writes are authorized. This review changes only the spec and
  protocol response; the rule amendment belongs to the implementation story.
- **R1-F003 — Accepted.** Added pre-enrollment create/append/flush/read probing in
  the real runtime permission context; distinct confirmed sandbox denial and
  otherwise-unclassified access-denial categories; no bypass or alternate staging
  root; operator-arranged subtree access or a disclosed permitted-only cohort.
  Decision-grade baselines require a participant manifest maintained outside the
  failing collector path, counting denied/missing/unknown participants and labeling
  fleet/concurrency estimates as lower bounds. The reviewer's scoped-host denial
  is evidence of a possible population bias, not proof that every Codex/Claude
  runtime has the same permissions; the spec checks each actual runtime.
- **R1-F004 — Accepted.** All 25 shell GraphQL sites remain in scope as opaque
  invocations through the existing shim. Launch coverage includes the CLI shell
  route and a documented measurement launcher for standalone entry points.
  Unlaunched standalone calls and PATH bypasses remain explicitly uncovered.
  AC1 now requires shipped Node and shell scans plus transport/launcher tests.
- **R1-F005 — Accepted.** Synchronous parents are observed through the same shim,
  which finishes and flushes before normal exit. The spec requires a real
  synchronous-caller/fake-gh integration fixture asserting a record exists when
  `execFileSync` returns. No promise is made that an async parent callback can
  flush after a synchronous process exits.

## Changes made

All revisions are in the reviewed spike specification. New acceptance criteria
cover action-capture compatibility, shell/synchronous execution, the narrow rule
exception, shared-root access, and baseline participant accounting.

The optional suggestions were also assessed:

1. Reuse the existing parsers/boundary where behavior matches, with safe telemetry
   classification for unsupported documents and no silent changes to legacy
   consumers. The existing mutation regex alone is not a GraphQL parser.
2. Header absence now has a transport-specific reason. Do not add `--include`
   where it would alter business stdout; direct HTTP can read existing headers.
3. No equality between augmented and original cost is claimed. Record overhead
   as unknown until a controlled comparison demonstrates otherwise; no extra
   per-observation request is introduced.
4. Add run-configured soft-cap warnings and periodic retained-byte reporting;
   no silent truncation or deletion. Operator pauses/cleanup create coverage gaps.
5. Require governed issue creation/refinement with Size and Estimate before
   implementation. This review does not create an issue or begin Develop.
6. Require two enrolled, permitted worktrees over a declared overlapping 60-minute
   collector window, with traffic observed from both and activity duration
   disclosed. The window is not presented as continuous request activity.

## Declined changes and rationale

Declined moving usage storage to main-worktree `.tmp/aitm`: the explicit user
requirement governs. Accepted the need to acknowledge that viable alternative
and amend the repository rule narrowly during implementation.

Did not replace legacy action capture or silently tighten its existing payload
policy. Usage-only mode never enables it; independently enabled legacy capture
keeps its separately disclosed behavior. The usage sink itself persists no
payloads. A broad migration of #1295 is outside this spike.

## Verification

Read and checked the cited implementations: `action-capture.mjs` root and
active-issue bootstrap (lines 115-118 and 194-230), argv/stdin extraction and
classification (44-93), the complete `action-capture-bin/gh` signal/stream/exit
path, the synchronous call in `verify-priority-p3.mjs:43`, and `CLAUDE.md:154`.
Source search confirmed 25 `gh api graphql` occurrences in
`init-project-config.sh`, and current action-capture bootstrap use in
`bin/aitm.mjs:97`. The new launcher wiring is a specified implementation change,
not a claim that all routes already have it.

The revised specification passed Prettier and targeted Markdown validation under
repository rules; whitespace checks passed. The editable response body passed
the same Markdown rules. Whole-response lint misparses the package-protected
frontmatter after its leading comments as setext headings (six template-related
diagnostics); protocol metadata was preserved, and only the editable body was
linted separately. Protected response frontmatter is unchanged. No runtime implementation or epic file was edited,
no issue was created, and no live GitHub calls were made. The package's author
submit owns the protocol commit and reviewer handoff.
