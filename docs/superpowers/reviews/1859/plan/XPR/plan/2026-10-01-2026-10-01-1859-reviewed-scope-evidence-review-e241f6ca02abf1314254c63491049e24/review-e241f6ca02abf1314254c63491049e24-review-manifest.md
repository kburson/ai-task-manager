<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "60976e24ee22df9e50414481d106b83df3f3a77b",
      "commit": "e9132c115bed26a7cf11547036c08a3320e91770",
      "digest": "sha256:01f793bafcb4abe733c971d5cd51f3d25b8a520340cbbfa279af1600141846a1",
      "path": "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "d501902d51c4b5862aa3313d2d3040692c490d45",
      "commit": "4449fc6e2689b7573b6fb8000f19fd680ca57079",
      "digest": "sha256:6a8d2e79b672b4cee2019f15e9bb9325b39457d7976ab33824c3fcafa4c6dc7b",
      "path": "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-a701464f-1480-4967-bcee-3f16bcf77ec2",
      "claimed_at": "2026-10-01T18:55:57.063Z",
      "expires_at": "2026-10-02T02:55:57.063Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-01T18:55:57.063Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:78e1e126efa721437702af97a20e6d900e2af0940e565273ddfdaae8f11322e9"
    },
    {
      "claim_id": "claim-0c4d0aff-b8b8-4ca3-8deb-e48db388d1b3",
      "claimed_at": "2026-10-01T18:58:42.209Z",
      "expires_at": "2026-10-02T02:58:42.209Z",
      "host": "codex",
      "last_activity_at": "2026-10-01T18:58:42.209Z",
      "role": "author",
      "session_fingerprint": "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "4449fc6e2689b7573b6fb8000f19fd680ca57079",
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
            "fingerprint": "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-01T18:55:11.088Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:97947d81a988ea116b4d54c263d2a54dc6b3d6d10e16de92a8074f7ac685cd7e",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-e241f6ca02abf1314254c63491049e24",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-e241f6ca02abf1314254c63491049e24",
        "root_review_id": "review-e241f6ca02abf1314254c63491049e24",
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
          "fingerprint": "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-01T18:55:11.088Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3"
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
          "fingerprint": "sha256:78e1e126efa721437702af97a20e6d900e2af0940e565273ddfdaae8f11322e9",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-01T18:55:57.033Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:78e1e126efa721437702af97a20e6d900e2af0940e565273ddfdaae8f11322e9"
    }
  },
  "record_id": "review-e241f6ca02abf1314254c63491049e24",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-e241f6ca02abf1314254c63491049e24",
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
    "project_root_digest": "2f47cdbb25b04316d9e41756d29454a08135078232a29076a3fd4ac3f6eaa415",
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
  "startup_commit": "e9132c115bed26a7cf11547036c08a3320e91770",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "d501902d51c4b5862aa3313d2d3040692c490d45",
        "digest": "sha256:6a8d2e79b672b4cee2019f15e9bb9325b39457d7976ab33824c3fcafa4c6dc7b",
        "path": "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md"
      },
      "author_response": {
        "digest": "sha256:041376f9889a86f698d59be55d1c0d00a64c0852eda872c3ed2ced0db010d9c3",
        "path": "docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-author-response-1.md"
      },
      "commit": "4449fc6e2689b7573b6fb8000f19fd680ca57079",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:bb2d898bd777146d02bc7768fa2c691d72027e5cbded603578786c606884d8ee",
        "path": "docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-reviewer-response-1.md"
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
        "digest": "sha256:9c95b3e8096aa9c6227065a0f21b5a519a13f91738bb331bb6b55d1334f636a5",
        "path": "docs/superpowers/reviews/1859/plan/XPR/plan/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-review-e241f6ca02abf1314254c63491049e24/review-e241f6ca02abf1314254c63491049e24-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
