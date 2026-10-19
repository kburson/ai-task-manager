<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "1c6346b45258635da8f43e38d2973ac9220623e7",
      "commit": "0f840cdcca5bfe181ec9a050fe41879b59002723",
      "digest": "sha256:9b87ec194deed5f31c118485ce2e8c5aa6e5f149085e6c41d4bf1c25e63d1873",
      "path": "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "0067d080abebbc9ced6f1907e1008210f1c9f890",
      "commit": "0fa38c7c17a8705b137a959b5ca2321556af1854",
      "digest": "sha256:80974708da66e471a11ba16888b159c417c4076ceac48aa58fbb5512fb221ff5",
      "path": "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "94428270100097627cdb192cde9891e043dfd3d2",
      "commit": "84159001f66fbe4f678ac03d03d2ec762c612ced",
      "digest": "sha256:3aade2c0eb0ec38fc784f61e03799f91b44f2ea7579c5d5fcc0cabfd9eed20c9",
      "path": "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-608d8885-02d8-4e8b-a18c-f6f569486dbc",
      "claimed_at": "2026-10-11T15:23:06.556Z",
      "expires_at": "2026-10-11T23:23:06.556Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-11T15:23:06.556Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:988367240c76a33f0b2d1184b0071fc99132abcbbb7a5499d433590d5a3b6525"
    },
    {
      "claim_id": "claim-b8294d98-5099-41c2-8731-9d4adc7cd271",
      "claimed_at": "2026-10-11T15:29:14.119Z",
      "expires_at": "2026-10-11T23:29:14.119Z",
      "host": "codex",
      "last_activity_at": "2026-10-11T15:29:14.119Z",
      "role": "author",
      "session_fingerprint": "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "84159001f66fbe4f678ac03d03d2ec762c612ced",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "observed",
            "conflict": false,
            "declared_id": null,
            "observed_id": "gpt-6.1-sol",
            "requested_id": null,
            "source": "provider-result"
          },
          "session": {
            "assurance": "observed",
            "fingerprint": "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-11T15:22:16.898Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:dbe01f470c47cae2cd06b908512ed83ef510cf55c57c12e9573477957a70205b",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-f72ed8649e6bbe30f0b4a3d179ce0f80",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-f72ed8649e6bbe30f0b4a3d179ce0f80",
        "root_review_id": "review-f72ed8649e6bbe30f0b4a3d179ce0f80",
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
          "observed_id": "gpt-6.1-sol",
          "requested_id": null,
          "source": "provider-result"
        },
        "session": {
          "assurance": "observed",
          "fingerprint": "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-11T15:22:16.898Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42"
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
          "fingerprint": "sha256:988367240c76a33f0b2d1184b0071fc99132abcbbb7a5499d433590d5a3b6525",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-11T15:23:06.515Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:988367240c76a33f0b2d1184b0071fc99132abcbbb7a5499d433590d5a3b6525"
    }
  },
  "record_id": "review-f72ed8649e6bbe30f0b4a3d179ce0f80",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-f72ed8649e6bbe30f0b4a3d179ce0f80",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "2f07147057bbeab35fa55d08a9117da94b8daf5efacff967c905cab3f2658336",
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
  "startup_commit": "0f840cdcca5bfe181ec9a050fe41879b59002723",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "0067d080abebbc9ced6f1907e1008210f1c9f890",
        "digest": "sha256:80974708da66e471a11ba16888b159c417c4076ceac48aa58fbb5512fb221ff5",
        "path": "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md"
      },
      "author_response": {
        "digest": "sha256:de0ce57f8c8c952be57539d4db2bfec1c707fe5a6dd9410fd7e878cbfee108a8",
        "path": "docs/superpowers/reviews/1908/plan/XPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-f72ed8649e6bbe30f0b4a3d179ce0f80/review-f72ed8649e6bbe30f0b4a3d179ce0f80-author-response-1.md"
      },
      "commit": "0fa38c7c17a8705b137a959b5ca2321556af1854",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:6174dcf62375567bafa0d82be4d105a803aa7a234788843087a3205e72fdc2c6",
        "path": "docs/superpowers/reviews/1908/plan/XPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-f72ed8649e6bbe30f0b4a3d179ce0f80/review-f72ed8649e6bbe30f0b4a3d179ce0f80-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "94428270100097627cdb192cde9891e043dfd3d2",
        "digest": "sha256:3aade2c0eb0ec38fc784f61e03799f91b44f2ea7579c5d5fcc0cabfd9eed20c9",
        "path": "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md"
      },
      "author_response": {
        "digest": "sha256:add33c2cabeacd847146d58a96fed9efdc93ea68c216ef48fdb447603b61b62e",
        "path": "docs/superpowers/reviews/1908/plan/XPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-f72ed8649e6bbe30f0b4a3d179ce0f80/review-f72ed8649e6bbe30f0b4a3d179ce0f80-author-response-2.md"
      },
      "commit": "84159001f66fbe4f678ac03d03d2ec762c612ced",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:2071e4c3b2bc388fbb96937d3de96eb5bbe53b427225574d8208f05c18eed9dc",
        "path": "docs/superpowers/reviews/1908/plan/XPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-f72ed8649e6bbe30f0b4a3d179ce0f80/review-f72ed8649e6bbe30f0b4a3d179ce0f80-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:9bf3255cca5ce175b735c9e07677b067bc010f127382305379596e305a61702b",
        "path": "docs/superpowers/reviews/1908/plan/XPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-f72ed8649e6bbe30f0b4a3d179ce0f80/review-f72ed8649e6bbe30f0b4a3d179ce0f80-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
