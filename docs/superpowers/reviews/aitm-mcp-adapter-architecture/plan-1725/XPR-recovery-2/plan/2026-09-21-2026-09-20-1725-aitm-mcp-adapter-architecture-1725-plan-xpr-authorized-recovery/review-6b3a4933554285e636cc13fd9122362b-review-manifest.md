<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "fe041541ac96ced0d9efb2ef8c1328192e59000b",
      "commit": "7f0f3193f2b66ed5d8e71a01961e300445efe047",
      "digest": "sha256:085fe0853bba0b768743d1a755e660da1aae5bed2df433cda594a2acb05249a4",
      "path": "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "0f50110733422d4fa75b18cd694ca9337ab58421",
      "commit": "7dedd176c7f2cd0234d9fda2aef9990d9d5ad7cd",
      "digest": "sha256:c3afe525cfce93f36259a957ae5d69e1289adfb6c003dac77022605717431520",
      "path": "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-324a0ea5-2bf7-4c39-b75e-34a5c5b0f509",
      "claimed_at": "2026-09-21T10:11:04.770Z",
      "expires_at": "2026-09-21T18:11:04.770Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-21T10:11:04.770Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:fa6e722768770df083577a8f479f19eba98629e6a80a66a1b518833a80cecd95"
    },
    {
      "claim_id": "claim-90197e8f-3770-4ba8-8b87-d21d12b45fae",
      "claimed_at": "2026-09-21T14:26:46.856Z",
      "expires_at": "2026-09-21T22:26:46.856Z",
      "host": "codex",
      "last_activity_at": "2026-09-21T14:26:46.856Z",
      "role": "author",
      "session_fingerprint": "sha256:877852f77c3f9ff5c23684f54e264e16ac7811aed4ac74f445590f4425bc977c"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "7dedd176c7f2cd0234d9fda2aef9990d9d5ad7cd",
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
            "fingerprint": "sha256:877852f77c3f9ff5c23684f54e264e16ac7811aed4ac74f445590f4425bc977c",
            "source": "environment-declaration"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-21T10:10:24.663Z",
        "model_display": "GPT-6 Astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:877852f77c3f9ff5c23684f54e264e16ac7811aed4ac74f445590f4425bc977c"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:afdbfa8098b154cfcb2a1900d66a76acba3efea3e4a58ffe5920e960cea3e033",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "1725-plan-xpr-authorized-recovery",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-6b3a4933554285e636cc13fd9122362b",
        "root_review_id": "review-6b3a4933554285e636cc13fd9122362b",
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
          "fingerprint": "sha256:877852f77c3f9ff5c23684f54e264e16ac7811aed4ac74f445590f4425bc977c",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-21T10:10:24.663Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:877852f77c3f9ff5c23684f54e264e16ac7811aed4ac74f445590f4425bc977c"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "claude-opus-5",
          "observed_id": null,
          "requested_id": null,
          "source": "configuration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:fa6e722768770df083577a8f479f19eba98629e6a80a66a1b518833a80cecd95",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-21T10:11:04.769Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:fa6e722768770df083577a8f479f19eba98629e6a80a66a1b518833a80cecd95"
    }
  },
  "record_id": "1725-plan-xpr-authorized-recovery",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-6b3a4933554285e636cc13fd9122362b",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "7f0f3193f2b66ed5d8e71a01961e300445efe047",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "0f50110733422d4fa75b18cd694ca9337ab58421",
        "digest": "sha256:c3afe525cfce93f36259a957ae5d69e1289adfb6c003dac77022605717431520",
        "path": "docs/superpowers/plans/2026-09-20-1725-aitm-mcp-adapter-architecture.md"
      },
      "author_response": {
        "digest": "sha256:a67be5de32130728b5544d4ff476da9a0969c48570606a5a4505b07bee80c833",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-author-response-1.md"
      },
      "commit": "7dedd176c7f2cd0234d9fda2aef9990d9d5ad7cd",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:4e2fbe5c870a7598f526865acb390a6139458a92d3c864fd44079625bc718414",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-reviewer-response-1.md"
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
        "digest": "sha256:97d73892d63b44d10831b70e52ae2112bbb43cc0f79313b0062f8c7e70a0eb65",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/plan-1725/XPR-recovery-2/plan/2026-09-21-2026-09-20-1725-aitm-mcp-adapter-architecture-1725-plan-xpr-authorized-recovery/review-6b3a4933554285e636cc13fd9122362b-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
