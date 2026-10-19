<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "d777a17ac10117677f65776a55adc04e230900d8",
      "commit": "83d422e92cf5f1ca95a5ef9ebd514c85698ee72e",
      "digest": "sha256:20b29a899742f77244f1a910bc1363f5fee8901f4f595e94bd9be46198f1fcc2",
      "path": "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "4247db3317a84c6bd6370915bf7a67768e6fda02",
      "commit": "acb725feafc26e31bccfd18b96e9b5e517137397",
      "digest": "sha256:3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4",
      "path": "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-25ef3f9b-c01e-42a3-84fc-cdfb44f1d776",
      "claimed_at": "2026-10-11T14:27:52.181Z",
      "expires_at": "2026-10-11T22:27:52.181Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-11T14:27:52.181Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:72a52ca24cb6d4dd4a36057be14d196a8e893cbdaf46f79afd97c8400ed95ec5"
    },
    {
      "claim_id": "claim-e155a333-a9d5-49c8-af5e-a3c8b2686a6f",
      "claimed_at": "2026-10-11T14:29:47.936Z",
      "expires_at": "2026-10-11T22:29:47.936Z",
      "host": "codex",
      "last_activity_at": "2026-10-11T14:29:47.936Z",
      "role": "author",
      "session_fingerprint": "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "acb725feafc26e31bccfd18b96e9b5e517137397",
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
        "joined_at": "2026-10-11T14:27:06.305Z",
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
        "event_log_digest": "sha256:271a0218d0ace027d405688d1434221e0817f7a1494ceada0cbe800841ab4573",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-2cf594a8a446f9552e00ecc0ef920a86",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-2cf594a8a446f9552e00ecc0ef920a86",
        "root_review_id": "review-2cf594a8a446f9552e00ecc0ef920a86",
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
      "joined_at": "2026-10-11T14:27:06.305Z",
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
          "fingerprint": "sha256:72a52ca24cb6d4dd4a36057be14d196a8e893cbdaf46f79afd97c8400ed95ec5",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-11T14:27:52.157Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:72a52ca24cb6d4dd4a36057be14d196a8e893cbdaf46f79afd97c8400ed95ec5"
    }
  },
  "record_id": "review-2cf594a8a446f9552e00ecc0ef920a86",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-2cf594a8a446f9552e00ecc0ef920a86",
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
  "startup_commit": "83d422e92cf5f1ca95a5ef9ebd514c85698ee72e",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "4247db3317a84c6bd6370915bf7a67768e6fda02",
        "digest": "sha256:3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4",
        "path": "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md"
      },
      "author_response": {
        "digest": "sha256:a863f5f0da324e01e479c6381865ae73f14d6a2d28190a2858bb56e473a0c1d0",
        "path": "docs/superpowers/reviews/1908/spec/XPR/spec/2026-10-11-2026-10-11-1908-reestimate-decomposition-design-review-2cf594a8a446f9552e00ecc0ef920a86/review-2cf594a8a446f9552e00ecc0ef920a86-author-response-1.md"
      },
      "commit": "acb725feafc26e31bccfd18b96e9b5e517137397",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:c66ba6f1f694e17508bd8b42584d7343e7dd6eb722d3ca7ae083005afec316b1",
        "path": "docs/superpowers/reviews/1908/spec/XPR/spec/2026-10-11-2026-10-11-1908-reestimate-decomposition-design-review-2cf594a8a446f9552e00ecc0ef920a86/review-2cf594a8a446f9552e00ecc0ef920a86-reviewer-response-1.md"
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
        "digest": "sha256:0e135b54c6462304b35762973ba233b375347b57c31c571cb3436c6bb1275d34",
        "path": "docs/superpowers/reviews/1908/spec/XPR/spec/2026-10-11-2026-10-11-1908-reestimate-decomposition-design-review-2cf594a8a446f9552e00ecc0ef920a86/review-2cf594a8a446f9552e00ecc0ef920a86-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
