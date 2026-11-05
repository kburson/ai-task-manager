<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "87f7fc0b9537bcb83b1302b1167612dfb6f79c2a",
      "commit": "18b2c4d36968f06175534b0bf3b2697a11bf24ba",
      "digest": "sha256:58ed42a650e2a23757277484fd346220f8c9019205f50ddd3f10d080d4d0bce1",
      "path": "docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "040a50f92e0794109254107f0c99225f8a2bc46c",
      "commit": "53201615bc53f0b22882d2d9020a3236b6a0d825",
      "digest": "sha256:0db5109d2602991cef86035ddae5827d501487a910e3aa9acc5cbd62f31f6628",
      "path": "docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "dc4aa28ea23bcde009fd249702f555c05ff5e5e5",
      "commit": "64bdb0d9af244950fca18f0d94036016f8bed767",
      "digest": "sha256:72bd6494229dda35a3827dfceac0d18d04c0767fe5cd0471b3b81772a54e9731",
      "path": "docs/superpowers/plans/2026-11-05-2157-timing-reengagement-repair.md",
      "snapshot": null,
      "turn": 3
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-11-05-2157-timing-reengagement-repair.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-c3dd8338-eab8-4001-a501-5fd873b610a1",
      "claimed_at": "2026-11-05T13:37:29.071Z",
      "expires_at": "2026-11-05T21:37:29.071Z",
      "host": "claude-code",
      "last_activity_at": "2026-11-05T13:37:29.071Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:98faf62d9aab0f6315ac31cb8bd2cee591251bf6085de8cc965d3ae4d2afea79"
    },
    {
      "claim_id": "claim-96e86b94-4840-4a50-8612-19371ea41020",
      "claimed_at": "2026-11-05T13:39:07.908Z",
      "expires_at": "2026-11-05T21:39:07.908Z",
      "host": "codex",
      "last_activity_at": "2026-11-05T13:39:07.908Z",
      "role": "author",
      "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "64bdb0d9af244950fca18f0d94036016f8bed767",
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
            "requested_id": "gpt-6.1-sol",
            "source": "launch-request"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-11-05T13:36:37.688Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:d769968f33d10ff2babc5649460e740b084a4801bbb9d6f318387c5b5b747efa",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-b57970a7c94c1361badac64a34cc751b",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-b57970a7c94c1361badac64a34cc751b",
        "root_review_id": "review-b57970a7c94c1361badac64a34cc751b",
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
          "requested_id": "gpt-6.1-sol",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-11-05T13:36:37.688Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
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
          "fingerprint": "sha256:98faf62d9aab0f6315ac31cb8bd2cee591251bf6085de8cc965d3ae4d2afea79",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-11-05T13:37:29.051Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:98faf62d9aab0f6315ac31cb8bd2cee591251bf6085de8cc965d3ae4d2afea79"
    }
  },
  "record_id": "review-b57970a7c94c1361badac64a34cc751b",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-b57970a7c94c1361badac64a34cc751b",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "high",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "ccaedf665170e23b4c5cee26d259cc712d8502dab338104113490879281b3dd3",
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
  "startup_commit": "18b2c4d36968f06175534b0bf3b2697a11bf24ba",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "040a50f92e0794109254107f0c99225f8a2bc46c",
        "digest": "sha256:0db5109d2602991cef86035ddae5827d501487a910e3aa9acc5cbd62f31f6628",
        "path": "docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md"
      },
      "author_response": {
        "digest": "sha256:bb6f9ee7b12528025fa135a4d23a7a93ee09e2edc4f82781073ad63d32bd1bb4",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2157-timing-reengagement-repair-design-review-b57970a7c94c1361badac64a34cc751b/review-b57970a7c94c1361badac64a34cc751b-author-response-1.md"
      },
      "commit": "53201615bc53f0b22882d2d9020a3236b6a0d825",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:6753affd26455846a3dfd6f71a1baf7aab307aec29b714e70e7143bf487f6008",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2157-timing-reengagement-repair-design-review-b57970a7c94c1361badac64a34cc751b/review-b57970a7c94c1361badac64a34cc751b-reviewer-response-1.md"
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
        "digest": "sha256:4d20a22d448da3c92f68f612bd4051acbf240ba3300a56961c968499dc9bd859",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2157-timing-reengagement-repair-design-review-b57970a7c94c1361badac64a34cc751b/review-b57970a7c94c1361badac64a34cc751b-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": {
        "blob": "dc4aa28ea23bcde009fd249702f555c05ff5e5e5",
        "digest": "sha256:72bd6494229dda35a3827dfceac0d18d04c0767fe5cd0471b3b81772a54e9731",
        "path": "docs/superpowers/plans/2026-11-05-2157-timing-reengagement-repair.md"
      },
      "author_response": {
        "digest": "sha256:fa0f6d5a9a204fd04f9401c542d6076a3e771ce7a0c7ac627a0fcc27be1c58ce",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2157-timing-reengagement-repair-design-review-b57970a7c94c1361badac64a34cc751b/review-b57970a7c94c1361badac64a34cc751b-author-response-3.md"
      },
      "commit": "64bdb0d9af244950fca18f0d94036016f8bed767",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:a215cb39fed958f205cee830108aa9ff247fde6afce4d2a2ad24ffb4b21091a1",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2157-timing-reengagement-repair-design-review-b57970a7c94c1361badac64a34cc751b/review-b57970a7c94c1361badac64a34cc751b-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:639e48cffafa2b4db20d6cdd89aeb3429ec4e666cd5eb028b4f9f796984d3287",
        "path": "docs/peer-reviews/spec/2026-11-05-2026-11-05-2157-timing-reengagement-repair-design-review-b57970a7c94c1361badac64a34cc751b/review-b57970a7c94c1361badac64a34cc751b-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    }
  ]
}
```
