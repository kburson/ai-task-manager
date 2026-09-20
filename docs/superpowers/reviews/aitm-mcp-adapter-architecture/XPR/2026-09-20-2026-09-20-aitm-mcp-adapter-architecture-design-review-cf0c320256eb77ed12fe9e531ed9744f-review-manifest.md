<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "0fb2aaeb4955afb41629e9b2e4f3de930fb9be33",
      "commit": "98bdbb4ea6dd00468886a38c4150d9d8049a44c3",
      "digest": "sha256:58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "a2d358fd42f56e4111ffbbc35d938d6d72004e3c",
      "commit": "db28996eeeaa3e290d2b2c18457becaf4f462607",
      "digest": "sha256:8e1096146ddd98be877b8f56a1ac8a3b54fd73c22f49da4c0dbc73427ec7ac12",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "9e98109ef683f232afcd6cb31d6f7078716b1f58",
      "commit": "267b91b9218b59342a0d70e0859a0e38523a3923",
      "digest": "sha256:4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382",
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
      "claim_id": "claim-8887a683-4f89-4c52-aa48-1f812d01984d",
      "claimed_at": "2026-09-20T20:51:32.153Z",
      "expires_at": "2026-09-21T04:51:32.153Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-20T20:51:32.153Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:456928280c0bc2616a47beee48666759265dd646d2bd64bbb311fe952beb12b3"
    },
    {
      "claim_id": "claim-ad591a88-4571-44a0-aab2-039c0274df20",
      "claimed_at": "2026-09-20T20:56:03.182Z",
      "expires_at": "2026-09-21T04:56:03.182Z",
      "host": "codex",
      "last_activity_at": "2026-09-20T20:56:03.182Z",
      "role": "author",
      "session_fingerprint": "sha256:43cb4fd5092989dd837ce1e68485335a8fe08ae750ec96419a461e45e172381b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "267b91b9218b59342a0d70e0859a0e38523a3923",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-20T20:51:09.519Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:43cb4fd5092989dd837ce1e68485335a8fe08ae750ec96419a461e45e172381b"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-20T20:51:32.151Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:456928280c0bc2616a47beee48666759265dd646d2bd64bbb311fe952beb12b3"
    }
  },
  "record_id": "review-cf0c320256eb77ed12fe9e531ed9744f",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-cf0c320256eb77ed12fe9e531ed9744f",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "98bdbb4ea6dd00468886a38c4150d9d8049a44c3",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "a2d358fd42f56e4111ffbbc35d938d6d72004e3c",
        "digest": "sha256:8e1096146ddd98be877b8f56a1ac8a3b54fd73c22f49da4c0dbc73427ec7ac12",
        "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
      },
      "author_response": {
        "digest": "sha256:c9a91c2d1bdc0d340e56f1601ebcea85bf58e231656606024f360fb2ace08a74",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-author-response-1.md"
      },
      "commit": "db28996eeeaa3e290d2b2c18457becaf4f462607",
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
        "digest": "sha256:1c10c8810fd461c155b193495e188c9258a910ef474f68fc3b212a9e4a358158",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "9e98109ef683f232afcd6cb31d6f7078716b1f58",
        "digest": "sha256:4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382",
        "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
      },
      "author_response": {
        "digest": "sha256:299523c922872fb0eda372b8b4fd83e172610b72cfacff55dc9c82356e76fe9b",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-author-response-2.md"
      },
      "commit": "267b91b9218b59342a0d70e0859a0e38523a3923",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003",
        "R2-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:3757fb4391dc0c2c1b4831b0d78b1e06230776db7331ef178a4773ee809b8f62",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-2.md"
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
        "digest": "sha256:1e54244a0872874900a05da7022b37386cd2f750d52f7578c1d528edbc35feea",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-cf0c320256eb77ed12fe9e531ed9744f-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
