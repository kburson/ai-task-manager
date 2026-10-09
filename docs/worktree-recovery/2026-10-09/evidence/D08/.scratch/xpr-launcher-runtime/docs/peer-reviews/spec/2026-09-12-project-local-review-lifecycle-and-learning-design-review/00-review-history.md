# Project-local review lifecycle and learning: review history

## Review of record

This folder is the complete human-facing review of record for
[`2026-09-12-project-local-review-lifecycle-and-learning-design.md`](../../../design/2026-09-12-project-local-review-lifecycle-and-learning-design.md).
It is one inspection-and-revision process that was forced through three
separate protocol attempt IDs. The attempts are preserved in chronological
order; they are not three competing canonical reviews.

The canonical terminal decision is the submitted acceptance in
[`13-review-59eb-reviewer-response-1-accepted.md`](13-review-59eb-reviewer-response-1-accepted.md),
as finalized by
[`14-review-59eb-author-finalization-manifest.md`](14-review-59eb-author-finalization-manifest.md).
The accepted artifact is commit
`3caacb42d882d1571184b3581a7a58932a54043e`, artifact digest
`sha256:0b65a538437dc2ef2bb86533e991c90b945dacb9fbc7cbe16ad277f8f709fd27`.
Finalization was committed as
`341686d3edbebf644bab81f3468245795d0f7e68`.

## Ordered chronology

| Order | Protocol attempt                          | Records   | Artifact inspected                         | Outcome                                                                                                                                                                                                                                                                                     |
| ----- | ----------------------------------------- | --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `review-853bbccf4ac330aae187dbb5415a02c8` | `01`-`05` | `d02ba9794a33054bc794cf5607662224d47669b4` | Revisions requested and submitted. The author revised the specification in `239de38c342c30694b6787ef8267274b464324c5`. A later accepting response was completed but its protocol submission failed, so it is not acceptance authority. The attempt remains non-terminal in `reviewer-turn`. |
| 2     | `review-7e25eb3b042cddffce22259d099bbdc0` | `06`-`10` | `239de38c342c30694b6787ef8267274b464324c5` | Revisions requested and submitted. The author revised the specification in `3caacb42d882d1571184b3581a7a58932a54043e`. The generated next-turn reviewer file was never completed or submitted. The attempt remains non-terminal in `reviewer-turn`.                                         |
| 3     | `review-59ebd8e3c0181485b88b141d59dc9ae6` | `11`-`14` | `3caacb42d882d1571184b3581a7a58932a54043e` | Accepted on the first reviewer turn and terminally finalized. This is the authoritative acceptance.                                                                                                                                                                                         |

The specification changed exactly twice during the review process: once in
response to attempt 1 and once in response to attempt 2. Attempt 3 inspected
the second revision and did not change the specification. There is no author
response after attempt 3 because the reviewer requested no revisions.

## Record status by file

1. [`01-review-853b-author-startup.md`](01-review-853b-author-startup.md) -
   attempt 1 request startup.
2. [`02-review-853b-reviewer-invitation.md`](02-review-853b-reviewer-invitation.md) -
   attempt 1 sealed reviewer request.
3. [`03-review-853b-reviewer-response-1-revisions-requested.md`](03-review-853b-reviewer-response-1-revisions-requested.md) -
   submitted reviewer decision.
4. [`04-review-853b-author-response-1.md`](04-review-853b-author-response-1.md) -
   submitted author dispositions and first specification revision.
5. [`05-review-853b-reviewer-response-2-acceptance-not-submitted.md`](05-review-853b-reviewer-response-2-acceptance-not-submitted.md) -
   completed accepting draft with `submitted_at: null`; preserved evidence,
   but not a protocol decision.
6. [`06-review-7e25-author-startup.md`](06-review-7e25-author-startup.md) -
   attempt 2 request startup.
7. [`07-review-7e25-reviewer-invitation.md`](07-review-7e25-reviewer-invitation.md) -
   attempt 2 sealed reviewer request.
8. [`08-review-7e25-reviewer-response-1-revisions-requested.md`](08-review-7e25-reviewer-response-1-revisions-requested.md) -
   submitted reviewer decision.
9. [`09-review-7e25-author-response-1.md`](09-review-7e25-author-response-1.md) -
   submitted author dispositions and second specification revision.
10. [`10-review-7e25-reviewer-response-2-not-completed.md`](10-review-7e25-reviewer-response-2-not-completed.md) -
    generated template with `submitted_at: null`; no reviewer decision exists.
11. [`11-review-59eb-author-startup.md`](11-review-59eb-author-startup.md) -
    attempt 3 request startup.
12. [`12-review-59eb-reviewer-invitation.md`](12-review-59eb-reviewer-invitation.md) -
    attempt 3 sealed reviewer request.
13. [`13-review-59eb-reviewer-response-1-accepted.md`](13-review-59eb-reviewer-response-1-accepted.md) -
    submitted canonical acceptance.
14. [`14-review-59eb-author-finalization-manifest.md`](14-review-59eb-author-finalization-manifest.md) -
    terminal acceptance manifest.
15. [`15-relocation-receipt.json`](15-relocation-receipt.json) - source-to-
    destination mapping and SHA-256 proof for every relocated record.

## Why the record fragmented

The first second-turn reviewer submission failed closed with
`APR_REVIEWER_GIT_VIOLATION` during Codex private
`refs/codex/turn-diffs/captures/**` activity. Version 0.2.2 excludes the
`checkpoints` namespace but not the separate `captures` namespace. Because the
command failed before a submission event was appended, the response remained
`submitted_at: null` and the attempt remained in `reviewer-turn`.

Recovery then exposed four additional lifecycle gaps:

- every restart received a new protocol ID and physical collateral folder;
- there was no stable review-of-record identity joining those attempts;
- superseded attempts in `reviewer-turn` could not be abandoned because
  `abandon` accepts only `intervention-required`; and
- version 0.2.2 had no supported archive or collateral-consolidation command.

The result was one human review process stored as three disconnected protocol
directories. Defect [#21](https://github.com/kburson/ai-peer-review/issues/21)
tracks the complete cause and product-level repair. It is linked to the
`ai-peer-review kanban` in `Backlog` at priority `P1`.

## Archival and authority rules

- Files `01` through `14` were moved and renamed without changing their bytes.
- Historical paths inside sealed startup, invitation, response, and manifest
  files remain unchanged because they are historical facts.
- The additive relocation receipt resolves each historical path to its current
  archive path and verifies the byte identity.
- The terminal manifest was not rewritten. Its original digest remains valid.
- The ignored `.scratch/peer-review/<review-id>` workspaces remain operational
  protocol evidence, but they are not part of this tracked human record and may
  still contain the historical collateral paths.
- This archive does not convert either non-terminal attempt into an accepted or
  abandoned protocol state. Only attempt 3 supplies terminal authority.
- The relocation was an explicitly authorized archival transaction because
  the installed package offered no migration command.
