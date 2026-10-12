<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "2a83a46621b46c9309cd76687a113d585006172c",
      "commit": "3caacb42d882d1571184b3581a7a58932a54043e",
      "digest": "sha256:0b65a538437dc2ef2bb86533e991c90b945dacb9fbc7cbe16ad277f8f709fd27",
      "path": "docs/design/2026-09-12-project-local-review-lifecycle-and-learning-design.md",
      "snapshot": null,
      "turn": 0
    }
  ],
  "artifact_path": "docs/design/2026-09-12-project-local-review-lifecycle-and-learning-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-25049676-d8ae-40db-9ee0-e13fcd6a5db4",
      "claimed_at": "2026-09-12T23:47:04.100Z",
      "expires_at": "2026-09-13T07:47:04.100Z",
      "host": "codex",
      "last_activity_at": "2026-09-12T23:47:04.100Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:b2ef57bd734ea2936577a3a9c1fd73c1d3d75547a7f5c342dfd15272a0715a78"
    },
    {
      "claim_id": "claim-f9660f88-addc-456f-a9d6-67366a2d33a7",
      "claimed_at": "2026-09-12T23:49:35.331Z",
      "expires_at": "2026-09-13T07:49:35.331Z",
      "host": "codex",
      "last_activity_at": "2026-09-12T23:49:35.331Z",
      "role": "author",
      "session_fingerprint": "sha256:456d5a7897c12020d183e80d52838e2d15823217d106281afe30cf7c7065e08f"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "3caacb42d882d1571184b3581a7a58932a54043e",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-12T23:45:32.723Z",
      "model_display": "Codex GPT-5",
      "model_id": "gpt-5",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:456d5a7897c12020d183e80d52838e2d15823217d106281afe30cf7c7065e08f"
    },
    "reviewer": {
      "host": "codex",
      "identity_source": "declared",
      "joined_at": "2026-09-12T23:47:04.099Z",
      "model_display": "GPT-6",
      "model_id": "gpt-6",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:b2ef57bd734ea2936577a3a9c1fd73c1d3d75547a7f5c342dfd15272a0715a78"
    }
  },
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-59ebd8e3c0181485b88b141d59dc9ae6",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "3caacb42d882d1571184b3581a7a58932a54043e",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:000cd3aa86c365a99c33dcdba58e48b7ce03633d5fda159555a19ba03977678b",
        "path": "docs/peer-reviews/spec/2026-09-12-2026-09-12-project-local-review-lifecycle-and-learning-design-review-59ebd8e3c0181485b88b141d59dc9ae6/reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
