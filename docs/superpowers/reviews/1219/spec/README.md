# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted specification remains normative; the review and owner response are evidence.
Recover the accepted artifact with `git cat-file blob c7f340fc3cfa020be08c8023bac9c7077e263bfb`.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "c1655cdd-f0c8-48fd-95e3-57af190d9f0c",
    "schema": "aitm.co-review/v1",
    "claimProvenance": "provider-session/v1"
  },
  "artifact": {
    "mode": "reference",
    "sourcePath": "docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md",
    "acceptedCommit": "1375edfd4b29c98e407ae428a15f992dbdff2cd6",
    "gitBlob": "c7f340fc3cfa020be08c8023bac9c7077e263bfb",
    "sha256": "sha256:16b4af266d2b6e05df2ee3c7b84f47ed720527363cb27ac2023e708675889f48"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-09-05T00:52:25.076Z",
    "reviewer": "claude"
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
      "claim": {
        "revision": 6,
        "role": "owner",
        "actor": "codex",
        "provider": "codex",
        "sid": "01a06ea9-ee97-7380-b809-d5579b8b900c",
        "at": "2026-09-05T00:39:01.415Z"
      },
      "handoffRevision": 7,
      "sourcePath": ".scratch/co-review/1219-continuous-agent-delivery-spec-only-restart/round-3-owner-response.md",
      "sourceSha256": "sha256:ba617b9528ed643d015b17664d57429cb24a7891faf5c415cc18b6f89b291621",
      "archivePath": "2026-09-04-1219-continuous-agent-delivery-amendment-design-r5-owner-codex-response.md",
      "archivedSha256": "sha256:ba617b9528ed643d015b17664d57429cb24a7891faf5c415cc18b6f89b291621"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 5,
      "claim": {
        "revision": 8,
        "role": "reviewer",
        "actor": "claude",
        "provider": "claude",
        "sid": "ae407787-5f1b-4649-ac12-4c5bb98def28",
        "at": "2026-09-05T00:47:51.658Z"
      },
      "handoffRevision": 9,
      "sourcePath": ".scratch/co-review/1219-continuous-agent-delivery-spec-only-restart/round-4-reviewer-review.md",
      "sourceSha256": "sha256:9d8f957dc39fb9c2a2a1a2e7d80cdca0d750b0eaedeb23bb719452e1bd197f53",
      "archivePath": "2026-09-04-1219-continuous-agent-delivery-amendment-design-r5-reviewer-claude-review.md",
      "archivedSha256": "sha256:9d8f957dc39fb9c2a2a1a2e7d80cdca0d750b0eaedeb23bb719452e1bd197f53"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
