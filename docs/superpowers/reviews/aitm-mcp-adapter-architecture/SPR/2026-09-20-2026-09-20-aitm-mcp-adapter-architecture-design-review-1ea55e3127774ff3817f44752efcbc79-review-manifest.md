<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "d8f71469bdc37e23aa9f1546946f95698f367ec9",
      "commit": "6891473eb0dca09b0c88d0745f2039c35c82249a",
      "digest": "sha256:5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "0fb2aaeb4955afb41629e9b2e4f3de930fb9be33",
      "commit": "0a7e3c6a6283feddd4a7d7f16d81ac856cc5f1eb",
      "digest": "sha256:58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 1
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
      "claim_id": "claim-466838e4-b5b6-4904-aec2-577e1a389d7f",
      "claimed_at": "2026-09-20T20:28:22.129Z",
      "expires_at": "2026-09-21T04:28:22.129Z",
      "host": "codex",
      "last_activity_at": "2026-09-20T20:28:22.129Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:63dde00893c2bcc6a55bed7f6d9424a621a97ecca480a80bedd6a9bdaed7b826"
    },
    {
      "claim_id": "claim-8b77725a-36f0-409b-b7b4-2f8d303edb9e",
      "claimed_at": "2026-09-20T20:31:53.451Z",
      "expires_at": "2026-09-21T04:31:53.451Z",
      "host": "codex",
      "last_activity_at": "2026-09-20T20:31:53.451Z",
      "role": "author",
      "session_fingerprint": "sha256:43cb4fd5092989dd837ce1e68485335a8fe08ae750ec96419a461e45e172381b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "0a7e3c6a6283feddd4a7d7f16d81ac856cc5f1eb",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-20T20:27:05.408Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:43cb4fd5092989dd837ce1e68485335a8fe08ae750ec96419a461e45e172381b"
    },
    "reviewer": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-20T20:28:22.128Z",
      "model_display": "GPT-5.6 Sol",
      "model_id": "gpt-5.6-sol",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:63dde00893c2bcc6a55bed7f6d9424a621a97ecca480a80bedd6a9bdaed7b826"
    }
  },
  "record_id": "review-1ea55e3127774ff3817f44752efcbc79",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-1ea55e3127774ff3817f44752efcbc79",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "6891473eb0dca09b0c88d0745f2039c35c82249a",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "0fb2aaeb4955afb41629e9b2e4f3de930fb9be33",
        "digest": "sha256:58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125",
        "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
      },
      "author_response": {
        "digest": "sha256:fbddf4cf3a444334cff5ffbd9d9cda8ed35a06f7ebea6bc1f662401575e7279e",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/SPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-author-response-1.md"
      },
      "commit": "0a7e3c6a6283feddd4a7d7f16d81ac856cc5f1eb",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:bd2b5479a660d3535000bac7228620f75a98c3f84023d3e0ba84e12b63e46a2b",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/SPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-reviewer-response-1.md"
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
        "digest": "sha256:ee3b40528476f7a6a80b86c6014f3ece2196c3a413b14d12f2ccb52901d1b925",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/SPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
