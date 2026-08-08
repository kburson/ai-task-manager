# GitHub-Native Coordination

AITM uses GitHub issues and issue comments as the durable authority for
distributed delivery. A local checkout, worktree, browser database, or direct
agent message may accelerate work, but none of them can grant authority or
satisfy a delivery gate.

This guide is the operator runbook. The architecture and record schemas are in
the [design specification](../superpowers/specs/2026-07-31-github-native-authority-records-design.md),
and the decision boundary is recorded in
[ADR 0002](../decisions/0002-github-native-authority-records.md).

## Authority model

A directory-governed issue has four GitHub-resident layers:

1. The issue body holds stable story intent and a hidden directory of singleton
   comment node IDs.
2. Singleton comments project the Delivery Contract, coordination, accepted
   evidence, and timing state.
3. Immutable record comments establish assignments, transitions, reviews,
   handoffs, integrations, corrections, and dispositions.
4. AITM Insights materializes a disposable browser read model from those GitHub
   records.

The hidden structured payload is canonical. Visible Markdown is a projection.
A checkbox edit, local cache row, branch name, or chat message alone cannot
approve work, transfer an assignment, or advance lifecycle state.

## Before operating

Use a seeded worktree on the issue's governed branch:

```bash
npm ci
npm run link:self
node scripts/dev-env/verify-local-worktree.mjs
gh auth status
npx aitm status
```

Bind the mutation target before any lifecycle command. For an epic child, cut
the worktree from the epic head with `cut-child-worktree.mjs`; do not base it on
trunk. Follow the normal `/task` state verbs. Record storage changes where
authority lives, not which lifecycle gates are required.

## Identify the authority source

AITM resolves each issue through the contract-source boundary:

- `legacy-body/v1` means AC, VC, DoD, and lifecycle projections still come from
  the versioned issue body.
- `github-records/v1` means the body directory identifies the authoritative
  singleton comments and accepted record chain.

Do not infer the source from issue age or visible formatting. Run a read-only
adoption audit:

```bash
npx aitm adopt-github-records 123
```

The command validates the legacy contract, discovers any existing singleton
records, and reports parity or drift without writing. Missing, duplicated,
malformed, cross-issue, stale, or forked records fail closed.

## Adopt one legacy issue

Adoption is deliberately per issue; there is no bulk historical rewrite.

1. Freeze the issue and branch SHA that will be adopted.
2. Run the read-only audit and resolve every parity error.
3. Read the current coordinator grant ID, authority epoch, and actor from the
   validated coordination authority, then apply adoption with that exact grant:

   ```bash
   npx aitm adopt-github-records 123 --apply \
     --grant-id <current-grant-id> \
     --authority-epoch <current-authority-epoch> \
     --actor <coordinator-actor>
   ```

4. Re-run the command without flags. It must report parity and be idempotent.
5. Exercise the next governed transition through the normal task verb.

The operation creates self-identifying singleton comments first and publishes
the body directory last. A crash before the directory write cannot expose a
partially authoritative issue. A rerun discovers and validates the existing
comments instead of duplicating them. Apply refuses missing or stale coordinator
authority rather than inferring mutation rights from the local binding.

Rollback is allowed only before divergent GitHub-native authority exists:

```bash
npx aitm adopt-github-records 123 --rollback
```

Rollback refuses if a sealed transition, accepted submission, changed contract,
or other post-adoption record would be discarded. Preserve the records and use
repair when authority has advanced.

## Normal governed delivery

Continue to use the workflow verbs:

```text
Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done
```

The verbs resolve the current contract source, evaluate gates without writing,
append an immutable authority record, read it back, and then converge singleton
projections. For a directory-governed Develop → Test → Review path, routine
delivery must not rewrite the issue body.

Never edit a record comment or singleton projection by hand. Never treat a
successful projection write as proof that its preceding record exists. The
append-first record is authoritative after read-back; projections are repaired
from accepted records.

## Coordinator and worker responsibilities

One active coordinator owns each governed epic or standalone issue. Parallel
workers receive narrower assignments containing the issue, branch, file scope,
dependency baseline, verification obligations, authority epoch, and allowed
operations.

The coordinator:

- refreshes GitHub before assignment, state mutation, disposition, and
  integration;
- rejects stale or out-of-scope epochs;
- validates a worker submission against its assignment;
- records acceptance or rejection before updating projections; and
- integrates only within the branch boundary granted by its parent.

The worker:

- works only inside the assigned issue and worktree;
- appends bounded result and evidence records;
- reports exact comment node IDs and the commit SHA; and
- does not advance state or integrate merely because code and tests are green.

A nested epic may have a delegated coordinator. Its grant cannot mutate the
parent, siblings, or excluded descendants. If a coordinator is replaced, the
new epoch must explicitly adopt or reject every outstanding submission; old
workers may submit observations but cannot act as current authority.

## Recovery and repair

First stop lifecycle advancement. Preserve the issue, comment IDs, record IDs,
branch SHA, and the first observed error. Then classify the failure:

| Symptom                                        | Required response                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Directory missing after partial initialization | Run `adopt-github-records N --repair`; discover deterministic singleton identities before creating anything |
| Missing or stale singleton projection          | Replay accepted records and converge the projection                                                         |
| Duplicate singleton                            | Block the issue; validate identity and history before repairing the directory                               |
| Record-chain fork                              | Block advancement; require a parent coordinator or human conflict-resolution record                         |
| Stale coordinator or authority epoch           | Reject the operation; refresh the active grant                                                              |
| Worker result from a replaced assignment       | Require explicit adoption or rejection by current authority                                                 |
| Manual edit or hash mismatch                   | Preserve the content, block authority, and choose adoption or restoration explicitly                        |
| Unsupported schema                             | Preserve and report it; never interpret it as valid authority                                               |

Run repair with:

```bash
npx aitm adopt-github-records 123 --repair
```

Repair is idempotent and read-back verified. It must not erase an immutable
record, choose between equal competing records, or silently re-author history.

## Insights and local caches

AITM Insights may cache repositories, issues, directories, contracts, records,
projections, and sync cursors in IndexedDB. Those stores are observational. A
cursor is an optimization, not proof that no record exists.

It is safe to delete the browser database and rebuild it from GitHub. Full and
incremental ingestion must converge for the same validated observation set.
See [GitHub Records Ingestion for AITM Insights](github-records-insights-ingestion.md)
for the collection schema, overlap rules, and rebuild procedure.

No SQLite file, PostgreSQL service, hosted AITM API, or browser database is
required for correctness. GitHub is the only required remote authority. Direct
messages and webhooks can reduce latency but cannot replace the durable record.

## Operational checklist

Before a governed mutation:

- [ ] The command is running from the bound, seeded worktree.
- [ ] GitHub authentication and repository correlation are valid.
- [ ] The directory, schema, hashes, active grant, authority epoch, contract
      epoch, and record-chain head validate.
- [ ] The branch and file scope match the active assignment.
- [ ] The expected predecessor and singleton revisions are current.

After a governed mutation:

- [ ] The immutable record was read back byte-for-byte and hash-validated.
- [ ] Singleton projections converged idempotently.
- [ ] A fresh read resolves the expected lifecycle and evidence state.
- [ ] The issue body did not change unless this was adoption, directory repair,
      or another explicitly body-owned operation.
- [ ] The exact commit SHA and record IDs are present in review or integration
      evidence.
