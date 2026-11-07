# Phase Review Manifest

```json
{
  "artifact_history": [
    {
      "blob": "9c92c9133378f03d7c3c01c7941b64e88d4773c7",
      "commit": "c1ea98935debeff50d711f7a5ab143e312a7787e",
      "digest": "sha256:3a4bd0ca05be979ce297bed9e3c16d8844eb26cb7ecbac4fae343d066595eeae",
      "path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "630e1d98f384578b5b4a9fa73430cf2d52b7ca36",
      "commit": "714c3c519b30c52cfd435e924e6ebe49594f61eb",
      "digest": "sha256:0c9ce1c46274f01081967c6e722e5f86a2c519ea4e7fbf13be715772e0337f88",
      "path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md",
  "authority": {
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-8f271917-445b-486f-8b78-e5da298e719e",
      "claimed_at": "2026-11-05T02:49:39.444Z",
      "expires_at": "2026-11-05T10:49:39.444Z",
      "host": "claude-code",
      "last_activity_at": "2026-11-05T02:49:39.444Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5"
    },
    {
      "claim_id": "claim-a4fb1a93-8fa1-499b-b31d-bf9ce29a1ce8",
      "claimed_at": "2026-11-05T04:15:14.616Z",
      "expires_at": "2026-11-05T12:15:14.616Z",
      "host": "codex",
      "last_activity_at": "2026-11-05T04:15:14.616Z",
      "role": "author",
      "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "714c3c519b30c52cfd435e924e6ebe49594f61eb",
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "observed",
            "conflict": false,
            "declared_id": null,
            "observed_id": "gpt-6-astra",
            "requested_id": null,
            "source": "provider-result"
          },
          "session": {
            "assurance": "observed",
            "fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-11-04T01:44:37.044Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "participants": {
    "author": {
      "evidence": {
        "model": {
          "assurance": "observed",
          "conflict": false,
          "declared_id": null,
          "observed_id": "gpt-6-astra",
          "requested_id": null,
          "source": "provider-result"
        },
        "session": {
          "assurance": "observed",
          "fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-11-04T01:44:37.044Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": null,
          "observed_id": null,
          "requested_id": "claude-opus-5-5",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-11-05T02:49:39.443Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5"
    }
  },
  "phase_index": 0,
  "phase_kind": "spec",
  "phase_start_commit": "c1ea98935debeff50d711f7a5ab143e312a7787e",
  "phase_status": "accepted",
  "record_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-6abe2343e9ddfd3139df0babe8fba61b",
  "schema": "ai-peer-review.phase-manifest/v1",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "630e1d98f384578b5b4a9fa73430cf2d52b7ca36",
        "digest": "sha256:0c9ce1c46274f01081967c6e722e5f86a2c519ea4e7fbf13be715772e0337f88",
        "path": "docs/superpowers/specs/2026-11-03-2147-verified-accept-live.md"
      },
      "author_response": {
        "digest": "sha256:2924ed08418005867f216613c5c8358da2bf864f180f1b21c974c762c776da36",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-author-response-1.md"
      },
      "commit": "714c3c519b30c52cfd435e924e6ebe49594f61eb",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005"
      ],
      "reviewer_response": {
        "digest": "sha256:29057f0ea8cb5dba85484a9da4ed0f08d34d05fabe3ddb846e12da9c889d12ad",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R2-F001",
        "R2-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:53100cee6341c150d7c2cc09c0ca755d68b98b6d92b293a5eeca80f0dd738c20",
        "path": "docs/peer-reviews/spec/2026-11-04-2026-11-03-2147-verified-accept-live-review-6abe2343e9ddfd3139df0babe8fba61b/review-6abe2343e9ddfd3139df0babe8fba61b-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
