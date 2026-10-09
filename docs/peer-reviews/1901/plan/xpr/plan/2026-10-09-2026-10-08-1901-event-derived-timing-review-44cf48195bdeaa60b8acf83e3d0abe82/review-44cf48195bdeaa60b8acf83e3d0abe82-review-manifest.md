<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "1c5f6f22e334ff1f65def384ae221594a5035fe4",
      "commit": "87f5225137ee3f90008a1fd232caf61ab2a287db",
      "digest": "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "a43a0aaeeceacfe53b93d08819049e1cb1105541",
      "commit": "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff",
      "digest": "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "c66c11455859d1a427f12fe84d6b5ef76541bbca",
      "commit": "e22473f927cdb0629651cdc94c1204ea7e621ca5",
      "digest": "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 2
    },
    {
      "blob": "31ea9b98614ed8efb863b327536e39bbe7549cc6",
      "commit": "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9",
      "digest": "sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 3
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-64b31abe-1673-4580-bba6-bb531e4cff5d",
      "claimed_at": "2026-10-09T02:18:47.911Z",
      "expires_at": "2026-10-09T10:18:47.911Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-09T02:18:47.911Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
    },
    {
      "claim_id": "claim-fde7a17b-9ffc-43eb-a7cc-de001586eae7",
      "claimed_at": "2026-10-09T02:24:37.126Z",
      "expires_at": "2026-10-09T10:24:37.126Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T02:24:37.126Z",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9",
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
            "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-09T02:17:32.513Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:5bf17dbc36a396eb0a77fd19742961b753d7371dfd6ed519ed156629382e57e0",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
        "root_review_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
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
          "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T02:17:32.513Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
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
          "fingerprint": "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T02:18:47.881Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
    }
  },
  "record_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "3e6c69f5fabf249449b6c1f3115736df8c4b09a4c7a3f07ba7e8516fa1633183",
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
  "startup_commit": "87f5225137ee3f90008a1fd232caf61ab2a287db",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "a43a0aaeeceacfe53b93d08819049e1cb1105541",
        "digest": "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:d93a40d0510527a25402f1414431f26af898a69a530f453a08121b3724186221",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-1.md"
      },
      "commit": "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006",
        "R1-F007",
        "R1-F008",
        "R1-F009"
      ],
      "reviewer_response": {
        "digest": "sha256:74b25bc76bca44320aeddc7ab8b459bc2fdbc2beecb1fa9ba25bf18100168155",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "c66c11455859d1a427f12fe84d6b5ef76541bbca",
        "digest": "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:afbb8ecd062e9352c02e868e34ef1596485adeaf80618169f4d2067e45c440a6",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-2.md"
      },
      "commit": "e22473f927cdb0629651cdc94c1204ea7e621ca5",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003",
        "R2-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:798a4ee05120fce28764579e7f4a5da4642800d472efdefb42b938b9c3c75dbd",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": {
        "blob": "31ea9b98614ed8efb863b327536e39bbe7549cc6",
        "digest": "sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:d4ce016e9e1c2019feee129e5461ae6c9237b9830131848378b8dd526a85a5ff",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-3.md"
      },
      "commit": "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9",
      "decision": "revisions-requested",
      "finding_ids": [
        "R3-F001",
        "R3-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:dd11667fd3d84931e57b2b19bb80f6a4d7f741ec9232cd4c692b686970ae5018",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R4-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:f9d1e37400b58b4d13feda64a14c1cbe7d04ee2f9d17021ceb3f94c8a8c60e22",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    }
  ]
}
```
