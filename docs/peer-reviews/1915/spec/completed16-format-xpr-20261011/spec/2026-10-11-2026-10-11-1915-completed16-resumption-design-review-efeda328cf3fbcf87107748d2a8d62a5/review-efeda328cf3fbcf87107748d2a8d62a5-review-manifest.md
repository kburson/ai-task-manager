<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "d23034beb8f224f83871cdfa99a8cc6019710d87",
      "commit": "f225c0ca5664036eb4b54729f2a219f995b70d27",
      "digest": "sha256:55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac",
      "path": "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md",
      "snapshot": null,
      "turn": 0
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
      "claim_id": "claim-e8246cd9-e93f-4e27-8fde-733aa20b2503",
      "claimed_at": "2026-10-11T19:37:41.743Z",
      "expires_at": "2026-10-12T03:37:41.743Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-11T19:37:41.743Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:3f00fb073cf147db2b9f3907a52251896bf56857a2d1b7f8ca47f607fd2e3624"
    },
    {
      "claim_id": "claim-e1b03daf-6aef-4002-88f2-5b1a2385d37a",
      "claimed_at": "2026-10-12T03:39:08.187Z",
      "expires_at": "2026-10-12T11:39:08.187Z",
      "host": "codex",
      "last_activity_at": "2026-10-12T03:39:08.187Z",
      "role": "author",
      "session_fingerprint": "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "f225c0ca5664036eb4b54729f2a219f995b70d27",
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
        "joined_at": "2026-10-11T19:36:51.483Z",
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
        "event_log_digest": "sha256:dea79cce19405a110c1e5303e0042802061d08460b7f7fdc32ae08330d008df2",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-efeda328cf3fbcf87107748d2a8d62a5",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-efeda328cf3fbcf87107748d2a8d62a5",
        "root_review_id": "review-efeda328cf3fbcf87107748d2a8d62a5",
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
      "joined_at": "2026-10-11T19:36:51.483Z",
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
          "fingerprint": "sha256:3f00fb073cf147db2b9f3907a52251896bf56857a2d1b7f8ca47f607fd2e3624",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-11T19:37:41.703Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:3f00fb073cf147db2b9f3907a52251896bf56857a2d1b7f8ca47f607fd2e3624"
    }
  },
  "record_id": "review-efeda328cf3fbcf87107748d2a8d62a5",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-efeda328cf3fbcf87107748d2a8d62a5",
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
  "startup_commit": "f225c0ca5664036eb4b54729f2a219f995b70d27",
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
        "digest": "sha256:0c25d1b4830934b8a090c7a78373e211da326ed88e08ad947d20552b4929be64",
        "path": "docs/peer-reviews/1915/spec/completed16-format-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-efeda328cf3fbcf87107748d2a8d62a5/review-efeda328cf3fbcf87107748d2a8d62a5-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
