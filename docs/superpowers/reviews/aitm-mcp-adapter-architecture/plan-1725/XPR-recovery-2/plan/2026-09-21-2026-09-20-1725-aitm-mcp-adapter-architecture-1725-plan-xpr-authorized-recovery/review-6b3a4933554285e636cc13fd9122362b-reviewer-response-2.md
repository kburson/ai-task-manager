<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-6b3a4933554285e636cc13fd9122362b"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md"
artifact_commit: "7dedd176c7f2cd0234d9fda2aef9990d9d5ad7cd"
artifact_blob: "0f50110733422d4fa75b18cd694ca9337ab58421"
artifact_digest: "sha256:c3afe525cfce93f36259a957ae5d69e1289adfb6c003dac77022605717431520"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:fa6e722768770df083577a8f479f19eba98629e6a80a66a1b518833a80cecd95"
  identity_source: "declared"
started_at: "2026-09-21T10:11:04.769Z"
submitted_at: "2026-09-21T14:33:16.575Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the revised artifact at commit `7dedd176c7f2cd0234d9fda2aef9990d9d5ad7cd`
(digest `sha256:c3afe525cfce93f36259a957ae5d69e1289adfb6c003dac77022605717431520`)
against my turn-1 findings and the author's turn-1 response. All four required
changes are present in the artifact, not merely asserted in the response. I
verified each against the plan text and, where the plan names repository
artifacts, against the repository itself.

### Correction to my turn-1 arithmetic

The author is right. In my turn-1 summary I wrote that the seven allowances at
`package-boundary.test.mjs:224-236` sum to 9. They sum to **10**
(`1 + 2 + 2 + 2 + 1 + 1 + 1`), so the effective ceiling is `788 + 10 = 798`. The
ceiling figure, the "zero headroom" observation, and Findings 2 and 3 were all
derived from the 798 total and are unaffected. I appreciate the correction being
raised rather than silently absorbed.

### Verification of the four required changes

**RC1 — Gate E coupling. Resolved, and resolved at both sites.** Gate E now
reads "Task 20 depends on Gates A–D and its own host-assurance certification
before MCP replaces the legacy Full-Auto entry path," with the explicit
statement that "Tasks 17–19 depend on Gate D and are separately governed
external projects, not prerequisites for Task 20 or the core cutover." The
`Hydration and Execution Protocol` was corrected in step with it — "Core
children are approved serially through Tasks 1–16, followed by Task 20. ...
Phase 6 external children (Tasks 17–19) branch from Gate D and do not block
Phase 7 Task 20. Phase numbers group capabilities; the explicit gate
dependencies determine execution order." That second edit is what I asked for
and the part most easily missed: the old blanket "later phase children remain
blocked on the preceding delivery gate" sentence was the actual mechanism
creating the dependency, and it has been narrowed to core children rather than
left to contradict the new gate text.

The author also added a constraint I did not ask for and that is correct:
Full-Auto remains unavailable for any *configuration* whose selected adapters
and participating-port assurance are not certified. That preserves the
specification's guarded-or-strict threshold across every participating port
while decoupling the core GitHub/local-Git cutover from external funding.
Decoupling the delivery order without that clause would have been the wrong fix;
the plan avoids it.

**RC2 — Tasks 12 and 15 package-boundary reach. Resolved.** Both verification
blocks now run `npm test`, which selects the unit lane
(`package.json:21`, `--lane fast`) and therefore executes
`scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`. Task 12
additionally carries a new first step recording "the before/after packed
inventory and exact reviewed entry allowance for the new bin, runtime closure,
and dependency manifest changes under Task 4's per-child package policy" —
which is the right home for it, since Task 12 is the task that edits
`package.json` and `package-lock.json`. The author's note that
`npm pack --dry-run` is not treated as an assertion matches what the artifact
now does: the pack command remains for human inspection, with the assertion
carried by the test.

**RC3 — `scripts/benchmarks/` exclusion ordering. Resolved, via the stronger of
the two options I offered.** Task 3 now owns the exclusion in the child that
creates the directory: "Modify: `package.json` to exclude `scripts/benchmarks/**`
from packed files in this same child, before the benchmark directory is
introduced. Extend `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
to enforce that exclusion without increasing the entry ceiling." Its
verification block runs that test file directly. Task 4 now says "preserve Task
3's `scripts/benchmarks/**` exclusion" rather than introducing it, so the two
tasks no longer contend for the same edit, and Task 4's inheritance clause
gained "Task 3 already applies the same inventory discipline and gate, with its
benchmark excluded in that child; no task may defer its packed-file compliance
to a later task."

The "without increasing the entry ceiling" qualifier is the detail that makes
this correct rather than merely present: an excluded directory adds no packed
entries, so the measured 798 is unchanged and no headroom is quietly
manufactured for a benchmark that should never ship.

**RC4 — ADR 0001 §5 correction. Resolved, and now durable.** Task 4's ADR
amendment step carries "Correct ADR 0001 §5 to match the runner: fast is
unit-only and integration is a separate lane." The commitment has moved from the
review thread into the artifact, which was the entire point of the finding. The
surrounding step still preserves existing `scripts/` mappings, support-only
exclusions, and fail-closed package-wide discovery, so the correction is scoped
to the stale sentence rather than reopening the taxonomy.

### Verification of the four optional suggestions

All four were taken.

1. Task 1's verification block now runs `npm run lint` and `npm run format:check`
   and drops the `npm test` that exercised nothing it changes. The Global
   Constraint was widened to "Every in-repository child, including
   document-producing children," which closes the exemption I noted rather than
   patching only Task 1.
2. Task 20's block now groups `npm test`, `npm run test:integration`, and
   `npm run test:slow` before lint and format, matching Tasks 10, 13, and 16.
3. Task 4 now names the reproduction path: "Reproduce with
   `npm pack --dry-run --json`, parsed by `parseNpmPackReport` from
   `scripts/tests/helpers/npm-pack-report.mjs`." I confirmed that file exists and
   that `parseNpmPackReport` is its line-1 export with the
   `{ expectedPackageName, requireFilename }` options signature the
   package-boundary test already uses. The citation is accurate, not aspirational.
4. The `test:package` contract landed in the Global Constraints — external plans
   must define a script that "asserts their allowed runtime, manifests, and
   exclusions over the packed inventory; printing a dry run alone is
   insufficient" — and Tasks 17, 18, and 19 each invoke `npm run test:package`.
   The author's framing is honest: this is a contract for future external plans,
   not a claim that those repositories or scripts exist today.

### The two self-initiated completeness corrections

Both are disclosed in the response and both check out. Task 4's bucket
enumeration now reads "conformance/package/migration feature buckets," which
closes a real gap — Task 10 introduces `scripts/tests/slow/migration/kernel-cutover.test.mjs`
and the prior text approved no migration bucket for it, so the ADR amendment
would have been incomplete at the moment Task 10 needed it. Task 16's fixture
paragraph now distinguishes "the tracked source fixture `dist/adapter.mjs`" from
the harness-assembled installable package around it. That is a clarification of
an ambiguity, not a relaxation: the local-only status, the
never-in-the-core-tarball statement, the path-based prohibition, and the
`scripts/tests/**` exclusion assertion all survive verbatim.

The `Review status` → `Review history` header change is likewise an improvement
rather than a claim — it points at the retained SAR and XPR records and tells a
reader to consult the terminal XPR record for the outcome, instead of freezing a
SAR-only status that would be wrong the moment this review concluded.

### What I did not re-verify

I could not execute `npm pack --dry-run --json` in this session; the command is
refused by the session's permission mode. I verified the ceiling arithmetic and
the helper's existence and export from source, and I accept the author's
re-measurement of 798 current entries on their statement. Nothing in my
decision depends on that number being exactly 798 rather than near it.

I did not re-run the plan's Markdown, Prettier, or CSpell checks, and I did not
re-derive the plan's SHA-256. The artifact commit, blob, and digest recorded in
this response's protected frontmatter were bound by the protocol tooling, and
they match the digest the author reported.

I have no findings on this turn. The four required changes are in the artifact,
each is correct rather than merely literal, and the two unsolicited corrections
improve the plan. The one remaining observation is recorded below as optional
and is not a condition of acceptance — I would not hold hydration for it.

Decision: accepted.

Acceptance is scoped to this umbrella hydration plan. It is not approval to
implement any task, to create child artifacts before their own bounded
specifications and plans complete independent review, to run any live provider
certification, or to substitute for the human approval gates the plan itself
names. Phase 0 remains a hard gate whose failure returns the architecture to
design review.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. The `Final Program Verification` preamble still reads "Run only after every
   in-repository task has reached its own reviewed exit gate **and the external
   provider tasks have retained their independent certification results**."
   That is internally consistent — Tasks 17–19 are part of this plan, so the
   whole-program close does span them — but it sits one section below a Gate E
   that now deliberately decouples core delivery from external provider
   delivery. A reader scanning for "when can we ship" could take the preamble as
   quietly reinstating the coupling I raised in turn 1. Consider one clause
   distinguishing the two: the core release gate (Tasks 1–16 and 20) versus the
   full-program close that additionally awaits external certification. This is
   presentational; the gate semantics are already correct where they are
   normative.

## Decision

accepted
