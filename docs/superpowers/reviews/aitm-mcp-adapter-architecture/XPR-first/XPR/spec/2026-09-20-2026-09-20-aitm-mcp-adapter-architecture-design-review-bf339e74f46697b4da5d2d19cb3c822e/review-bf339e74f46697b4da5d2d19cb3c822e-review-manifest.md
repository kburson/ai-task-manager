<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "a076d41e917efa17d7a23de75d139f1d898cef43",
      "commit": "93a2c790be8c771324ae51eaf35b41bf029dd6ea",
      "digest": "sha256:7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "11a64101687a823e5423c6592fecd523f54f3209",
      "commit": "718fc30a2791b9399f1ec37e2c15815633a74806",
      "digest": "sha256:69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "0050040de99db597a29b1c6d84eeefafdc780201",
      "commit": "09551213ec6ee18e90d2d6d39f3fff00e9ade055",
      "digest": "sha256:1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-813e634b-2f1c-4343-826b-e91ec459e67e",
      "claimed_at": "2026-09-20T21:48:53.668Z",
      "expires_at": "2026-09-21T05:48:53.668Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-20T21:48:53.668Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:7269798814f6e42c7dbd35031039451c136e87664d5bf2159f1e59823321f699"
    },
    {
      "claim_id": "claim-7efb4916-c9cf-44f8-b179-942354458611",
      "claimed_at": "2026-09-20T21:54:14.764Z",
      "expires_at": "2026-09-21T05:54:14.764Z",
      "host": "codex",
      "last_activity_at": "2026-09-20T21:54:14.764Z",
      "role": "author",
      "session_fingerprint": "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "09551213ec6ee18e90d2d6d39f3fff00e9ade055",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-20T21:48:14.761Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-20T21:48:53.667Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:7269798814f6e42c7dbd35031039451c136e87664d5bf2159f1e59823321f699"
    }
  },
  "record_id": "review-bf339e74f46697b4da5d2d19cb3c822e",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-bf339e74f46697b4da5d2d19cb3c822e",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "93a2c790be8c771324ae51eaf35b41bf029dd6ea",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "11a64101687a823e5423c6592fecd523f54f3209",
        "digest": "sha256:69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4",
        "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
      },
      "author_response": {
        "digest": "sha256:da825fc2966f667a0f5b1588e9009a90a88a8b76ca0fd2534d7311bc023ab1a6",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-author-response-1.md"
      },
      "commit": "718fc30a2791b9399f1ec37e2c15815633a74806",
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
        "digest": "sha256:b70b58f02d428942031c27462ba63097318bde4735cd9bd1c520fbd15dded6cb",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "0050040de99db597a29b1c6d84eeefafdc780201",
        "digest": "sha256:1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e",
        "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
      },
      "author_response": {
        "digest": "sha256:119933db7c4dea9ef261d6a558807de41d092488fd94ca6ea4a8133069f7bf90",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-author-response-2.md"
      },
      "commit": "09551213ec6ee18e90d2d6d39f3fff00e9ade055",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:d692e22b30272e2788621ec8aa578a621a07edd8c802d649e0e860be5fb53494",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:7b26b20ab2004431d52a9e2c5bac9b33da2d186bdbf242013113e45ab5de3440",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
