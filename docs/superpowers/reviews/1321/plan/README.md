# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "b2e40ec2-81db-4ca0-b9bc-7bc5f69fd1dd",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "sourcePath": "docs/superpowers/plans/2026-08-18-grok-provider-adapter.md",
    "acceptedCommit": "617dc0398a43fd1efaeab049476dbc26b7ff3c3c",
    "gitBlob": "f2c6640720b2b1e1e62d752fe6854e70ba282a19",
    "sha256": "sha256:f73b42b6eac04bbb2078aa0f085d33690dd5a9589bcd714ada0abb3db3d315e2",
    "archivePath": "artifact-2026-08-18-grok-provider-adapter.md",
    "archivedSha256": "sha256:f73b42b6eac04bbb2078aa0f085d33690dd5a9589bcd714ada0abb3db3d315e2"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "grok"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-19T03:41:27.316Z",
    "reviewer": "grok"
  },
  "budget": {
    "reviewTurnsUsed": 2,
    "maxReviewTurns": 12,
    "remainingReviewTurns": 10
  },
  "evidence": {
    "pairRound": 5,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 4,
      "sourcePath": ".tmp/co-review/2026-08-18-grok-provider-adapter-plan/round-3-author-response.md",
      "sourceSha256": "sha256:8274da10339b8bd9da708b84a621e0e44b95892f106ab7e9e71cd15d2a89a5ea",
      "archivePath": "2026-08-18-grok-provider-adapter-r5-owner-codex-response.md",
      "archivedSha256": "sha256:8274da10339b8bd9da708b84a621e0e44b95892f106ab7e9e71cd15d2a89a5ea"
    },
    "reviewerReview": {
      "identity": "grok",
      "eventRound": 5,
      "sourcePath": ".tmp/co-review/2026-08-18-grok-provider-adapter-plan/round-4-reviewer-review.md",
      "sourceSha256": "sha256:d55f63d602b3e9350fdf7b23f1a12ff01dd3a027bd0221ecd4a31b6b9a6aab71",
      "archivePath": "2026-08-18-grok-provider-adapter-r5-reviewer-grok-review.md",
      "archivedSha256": "sha256:d55f63d602b3e9350fdf7b23f1a12ff01dd3a027bd0221ecd4a31b6b9a6aab71"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
