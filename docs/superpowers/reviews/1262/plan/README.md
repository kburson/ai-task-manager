# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted artifact is referenced by commit and Git blob, not copied here; recover its exact bytes with `git cat-file blob <gitBlob>` or `git show <acceptedCommit>:<sourcePath>`. The accepted artifact remains normative; the review and owner response are evidence.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "0638a296-8f90-4a2a-88d5-09c8cfd06a0a",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "sourcePath": "docs/superpowers/plans/2026-08-14-git-native-polyglot-tia.md",
    "acceptedCommit": "d39e0984c7e6d62f08ade3eb17bf81cfd61bd4b3",
    "gitBlob": "fe5197da62a6a4084d0e4caa66fcc7688d0b0fe8",
    "sha256": "sha256:89f2dce49a42a040e25e94879c0e49f7ffae6d16008fab84290c2669e677581c",
    "mode": "reference"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-18T19:11:27.148Z",
    "reviewer": "claude"
  },
  "budget": {
    "reviewTurnsUsed": 3,
    "maxReviewTurns": 10,
    "remainingReviewTurns": 7
  },
  "evidence": {
    "pairRound": 7,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 6,
      "sourcePath": ".tmp/co-review/1262-plan-claude-1/round-5-author-response.md",
      "sourceSha256": "sha256:b5370176b39a468be4c24c2d2aaa38f32cf9a31c8b64b0c0da82952dfaab7a93",
      "archivePath": "2026-08-14-git-native-polyglot-tia-r7-owner-codex-response.md",
      "archivedSha256": "sha256:b5370176b39a468be4c24c2d2aaa38f32cf9a31c8b64b0c0da82952dfaab7a93"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 7,
      "sourcePath": ".tmp/co-review/1262-plan-claude-1/round-6-reviewer-review.md",
      "sourceSha256": "sha256:1b32e2777ba0d525397d8d05fb20a42966a0f88bcbaaf1a069a52ee3451ddc08",
      "archivePath": "2026-08-14-git-native-polyglot-tia-r7-reviewer-claude-review.md",
      "archivedSha256": "sha256:1b32e2777ba0d525397d8d05fb20a42966a0f88bcbaaf1a069a52ee3451ddc08"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
