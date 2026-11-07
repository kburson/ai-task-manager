<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "9c92c9133378f03d7c3c01c7941b64e88d4773c7",
      "commit": "c1ea98935debeff50d711f7a5ab143e312a7787e",
      "digest": "sha256:3a4bd0ca05be979ce297bed9e3c16d8844eb26cb7ecbac4fae343d066595eeae",
      "path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "630e1d98f384578b5b4a9fa73430cf2d52b7ca36",
      "commit": "714c3c519b30c52cfd435e924e6ebe49594f61eb",
      "digest": "sha256:0c9ce1c46274f01081967c6e722e5f86a2c519ea4e7fbf13be715772e0337f88",
      "path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "ed525847fd58ca85ba5e31736a3568ab6bd2a40b",
      "commit": "06867d32956687cbb4a7840f5fe8693e9d0d9cb3",
      "digest": "sha256:55d2cfc3414c90760d75cdb1713d0032f09c148d5a6b0acf4d21bd21b94766e7",
      "path": "docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md",
      "snapshot": null,
      "turn": 3
    },
    {
      "blob": "d01d1dac17bfeddda158e7f6a1386e24b16b3d55",
      "commit": "53556dc0fe19902dad04bb987b62f21410244c7d",
      "digest": "sha256:f0e47089f369e7cd69691e39f8d05aa1e8b865fea4b6fecc2d2d80474576f754",
      "path": "docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md",
      "snapshot": null,
      "turn": 4
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-8f271917-445b-486f-8b78-e5da298e719e",
      "claimed_at": "2026-11-05T02:49:39.444Z",
      "expires_at": "2026-11-05T10:49:39.444Z",
      "host": "claude-code",
      "last_activity_at": "2026-11-05T02:49:39.444Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5"
    },
    {
      "claim_id": "claim-a4fb1a93-8fa1-499b-b31d-bf9ce29a1ce8",
      "claimed_at": "2026-11-05T04:15:14.616Z",
      "expires_at": "2026-11-05T12:15:14.616Z",
      "host": "codex",
      "last_activity_at": "2026-11-05T04:15:14.616Z",
      "role": "author",
      "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "53556dc0fe19902dad04bb987b62f21410244c7d",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "observed",
            "conflict": false,
            "declared_id": null,
            "observed_id": "gpt-6-astra",
            "requested_id": null,
            "source": "provider-result"
          },
          "session": {
            "assurance": "observed",
            "fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-11-04T01:44:37.044Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:dbe182fe9509415207f86b9a773b86bc1c4dfe86176245bcebc02f9308789d32",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
        "root_review_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
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
          "observed_id": "gpt-6-astra",
          "requested_id": null,
          "source": "provider-result"
        },
        "session": {
          "assurance": "observed",
          "fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-11-04T01:44:37.044Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": null,
          "observed_id": null,
          "requested_id": "claude-opus-5-5",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-11-05T02:49:39.443Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5"
    }
  },
  "record_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
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
    "project_root_digest": "bc9f25c3111008599a2a85470a7b52e5f73a273a49f79dd050ae67412062048a",
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
  "startup_commit": "c1ea98935debeff50d711f7a5ab143e312a7787e",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "630e1d98f384578b5b4a9fa73430cf2d52b7ca36",
        "digest": "sha256:0c9ce1c46274f01081967c6e722e5f86a2c519ea4e7fbf13be715772e0337f88",
        "path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md"
      },
      "author_response": {
        "digest": "sha256:2924ed08418005867f216613c5c8358da2bf864f180f1b21c974c762c776da36",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-author-response-1.md"
      },
      "commit": "714c3c519b30c52cfd435e924e6ebe49594f61eb",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005"
      ],
      "reviewer_response": {
        "digest": "sha256:29057f0ea8cb5dba85484a9da4ed0f08d34d05fabe3ddb846e12da9c889d12ad",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R2-F001",
        "R2-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:53100cee6341c150d7c2cc09c0ca755d68b98b6d92b293a5eeca80f0dd738c20",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": {
        "blob": "ed525847fd58ca85ba5e31736a3568ab6bd2a40b",
        "digest": "sha256:55d2cfc3414c90760d75cdb1713d0032f09c148d5a6b0acf4d21bd21b94766e7",
        "path": "docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md"
      },
      "author_response": {
        "digest": "sha256:0c41a53e086e44d963f9e4cfb635a05452ec0e7f4bdbf71d561ea116e4095d17",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-author-response-3.md"
      },
      "commit": "06867d32956687cbb4a7840f5fe8693e9d0d9cb3",
      "decision": "revisions-requested",
      "finding_ids": [
        "R3-F001",
        "R3-F002",
        "R3-F003",
        "R3-F004",
        "R3-F005"
      ],
      "reviewer_response": {
        "digest": "sha256:94a73a6590bd498ca8e14a1ecb5e61d5b0b47e19c672639193917fc67342e121",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": {
        "blob": "d01d1dac17bfeddda158e7f6a1386e24b16b3d55",
        "digest": "sha256:f0e47089f369e7cd69691e39f8d05aa1e8b865fea4b6fecc2d2d80474576f754",
        "path": "docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md"
      },
      "author_response": {
        "digest": "sha256:2d236b6dc78fda166533090beaf91e313cdc52e246e7056d345a952dce6c6511",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-author-response-4.md"
      },
      "commit": "53556dc0fe19902dad04bb987b62f21410244c7d",
      "decision": "revisions-requested",
      "finding_ids": [
        "R4-F001",
        "R4-F002",
        "R4-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:a1557465a9f219a9443f4abe9ce1d409155df2130aab8d0e3ad83dbc95b5a164",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R5-F001",
        "R5-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:065515f6f6b8a28fcd34b056ac423fbd2c15b45bcb9945b3be07f8c1a3e48f07",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-5.md"
      },
      "snapshot": null,
      "turn": 5
    }
  ]
}
```
