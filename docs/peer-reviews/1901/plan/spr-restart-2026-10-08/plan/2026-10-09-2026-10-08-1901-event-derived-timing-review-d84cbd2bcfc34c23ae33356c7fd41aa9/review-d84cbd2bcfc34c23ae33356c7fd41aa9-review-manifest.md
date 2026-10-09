<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "95868c2ba0f0dd7814266d9b8b192d7a21d8dd06",
      "commit": "7d85e386fc54b1fe9f9c42c6550982042152937c",
      "digest": "sha256:87cbab9c19ad2bdb00ec5b26a671dbbbc3ff9792fd115a9410e931fafd71a82e",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "88e1dd3bad7af02b5d549b0d813375dab5535b09",
      "commit": "e2e8f684208d2a2503c01dec30a689b63592dbd3",
      "digest": "sha256:036a45e3c032ec88f80eb89045b287915353873802807a58c9c8207b4d92f8aa",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "1c5f6f22e334ff1f65def384ae221594a5035fe4",
      "commit": "b20d1255fde08ab16b9ed7ddb8b76dbeef9b0355",
      "digest": "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-c91a3132-5d09-4e5f-a018-8b8de215978d",
      "claimed_at": "2026-10-09T01:32:08.947Z",
      "expires_at": "2026-10-09T09:32:08.947Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T01:32:08.947Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:19685058e4c340cdc0bdd0c9d96ee9ce7088fdd6bc6aa0d4d2eff767a83173b4"
    },
    {
      "claim_id": "claim-0d4ce1de-07ad-46ea-a60d-9b9502b6af24",
      "claimed_at": "2026-10-09T01:36:16.612Z",
      "expires_at": "2026-10-09T09:36:16.612Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T01:36:16.612Z",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "b20d1255fde08ab16b9ed7ddb8b76dbeef9b0355",
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
            "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-09T01:23:24.590Z",
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
        "event_log_digest": "sha256:cce8c6c8919ca40d2eb4a77861a6b0fb85fa2faf675e09de3fe3237078fe82cc",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-d84cbd2bcfc34c23ae33356c7fd41aa9",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-d84cbd2bcfc34c23ae33356c7fd41aa9",
        "root_review_id": "review-d84cbd2bcfc34c23ae33356c7fd41aa9",
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
          "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T01:23:24.590Z",
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
          "declared_id": "gpt-6-astra",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:19685058e4c340cdc0bdd0c9d96ee9ce7088fdd6bc6aa0d4d2eff767a83173b4",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T01:32:08.926Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:19685058e4c340cdc0bdd0c9d96ee9ce7088fdd6bc6aa0d4d2eff767a83173b4"
    }
  },
  "record_id": "review-d84cbd2bcfc34c23ae33356c7fd41aa9",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-d84cbd2bcfc34c23ae33356c7fd41aa9",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "SPR",
    "ownership": "broker",
    "project_root_digest": "3e6c69f5fabf249449b6c1f3115736df8c4b09a4c7a3f07ba7e8516fa1633183",
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
  "startup_commit": "7d85e386fc54b1fe9f9c42c6550982042152937c",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "88e1dd3bad7af02b5d549b0d813375dab5535b09",
        "digest": "sha256:036a45e3c032ec88f80eb89045b287915353873802807a58c9c8207b4d92f8aa",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:2de8f595e4b44d79a6f502519df215a13103cce9b5ae3d36b1fbd1c3b9d06b20",
        "path": "docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-author-response-1.md"
      },
      "commit": "e2e8f684208d2a2503c01dec30a689b63592dbd3",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:3e3a1f5798dbc6a120a9e1d87f48d1769fcac9413817b5a17b8ea8170d5588c4",
        "path": "docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "1c5f6f22e334ff1f65def384ae221594a5035fe4",
        "digest": "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:ed7ea2897070f1f4aaa020fc99f0460886f967a660970352bc9b04af4f986688",
        "path": "docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-author-response-2.md"
      },
      "commit": "b20d1255fde08ab16b9ed7ddb8b76dbeef9b0355",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:40d8af3afb4a762ba9f3e6ba266f8f2323511728b9d0fb9ed04463cbc24d2c55",
        "path": "docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-reviewer-response-2.md"
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
        "digest": "sha256:028bd5cfd36dfc73881240f3ae5b38f42d5d986efc9ce5df8e7e40d0d3feceed",
        "path": "docs/peer-reviews/1901/plan/spr-restart-2026-10-08/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-d84cbd2bcfc34c23ae33356c7fd41aa9/review-d84cbd2bcfc34c23ae33356c7fd41aa9-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
