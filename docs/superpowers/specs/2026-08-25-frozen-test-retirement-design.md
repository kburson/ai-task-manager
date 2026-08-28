# Frozen Test Retirement — Bounded Pilot Design

Status: approved for implementation as a four-test pilot on 2026-08-25

## Context

AITM's test-corpus authority combines an immutable pre-move manifest with one
deterministic membership record per post-snapshot test. The immutable manifest
preserves the original 915-test census, source hashes, path migration, and Git
rename provenance. Current reconciliation treats every finalized frozen path as
permanent active membership.

Extracting the article publisher into `kburson/writing-studio` makes four frozen
AITM tests dead:

- `scripts/tests/unit/articles/publish-articles.test.mjs`
- `scripts/tests/unit/articles/diagram-drift.test.mjs`
- `scripts/tests/slow/articles/publish-articles-e2e.test.mjs`
- `scripts/tests/integration/task-tracker/maintenance/lint-article-citations.test.mjs`

## Current-trunk test-layout compatibility

AITM trunk's test-lane migration finalized the citation test at the integration
path above and moved the live corpus-authority tests and tree baseline beneath
`scripts/tests/integration/`. Frozen retirement authority follows each manifest
record's finalized path, not its intermediate migration path.

The retirement implementation therefore modifies the existing repository-wide
membership, package-corpus, tree-layout, and test-impact tests at their current
integration paths. New tests for one bounded retirement module, the local
graduation command, and the workflow text contract remain unit tests; isolated
filesystem, Git, and child-process fixtures do not become integration tests
solely because of those mechanics.

The immutable inputs are the current `origin/trunk` copies of
`scripts/tests/fixtures/test-corpus-pre-move.json` and
`scripts/tests/integration/meta/test-tree-layout.baseline.json`. The cleanup may
read their finalized paths but must not edit or regenerate either file.

Keeping those tests, skipped proxies, or replacement stubs in active `trunk`
would misrepresent the current package merely to satisfy a historical receipt.
Editing the frozen manifest would destroy its original audit claim. AITM needs a
way to delete a deliberately retired frozen test while retaining the retirement
decision long enough to reach canonical Git history.

## Decision

Add a deterministic, per-test frozen-retirement receipt. The receipt exists in
active repository content while retirement work is in flight and after its
delivery reaches `trunk`. A weekly repository workflow batches delivered
receipts into a cleanup pull request. After that pull request merges, the
receipt and its temporary evidence disappear from HEAD and remain discoverable
only in canonical Git history.

The immutable frozen manifest remains byte-for-byte unchanged. Active frozen
membership is the frozen path set minus retirements proved either by an active
receipt or a valid receipt in reachable `trunk` history.

This mechanism begins as a bounded pilot for the four publisher tests above.
After the first weekly cleanup pull request, the user will review its clarity,
churn, reliability, and maintenance cost before AITM treats the mechanism as a
general retirement pattern.

## Goals

- Delete dead tests from active `trunk` without weakening the immutable
  pre-move receipt.
- Support squash merges, rebases, fast-forward delivery, and merge commits.
- Keep retirement evidence active only until it is durable in canonical history.
- Batch receipt removal in one weekly pull request instead of adding a cleanup
  pull request to every delivery.
- Fail closed when canonical history or receipt evidence cannot be verified.
- Keep the first implementation limited to the four publisher-test retirements.

## Non-goals

- Retiring post-snapshot tests; they retain paired test/record deletion.
- Rewriting, pruning, or regenerating the frozen manifest.
- Keeping skipped tests, proxy tests, or permanent tombstone records in HEAD.
- Automatically merging the weekly cleanup pull request.
- Pushing automation commits directly to `trunk`.
- Deleting permanent project documentation or evidence outside the temporary
  retirement-evidence directory.
- Generalizing the pilot to every future frozen-test deletion before review of
  the first automated cleanup.

## Receipt storage and schema

Active receipts live at:

```text
scripts/tests/fixtures/test-corpus-frozen-retirements/
  <lane>/<source-relative-test-path>.json
```

For example:

```text
scripts/tests/fixtures/test-corpus-frozen-retirements/
  unit/articles/publish-articles.test.mjs.json
```

Every receipt has exactly these keys:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/articles/publish-articles.test.mjs",
  "reason": "Publishing subsystem extracted from the AITM package repository.",
  "lastLiveSha256": "64-lowercase-hexadecimal-characters",
  "evidence": "docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md"
}
```

Rules:

- `schema` is integer `1`.
- `path` is a canonical test path and a finalized path in the frozen manifest.
- The receipt path is derived deterministically from `path`.
- `reason` is a non-empty sentence.
- `lastLiveSha256` is the SHA-256 digest of the test immediately before its
  delivered deletion.
- `evidence` is a repository-relative Markdown path under
  `docs/evidence/temporary-test-retirements/`.
- The evidence file exists in the same active or historical commit as the
  receipt.
- One frozen path has at most one active receipt.
- A post-snapshot path cannot use a frozen-retirement receipt.

The receipt deliberately stores a content digest rather than a feature-branch
commit SHA. Squash and rebase delivery may replace branch SHAs, but the
pre-deletion test bytes remain recoverable from canonical Git history.

## Delivery-scoped lifetime

The receipt's lifetime is tied to delivery rather than a calendar date:

1. Active cleanup work deletes the dead test and adds its receipt and temporary
   evidence.
2. The change reaches `trunk` by squash, rebase, fast-forward, or merge commit.
3. The delivered `trunk` commit temporarily contains the receipt and evidence.
4. The weekly graduation workflow verifies that canonical history contains the
   receipt, evidence, deletion, and pre-deletion test bytes.
5. One batched pull request removes every eligible receipt and any now-unreferenced
   temporary evidence.
6. After that pull request merges, HEAD contains neither the dead test nor its
   audit files. Canonical Git history retains the story-era audit trail.

This makes the practical TTL the interval from delivery until the next
successful weekly graduation pull request. There is no per-receipt date field
and no cleanup pull request attached to each delivery.

## Active and historical hydration

For each frozen path missing from live discovery, reconciliation uses the
deterministic receipt path.

### Active receipt

If the receipt exists in HEAD, the loader validates its schema, deterministic
location, evidence, frozen membership, and `lastLiveSha256`. The missing test is
an intentional active retirement.

A receipt plus a live test is an error. The diagnostic directs the maintainer to
remove either the test or the receipt.

### Graduated receipt

If no receipt exists in HEAD, the history loader searches the canonical
`origin/trunk` ancestry for the deterministic receipt path. It must prove:

- a commit containing the valid receipt is reachable from `origin/trunk`;
- the evidence file exists in that same historical tree;
- canonical history contains the delivered deletion of `path`;
- the file immediately before that deletion hashes to `lastLiveSha256`; and
- the receipt was present in canonical history before its graduation deletion.

The loader may use commit and tree identities internally, but those identities
are discovered after delivery rather than embedded in the receipt.

If `origin/trunk`, the relevant commits, or required blobs are unavailable in a
shallow checkout, validation fails closed with a fetch-history instruction. It
must never convert missing history into an accepted retirement.

## Reconciliation model

The current flow becomes:

```text
immutable frozen manifest ─┐
active receipts ───────────┼─→ active frozen membership
historical receipts ───────┤
post-snapshot records ─────┘
                                  ↓
                         compare with live discovery
```

The reconciler computes:

```text
retired frozen paths = valid active receipts + valid historical receipts
active frozen paths  = all frozen paths - retired frozen paths
declared membership  = active frozen paths + post-snapshot paths
```

It reports deterministic failures for:

- malformed, duplicate, or misplaced active receipts;
- receipts naming non-frozen or post-snapshot paths;
- receipt/test overlap in the current tree;
- missing, escaping, or malformed evidence paths;
- missing frozen tests with no valid active or historical receipt;
- missing or shallow canonical history;
- undelivered receipt commits presented as historical authority;
- missing pre-deletion blobs; and
- `lastLiveSha256` mismatches.

Post-snapshot overlap rules remain unchanged: a post-snapshot membership record
cannot declare an active or retired frozen path.

## Frozen-history and tree-baseline tests

Existing package-corpus assertions continue proving, without modification to
the source data:

- the frozen manifest schema and 915-test census;
- original source hashes;
- path migration and lane correction;
- immutable rename provenance; and
- package exclusion of the test corpus.

Only live-realization semantics change:

- active frozen paths must exist and be discovered;
- retired frozen paths must be absent;
- every absent frozen path must have valid active or canonical historical
  retirement evidence.

The test-tree baseline remains unchanged. Its live-drop assertion subtracts
only paths returned by the validated retirement loader. It does not rewrite or
regenerate the historical baseline.

## Weekly graduation command

Add one repository-owned command:

```text
scripts/maintenance/graduate-frozen-test-retirements.mjs
```

It supports:

- `--check`: read-only eligibility scan with machine-readable and human-readable
  output;
- `--apply`: validate the complete batch, then remove eligible files.

A receipt is eligible when:

- it exists in the checked-out `trunk` tree;
- its test is absent;
- its receipt and evidence are committed in `origin/trunk`;
- its historical pre-deletion bytes match `lastLiveSha256`; and
- its evidence file will either remain referenced by another active receipt or
  may be removed safely with the last referencing receipt.

The command computes and validates the entire batch before changing the working
tree. It may delete only:

- files under `scripts/tests/fixtures/test-corpus-frozen-retirements/`; and
- unreferenced files under
  `docs/evidence/temporary-test-retirements/`.

No eligible receipts is a successful no-op. Any invalid receipt aborts the whole
batch without partial deletion.

## Weekly GitHub workflow

Add:

```text
.github/workflows/graduate-frozen-test-retirements.yml
```

The workflow:

- runs weekly and through `workflow_dispatch`;
- checks out full `trunk` history;
- requests only `contents: write` and `pull-requests: write`;
- runs the repository-owned command in check mode, then apply mode;
- runs focused corpus, package-corpus, tree-layout, and test-impact tests;
- runs the normal repository quality gate;
- exits without creating a branch when there is no eligible work;
- creates or refreshes one fixed, bot-owned branch;
- opens or updates one batched cleanup pull request;
- never pushes directly to `trunk`; and
- never enables automatic merge.

The bot-owned branch is reserved exclusively for this workflow. Refreshing it
may use force-with-lease after verifying its remote head; the workflow must not
reuse or rewrite a human-owned branch.

The pull-request body lists:

- every graduated receipt path;
- every removed temporary evidence document;
- the historical deletion and digest verification result for each test; and
- the exact verification commands and outcomes.

## Error handling

- Receipt loading and historical hydration are read-only.
- History failure is an error, not an implicit retirement.
- Apply mode performs no deletion until every candidate validates.
- Files outside the two retirement-owned directories are never deletion
  targets.
- Shared evidence remains until its final active receipt graduates.
- Workflow failure leaves existing receipts and evidence in HEAD.
- A stale automation pull request is refreshed only from the dedicated bot
  branch; the workflow never force-updates a user branch.

## Testing

Focused unit and integration fixtures cover:

- deterministic receipt paths and exact schema validation;
- receipt/test overlap;
- non-frozen and post-snapshot paths;
- missing, escaping, and shared evidence;
- squash-delivered deletion history;
- rebased and fast-forward deletion history;
- merge-commit deletion history;
- a receipt that exists only on an undelivered feature branch;
- graduated historical hydration;
- missing pre-deletion blobs and digest mismatches;
- shallow history and absent `origin/trunk`;
- empty, single-record, and multi-record batches;
- whole-batch refusal on one invalid candidate;
- deletion confinement to the two owned directories;
- unchanged frozen manifest and tree baseline;
- test-impact selection for receipt and temporary-evidence changes; and
- workflow schedule, permissions, full-history checkout, no-op behavior,
  branch ownership, and pull-request wiring.

The four-test pilot also runs the complete AITM normal quality gate before its
delivery and again in the weekly graduation pull request.

## Pilot review gate

The first weekly graduation pull request is an observation checkpoint. Before
using the mechanism for unrelated frozen tests, review:

- whether the receipt and pull-request narrative are understandable;
- whether history hydration works under the repository's real merge strategy;
- whether the weekly batching meaningfully reduces churn;
- whether failure diagnostics are actionable;
- whether full-history cost is acceptable; and
- whether the ongoing mechanism is simpler than an alternative current-corpus
  authority.

The pilot may be revised or retired after that review. Successful automation is
not assumed merely because the design is internally consistent.

## Acceptance criteria

- The immutable pre-move manifest and tree baseline retain their original data.
- The four dead publisher tests can be absent from HEAD while membership checks
  pass only through validated retirement evidence.
- The receipt format survives squash, rebase, fast-forward, and merge delivery.
- Undelivered branch-only receipts cannot authorize a missing frozen test.
- The weekly workflow batches eligible receipts into one pull request and never
  pushes to `trunk` or auto-merges.
- After the graduation pull request merges, the four receipts and temporary
  evidence are absent from HEAD and discoverable in canonical history.
- Shallow or incomplete history fails closed.
- Post-snapshot membership behavior remains unchanged.
- The first automated cleanup pull request is reviewed before this mechanism is
  generalized beyond the four-test pilot.
