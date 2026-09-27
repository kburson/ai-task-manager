<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "873e5be211682e8a7698e9176c2e59d4eeee913d",
      "commit": "fd37bb0427d9e2e876084110b2fc5a8aaf13c664",
      "digest": "sha256:0001d47ccbceefff30559be86bac66e6fb26abd09228a71bc7cff953369885c7",
      "path": "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "16f153a85a66e0703da18d9568805ffc5b338d8e",
      "commit": "9d4601aa15f20770fed1a1f57699b78680e4adf5",
      "digest": "sha256:b381fb29a67f0cf482a38a5ba9c02fb908cfb59d69ad3a3af8865bf11f085aad",
      "path": "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-3d57c89f-f99f-4881-8bf5-0d6bca752056",
      "claimed_at": "2026-09-27T21:03:38.691Z",
      "expires_at": "2026-09-28T05:03:38.691Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-27T21:03:38.691Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:88456a5175584c25e8366623b2a32c0cef6ebfff68c38191fc362d8f50486e4b"
    },
    {
      "claim_id": "claim-35d6dbb8-a3da-4381-b475-1f1dc8c98f92",
      "claimed_at": "2026-09-27T21:31:00.827Z",
      "expires_at": "2026-09-28T05:31:00.827Z",
      "host": "codex",
      "last_activity_at": "2026-09-27T21:31:00.827Z",
      "role": "author",
      "session_fingerprint": "sha256:b7c12ea05fed456bbb58ffde2c284c3281bda5fcdebfbacf3429061d11d9a13c"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "9d4601aa15f20770fed1a1f57699b78680e4adf5",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-27T20:53:00.459Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:b7c12ea05fed456bbb58ffde2c284c3281bda5fcdebfbacf3429061d11d9a13c"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-27T21:03:38.690Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:88456a5175584c25e8366623b2a32c0cef6ebfff68c38191fc362d8f50486e4b"
    }
  },
  "record_id": "review-9db94a29416795699db536014299a9a6",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-9db94a29416795699db536014299a9a6",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "fd37bb0427d9e2e876084110b2fc5a8aaf13c664",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "16f153a85a66e0703da18d9568805ffc5b338d8e",
        "digest": "sha256:b381fb29a67f0cf482a38a5ba9c02fb908cfb59d69ad3a3af8865bf11f085aad",
        "path": "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md"
      },
      "author_response": {
        "digest": "sha256:3562345332ae6fbe5f9cf92dff5e4173411ab9597f9319a2b4e1a275348fa0ba",
        "path": "docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-author-response-1.md"
      },
      "commit": "9d4601aa15f20770fed1a1f57699b78680e4adf5",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:085f8201ef36d5299cc8ab92b5d009dbf8cfb5d78c65ae0b924521fee7fc70ba",
        "path": "docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-reviewer-response-1.md"
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
        "digest": "sha256:f3ddd5371276fa78d01c16fcf68d58199be0b7e262d00d3cc0d32e5f9fb5f5dc",
        "path": "docs/peer-reviews/plan/2026-09-27-2026-09-27-1830-mutation-guard-context-review-9db94a29416795699db536014299a9a6/review-9db94a29416795699db536014299a9a6-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
