# #2039 named-carrier qualification — Phase 0 evidence checkpoint

## Outcome and scope

The Phase 0 inventory is complete for coordinator review. The author genuinely stopped #2039 in B, verified release, attached A, ended idle, inspected A in a fresh native A context, then attached B and ended idle again. A fresh B reporting turn resumed #2039 normally before editing this document. The observed carrier is clean, local runtime paths are resolved, relevant claims are absent in idle A, protected refs are retained, and the required metadata checks passed through admitted read-only operations. This is an inventory checkpoint, not acceptance of product source, #2071 admission, implementation, delivery or Close. Phase 1 remains unauthorized.

Three required-read formulations were refused and stopped their respective passes: an unpinned ProjectV2 query, a general executable Node heredoc after Stop, and a mixed Git metadata batch. Each complete denied operation remained unexecuted. The coordinator explicitly selected bounded source-supported corrections; no refusal was treated as permission to change policy or disguise a writer. The original 20-active-minute inventory bound was retained, with an explicit later allowance of at most five additional active minutes for the metadata correction. Recorded windows and their limits appear below. No #2071 Start, P/D creation, source integration, dependency change, setup/repair, excluded dirty-O read or other story execution occurred.

## Reviewed inputs and actual B context

- Accepted route: `docs/superpowers/plans/2026-11-06-2039-named-carrier-route.md`, 36,272 UTF-8 bytes, SHA256 `e14b2f46c0864ddae08ef6669277ee2f1b94372984395f9c7989ce8c63a7c151`.
- Same four-round XPR `review-beb5bac902f522af0e926f684c05aa5e`: reviewer consensus, normal commit mode, authority assurance unavailable. Acceptance covers a conditional proposal, not actual qualification or execution.
- Finalization/current starting checkpoint: `69cdc6683e5e5ac2021d85d4cc435c55b8dd5bf9`.
- Native default root B: `/Users/kpburson/.codex/worktrees/2163-inflation-intent/ai-task-manager`, branch `codex/2163-draft`. No explicit shell cwd was substituted.
- Executable public entry resolved physically to B's `bin/aitm.mjs`. Normal `bin/aitm.mjs resume` succeeded for #2039; no identity/environment override was supplied.
- Exact session binding read back #2039, Develop, the actual B root/branch, and an active entry timestamp. The genuine actor record and shared occupancy row had the same binding generation and native session identity. Exact private identifiers remain in native capture `f570c8`; they are not copied into this public document or another runtime.
- The relevant shared occupancy read returned only this chat's #2039/B row; no #2071 or A occupancy row was observed. This is an observation, not a reservation or permission for a future claim.
- App `list_artifacts` confirmed A and B are already attachments of this chat. The held #2149 attachment was also listed and was not used.

## Provenance and issue observations

`bin/aitm.mjs commit-trace 2039` returned `noop-duplicate` at the actual finalization HEAD. A fresh canonical-comment read then confirmed that `69cdc6683e5e5ac2021d85d4cc435c55b8dd5bf9` is present in [#2039's canonical commit trace](https://github.com/kburson/ai-task-manager/issues/2039#issuecomment-6280178302), alongside the earlier R1 commit. The trace is not inferred from R1 alone.

Fresh issue reads showed #2039 and #2071 Open and assigned solely to `kburson`. #2039's last recorded location remains B; its decomposition is epic-readiness-required with inspect/checkpoint/decomposition-prepare/governed-decomposition only. #2071's last location remains original O/`codex/2071-delivery`; its body selects Task 30 at `0ad57329a5eb4e3aec395adb06a6216178e45c87`, carries the existing full-auto Plan approval and Develop marker, and has a complete story-ok decomposition publication. The separately completed bound-project board read establishes Develop; the body marker alone does not.

The accepted excluded-WIP decision remains unchanged: dirty/untracked O bytes are retained, uninspected and not inputs. No current byte hashes, acceptance or test coverage are asserted for that work. The committed-input necessity assessment below was completed after the coordinator's bounded continuation instruction.

## First refusal and authorized board recovery

The combined read requested #2039's direct sub-issues plus #2071 project-item Status and blockedBy records through `gh api graphql`. Its `projectItems` selection was not scoped to the configured project ID. The PreToolUse guard refused it before provider execution:

> `gh api graphql` runs a ProjectV2 query with no pinned project id — a client-side project-number / `content.number` filter. This is the hand-rolled cross-project read aitm guards against (a same-numbered issue on another board can be misread).
>
> Read board Status with `aitm board [#N]` (resolves the bound projectId internally).
> Change Status with the state verbs (`/task promote`, `/task demote`, `/task reconcile`).

No retry occurred before the coordinator's recovery instruction. After that explicit instruction, `bin/aitm.mjs board help` established the supported syntax and `bin/aitm.mjs board 2071` returned `#2071 board Status: develop` (native capture `fe22ed`). The overbroad ProjectV2 query was not repeated and no provider was substituted.

The initial partial document was retained uncommitted in B throughout the idle handoffs. It was not written in unbound A. The later Stop/release, A inventory, B return and reporting Resume evidence follows; the accepted route and finalized XPR were not edited.

## Authorized B continuation and source necessity

The exact sanctioned graph read was:

```sh
gh api graphql -f query='query { viewer { login } repository(owner:"kburson",name:"ai-task-manager") { parent:issue(number:2039) { subIssues(first:100) { totalCount pageInfo { hasNextPage } nodes { number state body } } } child:issue(number:2071) { assignees(first:20){nodes{login} pageInfo{hasNextPage}} blockedBy(first:100) { totalCount nodes { number state } pageInfo { hasNextPage } } } } }' --jq '{viewer:.data.viewer.login,children:{totalCount:.data.repository.parent.subIssues.totalCount,pageInfo:.data.repository.parent.subIssues.pageInfo,open:[.data.repository.parent.subIssues.nodes[]|select(.state=="OPEN")|{number,location:((.body|[scan("<!-- aitm-worktree-location[^>]*-->")])[-1]//"none")}]},child:.data.repository.child}'
```

Native capture `dde29b` returned 32 direct children, complete pagination, and only #2050/#2051/#2071 Open. The first two still record the protected `bc8d/ai-task-manager` checkout on `codex/2039-draft`; #2071 still records O. Viewer and sole #2071 assignee both equal `kburson`. Dependencies remain #2145 Open and #2070/#2049 Closed. The coordinator's conditional epic-wide parent-retarget decision therefore still matches the observed graph; no sibling or dependency was mutated. Private actor fields from the raw location markers are not reproduced here.

Fresh issue bodies confirmed current Scope, ACs, DoD, Plan approval, selected Task 30 and locations. The initial real B active record was #2039/Develop with the original Resume timestamp. A diagnostic initially passed the session ID where `readExactSessionBinding` expects the root and returned null; source inspection corrected the read-only call to `readExactSessionBinding(process.cwd())`, which returned the matching B binding (`c8f0e0`). No identity override, record repair or rebind was used. Explain (`b853ad`) reported Promote blocked by decomposition-required and unfinished children; no Promote is attempted or implied by this Phase 0 permission.

Committed inputs were read exclusively through B's Git object database: Task 30 at `0ad57329a5eb4e3aec395adb06a6216178e45c87`, retained Task 10 at `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`, the relevant publication/authority sections of the governing specification at `dafb1d276036ddc17490f76329f6aa2c09732a15`, and O at `58ed1ec27c9cc88ec9dfde4d23d4ef2428a2c3d4`. The specification supersedes arithmetic body-version authority with native resource revisions and exact hashes. No routine staging result may imply verified cloud publication or completed lifecycle authority.

O contains the committed story-cache activation, staging, transition, snapshot, retention, view and timing families. A static relative-import walk from activation, stage-body, stage-comment, native-transition, views and timing-authority found 591 reachable committed files with no missing matched relative import (`796527`). This is an overinclusive dependency inventory, not an import allowlist or source acceptance; dynamic imports and behavior are not established by it. Exact minimal source selection, attribution and integration remain Phase 5 obligations.

The public contract is still missing in the inspected committed O facades: `mutateIssueBody` delegates to `versionedWriteBody`, and `pushIssueBody` performs the legacy push and returns `ok`; committed helper availability does not establish public activation. The Z-to-O comparison of the seven owned public files changes only four files (40 additions, 6 removals), including historical runtime differences and a removal of newer delivered observer forwarding. Consequently no wholesale old-file replacement is justified. Preserve the delivered source and integrate only separately accepted prerequisite changes.

The pinned contracts independently specify the required new tests: real public writer/caller staging, typed unpublished results, working versus published reader authority, no routine immediate cloud fallback, native revision/hash conflict refusal, preserved intent, retry/readback, and timing work/Unknown retention without false completed visits. No required behavior is presently available only in dirty O; the selected independent re-authoring route remains viable. This does not accept, discard or characterize the uninspected original tests.

The registered merge-back implementation and provider runner were read in B (`175441`). They resolve recorded child/parent lineage, synchronize only when ancestry requires it, verify the child, recheck the verified head and fast-forward the parent under exclusion. The accepted route therefore requires ordinary post-approval execution and a bounded stop on drift; it grants no early synchronization. B configuration selects project verification with `npm-ci` and `node scripts/maintenance/verify-ci-receipts.mjs`, plus declared-command coverage. Actual A effective configuration and runtime resolution were subsequently inspected separately, as recorded below.

## Real Stop, second refusal, release and native A attachment

The ordinary public command `bin/aitm.mjs stop 'Phase 0: release #2039 before native idle A-context inventory; no #2071 admission authorized'` exited 0 (`7a47b9`): `Stopped #2039: +Unknown active min (wall 12), +212 words.` Unknown active time was not converted into measured engagement. The following entire read-back batch was refused before execution:

```sh
node --input-type=module <<'NODE'
import {currentSessionId,aiAppName} from './scripts/task-tracker/word-counter.mjs';
import {getActiveTask} from './scripts/task-tracker/session-state.mjs';
import {readExactSessionBinding} from './scripts/task-tracker/lib/mutation-context.mjs';
import {readOccupancy} from './scripts/task-tracker/lib/occupancy.mjs';
import {occupancyPath,statePath} from './scripts/task-tracker/paths.mjs';
import {findMainWorktreePath} from './scripts/task-tracker/fleet-registry.mjs';
import {loadState} from './scripts/task-tracker/state.mjs';
const root=process.cwd(),sid=currentSessionId();
const occupancyFile=occupancyPath(findMainWorktreePath(root));
const occupancy=readOccupancy(occupancyFile);
const state=loadState(statePath(root));
console.log(JSON.stringify({root,sid,provider:aiAppName(),activeRecord:getActiveTask(sid,root),binding:readExactSessionBinding(root),timing:{active:state.active,entryStartTs:state.entryStartTs,paused:state.paused,lastActive:state.lastActive},occupancyFile,occupancy},null,2));
NODE
git rev-parse HEAD
git branch --show-current
```

Exact refusal: `Command blocked by PreToolUse hook: [task-tracker] Native hook session has no active issue binding.` The author stopped and reported; no attachment or alternate reader followed without the coordinator's concrete recovery instruction. This batch, including `loadState`, was never rerun.

Public help established that `status` and bare `fleet` are read-only and do not require an active task. Their actual outputs (`97eecc`, `525390`) confirmed B, `No active task. Last active: #2039`, and the stopped #2039 fleet registration. `occupancy help` exposed only administrative `--release`; that mutator was not invoked. Neither public output was misrepresented as authoritative claim absence.

Bounded source captures (`8d0284`, `2d2ed0`) then established the canonical `readOccupancy` getter's validation/read-only behavior; `occupancyPath` constructs the shared path; `findMainWorktreePath` reads Git's worktree list but can fall back to its input. The activity guard expressly permits unbound `READ_*`. `inspectQuotedHeredocs` marks interpreter heredocs executable, which the classifier treats as `WRITE_CODE`. These are source contracts, not a waiver or a proof of every transitive module's initialization.

The coordinator selected exactly one materially narrower read: import only those three existing getters, discover main from genuine `process.cwd()`, reject main equal to cwd before reading, and emit only project root, main root and the #2039 row. It neither called `loadState` nor copied an identity or rewrote a path. Actual capture `28c601` exited 0: project root B, main root `/Users/kpburson/projects/Vibe-Coding/ai-task-manager`, `issue2039:null`. Together with public No-active status, this established release. Native `attach_worktree` then returned A for both Git/workspace roots with `registrationError:null`. The turn ended idle; no A command ran under the old B hook context.

## Genuine idle A inventory

The next turn's actual default `pwd` was `/Users/kpburson/.codex/worktrees/aaff/ai-task-manager` (A). No explicit shell cwd was substituted. Current Tier-1 guidance was read; no setup or self-healing command ran. Capture `0d9c6f` established:

- Branch C: `codex/2147-draft`.
- HEAD C: `cb996cb25d5f9587a5508d3ea332f8d2fe779cf6`.
- Tree: `2cd5ee8490b3f9143cc018ce488c36f96eb1f00c`.
- `git status --porcelain=v1 --untracked-files=all` returned no entries: no staged/unstaged source change or untracked source file was observed.

The actual current-session resolver returned the same genuine Codex actor, without override. `getActiveTask` is a pure reader but can return null on invalid input; the inspection therefore also established that its exact actor file did not exist, rather than treating an ambiguous null as absence. Canonical shared occupancy returned #2039 null, #2071 null and no row with A's worktree path (`69f7c4`). Private session/generation values remain in native captures and are not copied here or into another runtime.

The exact Git-operation markers inspected in `aed30d` were `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `REBASE_HEAD`, `rebase-merge`, `rebase-apply`, `sequencer`, `BISECT_START` and `index.lock`; each was absent at its Git-resolved path. This is the inspected marker list, not a claim about all possible Git metadata. Phase 1 must freshly recheck the selected native operation's complete idle-Git conditions. `.scratch`, `.tmp/aitm` and `node_modules` were present; `.db/aitm` was absent. Private contents were not read, copied, deleted or imported.

### Runtime, public entry and hooks

Actual Node was `v26.8.1`, with executable and physical path `/Users/kpburson/.nvm/versions/node/v26.8.1/bin/node`. `package.json` registers `bin/aitm.mjs` as the public `aitm` entry; its Node shebang and realpath-aware `resolvesAsMain` dispatch were inspected. Runtime capture `48ceaa` records:

| Entry                                   | Observed type/target              | Physical result         |
| --------------------------------------- | --------------------------------- | ----------------------- |
| `bin/aitm.mjs`                          | Regular executable file, mode 755 | A's own public entry    |
| `node_modules/ai-task-manager`          | Symlink, target `..`              | A                       |
| `node_modules/@kburson/ai-task-manager` | Absent                            | No scoped alias claimed |
| `node_modules/.bin/aitm`                | Absent                            | No npm shim claimed     |

Actual `.codex/hooks.json` declares scoped-package-first, repo-local-second resolution. All ten unique configured targets selected the repo-local fallback and physically resolved within A: `hook-handler.mjs`, `hooks/memory-index.mjs`, `bash-guard.mjs`, `activity-guard.mjs`, `source-edit-gate.mjs`, `commit-trail-handler.mjs`, `hooks/on-stop.mjs`, `hooks/stop-audit-pause-resume.mjs`, `hooks/on-user-prompt.mjs`, and `hooks/codex-prompt-timestamp.mjs`, all beneath `scripts/task-tracker/`. This proves source/path resolution, not execution of every hook event. Optional aliases were not repaired.

The selected ordinary public command entry is repo-local `bin/aitm.mjs`, from the genuine attached context. No `npx` registry resolution, global executable or alternative support-script dispatch is selected. Actual candidate admission and its ordinary lifecycle commands remain unattempted. Any later owned `npm-ci` runtime effects and the accepted route's conditional one-time self-link restoration still require that route's exact readbacks and authority; this inventory grants no repair.

### Actual effective provider

Canonical `loadConfig()` and `getPreferences()` were invoked with no overrides (`c62925`), after their source was inspected as read-only. Effective repository is `kburson/ai-task-manager`, trunk is `origin/trunk`, and verification provider provenance is `project`. The provider selects `npm-ci`, `node scripts/maintenance/verify-ci-receipts.mjs` and cloud-complete coverage for declared `npm test`/`npm run test:slow`. Develop iteration uses `verify-affected-or-cloud.mjs`, with lint and format at final verification.

A's actual CI verifier declares `{unit:1,integration:12,slow:3}`. The targeted Z-to-A diff was empty for public bin, hook configuration, project configuration, CI verifier and inspected merge-back implementation/provider files. B's older nine-integration-group verifier is not an input to A. Effective preferences preserve assignee-match, existing confirmation settings, timer pause on blocking questions, and no-emojis formatting. No provider setup, product test or CI verification was executed during this inventory.

## Third refusal, classification correction and preserved metadata

This entire mixed Git batch was refused before execution with the same exact native-hook no-active-binding error:

```sh
git rev-parse --git-dir --git-common-dir
git for-each-ref --format='%(refname) %(objectname)' refs/heads/codex/2147-draft refs/heads/codex/2163-draft refs/heads/codex/2071-delivery refs/heads/codex/2039-delivery-finish refs/heads/codex/2039-draft refs/heads/codex/2039-integration-parent-20261106 refs/heads/codex/2071-public-activation-20261106 refs/remotes/origin/codex/2039-integration-parent-20261106 refs/remotes/origin/codex/2071-public-activation-20261106 refs/remotes/origin/trunk
git rev-parse ORIG_HEAD 2e5a3feec6d6296778f767977cf8086f587d1967^{tree}
git for-each-ref --contains=ORIG_HEAD --format='%(refname) %(objectname)' refs/heads/codex/2147-draft refs/heads/codex/2163-draft refs/heads/codex/2071-delivery refs/heads/codex/2039-delivery-finish refs/heads/codex/2039-draft
git merge-base --is-ancestor 9514fcd7d5f24fc63335fb08f6efde05d19e4275 58ed1ec27c9cc88ec9dfde4d23d4ef2428a2c3d4
git reflog -5 --format='%H %gs' HEAD
git ls-remote origin refs/heads/trunk refs/heads/codex/2039-integration-parent-20261106 refs/heads/codex/2071-public-activation-20261106
```

Independent read calls already launched in the same batch completed; no follow-up read was launched after observing the refusal. The author ended idle in A and reported. Under subsequent explicit coordinator direction, the existing pure classifier evaluated each literal without executing it (`552e60`). Both `for-each-ref` queries, `merge-base`, `reflog` and `ls-remote` classified `COMMIT_CODE`; they were not executed or wrapped. The two `rev-parse` queries classified `READ_*` and later ran independently. The coordinator's selected `git log --walk-reflogs -5 --format='%H %gs' HEAD` also classified `READ_*`; its semantics are documented by [Git log](https://git-scm.com/docs/git-log). No output-file, alias, policy edit or mutating option was introduced.

Actual metadata results:

- `272953`: Git directory `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git/worktrees/ai-task-manager49`; common directory `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git`.
- `9d868b`: ORIG_HEAD `de35374650d8a427a0a94cd4fdb56d9286a0a855`; Z's tree equals C's observed `2cd5ee8490b3f9143cc018ce488c36f96eb1f00c`. Tree equality is not ancestry.
- `02185f`: five actual HEAD walk-reflog entries, newest first: `cb996cb25d5f9587a5508d3ea332f8d2fe779cf6`, `de35374650d8a427a0a94cd4fdb56d9286a0a855`, `83cbc7d2afd6268cf9913079497a8b40654533a6`, `8519f08d316484e819e6bd8c372e94dd83b8f9ea`, `d9108f168cbd9d91671f4d3124e9e9e259e3e711`. Their original messages remain in the capture. Reflog presence alone was not treated as protected-ref reachability.

The coordinator then selected exact local `git rev-parse --verify <full-ref>` and commit-log reads. Every exact query classified `READ_*` before execution (`24111a`); each was captured independently. No denied interface was run through a wrapper. Successful exit-0 protected ref results were:

| Ref                                     | Observed commit                            | Capture  |
| --------------------------------------- | ------------------------------------------ | -------- |
| `refs/heads/codex/2147-draft`           | `cb996cb25d5f9587a5508d3ea332f8d2fe779cf6` | `8964d9` |
| `refs/heads/codex/2163-draft`           | `69cdc6683e5e5ac2021d85d4cc435c55b8dd5bf9` | `0ab65c` |
| `refs/heads/codex/2071-delivery`        | `58ed1ec27c9cc88ec9dfde4d23d4ef2428a2c3d4` | `358604` |
| `refs/heads/codex/2039-delivery-finish` | `9514fcd7d5f24fc63335fb08f6efde05d19e4275` | `b85481` |
| `refs/heads/codex/2039-draft`           | `f1690c264ce923826fd01af750db812d33b4c60d` | `09d109` |
| `refs/remotes/origin/trunk`             | `2e5a3feec6d6296778f767977cf8086f587d1967` | `f05dd3` |

The four valid full refs for local P/D and origin-tracking P/D each returned exit 128, `fatal: Needed a single revision`, and no hash (`b30056`, `7aa36b`, `f916eb`, `b0680a`). These are actual negative resolution results in the successfully inspected repository, not invented successful empty outputs or remote observations.

`git log -1 --format='%H %P' cb996cb25d5f9587a5508d3ea332f8d2fe779cf6` returned C with ordered parents `de35374650d8a427a0a94cd4fdb56d9286a0a855` and `6b12edf856408fb11767baaa8c3be07075773c28` (`fe91e1`). Thus ORIG_HEAD is directly retained by unchanged protected C. The read-only O ancestry log piped to fixed exact-line `rg` for H returned `9514fcd7d5f24fc63335fb08f6efde05d19e4275`, exit 0 (`710201`), establishing H in O's commit ancestry without the unsupported `merge-base` interface. No O filesystem/WIP was accessed.

### Separate primary-provider evidence supplied by the coordinator

The coordinator independently used the supported GitHub connector's GET Git-data endpoints for repository `kburson/ai-task-manager`: `/git/ref/heads/trunk` returned Z, `2e5a3feec6d6296778f767977cf8086f587d1967`; `/git/matching-refs/heads/codex/2039-integration-parent-20261106` and `/git/matching-refs/heads/codex/2071-public-activation-20261106` each returned a successful empty array. This is the coordinator's directly observed primary-provider evidence, relayed into this chat before the final local checks. It is not this author's Git result, not inferred from local tracking refs, and not a reservation. The author did not execute `ls-remote` or substitute another provider after its classification.

## Native return, reporting binding and checkpoint boundary

After the metadata checks, native `attach_worktree` returned original B for both Git/workspace roots and `registrationError:null`. The A turn ended idle with no B command under the old A context. A subsequent fresh B reporting turn verified default root B, branch `codex/2163-draft`, HEAD `69cdc6683e5e5ac2021d85d4cc435c55b8dd5bf9`, the intact uncommitted qualification document and four unchanged untracked review startup/invitation files (`0b284d`). B's self-link physically resolved to B; current guidance, preferences and live #2039 authority were read.

Normal registered `bin/aitm.mjs resume 2039`, without relocation or identity override, succeeded (`020c39`). Actual binding/occupancy capture `3dd9b6` records #2039/Develop/B/`codex/2163-draft`, a new real entry start `2026-11-06T10:39:09.081Z`, matching newly generated actor/occupancy generation, and no #2071 occupancy. The generation was obtained from normal Resume, never copied or injected. #2039's durable issue location was still B. The returned restriction remains epic-readiness-required with inspect/checkpoint/decomposition-prepare/governed-decomposition; it grants only this documentation checkpoint, not product source work.

The ordinary attributed commit containing this file is checkpoint Q, whose parent is the unchanged finalization `69cdc6683e5e5ac2021d85d4cc435c55b8dd5bf9`. Its exact SHA, file byte count/hash, targeted checks and canonical commit-trace readback are emitted in the reporting packet after commit, avoiding a self-referential SHA inside its own bytes. Only this issue-numbered document is staged. Accepted route/XPR/code artifacts and the four untracked startup/invitation files remain retained; no history is rewritten or source imported. B necessarily advances by this authorized documentation commit; its previous checkpoint remains its parent.

## Budget record and remaining gates

The original bound was 20 active minutes across all inventory passes, never restarted on refusal or fresh-context handoff. The coordinator explicitly allowed at most five additional active minutes for the concrete metadata formulation correction. Observed windows are:

| Work                                      | Recorded window/evidence                                                           | Limit on interpretation                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Initial B pass and real Stop              | Resume `09:54:24.099Z`; post-Stop clock `10:06:48Z`; Stop reported wall 12 minutes | About 12m24 elapsed; native measured active remained Unknown |
| Public inspector recovery                 | First clock `10:10:40Z`; report said under two minutes                             | No precise end-clock measurement retained                    |
| Getter/classifier source contract         | First clock `10:16:50Z`; bounded under two minutes                                 | No precise end-clock measurement retained                    |
| Narrow canonical release read/attach      | First clock `10:20:05Z`; reported under one minute                                 | Not an exact measured engagement total                       |
| Genuine A inventory                       | `10:22:20Z` to `10:23:53Z`                                                         | 1m33 observed elapsed window                                 |
| Explicit corrective allowance, first pass | `10:27:19Z` to `10:27:50Z`                                                         | 31 seconds observed                                          |
| Final permitted local reads/return        | `10:34:50Z` to `10:35:04Z`                                                         | 14 seconds observed                                          |

All dates are 2026-11-06 and times UTC. The two exactly measured corrective windows total 45 seconds; this excludes unmeasured message-authoring time and is not a fabricated exact active total. Gaps awaiting coordinator continuation were idle, with #2039 stopped. The fresh reporting turn is the coordinator's separately instructed Resume/document-checkpoint work, not a restarted inventory or an extension into product execution. The available timing evidence does not establish a more precise cumulative active duration.

Phase 0 establishes the recorded inventory and the viable independent re-authoring input decision only. It does not prove live #2071 Start admission, P/D construction/renewal, accepted minimal committed-source integration, Task 30 behavior/TDD, #2145 dependency disposition, native Test/Review/approval, provider verification, merge-back or Close. Fresh Phase 1 must revalidate current authority, claims, source/runtime and the chosen operation's complete idle-Git conditions before its separately authorized single real admission attempt. No original owner or held Plan story is resumed. The coordinator reviews Q and actual captures before any Phase 1 decision.
