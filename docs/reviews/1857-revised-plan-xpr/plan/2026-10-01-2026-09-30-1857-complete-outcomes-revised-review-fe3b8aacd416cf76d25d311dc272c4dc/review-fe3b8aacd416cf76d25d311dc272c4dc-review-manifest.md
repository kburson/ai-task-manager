<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "bb2eae7c25bda295c87772ef0f5cbaa8ad99780b",
      "commit": "ba5d00817fd387181d9a264f7687c186a3370f9e",
      "digest": "sha256:8835ec6a7d95ceec7ec7df6d478d01092e9221e9b7403d3989c80cf667b4307e",
      "path": "docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "ccf0bc65ef16d389313be94df1ac66061e27a78c",
      "commit": "2079261adada8e9c4087c6c66a0b4a76031618d8",
      "digest": "sha256:cf4b8ab03e4dac6ef1b4e0d602b2da8476b685c5d98089e62192a607375c4713",
      "path": "docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-c191883b-d0be-4a8e-b463-d006511369cc",
      "claimed_at": "2026-10-01T05:51:41.363Z",
      "expires_at": "2026-10-01T13:51:41.363Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-01T05:51:41.363Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:c9125952da149fd3712e65df311e6de5c91e318ed41e211b32dfed3d7ab5ef12"
    },
    {
      "claim_id": "claim-a896293c-80f2-4603-8ad4-f592b029df9d",
      "claimed_at": "2026-10-01T05:54:09.704Z",
      "expires_at": "2026-10-01T13:54:09.704Z",
      "host": "codex",
      "last_activity_at": "2026-10-01T05:54:09.704Z",
      "role": "author",
      "session_fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "2079261adada8e9c4087c6c66a0b4a76031618d8",
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
            "requested_id": "gpt-6-astra",
            "source": "launch-request"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-01T05:48:17.026Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:8b1617d8cfa92bb83c2c6161472c77aa4cb9b290994e0afc679bda85c09ddc93",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-fe3b8aacd416cf76d25d311dc272c4dc",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-fe3b8aacd416cf76d25d311dc272c4dc",
        "root_review_id": "review-fe3b8aacd416cf76d25d311dc272c4dc",
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
          "requested_id": "gpt-6-astra",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-01T05:48:17.026Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc"
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
          "fingerprint": "sha256:c9125952da149fd3712e65df311e6de5c91e318ed41e211b32dfed3d7ab5ef12",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-01T05:51:41.337Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:c9125952da149fd3712e65df311e6de5c91e318ed41e211b32dfed3d7ab5ef12"
    }
  },
  "record_id": "review-fe3b8aacd416cf76d25d311dc272c4dc",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-fe3b8aacd416cf76d25d311dc272c4dc",
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
    "project_root_digest": "30ce30ffb13c4f3ff4ef6b74293388b10979f563375a8cdf0008efe1236f6e03",
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
  "startup_commit": "ba5d00817fd387181d9a264f7687c186a3370f9e",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "ccf0bc65ef16d389313be94df1ac66061e27a78c",
        "digest": "sha256:cf4b8ab03e4dac6ef1b4e0d602b2da8476b685c5d98089e62192a607375c4713",
        "path": "docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md"
      },
      "author_response": {
        "digest": "sha256:194a70225ad5686683f0b4a8c0bb2a94b22f477cdb37d5d376eef2c6947beb37",
        "path": "docs/reviews/1857-revised-plan-xpr/plan/2026-10-01-2026-09-30-1857-complete-outcomes-revised-review-fe3b8aacd416cf76d25d311dc272c4dc/review-fe3b8aacd416cf76d25d311dc272c4dc-author-response-1.md"
      },
      "commit": "2079261adada8e9c4087c6c66a0b4a76031618d8",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:1d63d2f36107deb0c3c45c3aa78808d0a59cec105ff451aab7fcca42c40266bb",
        "path": "docs/reviews/1857-revised-plan-xpr/plan/2026-10-01-2026-09-30-1857-complete-outcomes-revised-review-fe3b8aacd416cf76d25d311dc272c4dc/review-fe3b8aacd416cf76d25d311dc272c4dc-reviewer-response-1.md"
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
        "digest": "sha256:c11f6d9a07dcb88440f05fabd5316c13e6662f28943d2ec011bf63c56243df41",
        "path": "docs/reviews/1857-revised-plan-xpr/plan/2026-10-01-2026-09-30-1857-complete-outcomes-revised-review-fe3b8aacd416cf76d25d311dc272c4dc/review-fe3b8aacd416cf76d25d311dc272c4dc-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
