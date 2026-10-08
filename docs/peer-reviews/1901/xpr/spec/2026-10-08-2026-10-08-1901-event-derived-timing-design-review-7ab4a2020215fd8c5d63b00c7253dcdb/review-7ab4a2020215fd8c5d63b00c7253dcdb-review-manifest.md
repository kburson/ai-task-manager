<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "292c2008e330d3b628dc6b7a84e2d1f360839e62",
      "commit": "06743dbddd6f9001d60b5674e52824230aead9f0",
      "digest": "sha256:e85871a74daba96ecc2310e0e0a3756759230bb0a1b1fcd7006e3eb73353ebbc",
      "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "db7201ee19f1e08c7507d157c80f03861921d3b7",
      "commit": "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d",
      "digest": "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767",
      "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "b47734b6626d971a5d67a879c03bebc2c928c84f",
      "commit": "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8",
      "digest": "sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f",
      "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-6c66b3cf-f87e-479a-a636-a396defe1795",
      "claimed_at": "2026-10-08T21:01:26.811Z",
      "expires_at": "2026-10-09T05:01:26.811Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-08T21:01:26.811Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
    },
    {
      "claim_id": "claim-926e5008-7aaa-49a6-83f6-9e20f5367879",
      "claimed_at": "2026-10-08T21:05:53.688Z",
      "expires_at": "2026-10-09T05:05:53.688Z",
      "host": "codex",
      "last_activity_at": "2026-10-08T21:05:53.688Z",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8",
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
            "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-08T21:00:32.785Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:ebc571b8c9a350bc34ef1e4932f1bf24591fc4f109bf615e4938e7b716429d01",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
        "root_review_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
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
          "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-08T21:00:32.785Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
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
          "fingerprint": "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-08T21:01:26.774Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
    }
  },
  "record_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
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
    "project_root_digest": "3e6c69f5fabf249449b6c1f3115736df8c4b09a4c7a3f07ba7e8516fa1633183",
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
  "startup_commit": "06743dbddd6f9001d60b5674e52824230aead9f0",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "db7201ee19f1e08c7507d157c80f03861921d3b7",
        "digest": "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767",
        "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
      },
      "author_response": {
        "digest": "sha256:3f7ecf05e4ebfeb388f4a2bd5e4d2e54e2d04e5c610d810556260cb103657e1b",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-author-response-1.md"
      },
      "commit": "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006",
        "R1-F007",
        "R1-F008"
      ],
      "reviewer_response": {
        "digest": "sha256:2cdaf16239d462436a1d1e3f914bdfa1897930460aca81a4929ff3bae8883d58",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "b47734b6626d971a5d67a879c03bebc2c928c84f",
        "digest": "sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f",
        "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
      },
      "author_response": {
        "digest": "sha256:6b04f601d295e1e65a5b9a3bd2c2703acd4cff15ba8ddee9ee12776132bc6444",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-author-response-2.md"
      },
      "commit": "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003",
        "R2-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:5c33ee50bc7b0e12228e54eae29f4294e7b2430bc16bba728d38d5ee971186b5",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R3-F001",
        "R3-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:89db4ee401f501d32e4752ebfecfe157c1f333707047ed06ef973ae04b9750be",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
