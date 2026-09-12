<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "046d1a17492a5d6cbba276ebeaedea08e8b60e9e",
      "commit": "487966729b913b364bd3e87428aabee95e9c1077",
      "digest": "sha256:94e3c570211fe67254328b2a2dca480a272a883603186da792c7caaea076023c",
      "path": "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "6c99f9b434bf7108900a645ca9278f82bd8b9010",
      "commit": "3006d3ac3b82c2b984142ee6005e0d489f8e5b09",
      "digest": "sha256:ced02d17da29f8530520b6dd2f308736f6e96bba23813aae791dbe1ece557cd9",
      "path": "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "b0071bed5c3738111d9e21a5b0f5333c8108a8a2",
      "commit": "3dcfecec1c6a64f25372e44bf71ab3d182e082c1",
      "digest": "sha256:93bc5ed4ec50214957e36152768ba769b79290b2c5c8b1359964f1ed3e05c567",
      "path": "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-b2882f13-9c07-4d41-bf46-102bd9ed3a00",
      "claimed_at": "2026-09-12T17:17:14.907Z",
      "expires_at": "2026-09-13T01:17:14.907Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-12T17:17:14.907Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:b442aba55add2575a307df23836f008c2fd2f4224f4758748bf984fd912fefe5"
    },
    {
      "claim_id": "claim-4bf62fb6-0378-470f-ad46-cba863fa24ec",
      "claimed_at": "2026-09-12T17:22:16.514Z",
      "expires_at": "2026-09-13T01:22:16.514Z",
      "host": "codex",
      "last_activity_at": "2026-09-12T17:22:16.514Z",
      "role": "author",
      "session_fingerprint": "sha256:17b0f7687638e5979626da70ea1c87d911de9cde19a8d0723e99d40c06d65c45"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "3dcfecec1c6a64f25372e44bf71ab3d182e082c1",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-12T17:11:51.632Z",
      "model_display": "GPT-5",
      "model_id": "gpt-5",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:17b0f7687638e5979626da70ea1c87d911de9cde19a8d0723e99d40c06d65c45"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-12T17:17:14.905Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:b442aba55add2575a307df23836f008c2fd2f4224f4758748bf984fd912fefe5"
    }
  },
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-03ff5087c2d09fdb34d6bf44fdb2928a",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "487966729b913b364bd3e87428aabee95e9c1077",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "6c99f9b434bf7108900a645ca9278f82bd8b9010",
        "digest": "sha256:ced02d17da29f8530520b6dd2f308736f6e96bba23813aae791dbe1ece557cd9",
        "path": "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md"
      },
      "author_response": {
        "digest": "sha256:fcc77f76f7cfd7b697292bac06d79142701c7405bae56311c527bc40b18f0440",
        "path": "docs/superpowers/reviews/1219/spec/2026-09-12-2026-09-12-1219-tiered-test-execution-design-review-03ff5087c2d09fdb34d6bf44fdb2928a-author-response-1.md"
      },
      "commit": "3006d3ac3b82c2b984142ee6005e0d489f8e5b09",
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
        "R1-F009"
      ],
      "reviewer_response": {
        "digest": "sha256:11eff84c1338a6f925322dff9915785f1a42cbeeab3b5bd8e6c9a2995a2b0ebb",
        "path": "docs/superpowers/reviews/1219/spec/2026-09-12-2026-09-12-1219-tiered-test-execution-design-review-03ff5087c2d09fdb34d6bf44fdb2928a-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "b0071bed5c3738111d9e21a5b0f5333c8108a8a2",
        "digest": "sha256:93bc5ed4ec50214957e36152768ba769b79290b2c5c8b1359964f1ed3e05c567",
        "path": "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md"
      },
      "author_response": {
        "digest": "sha256:a0e143d36fe76defad73866df5db0380a49eb12a35d2eb2184d179ce90a610c3",
        "path": "docs/superpowers/reviews/1219/spec/2026-09-12-2026-09-12-1219-tiered-test-execution-design-review-03ff5087c2d09fdb34d6bf44fdb2928a-author-response-2.md"
      },
      "commit": "3dcfecec1c6a64f25372e44bf71ab3d182e082c1",
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
        "digest": "sha256:9f5bcf0a6d31ad8d59973be9bb672c90ed5a4771da78d6b290f290eb624bbc25",
        "path": "docs/superpowers/reviews/1219/spec/2026-09-12-2026-09-12-1219-tiered-test-execution-design-review-03ff5087c2d09fdb34d6bf44fdb2928a-reviewer-response-2.md"
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
        "digest": "sha256:9154c446da9b2c36118501d85825885d35e80faa58653171ffef345066bdab17",
        "path": "docs/superpowers/reviews/1219/spec/2026-09-12-2026-09-12-1219-tiered-test-execution-design-review-03ff5087c2d09fdb34d6bf44fdb2928a-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
