# Worktree-local backlog and history design: review summary

An independent read-only reviewer examined the epic specification in five passes. The reviewer found no remaining material issues in the final pass.

| Finding | Resolution in the specification |
| --- | --- |
| Lost issue-create response could cause duplicate publication | Persist a unique draft marker in the first remote create payload; reconcile or stop before retry. |
| Archived issue could reopen off-board | Restore and verify the Project item before lifecycle work; retention checks for reopen after archiving. |
| Post-close archive had no publication owner | Record a recovery job in the shared Git directory; each job has a unique branch and PR. |
| Parallel archive PRs could overwrite one manifest | Use per-issue coverage manifest shards with conflict verification. |
| Temporary journals were treated as durable at cleanup | Flush published-issue edits and commit or publish new drafts before worktree cleanup. |
| Archive and Project retention could race with source changes | Verify paginated sources and use native Project-item archiving, which retains field values for readback and restoration. |
| A bounded Project query could not establish an exact closed-card cap | Require a measured full baseline/reconciliation scan; pause cap-based retention when count confidence is lost. |
| Close success conflicted with an immediate archive-record criterion | Expose archive-pending status and block retention until the archive reaches the shared branch. |

The review did not perform a cross-provider XPR. The standalone GraphQL measurement spike has its own review record and remains outside this epic.
