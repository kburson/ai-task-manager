---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md
commit_sha: 5689ebe4d7b3c85f9e34d003f92ad6e023bef181
uncommitted_changes: false
reviewed_file_sha256: 8bcefeac6682c61fcbcd9f93ff63193dd6ed7ecae36535d4839cdf57c9aab8a8
turn_ordinal: SAR r1
turn_description: Single Agent Review revision 1
finding_count: 3
---

# #1841 worktree hook boundary: SAR round 1

**Reviewed baseline:** `5689ebe4d7b3c85f9e34d003f92ad6e023bef181`. The GPT-6-Astra reviewing agent worked read-only at high effort and examined the full specification, relevant hook code, the installed peer-review skill, and #1841 acceptance criteria. This is a single-agent design review, not cross-provider peer-review acceptance or implementation evidence.

## Findings and author dispositions

### SAR1-01 — P1: Linked-worktree Git metadata lacks an authorized write path

**Evidence:** The proposed working-file boundary is the linked checkout. Its `.git` file points to a per-worktree Git directory under the primary clone, and Git's common directory contains objects, refs, and logs. `git add` and `git commit` need to write those metadata paths outside the checkout. The initial spec promised commits but did not distinguish these required administrative writes from arbitrary outside-root writes.

**Impact:** Strict host confinement would make ordinary commits fail; a blanket grant to the primary clone would erode worktree isolation.

**Disposition:** Addressed in the revised Scope and ownership, Local file boundary, migration sequence, and acceptance mapping. Git metadata paths must be discovered from the selected repository and authorized through an explicit host VCS capability or per-operation host approval. That authority does not make primary or sibling working files generally writable. The spec requires a real linked-worktree add/commit test, negative sibling-write tests, and honest capability reporting when authorization is absent. #1841's existing local-work acceptance text now includes this requirement.

### SAR1-02 — P1: Installed peer-review policy exceeds the proposed artifact-only restriction

**Evidence:** The installed `.codex/skills/peer-review/SKILL.md` forbids reviewer Git commands and writes outside the exact response/package scratch at lines 44–47, and seals the index and whole worktree at lines 56–60. The initial spec treated the independent package rule as though it already matched author-only mutation of the authoritative spec or plan.

**Impact:** Removing AITM's local gates would not make unrelated contained reviewer files writable. Merely linking a dependency would leave #1841's acceptance criterion unmet.

**Disposition:** Addressed in the revised Scope and ownership, Review artifact ownership, migration sequence, and acceptance mapping. The owning `ai-peer-review` package must revise its protocol, generated skill/provider policies, and runtime enforcement, then AITM must adopt and verify the result. Positive tests cover unrelated files and `.scratch/**` during review; negative tests cover authoritative-artifact mutation; a post-review test proves release. A linked issue is tracking only, not completion evidence. #1841's acceptance text was reconciled accordingly.

### SAR1-03 — P2: Foreign-command criterion contradicts unrestricted local work

**Evidence:** The initial spec allowed local work without a binding, while #1841 required “a command from a genuinely foreign worktree” to be refused. Existing `bash-guard-worktree-binding.test.mjs` fixtures refuse ordinary `npm test` under a foreign binding.

**Impact:** The issue and old regression suite could require restoration of the local-work refusal that #1841 intends to remove.

**Disposition:** Addressed in Exact session and checkout resolution, migration sequence, and acceptance mapping. The revised contract permits host-authorized local edit/test/build/Git activity within the effective checkout, independent of another checkout's binding. Governed AITM mutations still require exact issue, branch, live session, and worktree; foreign targets are refused with both identities. Successful audited override and failure when its audit cannot be recorded are explicit tests. The governed #1841 issue-body operation revised its existing acceptance wording at body version 10 while preserving all protected AITM markers.

## Review boundary and next pass

The reviewer also noted that the spec header cited body version 7 while the issue had advanced. The header now identifies the live issue body without asserting a stale fixed version.

These are design corrections only. They do not prove runtime confinement, peer-review package adoption, or stage transitions. A second GPT-6-Astra SAR must review the revised committed specification in full and check these dispositions for new contradictions.
