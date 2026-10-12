<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "cfa4e35b99359cc3d0dcd4de02d142c07ac84330",
      "commit": "6a388d2439d46e4c8a5200d65097c887855dae2b",
      "digest": "sha256:49083dfc9c8c713c758d878e7e8c3eb56f7563bebe04c3f54a5ec50454e25b5d",
      "path": "docs/plans/2026-09-14-56-macos-broker-endpoint.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "1b23814dafe769f1edd7a611f0d378bbdfbeb691",
      "commit": "770ec433acbf9709bf729b417004ecc586a5773e",
      "digest": "sha256:bbb05fafbcd756c139e7d79e0384371ccb21f9f78ae38ab157524492758395c7",
      "path": "docs/plans/2026-09-14-56-macos-broker-endpoint.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/plans/2026-09-14-56-macos-broker-endpoint.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-d588dbe5-0b9d-49b4-89be-6a909de71d32",
      "claimed_at": "2026-09-19T21:25:49.318Z",
      "expires_at": "2026-09-20T05:25:49.318Z",
      "host": "grok",
      "last_activity_at": "2026-09-19T21:25:49.318Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
    },
    {
      "claim_id": "claim-ff803639-5135-4d7e-8a9f-b3a23517d370",
      "claimed_at": "2026-09-19T21:29:56.057Z",
      "expires_at": "2026-09-20T05:29:56.057Z",
      "host": "codex",
      "last_activity_at": "2026-09-19T21:29:56.057Z",
      "role": "author",
      "session_fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "770ec433acbf9709bf729b417004ecc586a5773e",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "declared",
            "conflict": false,
            "declared_id": "gpt-6-astra",
            "observed_id": null,
            "requested_id": null,
            "source": "environment-declaration"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9",
            "source": "environment-declaration"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-09-19T21:25:06.367Z",
        "model_display": "GPT-6 Astra",
        "model_id": "gpt-6-astra",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:3915f0c3cc0c8fb0c08cd6583be33db53a6f732c45a72a01b4ce451a89495dff",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-5cd2937d118a0a6c9a6caf9622f19ae1",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-5cd2937d118a0a6c9a6caf9622f19ae1",
        "root_review_id": "review-5cd2937d118a0a6c9a6caf9622f19ae1",
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
          "declared_id": "gpt-6-astra",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9",
          "source": "environment-declaration"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-19T21:25:06.367Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "grok-4.6",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb",
          "source": "environment-declaration"
        }
      },
      "host": "grok",
      "identity_source": "runtime",
      "joined_at": "2026-09-19T21:25:49.317Z",
      "model_display": "Grok 4.6",
      "model_id": "grok-4.6",
      "provider": "xai",
      "role": "reviewer",
      "session_fingerprint": "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
    }
  },
  "record_id": "review-5cd2937d118a0a6c9a6caf9622f19ae1",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-5cd2937d118a0a6c9a6caf9622f19ae1",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "6a388d2439d46e4c8a5200d65097c887855dae2b",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "1b23814dafe769f1edd7a611f0d378bbdfbeb691",
        "digest": "sha256:bbb05fafbcd756c139e7d79e0384371ccb21f9f78ae38ab157524492758395c7",
        "path": "docs/plans/2026-09-14-56-macos-broker-endpoint.md"
      },
      "author_response": {
        "digest": "sha256:8c58d9f8a0426755ccc337c9a8a1e0b9f88669386b6e06678f482887d74c9af5",
        "path": "docs/peer-reviews/plan/2026-09-19-2026-09-14-56-macos-broker-endpoint-review-5cd2937d118a0a6c9a6caf9622f19ae1/review-5cd2937d118a0a6c9a6caf9622f19ae1-author-response-1.md"
      },
      "commit": "770ec433acbf9709bf729b417004ecc586a5773e",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:68c6dd05eb84575b3d491833220a5891b3a4f4d0d8775afee00bc4b37f6d77c0",
        "path": "docs/peer-reviews/plan/2026-09-19-2026-09-14-56-macos-broker-endpoint-review-5cd2937d118a0a6c9a6caf9622f19ae1/review-5cd2937d118a0a6c9a6caf9622f19ae1-reviewer-response-1.md"
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
        "digest": "sha256:fdc0be67bcd970ace264497185a8e8aeb9612b2d019577f0d583af120c9b3599",
        "path": "docs/peer-reviews/plan/2026-09-19-2026-09-14-56-macos-broker-endpoint-review-5cd2937d118a0a6c9a6caf9622f19ae1/review-5cd2937d118a0a6c9a6caf9622f19ae1-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
