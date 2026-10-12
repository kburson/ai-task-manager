<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "4cb0d0b2a1add9d6367d89dbdf0809be65c39d7e",
      "commit": "ce566ab6b16da78b546d184eb6862e601d0f5387",
      "digest": "sha256:ae5b023ce0d532cf6a9d45273b9bce71f035bf56a8423f57c141de74f36dc463",
      "path": "docs/design/2026-09-14-56-macos-broker-endpoint-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "1e2f5965ba3b468d84ef1806f55280df3ee31c6c",
      "commit": "e075f4e3dae0be5d0e444357e6727ee98d16a577",
      "digest": "sha256:93045bf8ed914ae17ef4ed181bad2bf0cb53acf0156b8fa155dffb0300aa3e2d",
      "path": "docs/design/2026-09-14-56-macos-broker-endpoint-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/design/2026-09-14-56-macos-broker-endpoint-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-2beccca6-f178-4b46-bca9-7ef440ec72b7",
      "claimed_at": "2026-09-19T21:08:22.757Z",
      "expires_at": "2026-09-20T05:08:22.757Z",
      "host": "grok",
      "last_activity_at": "2026-09-19T21:08:22.757Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
    },
    {
      "claim_id": "claim-4a4988e1-6322-4e70-bcbf-8ab145f8c9f9",
      "claimed_at": "2026-09-19T21:17:32.979Z",
      "expires_at": "2026-09-20T05:17:32.979Z",
      "host": "codex",
      "last_activity_at": "2026-09-19T21:17:32.979Z",
      "role": "author",
      "session_fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "e075f4e3dae0be5d0e444357e6727ee98d16a577",
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
            "fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9",
            "source": "environment-declaration"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-19T21:05:37.996Z",
        "model_display": "GPT-6 Astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:ebed50253c9a250606fae512a1958503b2822d219e7d9e8eade27c6a19ee0b56",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-ac3e35c32b02cc36dbbf5bebb20c0a70",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-ac3e35c32b02cc36dbbf5bebb20c0a70",
        "root_review_id": "review-ac3e35c32b02cc36dbbf5bebb20c0a70",
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
          "fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-19T21:05:37.996Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
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
          "fingerprint": "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb",
          "source": "environment-declaration"
        }
      },
      "host": "grok",
      "identity_source": "runtime",
      "joined_at": "2026-09-19T21:08:22.756Z",
      "model_display": "Grok 4.6",
      "model_id": "grok-4.6",
      "provider": "xai",
      "role": "reviewer",
      "session_fingerprint": "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
    }
  },
  "record_id": "review-ac3e35c32b02cc36dbbf5bebb20c0a70",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-ac3e35c32b02cc36dbbf5bebb20c0a70",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "ce566ab6b16da78b546d184eb6862e601d0f5387",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "1e2f5965ba3b468d84ef1806f55280df3ee31c6c",
        "digest": "sha256:93045bf8ed914ae17ef4ed181bad2bf0cb53acf0156b8fa155dffb0300aa3e2d",
        "path": "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
      },
      "author_response": {
        "digest": "sha256:54210d5637798a5200cb4f0bd929a4f956ecfab5e44a39de061e5ebd4a992f1f",
        "path": "docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-author-response-1.md"
      },
      "commit": "e075f4e3dae0be5d0e444357e6727ee98d16a577",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:7aa59703fd6e957438855217a49fc33cb4278ba7365e7b74487d6a785519901d",
        "path": "docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-reviewer-response-1.md"
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
        "digest": "sha256:fb190fd2b1bab19e25f65fd259addc63f58fee54ca68f124e08da0ef1e12741f",
        "path": "docs/peer-reviews/spec/2026-09-19-2026-09-14-56-macos-broker-endpoint-design-review-ac3e35c32b02cc36dbbf5bebb20c0a70/review-ac3e35c32b02cc36dbbf5bebb20c0a70-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
