<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "9cfb61a8dc04fcbe59f6bb804eb49286992111e9",
      "commit": "9fedef728326adfff11d4b5b481875d0617a8e3e",
      "digest": "sha256:8e5072487814a8cccf0a89cd50c22db351b9e07de0784e7e6367ab91dc4ef892",
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
      "claim_id": "claim-c45f7d59-f86c-4cb2-9620-5011de936a06",
      "claimed_at": "2026-10-12T14:11:15.645Z",
      "expires_at": "2026-10-12T22:11:15.645Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T14:11:15.645Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:cf1653e9abbe048eeffc90dd438151cd4a03a3c4aa54a57c608043311a47b9be"
    },
    {
      "claim_id": "claim-e1224521-7333-46d7-be33-cd36ebcb33fb",
      "claimed_at": "2026-10-12T14:14:12.502Z",
      "expires_at": "2026-10-12T22:14:12.502Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T14:14:12.502Z",
      "role": "author",
      "session_fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "9fedef728326adfff11d4b5b481875d0617a8e3e",
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
        "joined_at": "2026-10-12T14:09:24.700Z",
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
        "event_log_digest": "sha256:276f66355e9096457c50926cfc686a5b037a5a6c53455fd73647c915aae6039a",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-6e4b55428d4701c7591940d2b6f296ce",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-6e4b55428d4701c7591940d2b6f296ce",
        "root_review_id": "review-6e4b55428d4701c7591940d2b6f296ce",
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
      "joined_at": "2026-10-12T14:09:24.700Z",
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
      "joined_at": "2026-10-12T14:11:15.640Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:cf1653e9abbe048eeffc90dd438151cd4a03a3c4aa54a57c608043311a47b9be"
    }
  },
  "record_id": "review-6e4b55428d4701c7591940d2b6f296ce",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-6e4b55428d4701c7591940d2b6f296ce",
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
  "startup_commit": "9fedef728326adfff11d4b5b481875d0617a8e3e",
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
        "digest": "sha256:22fcb3cee0ba8b7416ea756dc9fec7faf0d7ba2804c5d3cf5dc203dc80905d28",
        "path": "docs/peer-reviews/1915/plan/completed16-spr-rereview-20261012/plan/2026-10-12-2026-10-12-1915-completed16-original-session-resumption-review-6e4b55428d4701c7591940d2b6f296ce/review-6e4b55428d4701c7591940d2b6f296ce-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
