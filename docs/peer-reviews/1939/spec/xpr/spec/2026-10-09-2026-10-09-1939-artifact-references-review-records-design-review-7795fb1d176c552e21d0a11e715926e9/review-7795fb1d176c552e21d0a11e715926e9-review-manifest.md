<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "4155688eaaf3686726be0a363f4e30bdec7981c3",
      "commit": "3621d94ab1f6d276f6558dfa8bb4e3a1ef7c1682",
      "digest": "sha256:082fe12c903c2b11a51d63dfc99e8fd6606258bc61633cb7e84876c78d98f66a",
      "path": "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "1df9dbd96db98a6ec8b8dabf01b7058046aa2be3",
      "commit": "a4bae019462b8771dbf97fbed6f8f7152f9e263b",
      "digest": "sha256:9726515d37326409d7df925043ac15d5f111946d9b739710a5e9c0a7b13c56b9",
      "path": "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "522843c97e5c9436757ea0465925f7cc2edd14ef",
      "commit": "108de3369e9ba93c2d314f747d44b3bcb4099aab",
      "digest": "sha256:d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc",
      "path": "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-1e97fe27-0287-45a7-8f1b-be4f20af4d03",
      "claimed_at": "2026-10-09T16:25:52.487Z",
      "expires_at": "2026-10-10T00:25:52.487Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-09T16:25:52.487Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:793fb00d66e5548993448a8ead48857597b364e40aa36b2e94411da64b748cfe"
    },
    {
      "claim_id": "claim-2a54cfd1-5d96-4193-8a19-1c8767dbb008",
      "claimed_at": "2026-10-09T16:28:42.007Z",
      "expires_at": "2026-10-10T00:28:42.007Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T16:28:42.007Z",
      "role": "author",
      "session_fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "108de3369e9ba93c2d314f747d44b3bcb4099aab",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "observed",
            "conflict": false,
            "declared_id": null,
            "observed_id": "gpt-6.1-sol",
            "requested_id": null,
            "source": "provider-result"
          },
          "session": {
            "assurance": "observed",
            "fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-09T16:25:09.469Z",
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
        "event_log_digest": "sha256:2f2e59007db7ac5e3eba463e647a61bce1eb39804d3d4961b4fca67880d081d2",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-7795fb1d176c552e21d0a11e715926e9",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-7795fb1d176c552e21d0a11e715926e9",
        "root_review_id": "review-7795fb1d176c552e21d0a11e715926e9",
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
          "assurance": "observed",
          "conflict": false,
          "declared_id": null,
          "observed_id": "gpt-6.1-sol",
          "requested_id": null,
          "source": "provider-result"
        },
        "session": {
          "assurance": "observed",
          "fingerprint": "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T16:25:09.469Z",
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
          "declared_id": "claude-opus-5-5",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:793fb00d66e5548993448a8ead48857597b364e40aa36b2e94411da64b748cfe",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T16:25:52.457Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:793fb00d66e5548993448a8ead48857597b364e40aa36b2e94411da64b748cfe"
    }
  },
  "record_id": "review-7795fb1d176c552e21d0a11e715926e9",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-7795fb1d176c552e21d0a11e715926e9",
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
    "project_root_digest": "3b08ad6d4b87ff4ac89d6f84204f1a3f009ce9c6bafbad6feaf5d0401564e300",
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
  "startup_commit": "3621d94ab1f6d276f6558dfa8bb4e3a1ef7c1682",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "1df9dbd96db98a6ec8b8dabf01b7058046aa2be3",
        "digest": "sha256:9726515d37326409d7df925043ac15d5f111946d9b739710a5e9c0a7b13c56b9",
        "path": "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md"
      },
      "author_response": {
        "digest": "sha256:5e2d9b6fb7a38aaf634c00ee7014a0a10d10a497d7417b7bb93746d13d11e71d",
        "path": "docs/peer-reviews/1939/spec/xpr/spec/2026-10-09-2026-10-09-1939-artifact-references-review-records-design-review-7795fb1d176c552e21d0a11e715926e9/review-7795fb1d176c552e21d0a11e715926e9-author-response-1.md"
      },
      "commit": "a4bae019462b8771dbf97fbed6f8f7152f9e263b",
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
        "R1-F009",
        "R1-F010"
      ],
      "reviewer_response": {
        "digest": "sha256:efaa02e612f65c32fd63503eeb3bb47fe59302e7dac16d96192004e151d88bf9",
        "path": "docs/peer-reviews/1939/spec/xpr/spec/2026-10-09-2026-10-09-1939-artifact-references-review-records-design-review-7795fb1d176c552e21d0a11e715926e9/review-7795fb1d176c552e21d0a11e715926e9-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "522843c97e5c9436757ea0465925f7cc2edd14ef",
        "digest": "sha256:d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc",
        "path": "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md"
      },
      "author_response": {
        "digest": "sha256:b8d4967fb5461291917fe1f70773d22b5b4a921515de60479264176dc914176f",
        "path": "docs/peer-reviews/1939/spec/xpr/spec/2026-10-09-2026-10-09-1939-artifact-references-review-records-design-review-7795fb1d176c552e21d0a11e715926e9/review-7795fb1d176c552e21d0a11e715926e9-author-response-2.md"
      },
      "commit": "108de3369e9ba93c2d314f747d44b3bcb4099aab",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:4a84b26ea4fcd50e70e2b9d0b7c7eb9b55aa9f906d1f8308cef9c14c5f506780",
        "path": "docs/peer-reviews/1939/spec/xpr/spec/2026-10-09-2026-10-09-1939-artifact-references-review-records-design-review-7795fb1d176c552e21d0a11e715926e9/review-7795fb1d176c552e21d0a11e715926e9-reviewer-response-2.md"
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
        "digest": "sha256:197324b07d630ad6e96959b46f2070574b760255a57057b1e7c8ecb6778e9ab8",
        "path": "docs/peer-reviews/1939/spec/xpr/spec/2026-10-09-2026-10-09-1939-artifact-references-review-records-design-review-7795fb1d176c552e21d0a11e715926e9/review-7795fb1d176c552e21d0a11e715926e9-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
