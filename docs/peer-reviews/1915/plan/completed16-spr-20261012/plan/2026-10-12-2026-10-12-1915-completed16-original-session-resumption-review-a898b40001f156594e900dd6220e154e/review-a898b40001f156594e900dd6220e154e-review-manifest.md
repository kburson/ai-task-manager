<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "1fcf3cb2254c4db1a5e4c74b2f4e516660c4768e",
      "commit": "ac0102de3893e84c1c64401ea04822cd91dd0e81",
      "digest": "sha256:9be27c5baac14c76c879634f7a96bb0e2005d6a8124d3b608bd827f7ecd62ff7",
      "path": "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md",
      "snapshot": null,
      "turn": 0
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
      "claim_id": "claim-50c473a2-28c1-403e-b1ae-ca3ce4f89401",
      "claimed_at": "2026-10-12T13:29:08.276Z",
      "expires_at": "2026-10-12T21:29:08.276Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T13:29:08.276Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:cf1653e9abbe048eeffc90dd438151cd4a03a3c4aa54a57c608043311a47b9be"
    },
    {
      "claim_id": "claim-135f8308-f18b-427f-b050-6dfb62c95033",
      "claimed_at": "2026-10-12T13:31:43.635Z",
      "expires_at": "2026-10-12T21:31:43.635Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T13:31:43.635Z",
      "role": "author",
      "session_fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "ac0102de3893e84c1c64401ea04822cd91dd0e81",
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
        "joined_at": "2026-10-12T13:26:03.569Z",
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
        "event_log_digest": "sha256:18552e1d2245d74c21897e1c2559937958ca03339208dd39b698921b842d683c",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-a898b40001f156594e900dd6220e154e",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-a898b40001f156594e900dd6220e154e",
        "root_review_id": "review-a898b40001f156594e900dd6220e154e",
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
      "joined_at": "2026-10-12T13:26:03.569Z",
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
          "declared_id": "gpt-6-astra",
          "observed_id": null,
          "requested_id": null,
          "source": "explicit-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:cf1653e9abbe048eeffc90dd438151cd4a03a3c4aa54a57c608043311a47b9be",
          "source": "explicit-declaration"
        }
      },
      "host": "codex",
      "identity_source": "declared",
      "joined_at": "2026-10-12T13:29:08.271Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:cf1653e9abbe048eeffc90dd438151cd4a03a3c4aa54a57c608043311a47b9be"
    }
  },
  "record_id": "review-a898b40001f156594e900dd6220e154e",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-a898b40001f156594e900dd6220e154e",
  "runtime": {
    "adapter_version": "1.0.0",
    "classification": "SPR",
    "ownership": "broker",
    "project_root_digest": "b5eda0a820f8ad576d5c7901eddde9ca8155de4421757bdaeeba2288730b0c6a",
    "reviewer": {
      "effort": "high",
      "host": "codex",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "selector": "codex"
    },
    "schema": "ai-peer-review.runtime/v1",
    "transport_mode": "manual"
  },
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "ac0102de3893e84c1c64401ea04822cd91dd0e81",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:cf6693998e4f84e173561c04b8f44a6a99f7445b6496898b4996a701a61a8e05",
        "path": "docs/peer-reviews/1915/plan/completed16-spr-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-a898b40001f156594e900dd6220e154e/review-a898b40001f156594e900dd6220e154e-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
