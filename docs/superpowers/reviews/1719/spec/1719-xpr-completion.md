<!-- @story #1719 -->

# Issue 1719 XPR completion

The fresh XPR is accepted and finalized. GPT-6 Astra authored the revisions;
Claude Opus 5 independently reviewed them. Final reviewer findings and required
changes: none. Three nonblocking planning suggestions are preserved in the final
reviewer response and dispositioned in the author closing response.

## Commits and artifact

- Specification revision and author response: `51fa4477`.
- Protocol acceptance and manifest: `d8e3e11b`.
- Accepted specification SHA-256:
  `1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9`.
- Accepted review: `review-5adf972a9df9d2101e757a5abdd469b1`.
- Native record name: `1719-xpr-restart`.

The sealed protocol manifest and response originals remain in
`xpr/1719-xpr-restart/`. The requested filenames are byte-identical copies of
sealed responses, except the explicitly labeled author closing record.

| Requested round | Provenance | Outcome |
| --- | --- | --- |
| r1 | Prior review `review-bd4fbcca64d8f812251c3846d92bb100`, turn 1 | Five findings and author revisions; that review's scratch authority was lost |
| r2 | Fresh review `review-5adf972a9df9d2101e757a5abdd469b1`, turn 1 | One required finding and author revision |
| r3 | Fresh review, turn 2 | Reviewer accepted; author closing record preserves planning suggestions |

Original round-1 files were preserved. The numbering continues across the
restart to avoid overwriting prior evidence; the protected metadata inside each
response identifies its actual review ID and protocol turn.

## Tooling repair and verification

Tooling changes are committed on `codex/1719-launch-routing` in the isolated
`ai-peer-review-worktrees/codex-1719-launch-routing` checkout:

- `314cad9`: public Claude launcher resolves the pending response from sealed
  current authority, resumes the same provider session, removes inherited
  author identity, and checks response rotation against prior submission.
- `f228b66`: retains the OS `USER` variable required for Claude keychain login.
- `aba3b32`: permits finalization of a single native root with an explicit record
  name under the existing legacy-lineage validator; multiple-attempt and
  broker-recovery cases still require recovery receipts.

The initial fresh Claude process stopped before joining with a login error.
Read-only authentication probes isolated the removed `USER` variable; the same
recorded session then completed the review. Subsequent round 2 also used that
session. No replacement provider session was started to bypass a failure.
Finalization's custom-record-name defect was repaired and tested locally after
reviewer acceptance, with no additional model call.

Validation: launcher/preflight regression suite 20 passed; package unit suite
325 passed with one skipped, plus 15 golden tests passed; keychain follow-up
suite 6 passed; finalization/lineage suite 21 passed. Changed tooling files passed
ESLint and whitespace checks. The spec passed Prettier and scoped Markdown lint.
A broad Markdown command also found existing sealed-review frontmatter lint
issues; those protected originals were preserved, so repository-wide lint is
not claimed clean.

The fixes were used through a task-local binary path; the global installed
package and the main tooling checkout were not modified. No push or release
was performed. Future use must select this corrected checkout until the fixes
are integrated and installed through the normal delivery workflow.

## Authority limits

This review does not ratify an implementation plan or authorize production,
billing-account access, or backfill. The accepted spec still requires the normal
human planning and execution approvals. The native protocol records ordinary
Git consensus, not a human-signed approval.
