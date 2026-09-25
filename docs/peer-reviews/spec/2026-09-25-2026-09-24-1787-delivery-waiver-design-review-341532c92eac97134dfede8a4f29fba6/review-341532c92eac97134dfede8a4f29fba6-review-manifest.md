<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "137b412ff616343887e341cc909afb5dffa10972",
      "commit": "21a07908370219e64b7aeeaa216c55bb4f009c02",
      "digest": "sha256:4e2ab1c13b159dbd7d5c6d529b8b04a59f721eb9a3dd3dafa06a8c26a136a937",
      "path": "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "5b9b76ccc484a66d9f13180971fd5422a19e3b6f",
      "commit": "787428315484792900c7f7f735a336515a9dd83b",
      "digest": "sha256:44d60394559dbbfab9cac8e373101e6545185be60d8103c38215a5e8c4947aff",
      "path": "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "4a6fa02c2c951899117601caa47697d167a42b6d",
      "commit": "b02b4b2660caac4ca2df31570d2cee44a1c6a1b0",
      "digest": "sha256:bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb",
      "path": "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-700d8a5c-73bd-4eb8-9bad-a3334e0222be",
      "claimed_at": "2026-09-25T00:57:32.506Z",
      "expires_at": "2026-09-25T08:57:32.506Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-25T00:57:32.506Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:d0f549acc4823b1d05dab7c341cd134589222ad56e02a364c14624eb89b42d81"
    },
    {
      "claim_id": "claim-f7f12a4c-b41b-4806-8840-711ab37b8ec1",
      "claimed_at": "2026-09-25T01:05:58.528Z",
      "expires_at": "2026-09-25T09:05:58.528Z",
      "host": "codex",
      "last_activity_at": "2026-09-25T01:05:58.528Z",
      "role": "author",
      "session_fingerprint": "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "b02b4b2660caac4ca2df31570d2cee44a1c6a1b0",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-25T00:56:41.461Z",
      "model_display": "GPT-6 Astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "declared",
      "joined_at": "2026-09-25T00:57:32.504Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:d0f549acc4823b1d05dab7c341cd134589222ad56e02a364c14624eb89b42d81"
    }
  },
  "record_id": "review-341532c92eac97134dfede8a4f29fba6",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-341532c92eac97134dfede8a4f29fba6",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "21a07908370219e64b7aeeaa216c55bb4f009c02",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "5b9b76ccc484a66d9f13180971fd5422a19e3b6f",
        "digest": "sha256:44d60394559dbbfab9cac8e373101e6545185be60d8103c38215a5e8c4947aff",
        "path": "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
      },
      "author_response": {
        "digest": "sha256:a40559d261f8abcd2681b976eda4124c97a15d3873b577489858c8d38fe5596e",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-author-response-1.md"
      },
      "commit": "787428315484792900c7f7f735a336515a9dd83b",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006"
      ],
      "reviewer_response": {
        "digest": "sha256:0024e1d4c2d7f6970cdc59d6e496f2a5836d97e45ca9b60a645c2b25544fc07b",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "4a6fa02c2c951899117601caa47697d167a42b6d",
        "digest": "sha256:bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb",
        "path": "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
      },
      "author_response": {
        "digest": "sha256:09701dbe97d48a47946a919e5a2f7a4fb82c805e32be3f275a988b9cd30e8dd2",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-author-response-2.md"
      },
      "commit": "b02b4b2660caac4ca2df31570d2cee44a1c6a1b0",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003"
      ],
      "reviewer_response": {
        "digest": "sha256:cf333fc641e723ce72526dd4e461782006be34d924d5d4efa62811ac419f8e23",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-response-2.md"
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
        "digest": "sha256:9be7d0c56ec4564b955d1d1bd769d97ec733a63f2e7cbae1beca551ca09475f4",
        "path": "docs/peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```
