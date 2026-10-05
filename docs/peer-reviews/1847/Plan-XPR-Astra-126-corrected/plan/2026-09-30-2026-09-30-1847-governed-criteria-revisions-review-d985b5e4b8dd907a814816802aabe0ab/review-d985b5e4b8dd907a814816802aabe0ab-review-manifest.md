<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "cce6215e70af825eddcb9891b4427b1766e59f6b",
      "commit": "30e59a7699695c1a9e4bf3b364f6861c2a144743",
      "digest": "sha256:62b70494e616d29e1a15fee50b51d308093d869de3883f8989011bd8bd4da244",
      "path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "f39bead365ae8bf30aca8f963e9f202ac57bf987",
      "commit": "17dc13eb790909f350feed4990da0ed89f66af59",
      "digest": "sha256:4afeb4691eb57b71eeb72d3c9c2b0e7f8257beb52ac96c2b9d5906da7a564c27",
      "path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-b9b1667c-d187-4c6c-9097-b4bc2b1672dd",
      "claimed_at": "2026-09-30T15:59:55.378Z",
      "expires_at": "2026-09-30T23:59:55.378Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-30T15:59:55.378Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:7773058b89daee9d32d62e82ba08182c0e688cf3cb2dc951876ad76219342188"
    },
    {
      "claim_id": "claim-4bf68e7a-7abc-4e85-8e33-9277658d3946",
      "claimed_at": "2026-09-30T16:01:36.035Z",
      "expires_at": "2026-10-01T00:01:36.035Z",
      "host": "codex",
      "last_activity_at": "2026-09-30T16:01:36.035Z",
      "role": "author",
      "session_fingerprint": "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "17dc13eb790909f350feed4990da0ed89f66af59",
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
        "joined_at": "2026-09-30T15:52:11.007Z",
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
        "event_log_digest": "sha256:3372ea799cd02526b931476672257c0f6b65ad4acf321f6725de6a13d58fd2b3",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-d985b5e4b8dd907a814816802aabe0ab",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-d985b5e4b8dd907a814816802aabe0ab",
        "root_review_id": "review-d985b5e4b8dd907a814816802aabe0ab",
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
      "joined_at": "2026-09-30T15:52:11.007Z",
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
          "fingerprint": "sha256:7773058b89daee9d32d62e82ba08182c0e688cf3cb2dc951876ad76219342188",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-30T15:59:55.339Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:7773058b89daee9d32d62e82ba08182c0e688cf3cb2dc951876ad76219342188"
    }
  },
  "record_id": "review-d985b5e4b8dd907a814816802aabe0ab",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-d985b5e4b8dd907a814816802aabe0ab",
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
  "startup_commit": "30e59a7699695c1a9e4bf3b364f6861c2a144743",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "f39bead365ae8bf30aca8f963e9f202ac57bf987",
        "digest": "sha256:4afeb4691eb57b71eeb72d3c9c2b0e7f8257beb52ac96c2b9d5906da7a564c27",
        "path": "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md"
      },
      "author_response": {
        "digest": "sha256:80d381d0b189cd8ef9343145161ae07aae27f77bc83a832c1654d2e0bb857565",
        "path": "docs/peer-reviews/1847/Plan-XPR-Astra-126-corrected/plan/2026-09-30-2026-09-30-1847-governed-criteria-revisions-review-d985b5e4b8dd907a814816802aabe0ab/review-d985b5e4b8dd907a814816802aabe0ab-author-response-1.md"
      },
      "commit": "17dc13eb790909f350feed4990da0ed89f66af59",
      "decision": "revisions-requested",
      "finding_ids": [],
      "reviewer_response": {
        "digest": "sha256:5541c350d74a27b71d596bf7d9133b2c453f3cb8491cb83ea6191b1d4edb2914",
        "path": "docs/peer-reviews/1847/Plan-XPR-Astra-126-corrected/plan/2026-09-30-2026-09-30-1847-governed-criteria-revisions-review-d985b5e4b8dd907a814816802aabe0ab/review-d985b5e4b8dd907a814816802aabe0ab-reviewer-response-1.md"
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
        "digest": "sha256:5ef4fdb3d012b57aaa0c2dd26415081b0bfa2e4684943953579b10ae67ff3143",
        "path": "docs/peer-reviews/1847/Plan-XPR-Astra-126-corrected/plan/2026-09-30-2026-09-30-1847-governed-criteria-revisions-review-d985b5e4b8dd907a814816802aabe0ab/review-d985b5e4b8dd907a814816802aabe0ab-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
