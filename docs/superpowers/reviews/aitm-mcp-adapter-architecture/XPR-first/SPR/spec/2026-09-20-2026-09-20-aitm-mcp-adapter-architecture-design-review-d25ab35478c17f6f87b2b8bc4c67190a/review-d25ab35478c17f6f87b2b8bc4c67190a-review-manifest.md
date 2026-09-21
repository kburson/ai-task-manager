<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "0050040de99db597a29b1c6d84eeefafdc780201",
      "commit": "e83599d8450faba1bebc813c4c4e514c05518ee7",
      "digest": "sha256:1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e",
      "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "b44552ca78e058e80fd17123a9b46f374a7103c9",
      "commit": "6edf917bdd2d0441ad9c296f69419da08307f758",
      "digest": "sha256:dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23",
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
      "claim_id": "claim-9a64d28f-9de0-4575-9fb1-cec35bde2888",
      "claimed_at": "2026-09-20T22:19:59.416Z",
      "expires_at": "2026-09-21T06:19:59.416Z",
      "host": "codex",
      "last_activity_at": "2026-09-20T22:19:59.416Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:6871f401f6a72a646720760c9a4ccfdcbb3db5fc8e76888427a8d96a3ae73429"
    },
    {
      "claim_id": "claim-59186a29-eeb7-4cd9-b3b0-85c9f1772340",
      "claimed_at": "2026-09-20T22:23:29.253Z",
      "expires_at": "2026-09-21T06:23:29.253Z",
      "host": "codex",
      "last_activity_at": "2026-09-20T22:23:29.253Z",
      "role": "author",
      "session_fingerprint": "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "6edf917bdd2d0441ad9c296f69419da08307f758",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-20T22:18:52.610Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
    },
    "reviewer": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-20T22:19:59.415Z",
      "model_display": "GPT-5.6 Sol",
      "model_id": "gpt-5.6-sol",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:6871f401f6a72a646720760c9a4ccfdcbb3db5fc8e76888427a8d96a3ae73429"
    }
  },
  "record_id": "review-d25ab35478c17f6f87b2b8bc4c67190a",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-d25ab35478c17f6f87b2b8bc4c67190a",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "e83599d8450faba1bebc813c4c4e514c05518ee7",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "b44552ca78e058e80fd17123a9b46f374a7103c9",
        "digest": "sha256:dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23",
        "path": "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
      },
      "author_response": {
        "digest": "sha256:fd8f8b2757d802a0af76eb4f0e429e6d478ad8ace9233334a4e5efe12702adac",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/SPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-d25ab35478c17f6f87b2b8bc4c67190a/review-d25ab35478c17f6f87b2b8bc4c67190a-author-response-1.md"
      },
      "commit": "6edf917bdd2d0441ad9c296f69419da08307f758",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:bd7a3d7a9af8c3c61e28db5474a569f08498776c110157e7231262fb298fbba1",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/SPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-d25ab35478c17f6f87b2b8bc4c67190a/review-d25ab35478c17f6f87b2b8bc4c67190a-reviewer-response-1.md"
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
        "digest": "sha256:9aeb400ef5d768c71ddccaf1acdf0f1825db6969661e1ae759be76ab62b6d891",
        "path": "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/SPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-d25ab35478c17f6f87b2b8bc4c67190a/review-d25ab35478c17f6f87b2b8bc4c67190a-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
