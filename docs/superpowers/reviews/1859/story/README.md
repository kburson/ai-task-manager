# Issue 1859 story hydration checkpoint

The body snapshot preserves GitHub issue version 7 after the accepted plan was hydrated into six Scope tasks. It records the state before the first origin push; publication notes in that snapshot are historical.

The reference operation was applied at body version 5, producing version 6. The plan hydration operation was applied at version 6, producing version 7. These files are audit inputs, not instructions to replay them against the current issue. The governed writer and independent readback verified each update.

Accepted specification, implementation plan, and SAR/XPR lineage are in [the review index](../README.md). Temporary review setup and hook edits, plus exact rollback backups, are checkpointed separately as WIP for the draft PR.
