<!-- aitm-skill-version: 1.0.0 -->

# Evidence v2 inspection, enrollment, and reopen

Load this rule before `aitm evidence` or `aitm reopen`. Emit `aitm-skill-loaded:rules/evidence:1.0.0` once.

`aitm evidence inspect <N> --json` is read-only. It reports the exact issue, source, installed runtime, and resident-entry predicate digests; raw legacy byte references; unverifiable history; and one canonical plan digest.

`aitm evidence enroll <N> --plan-digest <digest> --operation-id <uuid>` re-runs inspection under the designated authority lock and refuses before its first write when the digest, authority host, provider mode, runtime capability, or complete resident-entry inventory differs. Import records preserve raw locators and hashes and carry no retroactive verification, review, approval, or provider claims. The protected v2 projection is written last after import read-back.

`aitm reopen <N> --operation-id <uuid> --reason <text>` is valid only for a closed, enrolled v2 issue and starts a distinct cycle. A malformed v2 marker is corruption and never falls back to v1.

The context file named by `AITM_EVIDENCE_CONTEXT` pins the installed tool root, source root, authority root and host, provider mode, repository identity, and issue. The tool and source roots must differ. Recorded mode additionally requires an explicit recorded fixture/transport. Do not move, reset, rebase, or rewrite the pinned source worktree.
