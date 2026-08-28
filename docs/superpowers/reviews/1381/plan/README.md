# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob fb7a3a2040773101095a2fdecae4840584d24212`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "47b65a77-2787-4c25-adb6-2e21c5190719",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/plans/2026-08-23-1381-governed-delivery-convergence.md",
    "acceptedCommit": "86a9fbfc27f1e2880bb2ace40c4402d86bd3cad3",
    "gitBlob": "fb7a3a2040773101095a2fdecae4840584d24212",
    "sha256": "sha256:a3a6c00771f63be2e14ca0645e739f94d345da37b85f0324939de33b3b88e103"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-23T13:35:12.076Z",
    "reviewer": "claude"
  },
  "budget": {
    "reviewTurnsUsed": 1,
    "maxReviewTurns": 10,
    "remainingReviewTurns": 9
  },
  "evidence": {
    "pairRound": 3,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 2,
      "sourcePath": ".tmp/co-review/2026-08-23-1381-governed-delivery-convergence-plan-claude-1/round-1-author-response.md",
      "sourceSha256": "sha256:0f3068a2172f4c9e8fc0f650d286916112edeabd86dc60d24aa9f7661fc4d36a",
      "archivePath": "2026-08-23-1381-governed-delivery-convergence-r3-owner-codex-response.md",
      "archivedSha256": "sha256:0f3068a2172f4c9e8fc0f650d286916112edeabd86dc60d24aa9f7661fc4d36a"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 3,
      "sourcePath": ".tmp/co-review/2026-08-23-1381-governed-delivery-convergence-plan-claude-1/round-2-reviewer-review.md",
      "sourceSha256": "sha256:dd6b5bd49b1f8f01aacb9ce0cc278b758c598b64a2d2bb74afd45d9925a19a86",
      "archivePath": "2026-08-23-1381-governed-delivery-convergence-r3-reviewer-claude-review.md",
      "archivedSha256": "sha256:dd6b5bd49b1f8f01aacb9ce0cc278b758c598b64a2d2bb74afd45d9925a19a86"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
