<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "ab77e9c259319275d0b1d4ec80fd5acdfa077995",
      "commit": "092a51e74ce4a794d2b6240c5fee714c611ccae5",
      "digest": "sha256:9995905f1f17a3e0c24928ed7a34a83d550d56d53f09889797c902f692a55ddd",
      "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "8ae4326c33492ce6862d2eb4ce273616e4bea1ce",
      "commit": "24529475b0135c06eef2007efdda887c0bb45eb2",
      "digest": "sha256:b96299a2f3508ba60e03536bcba73d434a47fb5fed7e6f70f1fbe445d7b2ccee",
      "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "86fdb87538c8ed59b5ab99135265d4a70dec5934",
      "commit": "2a06a6a4f94ee8a2e61f1c528f585a8638509f8d",
      "digest": "sha256:6f48a829a2d8ecf657585416def0f972215ffa1915410021c65d187b6340e5a0",
      "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-e7a7e4ff-57f6-45e8-83f2-051c73ba751a",
      "claimed_at": "2026-10-09T18:13:10.089Z",
      "expires_at": "2026-10-10T02:13:10.089Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-09T18:13:10.089Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:7904a355245b72934b2c8e0064efb0a23665315d643f3533dd7bd4df785214e1"
    },
    {
      "claim_id": "claim-37a440c6-b695-4f17-9fef-77b070dd84a9",
      "claimed_at": "2026-10-09T18:18:08.308Z",
      "expires_at": "2026-10-10T02:18:08.308Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T18:18:08.308Z",
      "role": "author",
      "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "2a06a6a4f94ee8a2e61f1c528f585a8638509f8d",
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
            "fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-09T18:12:28.313Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:803d314d8c6bbf93f0c09dbfc8264bedf65cfea21028cd080ddbddb92ab7d638",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-c05891ebcf448a103ab2c428a74e208b",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-c05891ebcf448a103ab2c428a74e208b",
        "root_review_id": "review-c05891ebcf448a103ab2c428a74e208b",
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
          "fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T18:12:28.313Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
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
          "fingerprint": "sha256:7904a355245b72934b2c8e0064efb0a23665315d643f3533dd7bd4df785214e1",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T18:13:10.058Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:7904a355245b72934b2c8e0064efb0a23665315d643f3533dd7bd4df785214e1"
    }
  },
  "record_id": "review-c05891ebcf448a103ab2c428a74e208b",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-c05891ebcf448a103ab2c428a74e208b",
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
    "project_root_digest": "9aa725b2b5a66515950a4cdfd5ed6323f75c218389e3bf87035b6d71d1eee901",
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
  "startup_commit": "092a51e74ce4a794d2b6240c5fee714c611ccae5",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "8ae4326c33492ce6862d2eb4ce273616e4bea1ce",
        "digest": "sha256:b96299a2f3508ba60e03536bcba73d434a47fb5fed7e6f70f1fbe445d7b2ccee",
        "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
      },
      "author_response": {
        "digest": "sha256:b8bc2ac693b5b81c2ef5c14378617faa97c367cbdcb1ad07743de753dd8ba238",
        "path": "docs/peer-reviews/1939/plan/xpr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-c05891ebcf448a103ab2c428a74e208b/review-c05891ebcf448a103ab2c428a74e208b-author-response-1.md"
      },
      "commit": "24529475b0135c06eef2007efdda887c0bb45eb2",
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
        "R1-F010",
        "R1-F011"
      ],
      "reviewer_response": {
        "digest": "sha256:1ea93c8175b83454b88e007fc1712bdbc331045d6cf3bbef8640142d91995489",
        "path": "docs/peer-reviews/1939/plan/xpr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-c05891ebcf448a103ab2c428a74e208b/review-c05891ebcf448a103ab2c428a74e208b-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "86fdb87538c8ed59b5ab99135265d4a70dec5934",
        "digest": "sha256:6f48a829a2d8ecf657585416def0f972215ffa1915410021c65d187b6340e5a0",
        "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
      },
      "author_response": {
        "digest": "sha256:0fb08dd6a8eea7c2e7494b173ea96aaf13bf76cba84e787892d1f0a690344356",
        "path": "docs/peer-reviews/1939/plan/xpr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-c05891ebcf448a103ab2c428a74e208b/review-c05891ebcf448a103ab2c428a74e208b-author-response-2.md"
      },
      "commit": "2a06a6a4f94ee8a2e61f1c528f585a8638509f8d",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:eefb54304a81234e5de7a39612bb547965078ebee3db53ae739871a945af04d0",
        "path": "docs/peer-reviews/1939/plan/xpr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-c05891ebcf448a103ab2c428a74e208b/review-c05891ebcf448a103ab2c428a74e208b-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R3-F001",
        "R3-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:b27b1789a0db2d421ed1c2bdeeb66ce5ae106be976f77f2db23dadcca7e63ea1",
        "path": "docs/peer-reviews/1939/plan/xpr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-c05891ebcf448a103ab2c428a74e208b/review-c05891ebcf448a103ab2c428a74e208b-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
