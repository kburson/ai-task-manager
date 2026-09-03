# Evidence v2 inputs and journal contracts

The #1497 library is available only to validated independent synthetic execution contexts. Ordinary issue commands still use v1. Later epic #1495 children supply delivery, cycles, guarded enrollment and public command adapters. These functions do not enroll a production issue.

## Evidence and identity

`buildEvidenceSubject` reads all tracked raw blobs, symlink targets and executable modes from the complete root tree and compares the working files. Dirty tracked files, unresolved LFS pointers and submodules refuse. Raw path bytes are hex encoded in the sorted manifest. Declared consumed untracked or ignored files are read separately and contribute to the environment digest. Paths cannot escape the source root. SHA, absolute source path and capture clock remain observations outside content identity.

Requirements, recipe and environment use exact versioned input shapes. The requirements normalizer retains every AC, command and mapping while excluding progress checkboxes and proof comments. A caller supplies the target contract and versioned policy. Recipes contain ordered executable/argument vectors, lane coverage, resolved tool and runner digests, and policy. History-sensitive is the default: all reachable commit history, refs, current branch and explicitly declared Git inputs contribute. Content-only requires a reviewed declaration; hosted checks still belong to their actual provider head.

The trusted capture caller must supply **observed** dependency material and lockfile digests, Node and toolchain identity, platform, relevant configuration digests, declared public environment values and consumed file paths. A digest copied from configuration is not an observation. Missing historical fields require new verification; do not fill old receipts from today's environment. Completeness is an input-capture obligation, not something static analysis can infer from an arbitrary command. The library refuses incomplete or unknown shapes, but does not inspect arbitrary runner code to prove its declarations exhaustive. Callers must retain the returned inputs and source artifacts alongside the candidate record.

Never supply secrets as environment values or consumed files. Names associated with authentication are rejected before hashing. External secret-dependent state is non-reusable unless a trusted provider supplies a safe, verifiable input identity. The caller owns classification of other values; the library does not promise to recognize arbitrary secret strings.

## Records and acceptance

Records use canonical JSON, SHA256 tagged IDs, UUID cycle/operation identities and exact payload schemas. The current child implements cycle-opened, candidate, verification, equivalence and acceptance. Later children extend the closed type registry with their delivery and cycle effects. Unknown types refuse. A verification preserves its original tested SHA and commands. Reuse returns a separate equivalence payload; it never rewrites the historical record or claims a new execution.

`authorizeAcceptance` requires exact candidate, requirements, target and policy. The trusted `policy.authorizeReview` port must authenticate an actual recorded human decision or explicit configured gate bypass and return that full decision. A boolean does not satisfy the contract. A record digest proves byte integrity, not who wrote the bytes. Journal reads additionally compare the provider's comment author against the envelope actor. The provider account and trusted runner boundary remain part of the security model; this is not a cryptographic attestation system.

## Journal operations

`readJournal` exhausts `listCommentsPage`, decodes strict records, retains physical IDs, rejects conflicting operation IDs and predecessor forks, and resolves same-issue typed references. `appendRecord` requires an independently validated synthetic context and designated host ID. The authority directory is anchored to the main Git common directory, so linked source worktrees share the same repository lock. A live local lock never expires because of elapsed time. A dead local process can be recovered; uncertain or malformed holders refuse.

Before any request, the writer atomically saves fixed canonical bytes and expected predecessor using a same-directory temporary file and rename. This supports process restart recovery; no machine power-loss guarantee is claimed. The recorded sandbox's Node permission model does not expose fsync. The writer reloads history under the lock, appends, exhaustively discovers its original operation and checks exact durable bytes. Same-operation identical physical duplicates are one logical event. A lost response with no visible effect remains uncertain and refuses another create. Resolve provider visibility before retrying; never rotate the operation ID to bypass uncertainty.

Acknowledged journal comments are retained in a local observation manifest. Their edit or deletion refuses further writes. Unrelated mutable timing or discussion comments are not evidence history. Foreign hosts can read but cannot append. GitHub body versions are not compare-and-swap; distributed multi-writer safety is not claimed. Body enrollment markers are protected projections and cannot restore missing journal history.
