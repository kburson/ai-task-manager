# GitHub Records Ingestion for AITM Insights

AITM Insights reads governed state from GitHub and materializes a disposable
browser read model. GitHub issues, comments, record envelopes, and active grants
remain authoritative. IndexedDB cannot satisfy any AITM gate, grant authority,
approve work, or prove that an event does not exist.

## Export contract

`exportInsightsRecordSet` produces `aitm.insights-record-set/v1` with these
canonically ordered collections:

| Collection     | IndexedDB primary key | Purpose                                                       |
| -------------- | --------------------- | ------------------------------------------------------------- |
| `repositories` | `repositoryNodeId`    | Repository identity and latest observed update                |
| `issues`       | `issueNodeId`         | Issue number and owning repository                            |
| `directories`  | `issueNodeId`         | Body-resident singleton directory                             |
| `contracts`    | `issueNodeId`         | Latest validated Delivery Contract projection                 |
| `records`      | `commentNodeId`       | Validated AITM record envelope; add a unique `recordId` index |
| `projections`  | `[issueNodeId, kind]` | Latest derived singleton projection by kind                   |
| `syncCursors`  | `repositoryNodeId`    | Local copy of exported `cursorHints`                          |

Applications should also index `issues.repositoryNodeId`,
`records.envelope.issue`, `records.envelope.recordType`, and
`projections.commentNodeId` for read performance. Those indexes are derived and
carry no authorization meaning.

## Initial materialization

1. Fetch repositories and issues from GitHub.
2. Parse each issue directory and batch-fetch its singleton comments by node ID.
3. Scan issue comments for AITM record envelopes.
4. Validate schemas, canonical payload hashes, repository/issue correlations,
   Delivery Contracts, directory references, and record identities.
5. Call `exportInsightsRecordSet` and replace the seven IndexedDB stores in one
   browser transaction.

A malformed, ambiguous, equal-time conflicting, or dangling observation stops
materialization. Insights must surface the diagnostic and retain the prior good
read model; it must not guess which GitHub observation is authoritative.

## Incremental overlap and deduplication

Poll changed issues and comments with an overlap window. Feed the prior export
and every overlapping page to `mergeInsightsRecordSets`. Entries converge by
GitHub node identity (and record identity where applicable), update time, and
canonical content or payload hash:

- a newer valid observation replaces an older observation;
- the same observation may appear on any number of overlapping pages;
- an equal-time unequal observation fails closed;
- a record ID observed under a different comment node fails closed; and
- newly accepted records and corrected mutable projections remain in the final
  materialization.

A cursor is an optimization, not proof that no event exists. Store both issue
and comment high-water hints, subtract the configured overlap on the next poll,
and rely on validation plus deduplication rather than cursor exclusivity.

## Full rebuild

It is always safe to delete the IndexedDB database and perform a full rebuild
from GitHub. For the same final observations, full export and incremental merge
produce the same canonical record set. Deleting IndexedDB must not delete or
invalidate governed state because no authoritative state originates there.

Operationally, create a replacement database version, ingest and validate the
complete GitHub record set, then swap readers only after the transaction commits.
If rebuild fails, discard the replacement and continue serving the previous
derived snapshot with a visible staleness diagnostic.

## Authority boundary

Only current GitHub records and the active coordinator/worker grants can satisfy
AITM delivery gates. Neither an IndexedDB row, a locally cached export, a cursor,
nor an Insights projection may be used as approval, test evidence, assignment
authority, integration permission, or closure evidence. Delivery commands must
return to GitHub and validate the current authoritative record chain.
