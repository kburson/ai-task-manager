<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "b79199c74dc6ba4b6888dc8866c11a3d3e238383",
      "commit": "29d09ff1ec0bba9e484da71a6af17ac5ea08271d",
      "digest": "sha256:0db2ebf7e7f59aa3b1bcb99b6b4d0b9ed4a6bb1d412e8210d916ff3ed8469267",
      "path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "244509a5f4da21cd7e2d3e2f479a58b4772aec8d",
      "commit": "6ffa587b2db0a89876e04e3946f66356f35c53c2",
      "digest": "sha256:496db79175d9cf0f046f073db119704148ab53596f1b8298c89d739b155535bb",
      "path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-204264f5-60da-41da-8147-916469fdeafc",
      "claimed_at": "2026-09-30T17:47:27.447Z",
      "expires_at": "2026-10-01T01:47:27.447Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-30T17:47:27.447Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:8182dd25c53e42272363b7c259fd4bea5763d10a5ecaa21a2e54717c1e91d762"
    },
    {
      "claim_id": "claim-96c9dfbe-a2b1-478b-9514-74a6108d608e",
      "claimed_at": "2026-09-30T17:48:38.944Z",
      "expires_at": "2026-10-01T01:48:38.944Z",
      "host": "codex",
      "last_activity_at": "2026-09-30T17:48:38.944Z",
      "role": "author",
      "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "6ffa587b2db0a89876e04e3946f66356f35c53c2",
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
            "fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-30T17:46:11.805Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:647f1c293cd06cdec60e31efa8c34253e290eba27edd3d5dda8a9621220fc8fb",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-cca8cd1a6c8765cfef624488b76e2c68",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-cca8cd1a6c8765cfef624488b76e2c68",
        "root_review_id": "review-cca8cd1a6c8765cfef624488b76e2c68",
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
          "fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T17:46:11.805Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
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
          "fingerprint": "sha256:8182dd25c53e42272363b7c259fd4bea5763d10a5ecaa21a2e54717c1e91d762",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T17:47:27.414Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:8182dd25c53e42272363b7c259fd4bea5763d10a5ecaa21a2e54717c1e91d762"
    }
  },
  "record_id": "review-cca8cd1a6c8765cfef624488b76e2c68",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-cca8cd1a6c8765cfef624488b76e2c68",
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
    "project_root_digest": "32690d9d047b0cc884eca4e33bd88c9787017eef175783d78c1ea42fcab0f9a0",
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
  "startup_commit": "29d09ff1ec0bba9e484da71a6af17ac5ea08271d",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "244509a5f4da21cd7e2d3e2f479a58b4772aec8d",
        "digest": "sha256:496db79175d9cf0f046f073db119704148ab53596f1b8298c89d739b155535bb",
        "path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md"
      },
      "author_response": {
        "digest": "sha256:96d46dd9983265233659c279103f3cd208af1cf79e46022865007a6065cde535",
        "path": "docs/peer-reviews/1847/Plan-XPR-canonical-titles/plan/2026-09-30-2026-09-30-1847-governed-criteria-revisions-review-cca8cd1a6c8765cfef624488b76e2c68/review-cca8cd1a6c8765cfef624488b76e2c68-author-response-1.md"
      },
      "commit": "6ffa587b2db0a89876e04e3946f66356f35c53c2",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:52892eaa40e82025d0d67b6533aa5ecb39c67134f0741f84764c5ad8084535fe",
        "path": "docs/peer-reviews/1847/Plan-XPR-canonical-titles/plan/2026-09-30-2026-09-30-1847-governed-criteria-revisions-review-cca8cd1a6c8765cfef624488b76e2c68/review-cca8cd1a6c8765cfef624488b76e2c68-reviewer-response-1.md"
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
        "digest": "sha256:f22b4a7b7768e77f3fad3943b13e73225c963d6584d0002c7c601a3337b387e4",
        "path": "docs/peer-reviews/1847/Plan-XPR-canonical-titles/plan/2026-09-30-2026-09-30-1847-governed-criteria-revisions-review-cca8cd1a6c8765cfef624488b76e2c68/review-cca8cd1a6c8765cfef624488b76e2c68-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
