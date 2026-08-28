# Round 2 Reviewer Review — Claude

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/plans/2026-08-23-1381-governed-delivery-convergence.md`
- **Reviewed commit:** `86a9fbfc27f1e2880bb2ace40c4402d86bd3cad3`
- **Decision:** accepted
- **Required supplements:** none active; none to acknowledge.

## Scope of review

Independent implementation-plan review only. No implementation, plan edit, or
artifact mutation was performed. Evaluated against the author's nine submission
questions: complete spec coverage without policy drift; task/file/interface/command
accuracy against the current repository; test-first ordering and independently
verifiable commits; separation of historical accepted-SHA recovery from current-head
provider behavior; exact close idempotency and Incorporated-ledger authorization;
#1403 sequencing and worktree governance; preservation of the accepted spec's
Claude findings F-001–F-004; the live reused-branch PR A → PR B acceptance with
idempotent closure of PR A by immutable accepted SHA; and the prohibition on
successor guard defects. Measured against the normative spec accepted at
`bc079275f96e1c01e78b41127809c00e349c2426` and my round-2 spec review.

## Verification performed

Repository claims were checked by file read, not shell (arbitrary Bash is blocked
during the reviewer turn; only co-review commands are authorized). Every load-bearing
claim I could inspect held:

- **Task 1 moved symbol.** `resolveAcceptedDeliveryHead` and `requireDeliveryReceipt`
  exist in `scripts/task-tracker/lib/close-delivery-receipt.mjs` with signatures
  matching the plan's interface contract (accepted-evidence validation over
  `localHeadSha`/`testReceiptSha`/`reviewReceiptSha`/`agentReviewPassed`; receipt gate
  over issue/lineage/branch/acceptedSha/PRs/records). The module already carries a
  `@story #939` header and "Task 1 projection" comment, so the plan's Task numbering
  aligns with in-place scaffolding rather than inventing it.
- **Task 4 disposition surface.** `scripts/task-tracker/lib/terminal-disposition.mjs`
  exports `TERMINAL_DISPOSITIONS = ['Delivered','Replaced','Discarded','Duplicate']`
  and `writeTerminalDisposition`/`writeTerminalStatusDone`. The plan's "extend
  TERMINAL_DISPOSITIONS" (Task 4) and "reuse the terminal write helpers" (Task 6) are
  accurate. `.ai-task-manager/project-fields.json` carries those four disposition
  options in the exact `{name,color,description}` shape Task 4 Step 5 appends
  `Incorporated` to; `BLUE` is used by no existing disposition option, so the added
  option introduces no color collision.
- **Per-issue coverage completeness.** Tallied Task 9's dispositions against the
  19-issue baseline: superseded/read-only #1378,#1379,#1386,#1387 and Delivered
  #1399,#1401 (Step 3); recover-then-close #1389,#1392 (Step 4); reused-branch close
  #1397 (Step 5); close-Delivered #1393,#1395 (Step 6); Incorporated
  #1380,#1382,#1383,#1384,#1388,#1390 (Step 7); #1403 (Step 8); #1381 itself (Step 9).
  That is 19 distinct baseline issues plus the convergence story, non-overlapping,
  matching the accepted spec's Required-Outcomes families.

## Findings

All findings are **advisory and non-blocking**. None alters the accepted decision;
each is recorded for the execution worker (Tasks 1–9) or a future maintainer.

### [finding:F-001] Repository interface accuracy independently confirmed (positive)

The plan's file, symbol, and interface claims are precise against the live tree on
every point I could verify by read (Task 1 moved resolver + receipt gate, Task 4
terminal-disposition set and project-field shape, Task 6 terminal-write reuse).
The plan legitimately "chooses file names, interfaces, task boundaries, and test
surfaces without changing policy," and the Specification Coverage and Global
Constraints tables faithfully restate the accepted spec — immutable accepted SHA,
exact-head PR selection, `gh pr merge` prohibition, Incorporated never satisfying a
receipt gate, ledger approval separate from spec/impl approval, and fully read-only
converged retry. No policy drift detected.

### [finding:F-002] Terminal state of #1399/#1401 is assumed, not stated, in Task 9

Task 9 Step 3 says "preserve #1399/#1401 as Delivered ... do not rewrite their
records, dispositions, or timing," and Step 6 ("Close remaining Delivered issues")
names only #1393 and #1395, explicitly noting #1397 closed in Step 5 but never
mentioning #1399/#1401. This is coherent only if #1399/#1401 are already CLOSED
(terminal), not merely Delivered-disposition on still-open issues. If either is open,
it is a "remaining Delivered issue" with no close step and the Step 8 verifier's
"one outcome for all 19 baseline issues" would fail-closed on it. The design is
self-guarded by that verifier, so this cannot ship silently wrong — but recommend the
execution worker confirm and record #1399/#1401's already-closed terminal state
before Step 6 so completeness does not rest on an unstated assumption. No plan change
required.

### [finding:F-003] Task 4 ledger fixture reuses PR #1385 as #1382's carrier — legitimate but should be annotated

The strict ledger example (Task 4 Step 1) sets issue `#1382` with `prNumber: 1385`,
`acceptedSha: e810084f…` (shared with #1383), `prHeadSha: ac36528f…`, and
`codeOnTrunkBasis: 'carrier-pr'`. The accepted spec's PR baseline assigns PR #1385 as
#1389's exact-head delivery. Both hold simultaneously: PR #1385 is #1389's exact-head
carrier and #1382's *cumulative* carrier — which is precisely the "incorporated =
retained on trunk without issue-local exact-head authority" phenomenon, and the
differing `prHeadSha` (≠ accepted SHA) correctly shows #1382 is not exact-head. The
fixture is internally sound, but its dual-role SHAs read like a copy-paste error at a
glance. Recommend annotating the fixture's carrier/exact-head duality, and — since
Task 9 mandates a live re-read of every issue/PR/trunk observation — reconciling the
illustrative hex values against the real baseline at execution so the durable ledger
carries observed, not fixture, SHAs.

### [finding:F-004] New command surfaces unverifiable under reviewer-turn Bash restriction (scope note)

The plan invokes several CLI surfaces I could not execute (the reviewer turn blocks
arbitrary Bash): pre-existing `npx aitm issue-body … --operation-file` in the
governance gate, and new `npx aitm incident-ledger`, `npx aitm close --as
incorporated --of`, and `verify-delivery-incident-reconciliation.mjs`. The new verbs
are correctly wired into the command-manifest, help, provider-parity, and
skill-version-stamp gates (Task 5, Task 8), which is the right discipline for adding a
verb. Existence and exact flag semantics of the pre-existing `issue-body` operation-file
mode rest on the author's Test-stage full-suite run. This is a boundary of my review,
not a defect I found.

### [finding:F-005] Accepted-spec advisories F-001–F-004 carried forward faithfully (positive)

The "Claude Review Advisories Carried Forward" table maps each of my four spec
findings to explicit plan steps, all correctly placed: F-001 uses `npm run lint:md`
and never adds the nonexistent `lint:docs` (independently reconfirmed: `lint:md`
present, `lint:docs` absent); F-002 widens the hydrated #1381 summary to the full
converged set including #1380/#1382/#1383; F-003 records approval provenance and
standing Full-Auto policy state at each live close (Tasks 7, 9), making a policy
refusal distinguishable from a defect; F-004 proves #1382/#1383 shared-SHA rows stay
issue-keyed and collision-free (Tasks 4, 7, 9). No advisory was dropped or diluted.

## Assessment against submission questions

- **Complete spec coverage without policy drift:** Specification Coverage table maps
  every accepted requirement to tasks; Global Constraints restate policy verbatim in
  intent. Accepted.
- **Task/file/interface/command accuracy:** Confirmed on every read-verifiable point;
  remaining command-surface checks bounded by F-004. Accepted.
- **Test-first ordering and independent commits:** Tasks 1–7 each write a failing
  test, run red, implement, run green, and commit independently with `[#1381]`; Task 8
  is red-first parity + docs; Task 9 is live operation with no code commit, correctly
  excluded from the implementation-commit rule. Accepted.
- **Recovery vs current-head separation:** Task 2 splits `validateDeliveryPreflight`
  (current-head, sole provider-authorizing path, `headRelation==='current'`) from
  `validateHistoricalRecoveryPreflight` (advanced, read-only, `action:null`, never
  calls `buildProviderAction`). Accepted.
- **Close idempotency and Incorporated authorization:** Task 3 exact-retry contract
  with all-zero mutation spies and partial-transaction convergence; Tasks 5–6 keep
  record/approve as distinct authenticated invocations and require an approved ledger
  row before any Incorporated terminal effect, with cumulative trunk presence barred
  from the ordinary receipt gate. Accepted.
- **#1403 sequencing and worktree governance:** Pre-implementation gate + Global
  Constraint + Task 9 Step 8; each live close binds and resumes the issue's recorded
  governed worktree without relocation. Accepted.
- **F-001–F-004 preservation:** See F-005. Accepted.
- **Reused-branch PR A → PR B with idempotent PR A closure:** Task 7 deterministic
  harness (A→B, close A retry, all mutation counts flat; standing-Full-Auto-disabled
  variant fails before terminal effects) and Task 9 Step 5 live on #1397/PR#1398 (A)
  and #1401/PR#1402 (B). Accepted.
- **No successor guard defects:** Global Constraint 1 + Specification Coverage row +
  final checklist. Accepted.

## Decision

**accepted.** The plan is a faithful, test-first decomposition of the accepted
specification with no policy drift. Its repository interface claims are precise on
every point I could verify by read, its per-issue disposition coverage is complete
and non-overlapping across the 19-issue baseline, its mode separation and idempotency
contracts match the spec, and all four carried-forward spec advisories are correctly
placed. The five findings above are advisory refinements for execution and a
maintainer's clarity, not blocking defects.
