# Phase Review Manifest

```json
{
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
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md",
  "authority": {
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
  "final_commit": "0d0d9247d36c9c858382fb7bb696ff301639ec7e",
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
  "phase_index": 0,
  "phase_kind": "spec",
  "phase_start_commit": "9a566c7fb2d089c1a58726e01d555822abd08df3",
  "phase_status": "accepted",
  "record_id": "review-a57fb56728281f6213185bbfbf7f4964",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-a57fb56728281f6213185bbfbf7f4964",
  "schema": "ai-peer-review.phase-manifest/v1",
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
    }
  ]
}
```
