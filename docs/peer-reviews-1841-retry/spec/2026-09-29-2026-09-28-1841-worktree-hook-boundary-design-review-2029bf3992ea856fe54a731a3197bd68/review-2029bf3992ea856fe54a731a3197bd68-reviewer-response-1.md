<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-2029bf3992ea856fe54a731a3197bd68"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md"
artifact_commit: "bd4de2dc56595aa18640104eb82b77f375dbea9e"
artifact_blob: "85cc83d7bab90a602b1da9b7bd0ba382bc69c2f8"
artifact_digest: "sha256:5ee63589c970bc045d630823af8fa44d1fa2b9b1d870419816efa296fe059823"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "Claude Opus 5.5"
  session_fingerprint: "sha256:3099bb0c10bc2aec5a889aab2d097c3366a7d76f286962573b5487b91235f30c"
  identity_source: "declared"
started_at: "2026-09-29T14:40:50.706Z"
submitted_at: "2026-09-29T14:43:51.106Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md` at `bd4de2dc` (blob `85cc83d7`) independently. I didn't read earlier review rounds. I checked the spec's code citations against the tree at that commit.

The direction is sound. Replacing the stage-based tool matrix with a checkout boundary is right. So is admitting that regexes over Bash text are not confinement and moving issue, owner and evidence checks to governed transitions. The spec's evidence claims hold up in the code:

- `bash-guard.mjs:146` calls `resolveCurrentSessionWorktreeBinding({ invokingDir })` without the payload `session_id`.
- `worktree-binding-guard.mjs:150-163` seeds candidates from `AI_TASK_MANAGER_PROJECT_DIR`, `TASK_TRACKER_PROJECT_DIR` and every fleet `worktreePath`. `:186,193` keeps the record with the newest timestamp.
- `apply-patch-targets.mjs:30-38` reads only `patch`, `input` and `text`. An object carrying only `command` produces the exact error the spec quotes: `empty or invalid patch payload`.
- `safePatchPath` (`:9-20`) rejects backslashes, NUL, and `.`/`..` segments as the spec says.
- The file-tool scratch/tmp carve-out is at `activity-guard.mjs:167-177`, as cited.
- Both `bash-guard.mjs:187` and `activity-policy.mjs` carry their own `stripQuotedRegions`.
- The temporary hook state matches the migration table. `.codex/hooks.json` has no PreToolUse entries. `.claude/settings.json` PreToolUse keeps `Agent`/`AskUserQuestion` hooks.
- `ready-for-plan` exists in the current matrix (`activity-policy.mjs:103`), so "Ready for Planning" is not invented.

Four issues must be settled in the spec before implementation:

1. What the boundary means when a linked worktree is nested inside the invoking checkout. AITM creates these itself.
2. How a governed CLI verb learns its live session. The payload fix does not reach it, and its fallback is another newest-wins selection.
3. Whether the retained file-target boundary fails open or closed. Today it fails open on several paths.
4. How to handle self-modification of installed guards and hook registrations in consumer installs, where both sit inside the checkout.

I couldn't verify the AC numbering against live issue #1841 body version 11. I used no network or Git access during this review.

## Findings

### R1-F001 — Containment is undefined for linked worktrees nested inside the invoking checkout

Location: Decision sought ("in the primary checkout, the clone root is the local boundary"); Proposed architecture §1 (canonicalize "to the containing Git worktree root"); §2 ("Resolve every target lexically and physically against the invoking worktree root"); §2 last paragraph and Migration step 2 ("refusing unauthorized writes to primary or sibling working files").

AITM nests linked worktrees inside the primary clone in normal operation:

- The Test-stage sandbox is created at `path.join(projectTmpDir(projectDir), '.task-test-<issue>-<sha>-<token>')` (`scripts/task-tracker/verbs/test.mjs:143-145`) and added with `git worktree add --detach` (`:169-170`).
- `.worktrees/` is gitignored (`.gitignore:54`) and excluded by `test-impact-selector.mjs:14`, which shows that per-issue isolation worktrees also live inside the clone.

With the rule as written, a session in the primary checkout passes a lexical/physical containment check for `<primary>/.tmp/.task-test-…/src/x.mjs` or `<primary>/.worktrees/<slug>/…`. Those are another worktree's working files. The spec says elsewhere that writes to sibling working files must be refused (AC9). §1 canonicalizes a *directory* to its containing worktree root, but §2 checks *targets* only against the invoking root, so the two sections disagree.

The reverse case also needs a rule. A nested child checkout's session is lexically inside the primary. Only the "invoking root" wording keeps it from reaching parent files, and the spec should make that explicit.

### R1-F002 — Governed CLI verbs still resolve their session by environment, then by newest transcript

Location: §1 ("A governed AITM mutation must independently establish its target issue, branch, live session, and target worktree"); Evidence item 1; AC1–AC6 mapping.

The payload `session_id` fix only helps code that runs inside a hook. Governed verbs (`npx aitm …`, `scripts/task-tracker/*.mjs`) run as Bash child processes with no hook payload. Their session comes from `currentSessionId()` (`word-counter.mjs:109-115`), which calls `resolveSessionId` (`lib/session-id.mjs:64-98`). The chain is:

1. `AI_TASK_MANAGER_SESSION_ID`
2. provider env keys, trying every registered provider and not only the active one (`:49-53,77-80`)
3. the **mtime-newest `.jsonl` transcript** in the transcript directory (`:81-95`)
4. the literal `default-session`

Step 3 is the same newest-wins pattern the spec removes from fleet resolution. With two concurrent sessions of one provider on a host that doesn't export a session env key, a governed verb can pick up the other session's identity. Also, `currentSessionId()` never returns null, so the `if (!sessionId) return null` guard at `worktree-binding-guard.mjs:142` is dead code. A missing session silently becomes `default-session`, and the spec already treats that as a fixture case ("stale/default-record").

The spec needs to say where a governed mutation gets its "live session". It also needs to say what happens when only the mtime or `default-session` fallback is available.

### R1-F003 — Failure mode of the retained file-target boundary is unspecified; today it fails open

Location: §2 (retained PreToolUse boundary for Edit, Write, NotebookEdit and apply_patch); Risks.

The spec says ambiguous patch target lists are refused. It doesn't say what the boundary does in these other failure cases, and the current code allows several of them:

- A missing, empty or non-string `file_path`/`notebook_path` exits 0 (allow) at `activity-guard.mjs:125-134`.
- Malformed stdin JSON exits 0 at `activity-guard.mjs:63-68`.
- `ensure-self-link.mjs:4` says it exists so that PreToolUse guards "resolve instead of failing open (#791)". A missing module or self-link has already disabled these hooks silently.

The spec makes this hook the only AITM-side file containment. If it can fail open, "must not label a host as bounded when it is not" is not enough, because doctor could report the hook as installed while it lets everything through.

### R1-F004 — Removing the installed-copy self-edit ban is justified only for the dogfooding repo; consumer installs are unaddressed

Location: Provenance row "Installed-copy self-edit ban and chore bypass"; §3 last paragraph; Risks.

The stated reason is that "the self-linked package source is within the permitted checkout". That is true for this repo, where `node_modules/ai-task-manager -> ..`. In a consumer project, `node_modules/ai-task-manager/scripts/**` is the real installed copy, and it sits inside the checkout. So do `.claude/settings.json` and `.codex/hooks.json`. Under the new rule, an agent's Edit/Write/apply_patch to the retained boundary hook, the direct-remote-mutation guard or their registrations is "contained" and allowed. The current ban (`activity-guard.mjs:144-160`) refuses writes into installed `node_modules/.../scripts`. Removing it also means hand edits to an installed copy go through silently and are then lost or diverge on the next install.

The spec calls the remote-mutation guard an "advisory accident barrier" and says Bash is host-governed, so an accepted-risk position may be defensible. But the spec should state that position. As written, the removal looks like a side effect of reasoning about the dev checkout.

### R1-F005 — Codex apply_patch key equivalence changes existing semantics for a non-string `command` on non-patch paths

Location: §2 ("Treat `command`, `patch`, `input`, and `text` as equivalent payload fields … Reject arrays and other non-string command shapes").

Today `extractApplyPatchText` throws on any non-string value among the keys it reads (`apply-patch-targets.mjs:33-35`). If `command` joins that set unconditionally, an apply_patch payload that carries a non-string `command` (for example an argv array, if a Codex version sends one next to a valid `input` string) becomes a hard refusal. Today the same payload succeeds. The spec already holds back the parser change until a captured payload exists (AC11). It should also say that the equivalence set is fixed by the captured fixture, and that a non-string `command` next to a valid string field is either refused on purpose (documented) or ignored. As written, the implementer has to guess, and both choices can pass AC11.

## Required changes

1. **R1-F001:** Define file-target containment as: the target's containing Git worktree root, resolved physically after symlinks and for the nearest existing ancestor of a nonexistent path, must **equal** the invoking worktree root. Lexical descent is not enough. Name the discovery method, for example the nearest ancestor with a `.git` file or directory, or `git worktree list --porcelain`. Add fixtures for:
   - primary session → nested `.tmp/.task-test-*` sandbox (refused);
   - primary session → nested `.worktrees/<slug>` (refused);
   - nested child session → parent primary files (refused);
   - nested child session → its own files (allowed);
   - a target whose nonexistent path would land under a nested root.

   Update the Decision sought sentence to match.
2. **R1-F002:** In §1, state how governed verbs establish the live session without a hook payload. One option is to require `AI_TASK_MANAGER_SESSION_ID` or the active provider's env key. Refuse a governed mutation, but not local work, when resolution falls back to the mtime transcript or `default-session`, or say why the mtime fallback is acceptable. Add a two-concurrent-sessions fixture for a governed verb invoked through Bash, and map it to AC1–AC6.
3. **R1-F003:** Specify the boundary's failure mode. For the known file tools (Edit, Write, NotebookEdit, apply_patch), refuse (fail closed) on:
   - malformed JSON;
   - a missing, empty or non-string target;
   - parser errors;
   - an unresolvable invoking root.

   Doctor/setup must report a hook that cannot load its modules as not enforcing, not as installed. Add tests for each case.
4. **R1-F004:** Pick one of these and record it in the spec:
   - (a) keep a narrow file-tool refusal for installed `node_modules/**/ai-task-manager/**` copies and generated hook-registration files, with the dev self-link exempted by physical resolution to the checkout's own package source; or
   - (b) accept that the agent can modify or deregister AITM's own hooks from inside the checkout. List this in Risks, and have doctor detect drift between the installed hook registrations/scripts and the generated set.

   Either way, fix the provenance-table rationale so it covers consumer installs.
5. **R1-F005:** In §2, state what happens to a non-string `command` alongside a valid string patch field. Make the accepted key set depend on the captured AC11 fixture, and add that case to the AC11 verification column.

## Optional suggestions

### R1-F006 — Derive the covered file-tool set from provider contracts, not a hard-coded list

§2 and the migration table name Edit, Write, NotebookEdit and apply_patch. If a provider adds or renames an explicit-target mutation tool (for example a multi-edit variant), a hard-coded matcher misses it silently. Suggest one small table that maps each provider's explicit-target tools to target fields. Installer parity tests would read that table, and doctor would warn about unknown mutation-capable tool names seen in payloads.

### R1-F007 — Snapshot the AC titles with the body version in the spec

The acceptance map depends on "the live #1841 body at version 11", and the spec says so. Add a one-line quote of each AC title, plus the body version and digest. A later reviewer can then detect drift offline without reading the live issue. The current summary names AC7–AC13 but not AC1–AC6 individually.

## Decision

revisions-requested
