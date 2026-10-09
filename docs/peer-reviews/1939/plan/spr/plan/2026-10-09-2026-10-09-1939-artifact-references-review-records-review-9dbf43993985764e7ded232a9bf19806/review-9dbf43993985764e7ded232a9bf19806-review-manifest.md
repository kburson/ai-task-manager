<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "4d0d14286c7f267dc222509c63ae6e6c55291f61",
      "commit": "8ffdaf6230da03d32314046208defbf158e58930",
      "digest": "sha256:8754a6090c21203e5017ea7613599ef9a54d6c3a7894d80d69bfec483d96d38c",
      "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "fc27eb5b20ae8b32dce4a406fcaf97ce27d0fa0d",
      "commit": "62938adcb063726897ccb85f875e16962f4ac7f6",
      "digest": "sha256:28dca5ac496e481de1727ab248c7ba21e0620a654dad3eabb9c135702eb0d74d",
      "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "ab77e9c259319275d0b1d4ec80fd5acdfa077995",
      "commit": "9f8642860127229e59e4ddbbb689abed8f449638",
      "digest": "sha256:9995905f1f17a3e0c24928ed7a34a83d550d56d53f09889797c902f692a55ddd",
      "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-22aaef88-f177-4956-9e68-d7abea62971e",
      "claimed_at": "2026-10-09T18:03:59.908Z",
      "expires_at": "2026-10-10T02:03:59.908Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T18:03:59.908Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:1a4fe1f21e37e5881eff155ce38a8c05d802b181a8f03f985a7037d73d350a21"
    },
    {
      "claim_id": "claim-711b23c1-52e1-4119-b73c-6f43b698dc38",
      "claimed_at": "2026-10-09T18:05:59.209Z",
      "expires_at": "2026-10-10T02:05:59.209Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T18:05:59.209Z",
      "role": "author",
      "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "9f8642860127229e59e4ddbbb689abed8f449638",
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
            "fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-09T18:01:10.112Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:c9681bc35656b86687865105e6977baee69e4cb8a02944fd11993d20077d5f28",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-9dbf43993985764e7ded232a9bf19806",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-9dbf43993985764e7ded232a9bf19806",
        "root_review_id": "review-9dbf43993985764e7ded232a9bf19806",
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
          "fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T18:01:10.112Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
    },
    "reviewer": {
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
          "fingerprint": "sha256:1a4fe1f21e37e5881eff155ce38a8c05d802b181a8f03f985a7037d73d350a21",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "declared",
      "joined_at": "2026-10-09T18:03:59.907Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "reviewer",
      "session_fingerprint": "sha256:1a4fe1f21e37e5881eff155ce38a8c05d802b181a8f03f985a7037d73d350a21"
    }
  },
  "record_id": "review-9dbf43993985764e7ded232a9bf19806",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-9dbf43993985764e7ded232a9bf19806",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "SPR",
    "ownership": "broker",
    "project_root_digest": "9aa725b2b5a66515950a4cdfd5ed6323f75c218389e3bf87035b6d71d1eee901",
    "reviewer": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "selector": "codex"
    },
    "schema": "ai-peer-review.runtime/v1",
    "transport_mode": "manual"
  },
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "8ffdaf6230da03d32314046208defbf158e58930",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "fc27eb5b20ae8b32dce4a406fcaf97ce27d0fa0d",
        "digest": "sha256:28dca5ac496e481de1727ab248c7ba21e0620a654dad3eabb9c135702eb0d74d",
        "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
      },
      "author_response": {
        "digest": "sha256:c3ebf81540cf0a2113bdb6b33d775465683cc0e7135981d39585906eb49bb579",
        "path": "docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-author-response-1.md"
      },
      "commit": "62938adcb063726897ccb85f875e16962f4ac7f6",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:76cd8b5e0398ffc4da25798633c286fc95ef03157f230a97e40ccf0c3bd13c9a",
        "path": "docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "ab77e9c259319275d0b1d4ec80fd5acdfa077995",
        "digest": "sha256:9995905f1f17a3e0c24928ed7a34a83d550d56d53f09889797c902f692a55ddd",
        "path": "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
      },
      "author_response": {
        "digest": "sha256:d876ae592992fe7431632ee9585ec92fd4c0b4b6af08400a6e26b9b511dbf76e",
        "path": "docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-author-response-2.md"
      },
      "commit": "9f8642860127229e59e4ddbbb689abed8f449638",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:f27f1029cbd4e261335ce9e0fd15e5650510c34a129e7905308f6bdc6b7001d9",
        "path": "docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-response-2.md"
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
        "digest": "sha256:7f488d9d7249e4d03bcd50aca2ea7beca2cafd98a6efe69ccb88302ebe78fdce",
        "path": "docs/peer-reviews/1939/plan/spr/plan/2026-10-09-2026-10-09-1939-artifact-references-review-records-review-9dbf43993985764e7ded232a9bf19806/review-9dbf43993985764e7ded232a9bf19806-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
