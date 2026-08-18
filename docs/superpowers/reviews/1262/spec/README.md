# Co-review finalization archive

This directory preserves the terminal evidence selected by the governed co-review protocol.
The accepted artifact is referenced by commit and Git blob, not copied here; recover its exact bytes with `git cat-file blob <gitBlob>` or `git show <acceptedCommit>:<sourcePath>`. The accepted artifact remains normative; the review and owner response are evidence.

<!-- aitm-co-review-manifest:start -->
```json
{
  "schema": "aitm.co-review.archive/v1",
  "protocol": {
    "id": "74140a54-782d-4bba-9210-363a635c251d",
    "schema": "aitm.co-review/v1"
  },
  "artifact": {
    "sourcePath": "docs/superpowers/specs/2026-08-14-repository-native-polyglot-tia-and-build-health-design.md",
    "acceptedCommit": "6605bf2645e611dd6f1e72824e946194c293e8cd",
    "gitBlob": "d7506fcfdc045c259696d421262de1fbd5ee492f",
    "sha256": "sha256:f9ee74d6aaea2a54e1e434c5db29eb787051746028effdb8eed6fb36a87ff964",
    "mode": "reference"
  },
  "participants": {
    "owner": "codex",
    "reviewer": "claude"
  },
  "decision": {
    "lifecycle": "accepted",
    "basis": "reviewer-consensus",
    "at": "2026-08-18T18:51:22.277Z",
    "reviewer": "claude"
  },
  "budget": {
    "reviewTurnsUsed": 2,
    "maxReviewTurns": 10,
    "remainingReviewTurns": 8
  },
  "evidence": {
    "pairRound": 5,
    "ownerResponse": {
      "identity": "codex",
      "eventRound": 4,
      "sourcePath": ".tmp/co-review/1262-spec-claude-1/round-3-author-response.md",
      "sourceSha256": "sha256:f1d02b98fdb6904f9469e528f641e79d9c3907783ee8cd0ba510db7378d15424",
      "archivePath": "2026-08-14-repository-native-polyglot-tia-and-build-health-design-r5-owner-codex-response.md",
      "archivedSha256": "sha256:f1d02b98fdb6904f9469e528f641e79d9c3907783ee8cd0ba510db7378d15424"
    },
    "reviewerReview": {
      "identity": "claude",
      "eventRound": 5,
      "sourcePath": ".tmp/co-review/1262-spec-claude-1/round-4-reviewer-review.md",
      "sourceSha256": "sha256:d7e504ca793dca3f957d54776c881d69bbd2fefadcb8c9d643d5d24abc7fb74b",
      "archivePath": "2026-08-14-repository-native-polyglot-tia-and-build-health-design-r5-reviewer-claude-review.md",
      "archivedSha256": "sha256:d7e504ca793dca3f957d54776c881d69bbd2fefadcb8c9d643d5d24abc7fb74b"
    }
  },
  "normative": "The accepted artifact remains normative; the archived review and owner response are evidence."
}
```
<!-- aitm-co-review-manifest:end -->
