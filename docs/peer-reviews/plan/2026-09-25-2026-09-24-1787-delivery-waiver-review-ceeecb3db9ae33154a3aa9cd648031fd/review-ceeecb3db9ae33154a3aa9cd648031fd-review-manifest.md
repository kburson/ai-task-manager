<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "d4a8d182ad8340452f61d410df19e12d8eb80042",
      "commit": "7caf638d4aea750e86a8fd5d6745c4c5f89342c7",
      "digest": "sha256:3d513a3943596389d27e283b93bdec93dd51638e3c502993947804ea4ce42618",
      "path": "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "bfc352b5725916f1fbb465dcf1b3dba13ddb98bc",
      "commit": "5b1a4d91e4340b2a828d0dcd9ee24430bb0304fc",
      "digest": "sha256:785478b50d21c6001388c6edabca76470d99569f5cdde11be5dc326f2d09a6c0",
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
      "claim_id": "claim-9b04bf0d-e1f6-4eef-862d-a08d9f9aecff",
      "claimed_at": "2026-09-25T02:04:02.813Z",
      "expires_at": "2026-09-25T10:04:02.813Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-25T02:04:02.813Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:5878eb25697e893a7581029def457f247da3366e6d148ecb1c145c9864d0ebfa"
    },
    {
      "claim_id": "claim-2cd7776c-c183-4c2e-8ad2-baeb977362a4",
      "claimed_at": "2026-09-25T02:11:23.173Z",
      "expires_at": "2026-09-25T10:11:23.173Z",
      "host": "codex",
      "last_activity_at": "2026-09-25T02:11:23.173Z",
      "role": "author",
      "session_fingerprint": "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "5b1a4d91e4340b2a828d0dcd9ee24430bb0304fc",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-25T02:03:05.987Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-25T02:04:02.812Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:5878eb25697e893a7581029def457f247da3366e6d148ecb1c145c9864d0ebfa"
    }
  },
  "record_id": "review-ceeecb3db9ae33154a3aa9cd648031fd",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-ceeecb3db9ae33154a3aa9cd648031fd",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "7caf638d4aea750e86a8fd5d6745c4c5f89342c7",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "bfc352b5725916f1fbb465dcf1b3dba13ddb98bc",
        "digest": "sha256:785478b50d21c6001388c6edabca76470d99569f5cdde11be5dc326f2d09a6c0",
        "path": "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md"
      },
      "author_response": {
        "digest": "sha256:0c0be39da30c79abf80789119bcc02f092a3d0f0dcc5862411be63a54ca02b7c",
        "path": "docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/review-ceeecb3db9ae33154a3aa9cd648031fd-author-response-1.md"
      },
      "commit": "5b1a4d91e4340b2a828d0dcd9ee24430bb0304fc",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:184730d25f8129aa638dda4d8207d619ee38c1bec7254c0fc4b16664f5ef1a9a",
        "path": "docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/review-ceeecb3db9ae33154a3aa9cd648031fd-reviewer-response-1.md"
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
        "digest": "sha256:e8b9a66eb5ab914d7e2f4d1656f354587db1498c42d285061ac2dbe443f735df",
        "path": "docs/peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/review-ceeecb3db9ae33154a3aa9cd648031fd-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
