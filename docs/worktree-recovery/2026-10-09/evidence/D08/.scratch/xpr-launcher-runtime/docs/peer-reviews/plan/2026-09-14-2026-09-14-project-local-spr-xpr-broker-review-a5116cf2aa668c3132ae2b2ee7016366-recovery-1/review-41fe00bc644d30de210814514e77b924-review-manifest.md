<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "9665885d49b01ee03488a254871556a8338815c1",
      "commit": "310893d79ba78b581acc0ed6997cbb65f30a61b8",
      "digest": "sha256:aae69e115b29295aef67b4f72bbebf34ccc6eaed354d0a63c89de77147f66603",
      "path": "docs/plans/2026-09-14-project-local-spr-xpr-broker.md",
      "snapshot": null,
      "turn": 0
    }
  ],
  "artifact_path": "docs/plans/2026-09-14-project-local-spr-xpr-broker.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-aa3b58cf-6f90-484e-ba9c-0671de9e0746",
      "claimed_at": "2026-09-14T04:55:41.763Z",
      "expires_at": "2026-09-14T12:55:41.763Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-14T04:55:41.763Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:c77bb2adc0c8bf3a6a6ea59158ff7b58a1dc1acb75fa5b25d60adadcf1e3f929"
    },
    {
      "claim_id": "claim-af4ada64-5f4d-4868-ae8e-cf9dc8cb7342",
      "claimed_at": "2026-09-14T05:00:31.456Z",
      "expires_at": "2026-09-14T13:00:31.456Z",
      "host": "codex",
      "last_activity_at": "2026-09-14T05:00:31.456Z",
      "role": "author",
      "session_fingerprint": "sha256:fc95f81c8e508a58981089677bc1253e151a27e1d266474e39b1fef6fa2b617f"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "310893d79ba78b581acc0ed6997cbb65f30a61b8",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-14T04:53:36.772Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:fc95f81c8e508a58981089677bc1253e151a27e1d266474e39b1fef6fa2b617f"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-14T04:55:41.761Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:c77bb2adc0c8bf3a6a6ea59158ff7b58a1dc1acb75fa5b25d60adadcf1e3f929"
    }
  },
  "record_id": "review-a5116cf2aa668c3132ae2b2ee7016366",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-41fe00bc644d30de210814514e77b924",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "310893d79ba78b581acc0ed6997cbb65f30a61b8",
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
        "digest": "sha256:1c0411a52680ca585a5a01fccba84cfff9bb34f2eebefeb4aa603425a841086c",
        "path": "docs/peer-reviews/plan/2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    }
  ]
}
```
