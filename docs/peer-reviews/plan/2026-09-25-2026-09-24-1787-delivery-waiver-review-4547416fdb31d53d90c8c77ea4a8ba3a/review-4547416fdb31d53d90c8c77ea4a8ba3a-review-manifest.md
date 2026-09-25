<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "fc909345ee02dd26feaf9a5bb0813ec6e922d51f",
      "commit": "f48cf94aa0cbf60294b91ead1279947e6e932e7c",
      "digest": "sha256:a11695175a901a661be14f7412c3969a6332491c3829be47310342c37065db05",
      "path": "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "40c26773cee48ee14d66b2e1550122f43725ef53",
      "commit": "a830796fc6dfae4f1c548224261ced6e8e91c172",
      "digest": "sha256:3cd2d2e87de671e93477a7271f278019631a329db28c981f6bae09844c94d9f0",
      "path": "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-8610967b-2dde-4af2-941f-91fa931f0a54",
      "claimed_at": "2026-09-25T03:36:33.937Z",
      "expires_at": "2026-09-25T11:36:33.937Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-25T03:36:33.937Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:8e0418558a5e2f38060c9beb87d020a67aa9b8e59decc898115b1b3b6a388f7e"
    },
    {
      "claim_id": "claim-72daf058-cefe-4c6c-974f-10d1afd18930",
      "claimed_at": "2026-09-25T03:42:35.546Z",
      "expires_at": "2026-09-25T11:42:35.546Z",
      "host": "codex",
      "last_activity_at": "2026-09-25T03:42:35.546Z",
      "role": "author",
      "session_fingerprint": "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "a830796fc6dfae4f1c548224261ced6e8e91c172",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-25T03:35:59.233Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-25T03:36:33.935Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:8e0418558a5e2f38060c9beb87d020a67aa9b8e59decc898115b1b3b6a388f7e"
    }
  },
  "record_id": "review-4547416fdb31d53d90c8c77ea4a8ba3a",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-4547416fdb31d53d90c8c77ea4a8ba3a",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "f48cf94aa0cbf60294b91ead1279947e6e932e7c",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "40c26773cee48ee14d66b2e1550122f43725ef53",
        "digest": "sha256:3cd2d2e87de671e93477a7271f278019631a329db28c981f6bae09844c94d9f0",
        "path": "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md"
      },
      "author_response": {
        "digest": "sha256:9f8b4c7e8cc81a88ef82b1da8ec234b802ebc0a9f2b410bdc33ccccce03ba922",
        "path": "docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-author-response-1.md"
      },
      "commit": "a830796fc6dfae4f1c548224261ced6e8e91c172",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:0338abd20a8b3b756edac487962ff5ceeb6c395cb09827f5f411fd5eb57c0340",
        "path": "docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:d6043e986f3a929c941743b3743ac3bf8e5a8b42e4fb46457b9fca8283ec8897",
        "path": "docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
