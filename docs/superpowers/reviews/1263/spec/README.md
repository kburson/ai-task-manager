# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob 09fb127c7f03e3f544406eaec1db840aed901616`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "7c95f02a-96cd-4e52-b7a1-6662e555d9c1",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/specs/2026-08-19-test-corpus-membership-registry-design.md",
    "acceptedCommit": "0dfdca7e0a32a7ebaa30871542e8a054bbb43e4b",
    "gitBlob": "09fb127c7f03e3f544406eaec1db840aed901616",
    "sha256": "sha256:4b325e769579eb31a13ca4d3ec5419286f9e31815fa5d802e5b5617c21801b06"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "grok"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-19T18:47:36.134Z",
    "reviewer": "grok"
  },
  "budget": {
    "reviewTurnsUsed": 3,
    "maxReviewTurns": 12,
    "remainingReviewTurns": 9
  },
  "evidence": {
    "pairRound": 7,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 6,
      "sourcePath": ".tmp/co-review/2026-08-19-1263-test-corpus-registry-spec-grok/round-5-owner-response.md",
      "sourceSha256": "sha256:6cfccb804f18dd8206f9c303daa19622095b6eb37e9bd0bb8451f746b120c4a7",
      "archivePath": "2026-08-19-test-corpus-membership-registry-design-r7-owner-codex-response.md",
      "archivedSha256": "sha256:6cfccb804f18dd8206f9c303daa19622095b6eb37e9bd0bb8451f746b120c4a7"
    },
    "reviewerReview": {
      "identity": "grok",
      "eventRound": 7,
      "sourcePath": ".tmp/co-review/2026-08-19-1263-test-corpus-registry-spec-grok/round-6-reviewer-review.md",
      "sourceSha256": "sha256:93db6886510f935f314e0ccc64e49fae3ac336bfafb3c0581836b47bec07d2e3",
      "archivePath": "2026-08-19-test-corpus-membership-registry-design-r7-reviewer-grok-review.md",
      "archivedSha256": "sha256:93db6886510f935f314e0ccc64e49fae3ac336bfafb3c0581836b47bec07d2e3"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
