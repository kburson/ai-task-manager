<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "7352e55f47206f191da8589b522c245f4fe77913",
      "commit": "0445849c27d2fcebd2cf97bff043b0923bd2e648",
      "digest": "sha256:e60f6e5fbbabe79e9c4ebc4cd85cd9126b8c3a50337986e8a2e179a361c99690",
      "path": "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "a8f7544c0f6d0f020c8decd37c4179c525180ef3",
      "commit": "6c55d59caece92bd65ad09ec4fd83bfbdb791319",
      "digest": "sha256:67f3a31fb5098ecd7ce967a900d0c16667acdc2c087323ef88d63b49af61bd13",
      "path": "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-4b61f91a-a1bf-41e1-a0b4-203137b84321",
      "claimed_at": "2026-10-02T05:50:07.329Z",
      "expires_at": "2026-10-02T13:50:07.329Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-02T05:50:07.329Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:4806451eb8f9f79569370dea56fa791c86423d6ffdbdd1614c3aa946c253343d"
    },
    {
      "claim_id": "claim-bf4f99b9-aa88-4675-905e-38c3ec731d85",
      "claimed_at": "2026-10-02T05:51:20.543Z",
      "expires_at": "2026-10-02T13:51:20.543Z",
      "host": "codex",
      "last_activity_at": "2026-10-02T05:51:20.543Z",
      "role": "author",
      "session_fingerprint": "sha256:a7be6bd4e13c5e5f6a6be7e050c1cf81a9266b169f7df8cce32d245f095de457"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "6c55d59caece92bd65ad09ec4fd83bfbdb791319",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "declared",
            "conflict": false,
            "declared_id": null,
            "observed_id": null,
            "requested_id": "gpt-6-astra",
            "source": "launch-request"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:a7be6bd4e13c5e5f6a6be7e050c1cf81a9266b169f7df8cce32d245f095de457",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-02T05:49:12.050Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:a7be6bd4e13c5e5f6a6be7e050c1cf81a9266b169f7df8cce32d245f095de457"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:2a5c55b3d7038a3439791d77f92bb6c0fcfa4a1eb03d9a47e0b27b7277ba549f",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-da039aa4a46ce3e709317ba191785610",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-da039aa4a46ce3e709317ba191785610",
        "root_review_id": "review-da039aa4a46ce3e709317ba191785610",
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
          "declared_id": null,
          "observed_id": null,
          "requested_id": "gpt-6-astra",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:a7be6bd4e13c5e5f6a6be7e050c1cf81a9266b169f7df8cce32d245f095de457",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-02T05:49:12.050Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:a7be6bd4e13c5e5f6a6be7e050c1cf81a9266b169f7df8cce32d245f095de457"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "claude-opus-5-5",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:4806451eb8f9f79569370dea56fa791c86423d6ffdbdd1614c3aa946c253343d",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-02T05:50:07.302Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:4806451eb8f9f79569370dea56fa791c86423d6ffdbdd1614c3aa946c253343d"
    }
  },
  "record_id": "review-da039aa4a46ce3e709317ba191785610",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-da039aa4a46ce3e709317ba191785610",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "30ce30ffb13c4f3ff4ef6b74293388b10979f563375a8cdf0008efe1236f6e03",
    "reviewer": {
      "effort": "medium",
      "host": "claude-code",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "selector": "claude"
    },
    "schema": "ai-peer-review.runtime/v1",
    "transport_mode": "manual"
  },
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "0445849c27d2fcebd2cf97bff043b0923bd2e648",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "a8f7544c0f6d0f020c8decd37c4179c525180ef3",
        "digest": "sha256:67f3a31fb5098ecd7ce967a900d0c16667acdc2c087323ef88d63b49af61bd13",
        "path": "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md"
      },
      "author_response": {
        "digest": "sha256:f0aff6f21ddbac56d0586ba3034717108b8cad7c0aee0b47657b478b5b758412",
        "path": "docs/reviews/1857-remaining-work-xpr-admitted/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-da039aa4a46ce3e709317ba191785610/review-da039aa4a46ce3e709317ba191785610-author-response-1.md"
      },
      "commit": "6c55d59caece92bd65ad09ec4fd83bfbdb791319",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:2e979ea6fdd739a350f6fde74d925af319c6f20b27596357a7c0ecdb5e0651e0",
        "path": "docs/reviews/1857-remaining-work-xpr-admitted/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-da039aa4a46ce3e709317ba191785610/review-da039aa4a46ce3e709317ba191785610-reviewer-response-1.md"
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
        "digest": "sha256:e948944851f86627d77e179022beaa7d63c05328b4bed37fd4a87f118bfb028b",
        "path": "docs/reviews/1857-remaining-work-xpr-admitted/plan/2026-10-02-2026-10-01-1857-remaining-work-decomposition-review-da039aa4a46ce3e709317ba191785610/review-da039aa4a46ce3e709317ba191785610-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
