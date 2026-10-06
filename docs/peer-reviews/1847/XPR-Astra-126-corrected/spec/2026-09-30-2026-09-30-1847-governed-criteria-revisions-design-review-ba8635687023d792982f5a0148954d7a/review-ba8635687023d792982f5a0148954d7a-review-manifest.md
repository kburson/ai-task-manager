<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "c7c0781431199e022a5764916e435b50f1b412fa",
      "commit": "29bd66e799633f784be324e34c728ee2cf4721a6",
      "digest": "sha256:de62f0b2045d5ffb48561ba083b2800825d345b44ce296d3d74620d1ac3c1ddb",
      "path": "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "b59ceeb96c1248d6ae3157546b3bfaabbb502ac9",
      "commit": "042ed2d8fb002feeda3771a85761ab5d27dcb8b7",
      "digest": "sha256:d00af99b2b2cdc1c67bb19b2010afdbd4236d5b35154a382564d0c7d59eb573f",
      "path": "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "678e9c132df18876fadc1ef0a5749d44e690f51d",
      "commit": "3bb590b5702754f4d222ce43262291083eb28b99",
      "digest": "sha256:681bd3f36583f4f1413b5089887f12dee084f8329d9b7a0829234d4caa125677",
      "path": "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-4d0fba84-0a9a-47d6-b1bc-c3a0f6d2764f",
      "claimed_at": "2026-09-30T08:23:55.109Z",
      "expires_at": "2026-09-30T16:23:55.109Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-30T08:23:55.109Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:9ab594da82e932c23d67af728809f0f2d2f4128f616ae2d30fdd407809de45b5"
    },
    {
      "claim_id": "claim-a45cbb19-0c9d-4872-ae8a-de52cf6b307b",
      "claimed_at": "2026-09-30T08:25:37.465Z",
      "expires_at": "2026-09-30T16:25:37.465Z",
      "host": "codex",
      "last_activity_at": "2026-09-30T08:25:37.465Z",
      "role": "author",
      "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "3bb590b5702754f4d222ce43262291083eb28b99",
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
            "fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-30T08:22:26.323Z",
        "model_display": "gpt-6-astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:bbe266c892a9cc6d81454267ab9147728c8696a24d10aebb57b695f6eff09690",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-ba8635687023d792982f5a0148954d7a",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-ba8635687023d792982f5a0148954d7a",
        "root_review_id": "review-ba8635687023d792982f5a0148954d7a",
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
          "fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T08:22:26.323Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
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
          "fingerprint": "sha256:9ab594da82e932c23d67af728809f0f2d2f4128f616ae2d30fdd407809de45b5",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T08:23:55.073Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:9ab594da82e932c23d67af728809f0f2d2f4128f616ae2d30fdd407809de45b5"
    }
  },
  "record_id": "review-ba8635687023d792982f5a0148954d7a",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-ba8635687023d792982f5a0148954d7a",
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
    "project_root_digest": "32690d9d047b0cc884eca4e33bd88c9787017eef175783d78c1ea42fcab0f9a0",
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
  "startup_commit": "29bd66e799633f784be324e34c728ee2cf4721a6",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "b59ceeb96c1248d6ae3157546b3bfaabbb502ac9",
        "digest": "sha256:d00af99b2b2cdc1c67bb19b2010afdbd4236d5b35154a382564d0c7d59eb573f",
        "path": "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
      },
      "author_response": {
        "digest": "sha256:e5ace3d1533174201b3eda44a2ee496348c8d778f7e7eebb5f50c2e033f9727d",
        "path": "docs/peer-reviews/1847/XPR-Astra-126-corrected/spec/2026-09-30-2026-09-30-1847-governed-criteria-revisions-design-review-ba8635687023d792982f5a0148954d7a/review-ba8635687023d792982f5a0148954d7a-author-response-1.md"
      },
      "commit": "042ed2d8fb002feeda3771a85761ab5d27dcb8b7",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:a01efec37bda202b58a5d387ebf878eb8ebf7ae81242d762b963079392539f45",
        "path": "docs/peer-reviews/1847/XPR-Astra-126-corrected/spec/2026-09-30-2026-09-30-1847-governed-criteria-revisions-design-review-ba8635687023d792982f5a0148954d7a/review-ba8635687023d792982f5a0148954d7a-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "678e9c132df18876fadc1ef0a5749d44e690f51d",
        "digest": "sha256:681bd3f36583f4f1413b5089887f12dee084f8329d9b7a0829234d4caa125677",
        "path": "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
      },
      "author_response": {
        "digest": "sha256:6af1fea664366481b87b1ccc5f4a30f91df5db82bf3626725df4da926ea64e4d",
        "path": "docs/peer-reviews/1847/XPR-Astra-126-corrected/spec/2026-09-30-2026-09-30-1847-governed-criteria-revisions-design-review-ba8635687023d792982f5a0148954d7a/review-ba8635687023d792982f5a0148954d7a-author-response-2.md"
      },
      "commit": "3bb590b5702754f4d222ce43262291083eb28b99",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:91360bd408f1e5a209e12d45a0ac2f66b36fb5677cc103a1257d668c1f0c54a4",
        "path": "docs/peer-reviews/1847/XPR-Astra-126-corrected/spec/2026-09-30-2026-09-30-1847-governed-criteria-revisions-design-review-ba8635687023d792982f5a0148954d7a/review-ba8635687023d792982f5a0148954d7a-reviewer-response-2.md"
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
        "digest": "sha256:4cb8e3493b8ff8cea1e553b168b55452189ac0b0348979496fce32de56bd0c1a",
        "path": "docs/peer-reviews/1847/XPR-Astra-126-corrected/spec/2026-09-30-2026-09-30-1847-governed-criteria-revisions-design-review-ba8635687023d792982f5a0148954d7a/review-ba8635687023d792982f5a0148954d7a-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
