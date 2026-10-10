<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "85cc83d7bab90a602b1da9b7bd0ba382bc69c2f8",
      "commit": "bd4de2dc56595aa18640104eb82b77f375dbea9e",
      "digest": "sha256:5ee63589c970bc045d630823af8fa44d1fa2b9b1d870419816efa296fe059823",
      "path": "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "7ca53d5f80176cbb824a05bc11d2df40595c91df",
      "commit": "6ac59f4955aa5a39b3940f02a2c3f25b7f3275de",
      "digest": "sha256:0e0bbb9beef0ddc2f828138b30a77505ea850eb42c3a097ab6f21d6dd96042d0",
      "path": "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-6de50317-afc9-4070-9a5c-fa6978456dbb",
      "claimed_at": "2026-09-29T14:40:50.710Z",
      "expires_at": "2026-09-29T22:40:50.710Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-29T14:40:50.710Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:3099bb0c10bc2aec5a889aab2d097c3366a7d76f286962573b5487b91235f30c"
    },
    {
      "claim_id": "claim-3ab3d679-e6dc-4bd3-a4f6-c8bf56bd9b3c",
      "claimed_at": "2026-09-29T14:43:51.106Z",
      "expires_at": "2026-09-29T22:43:51.106Z",
      "host": "codex",
      "last_activity_at": "2026-09-29T14:43:51.106Z",
      "role": "author",
      "session_fingerprint": "sha256:b2f5083dd38b4293bf1b765a1190acd11c95df91027d5b1382ce4a8d7e8830df"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "6ac59f4955aa5a39b3940f02a2c3f25b7f3275de",
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
            "source": "official-runtime"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:b2f5083dd38b4293bf1b765a1190acd11c95df91027d5b1382ce4a8d7e8830df",
            "source": "environment-declaration"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-29T14:40:01.818Z",
        "model_display": "GPT-6 Astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:b2f5083dd38b4293bf1b765a1190acd11c95df91027d5b1382ce4a8d7e8830df"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:4e77fd471b16248321d576cff3470609a7493dba6c902a601c2acc9dbb9c22dd",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-2029bf3992ea856fe54a731a3197bd68",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-2029bf3992ea856fe54a731a3197bd68",
        "root_review_id": "review-2029bf3992ea856fe54a731a3197bd68",
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
          "source": "official-runtime"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:b2f5083dd38b4293bf1b765a1190acd11c95df91027d5b1382ce4a8d7e8830df",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-29T14:40:01.818Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:b2f5083dd38b4293bf1b765a1190acd11c95df91027d5b1382ce4a8d7e8830df"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "claude-opus-5-5",
          "observed_id": null,
          "requested_id": null,
          "source": "configuration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:3099bb0c10bc2aec5a889aab2d097c3366a7d76f286962573b5487b91235f30c",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-29T14:40:50.706Z",
      "model_display": "Claude Opus 5.5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:3099bb0c10bc2aec5a889aab2d097c3366a7d76f286962573b5487b91235f30c"
    }
  },
  "record_id": "review-2029bf3992ea856fe54a731a3197bd68",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-2029bf3992ea856fe54a731a3197bd68",
  "runtime": {
    "adapter_version": "1.0.0",
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "39f939e7afef6fa413fe80f2e0865c1bbb6a90a05600b24abef02c35a77aff82",
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
  "startup_commit": "bd4de2dc56595aa18640104eb82b77f375dbea9e",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "7ca53d5f80176cbb824a05bc11d2df40595c91df",
        "digest": "sha256:0e0bbb9beef0ddc2f828138b30a77505ea850eb42c3a097ab6f21d6dd96042d0",
        "path": "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md"
      },
      "author_response": {
        "digest": "sha256:2207fe281867d55111cb4d1b921c9f3db99a82013bc9d3472e08d0eef6f26b95",
        "path": "docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-author-response-1.md"
      },
      "commit": "6ac59f4955aa5a39b3940f02a2c3f25b7f3275de",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006",
        "R1-F007"
      ],
      "reviewer_response": {
        "digest": "sha256:d8387765bbc7c18f2ac229430ef86dbc009d1ad88e6dee7e9080748883e7cabc",
        "path": "docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-reviewer-response-1.md"
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
        "R2-F002",
        "R2-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:4ad6bb84e7cc690114cbf246782a10a33425f463a98292597b867e9efb1454a9",
        "path": "docs/peer-reviews-1841-retry/spec/2026-09-29-2026-09-28-1841-worktree-hook-boundary-design-review-2029bf3992ea856fe54a731a3197bd68/review-2029bf3992ea856fe54a731a3197bd68-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
