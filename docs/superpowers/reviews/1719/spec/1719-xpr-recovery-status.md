<!-- @story #1719 -->

# Issue 1719 XPR recovery status

The user authorized one additional tooling recovery after the original launcher could not route round 2. Recovery inspection found that the original df88 worktree had been removed and its Git registration was absent. No paid provider call was made during this additional recovery.

## Restored evidence

The df88 worktree was restored at the exact original path from commit `717df5e3d34a26cd36888fe4b8c642f830ba1c5a`. Its specification digest remains `7f4b8a7566abcaad3f598d3d5c38e8449f7c51f5649bbe906683b94d519f2c55`.

The Git snapshot `d8759bee507cf44c0c2502609f3391a01027d0df`, retained at `refs/codex/snapshots/2a37bcc00419d30fd5ade9346fd660a9f613c73d`, supplied nine additional setup and collateral files. The snapshot is labeled `Codex worktree snapshot: archive-cleanup`. It does not contain the ignored review event ledger, claims, reviewer Git seal, or launcher state.

The sealed round-1 reviewer and author responses survive in the revision commit. Byte-identical copies are stored here as `1719-xpr-reviewer-response-r1.md` and `1719-xpr-author-response-r1.md`. The recovered protocol round-2 response is an unsubmitted template, not reviewer evidence, and has not been copied as a completed round.

## Protocol status and blocker

Review `review-bd4fbcca64d8f812251c3846d92bb100` last reached reviewer-turn for round 2 after author revision 1. It has no recovered event authority or terminal acceptance. Restoring documents does not reconstruct that authority; the original protocol cannot currently be resumed or formally superseded. No event records, session handles, or reviewer seals have been fabricated.

The installed launch-reviewer command obtains its response path from the original sealed invitation. Read-only inspection of the clean local ai-peer-review checkout at `7bb30d3` found the same public CLI routing: `invitationValues` supplies the original response to `buildClaudeReviewerResume`, whose stored-path checks are still response-specific. Newer execution-contract/preflight helpers exist, but the inspected public launch-reviewer command does not use them. Therefore simply selecting that package does not establish a supported fix, and no global package installation was performed.

A supported continuation requires either restoration of the original ignored review workspace plus a corrected launcher, or a distinct replacement review using a verified launcher. Prior review documents can inform a replacement but cannot be represented as its acceptance authority. The extra authorized recovery ends here without another paid launch or an unapproved additional recovery.
