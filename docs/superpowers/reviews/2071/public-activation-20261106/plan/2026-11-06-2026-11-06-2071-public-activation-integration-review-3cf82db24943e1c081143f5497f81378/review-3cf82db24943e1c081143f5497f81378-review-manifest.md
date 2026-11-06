<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "4f9b48c225f0bddc9035857c5a58e0bfa3e2f758",
      "commit": "ccc4d7582f5fcb58084ceabadae547ce12239d36",
      "digest": "sha256:4a2b08cb75d344a77888429ca39645814683e45c1fe419316241944dca80d6f7",
      "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "284824831887a3df1ca9698c7797bf8a29d7e617",
      "commit": "6f3b945b7c4bf171d471fe354d631d5f11cf7ed3",
      "digest": "sha256:6873dcf3d9fa24517db79e9a2aa5e23be13f58ee0a5ce8fd26bebf5de09bc6ce",
      "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "06fe72af7fc3c8befd411a205a56c40720d50274",
      "commit": "3ac32b471cf600bb4150e7a9c05cd703cc34d7b5",
      "digest": "sha256:9c8833850257118e4950cba64877b1bd89d346925c321ae80784d19e4606f81d",
      "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md",
      "snapshot": null,
      "turn": 2
    },
    {
      "blob": "6ed42482aad392a25d11f559091468c3cf11525b",
      "commit": "00ca5ab7a9c041464846c4563532a6061c2c178b",
      "digest": "sha256:b097c524142b98d26ca025fd20293312f5d011d881bc1b630cd77213e3c6d26b",
      "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md",
      "snapshot": null,
      "turn": 3
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-5fd0153a-1104-40f5-af7b-d91b87747300",
      "claimed_at": "2026-11-06T12:08:05.498Z",
      "expires_at": "2026-11-06T20:08:05.498Z",
      "host": "claude-code",
      "last_activity_at": "2026-11-06T12:08:05.498Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:977913bd10ef40ca0a51ac9b802d94daa6446ab6a17ce166fcbc3e042ef8cb82"
    },
    {
      "claim_id": "claim-bf75eeac-e43a-4b1a-bc00-dc8bcd3441c6",
      "claimed_at": "2026-11-06T12:11:47.614Z",
      "expires_at": "2026-11-06T20:11:47.614Z",
      "host": "codex",
      "last_activity_at": "2026-11-06T12:11:47.614Z",
      "role": "author",
      "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "00ca5ab7a9c041464846c4563532a6061c2c178b",
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
            "fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-11-06T12:07:15.992Z",
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
        "event_log_digest": "sha256:de80fb893b1c81c8fc5dbe6c6b6742b35529b7fda34ca7546d873bf237397860",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-3cf82db24943e1c081143f5497f81378",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-3cf82db24943e1c081143f5497f81378",
        "root_review_id": "review-3cf82db24943e1c081143f5497f81378",
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
          "fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-11-06T12:07:15.992Z",
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
          "declared_id": "claude-opus-5-5",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:977913bd10ef40ca0a51ac9b802d94daa6446ab6a17ce166fcbc3e042ef8cb82",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-11-06T12:08:05.478Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:977913bd10ef40ca0a51ac9b802d94daa6446ab6a17ce166fcbc3e042ef8cb82"
    }
  },
  "record_id": "review-3cf82db24943e1c081143f5497f81378",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-3cf82db24943e1c081143f5497f81378",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "xhigh",
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
  "startup_commit": "ccc4d7582f5fcb58084ceabadae547ce12239d36",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "284824831887a3df1ca9698c7797bf8a29d7e617",
        "digest": "sha256:6873dcf3d9fa24517db79e9a2aa5e23be13f58ee0a5ce8fd26bebf5de09bc6ce",
        "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
      },
      "author_response": {
        "digest": "sha256:e838ad6bad255541d069c34c7eef8f8c59a3ec8221f81b0d7546e8227f0d583c",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-author-response-1.md"
      },
      "commit": "6f3b945b7c4bf171d471fe354d631d5f11cf7ed3",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006",
        "R1-F007",
        "R1-F008",
        "R1-F009",
        "R1-F010"
      ],
      "reviewer_response": {
        "digest": "sha256:276f49ef6e3082b583c9ee03be4ff60d06cd0b00e39f437a65db674d32bd1777",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "06fe72af7fc3c8befd411a205a56c40720d50274",
        "digest": "sha256:9c8833850257118e4950cba64877b1bd89d346925c321ae80784d19e4606f81d",
        "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
      },
      "author_response": {
        "digest": "sha256:37e3d0017c23bfa348dfc661b3fb79642b2219a7d5ce7169d2640c933cc04d38",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-author-response-2.md"
      },
      "commit": "3ac32b471cf600bb4150e7a9c05cd703cc34d7b5",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003",
        "R2-F004",
        "R2-F005",
        "R2-F006"
      ],
      "reviewer_response": {
        "digest": "sha256:0d9a33e77f1f99c7c7e954b181fe5aa7148120e8b8e1042c550fffbd664d7371",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": {
        "blob": "6ed42482aad392a25d11f559091468c3cf11525b",
        "digest": "sha256:b097c524142b98d26ca025fd20293312f5d011d881bc1b630cd77213e3c6d26b",
        "path": "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
      },
      "author_response": {
        "digest": "sha256:e185c5fbd2d6b9c3a37508f29343c2d9839d77ff708d9459223f7620e88d3725",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-author-response-3.md"
      },
      "commit": "00ca5ab7a9c041464846c4563532a6061c2c178b",
      "decision": "revisions-requested",
      "finding_ids": [
        "R3-F001",
        "R3-F002",
        "R3-F003",
        "R3-F004",
        "R3-F005"
      ],
      "reviewer_response": {
        "digest": "sha256:f02e19b1930024d73332e6fb53b0c54b0b0ed5e40237f96ced35bbc3c077f09e",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:15e22830a4203b155dca75afe465078f78e34944ff776503598df397e8882f83",
        "path": "docs/superpowers/reviews/2071/public-activation-20261106/plan/2026-11-06-2026-11-06-2071-public-activation-integration-review-3cf82db24943e1c081143f5497f81378/review-3cf82db24943e1c081143f5497f81378-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    }
  ]
}
```
