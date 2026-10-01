<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "ccc18a57bfb5547f636806c5e4b24915254b564c",
      "commit": "47d3b1992fcff5c3e79dd66aa4a5396666c740b6",
      "digest": "sha256:85f1e2955149f25e10140f095d870f55d21f63910318d3ac87d779a96db953b9",
      "path": "docs/superpowers/specs/2026-10-01-1859-reviewed-scope-evidence-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "9b6febbbd730afa1705542c7286770f81eb66a1e",
      "commit": "2147677a1b3ac44fc735850b3a8b85aac9071cb8",
      "digest": "sha256:696b7483439a92a87ad3264508c9070fb7e9c599279beaa3f782ed126652380a",
      "path": "docs/superpowers/specs/2026-10-01-1859-reviewed-scope-evidence-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-01-1859-reviewed-scope-evidence-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-0326040b-94d9-4da2-a66f-b51966ecd808",
      "claimed_at": "2026-10-01T18:27:16.563Z",
      "expires_at": "2026-10-02T02:27:16.563Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-01T18:27:16.563Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:ba9ab2d520084c0520c4b45e5a474836401980c6ba5abb5645340c4b5a5f2084"
    },
    {
      "claim_id": "claim-b984ff50-37f8-48be-a450-626fd14a111d",
      "claimed_at": "2026-10-01T18:29:23.502Z",
      "expires_at": "2026-10-02T02:29:23.502Z",
      "host": "codex",
      "last_activity_at": "2026-10-01T18:29:23.502Z",
      "role": "author",
      "session_fingerprint": "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "2147677a1b3ac44fc735850b3a8b85aac9071cb8",
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
        "joined_at": "2026-10-01T18:25:35.480Z",
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
        "event_log_digest": "sha256:22b765265b429f68aab1504f714be7b1cb3a301bfaa49dd6f4bd9eff4945b481",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-26997eff0c0ae32bf519416e6fa943fa",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-26997eff0c0ae32bf519416e6fa943fa",
        "root_review_id": "review-26997eff0c0ae32bf519416e6fa943fa",
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
      "joined_at": "2026-10-01T18:25:35.480Z",
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
          "fingerprint": "sha256:ba9ab2d520084c0520c4b45e5a474836401980c6ba5abb5645340c4b5a5f2084",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-01T18:27:16.529Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:ba9ab2d520084c0520c4b45e5a474836401980c6ba5abb5645340c4b5a5f2084"
    }
  },
  "record_id": "review-26997eff0c0ae32bf519416e6fa943fa",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-26997eff0c0ae32bf519416e6fa943fa",
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
  "startup_commit": "47d3b1992fcff5c3e79dd66aa4a5396666c740b6",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "9b6febbbd730afa1705542c7286770f81eb66a1e",
        "digest": "sha256:696b7483439a92a87ad3264508c9070fb7e9c599279beaa3f782ed126652380a",
        "path": "docs/superpowers/specs/2026-10-01-1859-reviewed-scope-evidence-design.md"
      },
      "author_response": {
        "digest": "sha256:09803d1069233a60962009b225fbde77a8da893382ad22702a8bdcaf9864fde9",
        "path": "docs/superpowers/reviews/1859/spec/XPR/spec/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-design-review-26997eff0c0ae32bf519416e6fa943fa/review-26997eff0c0ae32bf519416e6fa943fa-author-response-1.md"
      },
      "commit": "2147677a1b3ac44fc735850b3a8b85aac9071cb8",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:ab9a1b0edd0eb2ea2df8bb997b5c310f78d13d420c0a30a434aa4b430a812382",
        "path": "docs/superpowers/reviews/1859/spec/XPR/spec/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-design-review-26997eff0c0ae32bf519416e6fa943fa/review-26997eff0c0ae32bf519416e6fa943fa-reviewer-response-1.md"
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
        "digest": "sha256:3a0abede92f49a672e4420396ef36536fc2924fe52fef0e9e22f01fb621353bb",
        "path": "docs/superpowers/reviews/1859/spec/XPR/spec/2026-10-01-2026-10-01-1859-reviewed-scope-evidence-design-review-26997eff0c0ae32bf519416e6fa943fa/review-26997eff0c0ae32bf519416e6fa943fa-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
