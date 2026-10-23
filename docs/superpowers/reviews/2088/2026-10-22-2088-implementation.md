# Native worker bootstrap and binding diagnostic — #2088

The app-owned #2048 canary in `0cfd` exposed a circular prerequisite at accepted
source `e011bf169d115f881c6bc1e92ae6b3da00e36fad`: task guidance requires the
local runtime before Start, while the native activity hook rejected its canonical
setup because the worker had no active issue binding. Both Codex identity keys
identified that worker; this differs from the earlier collaboration worker whose
thread identity and hook/session identity disagreed. Neither failure is a verified
worker binding. The old canary and every existing worktree remain preserved.

## Implemented boundary

The exact canonical `bash scripts/dev-env/setup-local-worktree.sh` operation can
run in a clean registered native Codex source worktree before issue binding.
Admission requires matching native identities, ordinary physical paths, a clean
index and worktree, no binding in the main checkout or the shared binding census,
trusted external host tools, and SHA-256 matches for 14 reviewed executable
setup inputs. Current HEAD alone never makes replacement setup bytes trusted.
The independent closure test traverses shell entrypoints and local ESM imports,
including the npm lifecycle/script entrypoints, and checks every pinned hash.

Host validation precedes runtime readers capable of invoking Git. It rejects
exported Bash functions and execution/identity overrides, checks effective Git
configuration, and inspects npm user, builtin and discovered global configuration.
Only unambiguous plain npm keys are supported. Native setup requires the actual
Node runtime with its paired npm 11 or newer. Supported explicit installation
roots cover standard system, both Homebrew architectures, the actual Node
installation, and paired distro npm. Other layouts fail closed.

`doctor --json --binding-proof <fresh-nonce>` independently observes the CLI
context and compares the genuine activity-hook observation. Its tuple includes
session, physical root, branch, invocation-worktree HEAD, issue, binding generation,
state and open timing entry. Missing or mismatched observations fail; matching
unbound observations remain unhealthy. The hook uses exclusive no-follow creation,
bounded schema/size/freshness and checked owned directories. CLI consumption
retains a consumed nonce to prevent reuse. No binding is edited and agreement
never grants mutation authority. Ordinary doctor health forms remain compatible.

The local transport is explicitly not cryptographic origin evidence. Genuine
native tool invocation and loaded hook source must accompany operational proof.
The tuple's source HEAD describes the invocation worktree, not the loaded module.
Offline subprocess fixtures are regression tests, never a live canary claim.

## Independent review and author rulings

A separate GPT-6.1 Sol reviewer at medium reasoning inspected source without
implementation authorship or lifecycle authority. Its complete returned report,
including probes, recommendations, dispositions, limits and fingerprints, is
retained in [the compressed raw report](evidence/2088-independent-preliminary-review.txt.gz)
with lengths and hashes in [the manifest](evidence/manifest.txt).

All six actionable findings were accepted and repaired:

| Finding | Author ruling and evidence |
| --- | --- |
| Exported Bash function injection | Reject exported functions before runtime readers; actual guard-process regression. |
| Arbitrary external executables and omitted dirname | Restrict installation roots and paired Node/npm, include dirname, check before Git readers; shim markers remain absent. |
| Git configuration scopes | Inspect effective configuration before status; global and worktree regressions. |
| Wrong global npm configuration path | Inspect builtin/user config, require paired supported npm, discover and inspect its actual global config. |
| Nonnative session fallback | CLI requires native Codex identity and agreement. Hook identity uses the explicit native payload, rejects default/invalid/overridden identity, and corroborates any present native environment keys. |
| Quoted INI execution keys | Actual guard-process red/green reproduction; conservative plain-key subset rejects quoted/escaped/ambiguous keys and normalizes prohibited names. |

The independent final preliminary disposition found no remaining actionable P1/P2.
All strengths and limits remain in the full report. Explicit main-checkout binding
inspection also repaired a census omission caught by a failing regression.
Compatibility roots were expanded narrowly for Intel Homebrew and paired distro
npm; broad PATH trust was rejected. Exact committed-source review remains a
separate acceptance step.

## Verification evidence and remaining boundaries

The original canonical-setup regression failed with the exact no-binding refusal
before production edits. The first run also caught the env-wrapper classification
gap. The closed doctor form and independent hook/CLI fixture failed before their
implementation. The quoted-key regression separately failed, then passed after
repair. Failed implementation/test trials remain in the chat evidence; they are
not relabeled as passing runs.

The initial focused retained-regression command passed all 79 tests, including 16 named
bootstrap/diagnostic tests, legacy seed/activity behavior, doctor unit/CLI behavior
and strict package boundaries. The measured production package grew exactly
three entries, from 974 to 977: admission, immutable pins and diagnostic transport.
The prior strict ceiling failed before its explicit three-entry adjustment. No
tests, reports or unrelated artifacts were added to the production package.

Initial full lint passed, including canonical inventory (1329 files), story tags, test
reach, package checks, action refusals and guidance release. The named test remains
below the 800 code-line limit; its soft size advisory is review evidence rather
than a baseline exemption. The complete slow lane also passed all 56 files with actual exit 0 (526.9s);
this run began before the behavior-preserving comparison extraction/test-lane
repair. Exact committed-source CI remains required. Final full lint and formatting also completed with actual exit 0. The retained
[local receipts](evidence/local-verification-receipts.json) distinguish complete
archived logs from the slow run whose full terminal output remains in chat. No CI or live
native worker success is asserted by this preliminary record.

The first complete fast run failed: the new subprocess fixture belonged in the
integration lane, and npm's inherited runner configuration correctly triggered
the production injection refusal. All subprocess cases were moved intact to the
integration tree; the original named unit file now covers pure identity, command,
nonce and tuple contracts. The fixture constructs its own minimal host environment
rather than weakening production inspection. Unit-purity plus both named files
then passed all 30 tests. The repaired complete fast lane passed all 1001 files
in 112.1 seconds with actual exit 0. The current canonical inventory is 1330 files. The
bound issue's VC1 was updated through the native exact-fragment writer to
run both files; its root citation IDs and unchecked evidence remain unchanged.

Native intake was repaired without state jumps: the registered event-field repair
filled #2088's missing current Refine Start time; fresh Explain became ready,
then the normal Ready for Planning, Plan, human-estimate appendix, Full-Auto
approval and Develop transitions succeeded. Adaptive estimation was explicitly
disabled; its refusal was retained and the documented human appendix used.

Issue #2088 is outside #2039's 32-child roster. The epic remains 22/32 native Done.
After reviewed fixed source and exact-head verification, establish a genuine
worker setup, Start and fresh matching CLI/hook diagnostic before #2048 product
edits. Preserve the failed old canary and all work, then resume independent workers
with dependency-aware parallel execution and serialized native acceptance.

The independent [lane-repair addendum](evidence/2088-independent-lane-repair-addendum.txt.gz)
found no new actionable defects and rechecked the 14 pinned input hashes.

## Native host context correction after the first commit

The first clean source commit was `0e55fb01f571144d81536ae70cf9bb159369fb3f`.
Its first genuine controller diagnostic refused because the hook payload SID was
correct, but the hook process had no executor-only Codex environment keys; its
environment resolver returned `default-session`. The actual command executor
had both Codex keys set to the correct controller SID. Requiring executor
variables inside the hook was an incorrect assumption, not evidence that the
actual chat IDs differed.

A failing regression captured that host boundary. The correction preserves the
existing native rule: hook payload identity is authoritative for hook reads;
CLI reads independently require real Codex keys. Present hook environment keys
must corroborate the payload. Default identities and operator session/project
overrides remain refused. The bootstrap census receives the observed payload SID
directly instead of falling back to the hook environment. A separate failing
foreign-fleet regression preceded that correction; no environment identity is
rewritten. The extended context/legacy checks passed all 80 tests with actual
exit 0.

Two genuine native controller diagnostics subsequently returned actual exit 0
and matching complete tuples for controller #2088. Native successful-hook
additionalContext was delivered by the host alongside independent CLI output.
The loaded runtime included the uncommitted host correction, while tuple HEAD
still identified `0e55fb01f`; this is qualified working-source evidence, not a
claim that the first commit already contained the correction. The generated
consumed hook observations remain preserved locally; full CLI output and native
origin evidence remain in the chat. An optional printf archive copy was refused
as WRITE_OTHER and was not retried through another writer.

A fresh independent GPT-6.1 Sol/medium reviewer accepted the correction with no
blocking finding, independently ran all seven pure tests, recomputed all 14 input
hashes, and reviewed the integration cases without writing fixtures. Its title
and documentation recommendations were accepted. Exact corrected-commit CI and
native #2048 setup/Start/proof still remain required; controller proof is never
substituted for worker proof.

The native AC verifier subsequently retained a 21/25 failure: its inherited
executable path caused four positive fixtures to refuse an untrusted executable.
The fixture now supplies explicit trusted host tool directories, retaining the
production refusal and the independent hostile-path test. A fresh independent
Sol/medium review accepted this fixture-only correction; all 25 focused tests
then passed with actual exit 0 (session 93329). The failed native run remains
archived. Native stamping and exact final-head CI remain separate requirements.

## Complete CI host and admission inventory repair

CI run 39897671356 at b597a0b32 failed integration group 2. The retained
configuration-origin diagnostic identified the hosted image's four system
Git LFS keys in /etc/gitconfig. HOME isolation correctly did not suppress
system configuration. Production continues to refuse executable Git filters.
The proposed system-configuration removal edit was blocked before execution
because it contained an elevation command; no file changed and that approach
was abandoned.

The complete unit/integration matrix now runs in an ordinary Node 24 Bookworm
container with Bash as its explicit default shell. The container installs gh
and jq before capture-source inspection and prints effective Git configuration
origins/key names. All matrix groups, full collection plans, failure artifacts,
exit capture and aggregate verification remain. No production exception,
configuration bypass or skipped bootstrap case was added. This validates a
clean host; it does not establish admission on hosts with system Git filters.

CI also exposed the exact guidance import inventory's missing doctor import.
The first correction exposed the guard's two new imports in the same inventory.
Both exact static import lists now include the new modules, retaining strict
equality and direct guidance admission. The original local integration suite
failed with actual exit 1 (session 59152); the intermediate guard mismatch also
failed (session 16490). The final complete suite passed all 17 tests with zero
skips and actual exit 0 (session 42619). Full lint and format passed with actual
exit 0 (sessions 51757 and 41047). Independent Sol/medium review accepted the
container and exact import corrections without blocking findings.
Native worker setup/Start/proof and final corrected-head CI remain outstanding.
