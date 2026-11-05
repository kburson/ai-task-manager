<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "8869564648c1fd36014756089fb28b2af89467ea",
      "commit": "7ffd955205c6c2034ea39a08bdf2d6463dd2a38e",
      "digest": "sha256:63fc3df473ff99f25747185ab5bb32973d325f8bb09b8c2bb9c7bfc676613847",
      "path": "docs/superpowers/plans/2026-11-03-2148-location-mutation-authority.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "591f35c0a7fab82cb24b18ae787ffadf6eccfb7d",
      "commit": "66d794de91635dbf7f352ca54b61e386119d17f7",
      "digest": "sha256:d9fc6b6e7935fec5719a48151f425f454731346f69cc4e22b3b31cd92db7dc5c",
      "path": "docs/superpowers/plans/2026-11-03-2148-location-mutation-authority.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-11-03-2148-location-mutation-authority.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-07a0a6a2-3c4a-4df7-baf9-61a3dc57f179",
      "claimed_at": "2026-11-05T02:45:22.560Z",
      "expires_at": "2026-11-05T10:45:22.560Z",
      "host": "claude-code",
      "last_activity_at": "2026-11-05T02:45:22.560Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:120b897078ed9d7b673ab842ca4659d6c82aea68f2e1bdd29d2c6b08e3227c13"
    },
    {
      "claim_id": "claim-7ad29b34-ec1b-4885-9810-6ebaca4b3038",
      "claimed_at": "2026-11-05T02:46:52.379Z",
      "expires_at": "2026-11-05T10:46:52.379Z",
      "host": "codex",
      "last_activity_at": "2026-11-05T02:46:52.379Z",
      "role": "author",
      "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "66d794de91635dbf7f352ca54b61e386119d17f7",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "observed",
            "conflict": false,
            "declared_id": null,
            "observed_id": "gpt-6-astra",
            "requested_id": null,
            "source": "provider-result"
          },
          "session": {
            "assurance": "observed",
            "fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-11-04T01:48:24.871Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:952fd68afb2db212fd579135272bbb8f9de5c376bda95f19f108c8f163be9ee8",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-c07dd9fe67f293cd31248e6d408a8b37",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-c07dd9fe67f293cd31248e6d408a8b37",
        "root_review_id": "review-c07dd9fe67f293cd31248e6d408a8b37",
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
          "assurance": "observed",
          "conflict": false,
          "declared_id": null,
          "observed_id": "gpt-6-astra",
          "requested_id": null,
          "source": "provider-result"
        },
        "session": {
          "assurance": "observed",
          "fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-11-04T01:48:24.871Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": null,
          "observed_id": null,
          "requested_id": "claude-opus-5-5",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:120b897078ed9d7b673ab842ca4659d6c82aea68f2e1bdd29d2c6b08e3227c13",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-11-05T02:45:22.559Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:120b897078ed9d7b673ab842ca4659d6c82aea68f2e1bdd29d2c6b08e3227c13"
    }
  },
  "record_id": "review-c07dd9fe67f293cd31248e6d408a8b37",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-c07dd9fe67f293cd31248e6d408a8b37",
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
    "project_root_digest": "2fc769d31c878ba1a658b16c0212d754c934d08f85826988500311a8014b5f07",
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
  "startup_commit": "7ffd955205c6c2034ea39a08bdf2d6463dd2a38e",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "591f35c0a7fab82cb24b18ae787ffadf6eccfb7d",
        "digest": "sha256:d9fc6b6e7935fec5719a48151f425f454731346f69cc4e22b3b31cd92db7dc5c",
        "path": "docs/superpowers/plans/2026-11-03-2148-location-mutation-authority.md"
      },
      "author_response": {
        "digest": "sha256:bd63a4dc7a46474cf009cf23ce8686f19acf65a2982fd90791fbf017aabdd5e5",
        "path": "docs/peer-reviews/plan/2026-11-04-2026-11-03-2148-location-mutation-authority-review-c07dd9fe67f293cd31248e6d408a8b37/review-c07dd9fe67f293cd31248e6d408a8b37-author-response-1.md"
      },
      "commit": "66d794de91635dbf7f352ca54b61e386119d17f7",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:80206d2f397736b9dfda6d3429a3e0016bd18e46c14d9bbb49e2b258fa2b79e1",
        "path": "docs/peer-reviews/plan/2026-11-04-2026-11-03-2148-location-mutation-authority-review-c07dd9fe67f293cd31248e6d408a8b37/review-c07dd9fe67f293cd31248e6d408a8b37-reviewer-response-1.md"
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
        "digest": "sha256:d5759875d81e56ca4569f8e31369f4677a3a403b34a0101a6c1a8c511b855f7d",
        "path": "docs/peer-reviews/plan/2026-11-04-2026-11-03-2148-location-mutation-authority-review-c07dd9fe67f293cd31248e6d408a8b37/review-c07dd9fe67f293cd31248e6d408a8b37-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
