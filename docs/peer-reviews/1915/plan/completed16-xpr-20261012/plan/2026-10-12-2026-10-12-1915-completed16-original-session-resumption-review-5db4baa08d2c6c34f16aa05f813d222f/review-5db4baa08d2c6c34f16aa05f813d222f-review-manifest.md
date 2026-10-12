<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "1fcf3cb2254c4db1a5e4c74b2f4e516660c4768e",
      "commit": "942428e7d3f8ccfcd520df4d4ef77b307e21f637",
      "digest": "sha256:9be27c5baac14c76c879634f7a96bb0e2005d6a8124d3b608bd827f7ecd62ff7",
      "path": "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "9cfb61a8dc04fcbe59f6bb804eb49286992111e9",
      "commit": "c308468292053cdb0fde8d3a8190f9f1eea8e6d5",
      "digest": "sha256:8e5072487814a8cccf0a89cd50c22db351b9e07de0784e7e6367ab91dc4ef892",
      "path": "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-e9f648de-2c6d-4812-99c1-f01e100dfb5c",
      "claimed_at": "2026-10-12T13:34:18.228Z",
      "expires_at": "2026-10-12T21:34:18.228Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-12T13:34:18.228Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:a2ce79750eb9d215757281b766d25d98c5e3b065b3f573e63f17875823203b8a"
    },
    {
      "claim_id": "claim-af603c57-44b7-48cb-876c-2d29b593a570",
      "claimed_at": "2026-10-12T13:41:41.324Z",
      "expires_at": "2026-10-12T21:41:41.324Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T13:41:41.324Z",
      "role": "author",
      "session_fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "c308468292053cdb0fde8d3a8190f9f1eea8e6d5",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "declared",
            "conflict": false,
            "declared_id": "gpt-6.1-sol",
            "observed_id": null,
            "requested_id": null,
            "source": "explicit-declaration"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25",
            "source": "explicit-declaration"
          }
        },
        "host": "codex",
        "identity_source": "declared",
        "joined_at": "2026-10-12T13:32:24.719Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:2243254d1943c22866f6c541e0d49685a710159b067c79a5b65db70c35ee3471",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-5db4baa08d2c6c34f16aa05f813d222f",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-5db4baa08d2c6c34f16aa05f813d222f",
        "root_review_id": "review-5db4baa08d2c6c34f16aa05f813d222f",
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
          "declared_id": "gpt-6.1-sol",
          "observed_id": null,
          "requested_id": null,
          "source": "explicit-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25",
          "source": "explicit-declaration"
        }
      },
      "host": "codex",
      "identity_source": "declared",
      "joined_at": "2026-10-12T13:32:24.719Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25"
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
          "fingerprint": "sha256:a2ce79750eb9d215757281b766d25d98c5e3b065b3f573e63f17875823203b8a",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-12T13:34:18.201Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:a2ce79750eb9d215757281b766d25d98c5e3b065b3f573e63f17875823203b8a"
    }
  },
  "record_id": "review-5db4baa08d2c6c34f16aa05f813d222f",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-5db4baa08d2c6c34f16aa05f813d222f",
  "runtime": {
    "adapter_version": "1.0.0",
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "b5eda0a820f8ad576d5c7901eddde9ca8155de4421757bdaeeba2288730b0c6a",
    "reviewer": {
      "effort": "high",
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
  "startup_commit": "942428e7d3f8ccfcd520df4d4ef77b307e21f637",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "9cfb61a8dc04fcbe59f6bb804eb49286992111e9",
        "digest": "sha256:8e5072487814a8cccf0a89cd50c22db351b9e07de0784e7e6367ab91dc4ef892",
        "path": "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md"
      },
      "author_response": {
        "digest": "sha256:725058a94878b92b0ea65fd10101b8b85eebb2192dcfca46212ad8b99f1d87b1",
        "path": "docs/peer-reviews/1915/plan/completed16-xpr-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-5db4baa08d2c6c34f16aa05f813d222f/review-5db4baa08d2c6c34f16aa05f813d222f-author-response-1.md"
      },
      "commit": "c308468292053cdb0fde8d3a8190f9f1eea8e6d5",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:c14caa71152ecf8397fec08a020addadffc2cbb937b5f05cfabee38c4851d685",
        "path": "docs/peer-reviews/1915/plan/completed16-xpr-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-5db4baa08d2c6c34f16aa05f813d222f/review-5db4baa08d2c6c34f16aa05f813d222f-reviewer-response-1.md"
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
        "digest": "sha256:2b981b390c88c632d62b460b55f68f60e989bccd803f6e07b4b45320ae9a3c1e",
        "path": "docs/peer-reviews/1915/plan/completed16-xpr-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-5db4baa08d2c6c34f16aa05f813d222f/review-5db4baa08d2c6c34f16aa05f813d222f-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
