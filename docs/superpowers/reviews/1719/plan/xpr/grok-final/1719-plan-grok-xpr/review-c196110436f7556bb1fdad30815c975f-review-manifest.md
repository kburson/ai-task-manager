<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "ada402774d5c7dac36103f149c67cb8438ad3b31",
      "commit": "dd46bb0277395f3b0b8b63820796e9d12646af25",
      "digest": "sha256:0c342a6fb44f083ccbf4a2083c3da1457db4977cc6df0252cc2b18226878dfea",
      "path": "docs/superpowers/plans/2026-09-21-1719-story-token-cost.md",
      "snapshot": null,
      "turn": 0
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-21-1719-story-token-cost.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-d4f31257-5457-4635-bffe-e3a08a46ef4f",
      "claimed_at": "2026-09-21T10:50:42.277Z",
      "expires_at": "2026-09-21T18:50:42.277Z",
      "host": "grok",
      "last_activity_at": "2026-09-21T10:50:42.277Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:3ab0a439a9151f60b926abcd59504dc030a6e60d8764f607d70bcaaafce77d3c"
    },
    {
      "claim_id": "claim-b235e18d-f149-4b72-a919-b96e433450dd",
      "claimed_at": "2026-09-21T10:52:42.329Z",
      "expires_at": "2026-09-21T18:52:42.329Z",
      "host": "codex",
      "last_activity_at": "2026-09-21T10:52:42.329Z",
      "role": "author",
      "session_fingerprint": "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "dd46bb0277395f3b0b8b63820796e9d12646af25",
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
        "joined_at": "2026-09-21T10:50:03.574Z",
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
        "event_log_digest": "sha256:2870f1e816d931a3ff74715b640a8805db1bb42a9b209f0b08e3e222fc163238",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "1719-plan-grok-xpr",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-c196110436f7556bb1fdad30815c975f",
        "root_review_id": "review-c196110436f7556bb1fdad30815c975f",
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
      "joined_at": "2026-09-21T10:50:03.574Z",
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
          "declared_id": "grok-4.6",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:3ab0a439a9151f60b926abcd59504dc030a6e60d8764f607d70bcaaafce77d3c",
          "source": "environment-declaration"
        }
      },
      "host": "grok",
      "identity_source": "runtime",
      "joined_at": "2026-09-21T10:50:42.276Z",
      "model_display": "Grok 4.6",
      "model_id": "grok-4.6",
      "provider": "xai",
      "role": "reviewer",
      "session_fingerprint": "sha256:3ab0a439a9151f60b926abcd59504dc030a6e60d8764f607d70bcaaafce77d3c"
    }
  },
  "record_id": "1719-plan-grok-xpr",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-c196110436f7556bb1fdad30815c975f",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "dd46bb0277395f3b0b8b63820796e9d12646af25",
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
        "digest": "sha256:55b858630e351ee139a2a502ac022c3f7b18782e7338147dbc9647e8ba35a953",
        "path": "docs/superpowers/reviews/1719/plan/xpr/grok-final/1719-plan-grok-xpr/review-c196110436f7556bb1fdad30815c975f-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
