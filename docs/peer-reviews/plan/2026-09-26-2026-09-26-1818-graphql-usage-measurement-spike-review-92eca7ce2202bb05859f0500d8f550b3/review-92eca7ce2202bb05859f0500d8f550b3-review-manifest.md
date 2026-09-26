<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "95d311386e5ab8fb184a7877fb202a0514b9777c",
      "commit": "cd5b43e494129cab7cf6a196b7204bcd89dcd207",
      "digest": "sha256:4577ecb7b7362841470ebaa382993852a0161effb88a41d8a98aa1eb4e95fdeb",
      "path": "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "25c8b6bda1e77928899502f7f773f72051a21197",
      "commit": "6a3a335b5ef246c95a986145bd6e3ae6fc77347f",
      "digest": "sha256:c50ae4522cbd67a33cb60d782018d9db7d4814893b29a6c6b8e35352f74343f9",
      "path": "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "a56b0e6cd9aa4875938faa2d0c43f7ed475cf6f3",
      "commit": "f635f8ac85f3807ab794b9ec5cf6b61847ded61d",
      "digest": "sha256:84f4c197a7f3250cae55e47e553862724e574292f4ec9d066511e60542b39845",
      "path": "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-0bc767c1-f0d5-4270-826f-170506ee400b",
      "claimed_at": "2026-09-26T17:16:28.222Z",
      "expires_at": "2026-09-27T01:16:28.222Z",
      "host": "codex",
      "last_activity_at": "2026-09-26T17:16:28.222Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:cd918182f9a46461b0e6b12fd197f51635a0c1147cff068b271eab0573fe60ac"
    },
    {
      "claim_id": "claim-c793a883-578b-4959-b5fd-36f734aabe8a",
      "claimed_at": "2026-09-26T17:19:37.682Z",
      "expires_at": "2026-09-27T01:19:37.682Z",
      "host": "codex",
      "last_activity_at": "2026-09-26T17:19:37.682Z",
      "role": "author",
      "session_fingerprint": "sha256:f178f24a52454f0dbb1de475235a660c30cb82fbfed0e47203c747a23c341309"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "f635f8ac85f3807ab794b9ec5cf6b61847ded61d",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-26T17:14:12.255Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:f178f24a52454f0dbb1de475235a660c30cb82fbfed0e47203c747a23c341309"
    },
    "reviewer": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-26T17:16:28.221Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:cd918182f9a46461b0e6b12fd197f51635a0c1147cff068b271eab0573fe60ac"
    }
  },
  "record_id": "review-92eca7ce2202bb05859f0500d8f550b3",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-92eca7ce2202bb05859f0500d8f550b3",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "cd5b43e494129cab7cf6a196b7204bcd89dcd207",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "25c8b6bda1e77928899502f7f773f72051a21197",
        "digest": "sha256:c50ae4522cbd67a33cb60d782018d9db7d4814893b29a6c6b8e35352f74343f9",
        "path": "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
      },
      "author_response": {
        "digest": "sha256:485f3a41c07018baf04e5e95df21862d0357ceb354aed47487be1e3e87e569cc",
        "path": "docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-author-response-1.md"
      },
      "commit": "6a3a335b5ef246c95a986145bd6e3ae6fc77347f",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:d7c57f9c1f6837b553d0815200dfc3956142726161b453ff15768d201fddfc49",
        "path": "docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "a56b0e6cd9aa4875938faa2d0c43f7ed475cf6f3",
        "digest": "sha256:84f4c197a7f3250cae55e47e553862724e574292f4ec9d066511e60542b39845",
        "path": "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
      },
      "author_response": {
        "digest": "sha256:a04560c9e0a2b58dcaf4d61297955cc31decd63e6059af7b28baf5e94652a122",
        "path": "docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-author-response-2.md"
      },
      "commit": "f635f8ac85f3807ab794b9ec5cf6b61847ded61d",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:88f9929e6504db76901fd1a107eb4c97a5a1a176992347064ecfce57c81ad911",
        "path": "docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-response-2.md"
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
        "digest": "sha256:532d9e0391f2f8757f8f4edad9076fa174ad54b4338add350ad4fa961512d1d3",
        "path": "docs/peer-reviews/plan/2026-09-26-2026-09-26-1818-graphql-usage-measurement-spike-review-92eca7ce2202bb05859f0500d8f550b3/review-92eca7ce2202bb05859f0500d8f550b3-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
