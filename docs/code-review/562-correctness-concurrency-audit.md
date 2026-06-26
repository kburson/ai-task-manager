# Functional Correctness, Concurrency & Injection Audit (#562)

**Date:** 2026-06-26
**Scope:** The external code review was 100% architecture and explicitly ran no
correctness, concurrency, or security testing (only the fast lane ran). This
audit fills that gap across three independent tracks — concurrency/race
conditions, fail-open gates that should be fail-closed, and the shell/`gh`
injection surface — anchored by the known concurrent-`/task test` worktree race.

**Method:** Three parallel read-only sweeps (one per track) over
`scripts/task-tracker/` and `scripts/gh/`, followed by manual verification of
every claimed finding against the cited source. Findings the sweep raised but
manual verification refuted are listed under _Rejected findings_ — they are
recorded so the audit trail shows they were considered, not silently dropped.

Each confirmed defect is filed as its own issue (links below). None of them
block the remaining epic-#549 work (all other children are closed and #562's
ACs explicitly accept "filed with a concrete repro and remediation plan"), so
no BLOCKED-protocol annotation was required.

---

## Confirmed defects

### D1 — HIGH — Concurrent `/task test` runs collide on a fixed worktree path (the anchor bug)

- **Site:** `scripts/task-tracker/verbs/test.mjs:363-367`
- **Code:**

  ```js
  const sha = await getHeadSha({ projectDir });
  const wtPath = path.join(projectTmpDir(projectDir), `.task-test-${issueNum}-${shortSha(sha)}`);
  if (existsSync(wtPath)) {
    await removeWorktree({ projectDir, path: wtPath });
  }
  ```

- **Race:** The sandbox worktree path is fully deterministic
  (`.task-test-<issue>-<8-char-sha>`) — no pid/uuid/timestamp component. Two
  concurrent runs for the same issue at the same HEAD compute the _same_ path.
  The second run sees the first's worktree via `existsSync` and **deletes it**
  (`removeWorktree`, line 366) out from under the first, which then fails its
  CI mid-flight and posts a red "✗ Sandboxed verification failed" comment — a
  reported failure that did not actually occur (integrity failure: false-red).
- **Repro:** `npx aitm test <N>` in two terminals against the same issue at the
  same commit, the second started before the first finishes setup. (This is the
  documented reason the project rule "never run `/task test` concurrently"
  exists — this audit pins it to the exact line and confirms it is unmitigated.)
- **Remediation:** Add a uniqueness component to `wtPath`
  (`crypto.randomUUID().slice(0,8)` or `process.pid`), and gate the
  `existsSync→removeWorktree` reclaim on a per-issue lock so a live peer's
  worktree is never reclaimed. Filed: #563.

### D2 — HIGH — Command injection via unvalidated `aitm-commits` SHA

- **Site:** `scripts/maintenance/audit-trunk-integration.mjs:19-30` (sink line 21)
- **Code:**

  ```js
  execSync(`git -C ${MAIN_REPO} merge-base --is-ancestor ${sha} ${TRUNK}`, ...)
  ```

- **Source:** `sha` is extracted from `<!-- aitm-commits ... -->` markers in
  **issue bodies and comments** (`extractShas`, lines 32-48). The only
  processing is `split(',')` + `trim()` — there is **no hex validation**. The
  value flows untrusted from GitHub content straight into a string passed to a
  shell (`execSync`, not the argv-array `execFileSync` used elsewhere in the
  same file at line 16).
- **Injection sketch:** A marker `<!-- aitm-commits: a1b2c3d; touch /tmp/pwned; -->`
  in any audited issue executes `git ... a1b2c3d; touch /tmp/pwned; trunk` when
  the maintenance audit runs.
- **Remediation:** Use `execFileSync('git', ['-C', MAIN_REPO, 'merge-base',
'--is-ancestor', sha, TRUNK], …)` **and** validate `sha` against
  `/^[0-9a-f]{7,40}$/` before use. Filed: #564.

### D3 — MEDIUM — Wave-model child↔parent guards fail open on parent-fetch error

- **Sites (same anti-pattern, three guards):**
  - `scripts/task-tracker/lib/backlog-exit-child-parent-state-guard.mjs:62-64, 74-76`
  - `scripts/task-tracker/lib/refine-exit-child-parent-state-guard.mjs:48-50, 60-62`
  - `scripts/task-tracker/lib/child-cannot-lead-epic-exit-guard.mjs:45-47`
- **Pattern:** Each wraps the parent-issue fetch / parent-state read in
  `try { … } catch { return { ok: true } }`. A transient `gh`/GraphQL failure at
  the moment of the transition is **indistinguishable from "no parent"** and the
  guard _permits_ the wave-model-violating transition (child enters refine/plan,
  or leads its epic, while the parent's true state is unknown).
- **Repro:** Force `fetchParentIssue`/`readParentStatus` to throw (network
  blip / auth expiry / rate-limit) during an on-deck→refine or refine→plan move
  on a child with a real parent → the guard returns `{ ok: true }` and the move
  proceeds unchecked.
- **Remediation:** Distinguish "no parent" (legitimately `ok:true`) from "fetch
  failed" (should be `{ ok:false, reason:'parent state unverifiable' }`).
  Filed: #565.

### D4 — MEDIUM — `gh-edit-guard` disables marker-loss protection when current-body fetch fails

- **Site:** `scripts/task-tracker/lib/gh-edit-guard.mjs:382-396`
- **Code:**

  ```js
  let currentBody = '';
  try {
    currentBody = fetchCurrentBody(parsed.issueNumber) ?? '';
  } catch {
    currentBody = '';
  }
  ```

- **Why fail-open:** The guard's marker-loss invariant (`findLostMarkers`)
  diffs the _new_ body against the _current_ body. When the current-body fetch
  throws, `currentBody` falls back to `''` — and an empty base has **no markers
  to lose**, so any edit that strips invariant markers (`aitm-fields`,
  `aitm-*-state`, etc.) sails through the guard. A transient `gh issue view`
  failure thus reopens the exact #257-class body-clobber the guard exists to
  prevent. (The sibling `block:false` on an unreadable `--body-file`, lines
  372-376, is benign — the underlying `gh` edit fails anyway — and is noted, not
  filed.)
- **Repro:** Make `fetchCurrentBody` throw during a `gh issue edit --body-file`
  that drops a marker → guard returns no block; the marker-stripping edit is
  allowed.
- **Remediation:** On current-body fetch failure, fail closed
  (`{ block: true, reason: 'current body unreadable; cannot verify markers' }`).
  Filed: #566.

---

## Rejected findings (considered, refuted on verification)

- **`blocked-by-guard` "fail-open" (sweep claimed HIGH):** _Refuted._ The catch
  sets `state = null`, but `isOpen(null)` returns `true`
  (`blocked-by-guard.mjs:40-43`), so a fetch failure makes the blocker count as
  **open → refusal**. This is fail-_closed_, exactly as the line 38-39 comment
  documents. Not a defect.
- **`bash-guard.mjs:233` `execSync` template literal:** _Not exploitable._ The
  interpolated value is `Number(n)` where `n` comes from a `\d+`-only regex, so
  it can hold no shell metacharacters. Noted as a defense-in-depth anti-pattern
  (prefer `execFileSync` argv form), not filed as a defect.
- **`promote.mjs` marker-repair catches (417-419, 469-471, 498-500):** These are
  _post_-board-move best-effort repairs / audit-log appends, not pre-move gates;
  swallowing is degraded-logging, not a fail-open transition. Noted, not filed.
- **Issue-body / state.json / queue read-modify-write:** The body path uses
  optimistic-concurrency versioning (`versioned-issue-write.mjs` re-fetches and
  rebases, refusing overlapping edits); `task-tracker-state.json` is per-session
  post-#212 with only monotonic shared fields; queue writes are tmp+rename.
  Correct by design — no race filed.

---

## Test-lane status (resolves the unverified-baseline gap, finding N4)

Recorded in the #562 close comment with command output: the slow lane
(`npm run test:all`), the quality lane (`npm run lint`), and `npm run
format:check` were run and their pass/fail status captured.
