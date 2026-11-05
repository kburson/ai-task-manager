<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "0785db299fa61bb95bd633c51faa132cf654770b",
      "commit": "d55d22784f6bf3d68b670c4e4238a0b34acda794",
      "digest": "sha256:7596330f04a1a075df884bcb00d74fa88e218df29422840675a2874187f89569",
      "path": "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "4fafa9f821cf062282a845d20b64848355f02bd1",
      "commit": "7dfdf255c9b3ee2408e719096a7bf5e07bcc4fe8",
      "digest": "sha256:48b132d85af9a49e8271770b673c4465ed9f403d5667aaf0a44a8347fc8e19b8",
      "path": "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md",
      "snapshot": null,
      "turn": 1
    }
  ],
  "artifact_path": "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-24a82311-36e9-4eec-9829-62378e886fc6",
      "claimed_at": "2026-09-14T02:52:19.457Z",
      "expires_at": "2026-09-14T10:52:19.457Z",
      "host": "claude-code",
      "last_activity_at": "2026-09-14T02:52:19.457Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:213be73c4074c670c747a8b650b54a8f2b6d4edf0ba215d148cdc53224221c5a"
    },
    {
      "claim_id": "claim-477bca4f-06e2-47ab-94e7-76a56b60236d",
      "claimed_at": "2026-09-14T03:05:52.685Z",
      "expires_at": "2026-09-14T11:05:52.685Z",
      "host": "codex",
      "last_activity_at": "2026-09-14T03:05:52.685Z",
      "role": "author",
      "session_fingerprint": "sha256:9a2b82a26e71ff21997465857f9902cff17d415416b1545d1ed6cc7adb447511"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "7dfdf255c9b3ee2408e719096a7bf5e07bcc4fe8",
  "human_decision": null,
  "identity_changes": [],
  "participants": {
    "author": {
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-09-14T02:49:44.921Z",
      "model_display": "gpt-6-astra",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:9a2b82a26e71ff21997465857f9902cff17d415416b1545d1ed6cc7adb447511"
    },
    "reviewer": {
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-09-14T02:52:19.455Z",
      "model_display": "Claude Opus 5",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:213be73c4074c670c747a8b650b54a8f2b6d4edf0ba215d148cdc53224221c5a"
    }
  },
  "record_id": "review-814c7c140b809d00b564ed1d1868f59d",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-814c7c140b809d00b564ed1d1868f59d",
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "d55d22784f6bf3d68b670c4e4238a0b34acda794",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "4fafa9f821cf062282a845d20b64848355f02bd1",
        "digest": "sha256:48b132d85af9a49e8271770b673c4465ed9f403d5667aaf0a44a8347fc8e19b8",
        "path": "docs/design/2026-09-14-project-local-spr-xpr-broker-design.md"
      },
      "author_response": {
        "digest": "sha256:bd9ba7c863a572709c68b004b0faf2ce479f3be6d16f76e130074b1251b6d77c",
        "path": "docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-author-response-1.md"
      },
      "commit": "7dfdf255c9b3ee2408e719096a7bf5e07bcc4fe8",
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
        "digest": "sha256:ba0c1d25e291ec085eb10003a1fc2041356fdd41ca6ed179332c670ddf595ac7",
        "path": "docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-reviewer-response-1.md"
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
        "digest": "sha256:92240722366ae90914175461081e783f15dcd7e1a242580edd3f022f27ae26c0",
        "path": "docs/peer-reviews/spec/2026-09-14-2026-09-14-project-local-spr-xpr-broker-design-review-814c7c140b809d00b564ed1d1868f59d/review-814c7c140b809d00b564ed1d1868f59d-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    }
  ]
}
```
