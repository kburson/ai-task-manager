<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "f13a8ff2ea605a8b6f526ed70dcc2f242fb6a177",
      "commit": "9a566c7fb2d089c1a58726e01d555822abd08df3",
      "digest": "sha256:461dd50267576fb12d19b8ac58ea308e1654f3d204234834e92cd6880820c250",
      "path": "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "d2dfe05ca5d94cf41540bcc5cf82743bb221545e",
      "commit": "2c563a62a5a44ef7dea77b88ed7248c440fa2189",
      "digest": "sha256:1da7c5aabf5492f7b9fb5129227d2ffb95b1c0720ff8d9b5cc5d902813d5cad1",
      "path": "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "ce5a60e3ef0af463ab517df4bfc3dcfd557fc513",
      "commit": "0d0d9247d36c9c858382fb7bb696ff301639ec7e",
      "digest": "sha256:bafb27685858804b7cac62870cbf260439575d5c925903337ef0cfc05e21f4f0",
      "path": "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md",
      "snapshot": null,
      "turn": 2
    },
    {
      "blob": "93b2c5054076514bc9d59f3acf10375cb359cfd7",
      "commit": "c8f3e057ba050e8d5c465246f7ce06432d5d28c7",
      "digest": "sha256:1f2a325b3dd709da4fa5cf3e4de606768d76c1692ccd42550911b4ad3e09fe13",
      "path": "docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md",
      "snapshot": null,
      "turn": 4
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-08cb7df3-8aca-40ea-a63e-42aa454bd07c",
      "claimed_at": "2026-09-30T20:47:30.499Z",
      "expires_at": "2026-10-01T04:47:30.499Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-30T20:47:30.499Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
    },
    {
      "claim_id": "claim-42ae7ed1-58d7-402c-b600-c8dc825973ac",
      "claimed_at": "2026-09-30T20:49:06.408Z",
      "expires_at": "2026-10-01T04:49:06.408Z",
      "host": "codex",
      "last_activity_at": "2026-09-30T20:49:06.408Z",
      "role": "author",
      "session_fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "c8f3e057ba050e8d5c465246f7ce06432d5d28c7",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "declared",
            "conflict": false,
            "declared_id": null,
            "observed_id": null,
            "requested_id": "gpt-6-astra",
            "source": "launch-request"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-30T20:43:48.019Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:53715af8efe0a2c2878f254417bebf260119cea338f93002e878f9aff7b99428",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-a57fb56728281f6213185bbfbf7f4964",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-a57fb56728281f6213185bbfbf7f4964",
        "root_review_id": "review-a57fb56728281f6213185bbfbf7f4964",
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
          "declared_id": null,
          "observed_id": null,
          "requested_id": "gpt-6-astra",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T20:43:48.019Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:589eccffd1326779b3a8604fea4ef27d320611487ff7db175d05a8257a3edbbc"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "claude-opus-5-5",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T20:47:30.467Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
    }
  },
  "record_id": "review-a57fb56728281f6213185bbfbf7f4964",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-a57fb56728281f6213185bbfbf7f4964",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "30ce30ffb13c4f3ff4ef6b74293388b10979f563375a8cdf0008efe1236f6e03",
    "reviewer": {
      "effort": "medium",
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
  "startup_commit": "9a566c7fb2d089c1a58726e01d555822abd08df3",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "d2dfe05ca5d94cf41540bcc5cf82743bb221545e",
        "digest": "sha256:1da7c5aabf5492f7b9fb5129227d2ffb95b1c0720ff8d9b5cc5d902813d5cad1",
        "path": "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md"
      },
      "author_response": {
        "digest": "sha256:d5c687522675fdb8351b193f0d2a21c7e81b06885077b2e7ddf72d88b443a4f3",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-author-response-1.md"
      },
      "commit": "2c563a62a5a44ef7dea77b88ed7248c440fa2189",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:59b87187bbe6c6d2e31c408fdeb008f770082b9e5c0187e667de2941a84f9135",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "ce5a60e3ef0af463ab517df4bfc3dcfd557fc513",
        "digest": "sha256:bafb27685858804b7cac62870cbf260439575d5c925903337ef0cfc05e21f4f0",
        "path": "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md"
      },
      "author_response": {
        "digest": "sha256:7be02811019448594101190fe0f16baf942cd12701bd653997936581f5b6ab5c",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-author-response-2.md"
      },
      "commit": "0d0d9247d36c9c858382fb7bb696ff301639ec7e",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:585afe7476ead6f5e0dcf40404c6df243311e221ffd7fc01d623d51cf648738e",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-response-2.md"
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
        "digest": "sha256:a233e25fa3aac5b712857de493fa8ef3e3a8005b8302ca944973c6506dabe2bb",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": {
        "blob": "93b2c5054076514bc9d59f3acf10375cb359cfd7",
        "digest": "sha256:1f2a325b3dd709da4fa5cf3e4de606768d76c1692ccd42550911b4ad3e09fe13",
        "path": "docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md"
      },
      "author_response": {
        "digest": "sha256:38889571af25e545e9cc65729bad60d836a91f83ac19bc39ab66cadb7174e418",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-author-response-4.md"
      },
      "commit": "c8f3e057ba050e8d5c465246f7ce06432d5d28c7",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:b91f1bd56caba153f08e01cbe86d9597da18fbf83bbdef4767b1f2aa2ace2270",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:16d72ab2f76e1d4a5b4098d0b76ec5eeeb188a6d98d920ea785f85751a21f41b",
        "path": "docs/reviews/1857-expanded/spec/2026-09-30-2026-09-30-1857-durable-runtime-cleanup-design-review-a57fb56728281f6213185bbfbf7f4964/review-a57fb56728281f6213185bbfbf7f4964-reviewer-response-5.md"
      },
      "snapshot": null,
      "turn": 5
    }
  ]
}
```
