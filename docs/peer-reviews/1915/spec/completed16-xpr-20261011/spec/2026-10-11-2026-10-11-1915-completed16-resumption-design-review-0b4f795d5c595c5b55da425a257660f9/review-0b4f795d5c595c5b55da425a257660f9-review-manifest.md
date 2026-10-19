<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "889b73869a50717eeac5eefbd06549ac8fcad0f1",
      "commit": "3249b393bb3c81d3fd89db19659ee2c0c13d7db0",
      "digest": "sha256:e443603691356e2365fd8fdc358261819cf9dcd44f0b5d435557037d779f9dae",
      "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "ee5874eed7cf04b524ac4399c3b8932bc81ca9ce",
      "commit": "79c0baea37a7a2406bf34aa1cc482c8639e988f0",
      "digest": "sha256:4d0a9d91aed5bb62a8c6d2de28fa8f111700f1dc7f14dfb01ee0a9b0c225111b",
      "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "8a4843c3dbba07581b6fe9e00422aa7f1bf1ad7d",
      "commit": "d985e728d1a8ff871945909b79cb17795b79620b",
      "digest": "sha256:00c8ce01f7b4c19062fe01452c5d70c1dc2f26b7920c2b45aa8a05c4768a6cda",
      "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-ef5382b6-d383-48db-b1ee-3e6cc7ee8d92",
      "claimed_at": "2026-10-11T19:23:05.446Z",
      "expires_at": "2026-10-12T03:23:05.446Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-11T19:23:05.446Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:7f709c3acc0a5562493b71731ee6551460300f0ea6ca3ac56fa6825532a2c6f4"
    },
    {
      "claim_id": "claim-ad905482-31a9-4b68-b75b-f6f5e7e3f18c",
      "claimed_at": "2026-10-11T19:26:35.344Z",
      "expires_at": "2026-10-12T03:26:35.344Z",
      "host": "codex",
      "last_activity_at": "2026-10-11T19:26:35.344Z",
      "role": "author",
      "session_fingerprint": "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "d985e728d1a8ff871945909b79cb17795b79620b",
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
            "fingerprint": "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-11T19:22:15.799Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:9ca5900884509f126efd187fbfe791e1ec78f3a00c8070736e41be8c9859a281",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-0b4f795d5c595c5b55da425a257660f9",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-0b4f795d5c595c5b55da425a257660f9",
        "root_review_id": "review-0b4f795d5c595c5b55da425a257660f9",
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
          "fingerprint": "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-11T19:22:15.799Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e"
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
          "fingerprint": "sha256:7f709c3acc0a5562493b71731ee6551460300f0ea6ca3ac56fa6825532a2c6f4",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-11T19:23:05.405Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:7f709c3acc0a5562493b71731ee6551460300f0ea6ca3ac56fa6825532a2c6f4"
    }
  },
  "record_id": "review-0b4f795d5c595c5b55da425a257660f9",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-0b4f795d5c595c5b55da425a257660f9",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "high",
      "host": "codex",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "b5eda0a820f8ad576d5c7901eddde9ca8155de4421757bdaeeba2288730b0c6a",
    "reviewer": {
      "effort": "high",
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
  "startup_commit": "3249b393bb3c81d3fd89db19659ee2c0c13d7db0",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "ee5874eed7cf04b524ac4399c3b8932bc81ca9ce",
        "digest": "sha256:4d0a9d91aed5bb62a8c6d2de28fa8f111700f1dc7f14dfb01ee0a9b0c225111b",
        "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
      },
      "author_response": {
        "digest": "sha256:644608574f6c39c4a663db16799333879993a110bad08277c6288dd78798c5da",
        "path": "docs/peer-reviews/1915/spec/completed16-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-0b4f795d5c595c5b55da425a257660f9/review-0b4f795d5c595c5b55da425a257660f9-author-response-1.md"
      },
      "commit": "79c0baea37a7a2406bf34aa1cc482c8639e988f0",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:eb41fbac37938fbad14ac483eb2ef0e4c832cbd83a8f4be2cd4efecda8f89138",
        "path": "docs/peer-reviews/1915/spec/completed16-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-0b4f795d5c595c5b55da425a257660f9/review-0b4f795d5c595c5b55da425a257660f9-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "8a4843c3dbba07581b6fe9e00422aa7f1bf1ad7d",
        "digest": "sha256:00c8ce01f7b4c19062fe01452c5d70c1dc2f26b7920c2b45aa8a05c4768a6cda",
        "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
      },
      "author_response": {
        "digest": "sha256:d08035da594da0d7dec0ab9282fdb052f0ddd1c3c2772c8287ae864f67f8d4ad",
        "path": "docs/peer-reviews/1915/spec/completed16-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-0b4f795d5c595c5b55da425a257660f9/review-0b4f795d5c595c5b55da425a257660f9-author-response-2.md"
      },
      "commit": "d985e728d1a8ff871945909b79cb17795b79620b",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:d171b1c89f5cbca5fade587f58e459b4ff88b8ab8dd2f6b093d2020f741a4b13",
        "path": "docs/peer-reviews/1915/spec/completed16-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-0b4f795d5c595c5b55da425a257660f9/review-0b4f795d5c595c5b55da425a257660f9-reviewer-response-2.md"
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
        "digest": "sha256:d8b3f39d101fbdd5d1fcc5dedf796893e6ed3de29fe0eb75da176dbc3726151d",
        "path": "docs/peer-reviews/1915/spec/completed16-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-0b4f795d5c595c5b55da425a257660f9/review-0b4f795d5c595c5b55da425a257660f9-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
