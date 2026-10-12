<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "d23034beb8f224f83871cdfa99a8cc6019710d87",
      "commit": "de0a1aede3d84cd46c26d0832072bfa762e4adbc",
      "digest": "sha256:55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac",
      "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
      "snapshot": null,
      "turn": 0
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-2fa12661-52c4-437c-8d8a-64ef0b78d1fa",
      "claimed_at": "2026-10-12T12:38:40.378Z",
      "expires_at": "2026-10-12T20:38:40.378Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-12T12:38:40.378Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:5f19b3c770ccc4525b613cb0085fbf1df82e319b0074907437c1de06e8ec2739"
    },
    {
      "claim_id": "claim-41b8ef7f-2b61-4578-9b47-5c94341e4bd3",
      "claimed_at": "2026-10-12T12:43:32.356Z",
      "expires_at": "2026-10-12T20:43:32.356Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T12:43:32.356Z",
      "role": "author",
      "session_fingerprint": "sha256:137f52ec5d91ccdcf41f7f184da96dbecfc99fdb3a754cd482aa0d13503e6c25"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "de0a1aede3d84cd46c26d0832072bfa762e4adbc",
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
        "joined_at": "2026-10-12T12:37:04.740Z",
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
        "event_log_digest": "sha256:c5948dd7aac23d26d5b86362e008d4788ef270ab0f3f0579d341721ee48e7baf",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-27134fe4d7e6a0f85e31058ba56a7e8b",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-27134fe4d7e6a0f85e31058ba56a7e8b",
        "root_review_id": "review-27134fe4d7e6a0f85e31058ba56a7e8b",
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
      "joined_at": "2026-10-12T12:37:04.740Z",
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
          "fingerprint": "sha256:5f19b3c770ccc4525b613cb0085fbf1df82e319b0074907437c1de06e8ec2739",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-12T12:38:40.352Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:5f19b3c770ccc4525b613cb0085fbf1df82e319b0074907437c1de06e8ec2739"
    }
  },
  "record_id": "review-27134fe4d7e6a0f85e31058ba56a7e8b",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-27134fe4d7e6a0f85e31058ba56a7e8b",
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
  "startup_commit": "de0a1aede3d84cd46c26d0832072bfa762e4adbc",
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
        "digest": "sha256:95bc41ab1238fb0bec00e35d52def972162873020f9bd9dd21c24a29d41a522a",
        "path": "docs/peer-reviews/1915/spec/invoking-author-xpr-20261012/spec/2026-10-12-2026-10-11-1915-completed16-resumption-design-review-27134fe4d7e6a0f85e31058ba56a7e8b/review-27134fe4d7e6a0f85e31058ba56a7e8b-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
