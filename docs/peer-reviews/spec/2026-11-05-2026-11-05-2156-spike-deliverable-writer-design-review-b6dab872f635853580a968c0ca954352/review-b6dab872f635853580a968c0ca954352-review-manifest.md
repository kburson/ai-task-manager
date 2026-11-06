<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "e6960867ad38530c6143fa2cb37ee75adc157967",
      "commit": "b6cf83c490eaf7f692a3396080ebd9b589c47deb",
      "digest": "sha256:71cd2c7864bcc0aedf9d8d7129c65ea826d4b62e07b0d403c7fdee317a5d15e6",
      "path": "docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "7296e37f7bc87ecc45c3110c84ef1f5b7883594e",
      "commit": "48d9f3306ff8e3c7278647ece741ca67cc8cd0c1",
      "digest": "sha256:4097cb41cfcdf830e71fdbce524a5797fbf1a38da599b059a73646aca365ec07",
      "path": "docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "a02dcb1a6f8f4e4fd044f02148f58d2c47b2683a",
      "commit": "1ec9c65d79f2bb12c1f106b94faaaaa5d072c7b4",
      "digest": "sha256:08fa5cc52747e832fa06b525141be0520e47ac27810c83b383fe0dbcf7243386",
      "path": "docs/superpowers/plans/2026-11-05-2156-spike-deliverable-writer.md",
      "snapshot": null,
      "turn": 3
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-11-05-2156-spike-deliverable-writer.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-fe8d6581-d27b-4dfe-b831-c55623c41f24",
      "claimed_at": "2026-11-05T10:36:53.074Z",
      "expires_at": "2026-11-05T18:36:53.074Z",
      "host": "claude-code",
      "last_activity_at": "2026-11-05T10:36:53.074Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:9289af6373656e819643b5ba41787b2c686a71de5fbeed4455e1330583534b19"
    },
    {
      "claim_id": "claim-a16c5286-f273-4cd3-b06a-8ba8c025d6b8",
      "claimed_at": "2026-11-05T10:38:22.323Z",
      "expires_at": "2026-11-05T18:38:22.323Z",
      "host": "codex",
      "last_activity_at": "2026-11-05T10:38:22.323Z",
      "role": "author",
      "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "1ec9c65d79f2bb12c1f106b94faaaaa5d072c7b4",
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
            "requested_id": "gpt-6.1-sol",
            "source": "launch-request"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-11-05T10:36:12.773Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
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
        "event_log_digest": "sha256:bd842faa567717ead4c5660a1b3f44d9273bb3d73455cbfbc30dbc36f8177b4b",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-b6dab872f635853580a968c0ca954352",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-b6dab872f635853580a968c0ca954352",
        "root_review_id": "review-b6dab872f635853580a968c0ca954352",
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
          "requested_id": "gpt-6.1-sol",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-11-05T10:36:12.773Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
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
          "fingerprint": "sha256:9289af6373656e819643b5ba41787b2c686a71de5fbeed4455e1330583534b19",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-11-05T10:36:53.054Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:9289af6373656e819643b5ba41787b2c686a71de5fbeed4455e1330583534b19"
    }
  },
  "record_id": "review-b6dab872f635853580a968c0ca954352",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-b6dab872f635853580a968c0ca954352",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "high",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "ccaedf665170e23b4c5cee26d259cc712d8502dab338104113490879281b3dd3",
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
  "startup_commit": "b6cf83c490eaf7f692a3396080ebd9b589c47deb",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "7296e37f7bc87ecc45c3110c84ef1f5b7883594e",
        "digest": "sha256:4097cb41cfcdf830e71fdbce524a5797fbf1a38da599b059a73646aca365ec07",
        "path": "docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md"
      },
      "author_response": {
        "digest": "sha256:86fceb314e943a8cd3875886417a6a5733ab4c495e5837da1304d1bb6d003f02",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2156-spike-deliverable-writer-design-review-b6dab872f635853580a968c0ca954352/review-b6dab872f635853580a968c0ca954352-author-response-1.md"
      },
      "commit": "48d9f3306ff8e3c7278647ece741ca67cc8cd0c1",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:7285dad39e4aaa89d1d60f01970315d71b257f5d0ccc138b932b49597211dcfc",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2156-spike-deliverable-writer-design-review-b6dab872f635853580a968c0ca954352/review-b6dab872f635853580a968c0ca954352-reviewer-response-1.md"
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
        "digest": "sha256:53bd8555b6bf37645264fd84c65799763d0de016b3f17ea5993bd3d1f5ecb138",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2156-spike-deliverable-writer-design-review-b6dab872f635853580a968c0ca954352/review-b6dab872f635853580a968c0ca954352-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": {
        "blob": "a02dcb1a6f8f4e4fd044f02148f58d2c47b2683a",
        "digest": "sha256:08fa5cc52747e832fa06b525141be0520e47ac27810c83b383fe0dbcf7243386",
        "path": "docs/superpowers/plans/2026-11-05-2156-spike-deliverable-writer.md"
      },
      "author_response": {
        "digest": "sha256:541ab4eb987697e11b77f5e221fbe81d2b86b3cbdecc8e98af4084db5ef95e61",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2156-spike-deliverable-writer-design-review-b6dab872f635853580a968c0ca954352/review-b6dab872f635853580a968c0ca954352-author-response-3.md"
      },
      "commit": "1ec9c65d79f2bb12c1f106b94faaaaa5d072c7b4",
      "decision": "revisions-requested",
      "finding_ids": [
        "R3-F001",
        "R3-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:d8d73d853b2f8878b83c550dedb3dfd20691655a6ff0766c680ba315d6fa05d7",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2156-spike-deliverable-writer-design-review-b6dab872f635853580a968c0ca954352/review-b6dab872f635853580a968c0ca954352-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:5d98f36babac891157ce2b181d03aa1efdcf15512ae02112c827eb7b7dbc295b",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2156-spike-deliverable-writer-design-review-b6dab872f635853580a968c0ca954352/review-b6dab872f635853580a968c0ca954352-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    }
  ]
}
```
