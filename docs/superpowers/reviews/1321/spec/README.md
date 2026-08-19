# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "464b72d4-d93d-4642-beca-be9e62490383",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "sourcePath": "docs/superpowers/specs/2026-08-18-grok-provider-adapter-design.md",
    "acceptedCommit": "5fa6e0b425e4239fcd803e338babb247fafc670c",
    "gitBlob": "53bbee2e3964bdca273ca6c8e291d04222a431b5",
    "sha256": "sha256:5f45b159aeef144573525b3736899c2774c009e1b99d2e4e825b70619bb6fa18",
    "archivePath": "artifact-2026-08-18-grok-provider-adapter-design.md",
    "archivedSha256": "sha256:5f45b159aeef144573525b3736899c2774c009e1b99d2e4e825b70619bb6fa18"
  },
  "participants": {
    "owner": "grok",
    "reviewer": "codex"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-19T02:43:59.704Z",
    "reviewer": "codex"
  },
  "budget": {
    "reviewTurnsUsed": 6,
    "maxReviewTurns": 10,
    "remainingReviewTurns": 4
  },
  "evidence": {
    "pairRound": 13,
    "ownerResponse": {
      "identity": "grok",
      "eventRound": 12,
      "sourcePath": ".tmp/co-review/2026-08-18-grok-provider-adapter/round-11-author-response.md",
      "sourceSha256": "sha256:48cebafedcb66d3bbfbc598188673d0ff709f625f4ec1ca94f8e4ae987831e1c",
      "archivePath": "2026-08-18-grok-provider-adapter-design-r13-owner-grok-response.md",
      "archivedSha256": "sha256:48cebafedcb66d3bbfbc598188673d0ff709f625f4ec1ca94f8e4ae987831e1c"
    },
    "reviewerReview": {
      "identity": "codex",
      "eventRound": 13,
      "sourcePath": ".tmp/co-review/2026-08-18-grok-provider-adapter/round-12-reviewer-review.md",
      "sourceSha256": "sha256:7c5abcda1b7fbbb33a7d43c02de26cca5f5dce424c5c0b8f6bfc101c711aade4",
      "archivePath": "2026-08-18-grok-provider-adapter-design-r13-reviewer-codex-review.md",
      "archivedSha256": "sha256:7c5abcda1b7fbbb33a7d43c02de26cca5f5dce424c5c0b8f6bfc101c711aade4"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
