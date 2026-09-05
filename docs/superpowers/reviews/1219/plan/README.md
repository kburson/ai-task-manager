# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob 3f0b33303b0aa2f5aaa29696fe5de5d468f4f860`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "7374809a-7f65-493f-b74d-d66b8d173eca",
    "schema": "aitm.co-review/v1",
    "claimProvenance": "provider-session/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md",
    "acceptedCommit": "7187854e13e21b357b4272afe349fc4b74f92767",
    "gitBlob": "3f0b33303b0aa2f5aaa29696fe5de5d468f4f860",
    "sha256": "sha256:e2a1389cd6aaffd976510a4da6e8c28e01d44ea9341efd5d7e63c043862c09a7"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-09-05T03:45:03.987Z",
    "reviewer": "claude"
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
      "claim": {
        "revision": 10,
        "role": "owner",
        "actor": "codex",
        "provider": "codex",
        "sid": "01a06f6b-aa93-7bc3-812e-2a9e85b479c3",
        "at": "2026-09-05T03:38:12.929Z"
      },
      "handoffRevision": 11,
      "sourcePath": ".scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-5-author-response.md",
      "sourceSha256": "sha256:88ba1c729a12fd916a9e7fd6b2e9451fd6970c3e9ce8a341f742c19350534304",
      "archivePath": "2026-09-04-1219-continuous-agent-delivery-amendment-r7-owner-codex-response.md",
      "archivedSha256": "sha256:88ba1c729a12fd916a9e7fd6b2e9451fd6970c3e9ce8a341f742c19350534304"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 7,
      "claim": {
        "revision": 12,
        "role": "reviewer",
        "actor": "claude",
        "provider": "claude",
        "sid": "109dd576-3d29-4f84-97e6-b82a2446a345",
        "at": "2026-09-05T03:42:31.395Z"
      },
      "handoffRevision": 13,
      "sourcePath": ".scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-6-reviewer-review.md",
      "sourceSha256": "sha256:b40fa593c51a4a065adddff54f01353eb201b4c1b0a7749c8aa7f7e1b1496283",
      "archivePath": "2026-09-04-1219-continuous-agent-delivery-amendment-r7-reviewer-claude-review.md",
      "archivedSha256": "sha256:b40fa593c51a4a065adddff54f01353eb201b4c1b0a7749c8aa7f7e1b1496283"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
