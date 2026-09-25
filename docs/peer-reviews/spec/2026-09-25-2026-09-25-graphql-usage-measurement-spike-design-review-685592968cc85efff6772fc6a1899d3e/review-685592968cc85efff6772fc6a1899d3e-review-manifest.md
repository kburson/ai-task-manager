<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "3dccf9eae14c5060df42956268a561b22dc3bef0",
      "commit": "b0e9c6897f09418bef886e505c369fd02a341b9f",
      "digest": "sha256:863337a74957ab88a549e1d4cc693c7af873c13c682e5fd9695e282a87f10e04",
      "path": "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "6ac82144153ad36bb93c0720400be79c9d584bd0",
      "commit": "6bcf9b6f85b92652dbb9cbbf87ceba4b9006d871",
      "digest": "sha256:9702ff4c363f6370d62dabd8ab2b80381c346d6303f5be90476c366b7de2c347",
      "path": "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-b5ca1a20-4c86-4d58-91d4-71d4fdf81504",
      "claimed_at": "2026-09-25T21:59:55.000Z",
      "expires_at": "2026-09-26T05:59:55.000Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-25T21:59:55.000Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:289b97773b3782d3b2dfef33780a310c9f141f7ae855f5bf9039f7c43aa3c8dc"
    },
    {
      "claim_id": "claim-7e9f72d2-f9d0-4e7d-b4af-7bca7e2e885e",
      "claimed_at": "2026-09-25T22:03:06.240Z",
      "expires_at": "2026-09-26T06:03:06.240Z",
      "host": "codex",
      "last_activity_at": "2026-09-25T22:03:06.240Z",
      "role": "author",
      "session_fingerprint": "sha256:290f380b468b3c8b3ed7fcb5ee7a936dccade3481b185d9c0614cd38f3826e76"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "6bcf9b6f85b92652dbb9cbbf87ceba4b9006d871",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-25T21:58:50.372Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:290f380b468b3c8b3ed7fcb5ee7a936dccade3481b185d9c0614cd38f3826e76"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-25T21:59:54.999Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:289b97773b3782d3b2dfef33780a310c9f141f7ae855f5bf9039f7c43aa3c8dc"
    }
  },
  "record_id": "review-685592968cc85efff6772fc6a1899d3e",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-685592968cc85efff6772fc6a1899d3e",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "b0e9c6897f09418bef886e505c369fd02a341b9f",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "6ac82144153ad36bb93c0720400be79c9d584bd0",
        "digest": "sha256:9702ff4c363f6370d62dabd8ab2b80381c346d6303f5be90476c366b7de2c347",
        "path": "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
      },
      "author_response": {
        "digest": "sha256:cfe7f8b84dbffe60811eb9e9e9ba42c18da9f2f354272b1ea35ca2fc3db181ae",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-25-graphql-usage-measurement-spike-design-review-685592968cc85efff6772fc6a1899d3e/review-685592968cc85efff6772fc6a1899d3e-author-response-1.md"
      },
      "commit": "6bcf9b6f85b92652dbb9cbbf87ceba4b9006d871",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:d19f84db1f1f766fbecff81933407e30a09589b09d59e0a02ed9cb85d092b264",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-25-graphql-usage-measurement-spike-design-review-685592968cc85efff6772fc6a1899d3e/review-685592968cc85efff6772fc6a1899d3e-reviewer-response-1.md"
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
        "digest": "sha256:62fc0ddd4d40bbb5eccbdd25059b46ee20dd8cb1d410c7c52294cedbd8649d35",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-25-graphql-usage-measurement-spike-design-review-685592968cc85efff6772fc6a1899d3e/review-685592968cc85efff6772fc6a1899d3e-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
