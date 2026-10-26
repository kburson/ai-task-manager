<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-2029bf3992ea856fe54a731a3197bd68"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md"
artifact_commit: "6ac59f4955aa5a39b3940f02a2c3f25b7f3275de"
artifact_blob: "7ca53d5f80176cbb824a05bc11d2df40595c91df"
artifact_digest: "sha256:0e0bbb9beef0ddc2f828138b30a77505ea850eb42c3a097ab6f21d6dd96042d0"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "Claude Opus 5.5"
  session_fingerprint: "sha256:3099bb0c10bc2aec5a889aab2d097c3366a7d76f286962573b5487b91235f30c"
  identity_source: "declared"
started_at: "2026-09-29T14:40:50.706Z"
submitted_at: "2026-09-29T14:48:23.480Z"
finding_ids: ["R2-F001","R2-F002","R2-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised spec at `6ac59f49` (blob `7ca53d5f`). I checked it against my round-1 findings, the author's round-1 response, and the source tree. All seven round-1 items are resolved:

- **R1-F001 (nested worktrees).** Decision sought and §2 now require the target's physically resolved containing worktree root to **equal** the invoking root. Lexical descent is explicitly insufficient. The spec names both nested layouts AITM creates: `.tmp/.task-test-*` (`verbs/test.mjs:143-145`) and `.worktrees/*`. Discovery is by nearest-ancestor `.git` file or directory, applied from the nearest existing ancestor of a nonexistent target. Migration step 2 lists every fixture I asked for: primary→nested refusal for both layouts, nested→parent refusal, nested self-write allowance, and a nonexistent path under a nested root.
- **R1-F002 (governed CLI session).** A new §1 paragraph makes `AI_TASK_MANAGER_SESSION_ID` or the active provider's documented env key the only mutation authority. It demotes the mtime transcript fallback (`lib/session-id.mjs:81-95`) and `default-session` to diagnostics only. It refuses the governed mutation, not local work, when exact identity is missing, and it requires a two-session Bash fixture. The AC1–AC4 mapping row and migration step 1 reflect this.
- **R1-F003 (fail-open).** §2 now fails closed on malformed JSON, missing, empty or non-string targets, parser errors, and unresolvable invoking or target roots. It treats an unloadable module or self-link as "not enforcing" in setup and doctor. Parity tests must exercise the real load path. That closes the fail-open paths at `activity-guard.mjs:63-68,125-134`.
- **R1-F004 (self-modification).** The author chose option (b) explicitly. The provenance row, §3 and a new Risks bullet cover consumer installs and hook-registration files. Doctor must report drift. Deregistration is stated as a known limitation, not a security boundary. This is an informed decision, so I accept it.
- **R1-F005 (`command` key).** The accepted key set now depends on the captured AC11 payload. A non-string `command` next to a valid string field is refused as ambiguous, not ignored. The case appears in the AC11 verification column.
- **R1-F006 / R1-F007 (optional).** Both were adopted: a provider target-contract table with unknown-coverage reporting, and an AC1–AC13 snapshot with body version and SHA-256.

I didn't independently recompute the issue-body digest. That would need network access, which this review avoided. The author reports computing it from `gh issue view 1841 --json body`.

No required changes remain. Three small clarifications follow as optional suggestions; the author can fold them in without another round.

## Findings

None.

## Required changes

None.

## Optional suggestions

### R2-F001 — Say that the boundary hook is registered only on file-tool matchers, so a malformed payload is still a known file-tool call

Location: §2, fail-closed paragraph ("For these known file tools, malformed hook JSON … must refuse").

If the JSON is malformed, the hook can't read `tool_name`, so "known file tool" can't come from the payload. The fail-closed rule is only well-defined if the boundary hook is registered solely on the explicit-target matchers (Edit, Write, NotebookEdit, apply_patch). That way, every invocation of that hook is a file-tool call by construction. State this, and have the installer parity test assert that the matcher set is exactly the provider target-contract table. Otherwise an implementer might register the hook more broadly, for example with an empty matcher like several current Claude entries, and then either refuse unrelated tools or fall back to failing open.

### R2-F002 — Name how nested non-worktree `.git` directories are treated

Location: §2, containment paragraph ("walking to its nearest `.git` file or directory").

The nearest-`.git` walk also stops at nested repositories that are not linked worktrees. Examples are submodules (a `.git` file) and fixture repos that tests create with their own `.git/` (the "slow-suite fixtures with their own .git/" noted at `verbs/test.mjs:178-181`). Under the equality rule, those are refused as a different root. That is the safe default, but the spec should say it is deliberate. Alternatively, it could say that only roots registered in `git worktree list` count as boundaries. One sentence plus one fixture (a write into a nested fixture repo) would settle it.

### R2-F003 — Run Prettier on the spec before the docs commit

Location: the new tables in §2 (provider target contract) and Acceptance mapping (AC opening phrases).

The existing tables are column-padded, but the two new tables and the widened rows of the AC mapping table are not. This suggests `npm run format` hasn't been run on the revision. It's cosmetic, but a format check at commit time would flag it.

## Decision

accepted
