<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "4b85864b21fe951f82d3e4b5b495b995c2c9416d",
      "commit": "62fa711d97a8364cadb81a0cb5849e8fe31b9f51",
      "digest": "sha256:7f4b8a7566abcaad3f598d3d5c38e8449f7c51f5649bbe906683b94d519f2c55",
      "path": "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "561cdfaf5b2fa547eaa156ffbc420eaca86f97b5",
      "commit": "51fa447740becf3e90b1ee90c76158b5c4e8ab60",
      "digest": "sha256:1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9",
      "path": "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-f6f54b50-e27b-427e-843a-12604dad5521",
      "claimed_at": "2026-09-21T05:09:59.240Z",
      "expires_at": "2026-09-21T13:09:59.240Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-21T05:09:59.240Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:ec62c7cc672ee56180cc262823c862e792b2aaf047d5580768ebf905d74b4a6e"
    },
    {
      "claim_id": "claim-1c7a1ec2-d119-4ce0-a1c2-30c17b54c1b1",
      "claimed_at": "2026-09-21T05:18:16.305Z",
      "expires_at": "2026-09-21T13:18:16.305Z",
      "host": "codex",
      "last_activity_at": "2026-09-21T05:18:16.305Z",
      "role": "author",
      "session_fingerprint": "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "51fa447740becf3e90b1ee90c76158b5c4e8ab60",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "declared",
            "conflict": false,
            "declared_id": "gpt-6-astra",
            "observed_id": null,
            "requested_id": null,
            "source": "environment-declaration"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779",
            "source": "environment-declaration"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-21T05:07:42.936Z",
        "model_display": "GPT-6 Astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:5d2dae4143278ce03f9d641d25bd30cf6da1d6b038b2e069efb5f6cca38378a0",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "1719-xpr-restart",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-5adf972a9df9d2101e757a5abdd469b1",
        "root_review_id": "review-5adf972a9df9d2101e757a5abdd469b1",
        "successor_review_id": null
      }
    ],
    "complete": true,
    "schema": "ai-peer-review.lineage-receipt/v1"
  },
  "participants": {
    "author": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "gpt-6-astra",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-21T05:07:42.936Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "claude-opus-5",
          "observed_id": null,
          "requested_id": null,
          "source": "configuration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:ec62c7cc672ee56180cc262823c862e792b2aaf047d5580768ebf905d74b4a6e",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-21T05:09:59.239Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:ec62c7cc672ee56180cc262823c862e792b2aaf047d5580768ebf905d74b4a6e"
    }
  },
  "record_id": "1719-xpr-restart",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-5adf972a9df9d2101e757a5abdd469b1",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "62fa711d97a8364cadb81a0cb5849e8fe31b9f51",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "561cdfaf5b2fa547eaa156ffbc420eaca86f97b5",
        "digest": "sha256:1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9",
        "path": "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md"
      },
      "author_response": {
        "digest": "sha256:4d2d7e36b799a806e44b2de89c7f522ebf504e29f8f1fea7434e18f2e6b0612d",
        "path": "docs/superpowers/reviews/1719/spec/xpr/1719-xpr-restart/review-5adf972a9df9d2101e757a5abdd469b1-author-response-1.md"
      },
      "commit": "51fa447740becf3e90b1ee90c76158b5c4e8ab60",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:06fe9923e3ac835d8b2de6e34f5dae4c0d2a1bb7f7488f2d05f54b5664eec2d7",
        "path": "docs/superpowers/reviews/1719/spec/xpr/1719-xpr-restart/review-5adf972a9df9d2101e757a5abdd469b1-reviewer-response-1.md"
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
        "digest": "sha256:4dc7c66d2fb89f5d6f1e674bbc71546fd33d5205ae38fdd6c1572434b64c381d",
        "path": "docs/superpowers/reviews/1719/spec/xpr/1719-xpr-restart/review-5adf972a9df9d2101e757a5abdd469b1-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
