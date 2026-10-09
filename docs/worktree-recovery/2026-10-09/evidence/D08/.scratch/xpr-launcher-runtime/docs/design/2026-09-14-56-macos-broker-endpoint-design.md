# Issue #56: macOS Broker Endpoint Correction

<!-- cspell:words aipr bindat canonicality chdir EADDRINUSE ECONNREFUSED EEXIST ENOENT fchmodat fstat fstatat NFC NFD nonsymlink overlength pathnames preflights sockaddr TMPDIR injective unpadded noninteger nonpositive -->

**Status:** Proposed correction for peer review

**Issue:** [#56](https://github.com/kburson/ai-peer-review/issues/56)

**Supersedes:** The live-endpoint verification sentence at lines 253–254, the
Unix socket pathname layout at lines 260–265, and the security rule at lines
279–280, and extends the stable-error list at lines 335–337 of
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`. It also
supersedes the matching Task 3 **Interfaces**, Task 3 layout, Task 4
**Interfaces**, and closed handshake instructions at lines 172, 192, 199, and
213 of `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`. Plan line 212
remains authoritative except that a Unix socket bind uses the absolute-path
exception specified here because Darwin and Linux expose no `bindat`; every
other filesystem operation remains directory-relative and no-follow. The issue #56
implementation plan will be the executable replacement authority for those plan
lines once it exists and passes its own peer review. The accepted epic documents
remain sealed and are not edited; this issue-numbered correction has precedence
only for the clauses named here. In particular, the accepted identity-tuple
canonicalization at lines 242–244, including physical-path symlink resolution
and Windows filesystem spelling, is not superseded. The new stable errors
extend rather than replace the accepted list:
`APR_BROKER_CACHE_ROOT_UNAVAILABLE`,
`APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE`,
`APR_BROKER_AUTHORITY_PARENT_UNSAFE`,
`APR_BROKER_AUTHORITY_PARENT_LOST`,
`APR_BROKER_ENDPOINT_PARENT_UNSAFE`,
`APR_BROKER_ENDPOINT_PARENT_LOST`,
`APR_BROKER_ENDPOINT_ROOT_MISMATCH`,
`APR_BROKER_AUTHORITY_CACHE_MISMATCH`,
`APR_BROKER_ENDPOINT_COLLISION`, and
`APR_BROKER_PREDECESSOR_LIMIT`.
The canonical root tuple, full SHA-256 digest, metadata and lock authority,
ownership, compatibility, and recovery requirements remain in force. The
handshake remains closed and fail-closed with the expanded field set specified
here.

## Problem

The accepted project-local broker design places the Unix socket at:

```text
<user-cache>/ai-peer-review/brokers/<64-hex-root-digest>/broker.sock
```

The active macOS SDK declares `sockaddr_un.sun_path[104]`, leaving 103 bytes for
a NUL-terminated pathname. The accepted pathname is 130 UTF-8 bytes under the
real `/Users/kpburson/Library/Caches` root and 117 bytes even when the home
directory is only `/x`. Task 3's byte-accurate preflight therefore rejects every
conforming macOS home path before Task 4 can bind the socket.

The rejection is correct. The pathname contract is not.

## Goals

- Preserve all 256 bits of the existing canonical project-root SHA-256 digest.
- Keep deterministic per-project and per-user routing across package upgrades.
- Fit realistic macOS cache roots within the 103-byte pathname limit.
- Remain injective on case-sensitive and case-insensitive filesystems.
- Keep the full-digest directory as lock and metadata authority.
- Retain fail-closed byte-length validation for unusually long cache roots.
- Leave the Windows named-pipe contract unchanged.
- Give Task 4 every protected parent path and an unambiguous security contract
  for the separated socket parent.
- Accept one shared endpoint-parent blast radius per user to obtain the macOS
  byte budget, with explicit whole-user fencing if that parent is lost.

## Non-goals

- TCP fallback, a shared port, Linux abstract sockets, or an endpoint override.
- Digest truncation, reduced collision resistance, or routing by package version.
- Dual-probing or migrating unreleased pre-0.3 broker endpoints.
- Weakening owner, symlink, peer-credential, lock, nonce, or handshake checks.
- A caller-selected endpoint pathname. The supported endpoint-root input selects
  only the protected parent namespace; the digest-derived token remains fixed,
  and lock/metadata authority never moves with that input.
- Automatic propagation or discovery of `AI_PEER_REVIEW_ENDPOINT_ROOT`; every
  participant is configured explicitly, and divergence fails closed.

## Considered approaches

### 1. Lowercase, unpadded base32 in a compact cache namespace

Encode the same 32 digest bytes with the lowercase alphabet `a-z2-7`, producing
exactly 52 characters, and place the Unix socket at
`<user-cache>/aipr/v1/<token>`.

This is the selected approach. It is lossless, deterministic, portable across
case-folding filesystems, recognizable as ai-peer-review state, and short enough
for realistic macOS home paths.

### 2. Unpadded base64url

Base64url produces only 43 characters, but its mixed-case alphabet is not an
injective pathname representation on the case-insensitive filesystems commonly
used by macOS. Treating letter case as identity would silently reduce the
filesystem routing space. That contradicts the full-identity requirement.

### 3. Full hexadecimal digest under a system temporary directory

A shorter global prefix could fit the existing 64 hexadecimal characters, but
it would abandon the accepted per-user cache-root contract, complicate ownership
and cleanup semantics, and still require a secure per-user namespace. This adds
risk without improving identity integrity.

## Corrected path contract

`brokerPaths({ identity, platform, env, home })` extends its return shape with
the authority-cache and endpoint trust anchors, their source classifications,
and both ordered protected directory chains:

```js
{
  cacheRoot,
  cacheRootSource,
  endpointRoot,
  endpointRootSource,
  endpointLayoutVersion,
  maxEndpointRootBytes,
  authorityDirectories,
  directory,
  endpointDirectories,
  endpoint,
  lock,
  metadata,
}
```

`cacheRoot` is the stable absolute `<user-cache>` path for lock and metadata
authority. It never changes in response to the endpoint-root input. `endpointRoot`
is the absolute POSIX parent beneath which `aipr/v1` is derived; it equals
`cacheRoot` unless an explicit endpoint root is configured. Windows returns
`endpointRoot: null` because its named-pipe endpoint has no filesystem root.
On POSIX, `endpointLayoutVersion` is `1` and `maxEndpointRootBytes` is
`platform.maxEndpointLength` minus the 61-byte `/aipr/v1/<token>` suffix. A
POSIX limit below 63 bytes cannot contain the suffix plus the shortest permitted
two-byte root such as `/a`; it fails with `APR_BROKER_ENDPOINT_LIMIT_INVALID`
before identity or root-input validation and before any path is derived. Windows returns `null` for both because its retained
named-pipe label has no versioned filesystem layout. The path layer is the sole
source for both values.

Every returned root is a canonical absolute platform path with no trailing
separator and no `.` or `..` component. A configured value carrying one of
those noncanonical forms fails with `APR_BROKER_PATH_INVALID` naming its input;
the path layer never resolves symlinks in the `home`, `XDG_CACHE_HOME`,
`LOCALAPPDATA`, or `AI_PEER_REVIEW_ENDPOINT_ROOT` root inputs. Identity-tuple
canonicalization remains governed by the accepted design and still resolves
physical project-root symlinks. POSIX `/` is intentionally rejected as an
unrepresentable owner-only root rather than treated as a trailing-separator
exception. POSIX cache-root and endpoint-root equality is byte-exact UTF-8
comparison of that canonical input form. It remains case-sensitive even on a
case-insensitive volume; a case-only difference fails closed with the mismatch
recovery rather than being silently normalized. This POSIX comparison rule does
not alter the accepted Windows canonical-volume/path-spelling contract.
On a case-insensitive POSIX volume, two differently cased inputs can therefore
name the same physical directory but still fail the byte-exact handshake
comparison. The same deliberate false positive applies to NFC-versus-NFD Unicode
spellings that the filesystem maps to one physical directory. Both are resolved
by converging the input spelling; neither is silently normalized.

Input mapping is normative:

| Platform    | Input                                             | Valid mapping                                                  | Invalid defined value                                                                                                                                          | Creation policy                                             |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| macOS       | `~/Library/Caches`                                | `cacheRootSource: platform-default`                            | Missing, empty, relative, trailing-separator, `.`-component, or `..`-component `home` fails `APR_BROKER_PATH_INVALID`; canonicality extends shipped behavior   | Must already exist and pass anchor checks                   |
| Linux       | absolute, nonempty `XDG_CACHE_HOME`               | `cacheRootSource: xdg-configured`                              | Empty, relative, trailing-separator, `.`-component, or `..`-component value fails `APR_BROKER_PATH_INVALID`; canonicality extends shipped behavior             | Must already exist and pass anchor checks                   |
| Linux       | absent `XDG_CACHE_HOME`, then `~/.cache`          | `cacheRootSource: home-default`                                | Missing, empty, relative, trailing-separator, `.`-component, or `..`-component `home` fails `APR_BROKER_PATH_INVALID`; canonicality extends shipped behavior   | May create `.cache` relative to a retained safe home handle |
| Windows     | absolute, nonempty `%LOCALAPPDATA%`               | `cacheRootSource: platform-default`                            | Missing, empty, nonabsolute, trailing-separator, `.`-component, or `..`-component value fails `APR_BROKER_PATH_INVALID`; canonicality extends shipped behavior | Must already exist and pass anchor checks                   |
| macOS/Linux | absolute, nonempty `AI_PEER_REVIEW_ENDPOINT_ROOT` | `endpointRootSource: configured`                               | Empty, relative, trailing-separator, `.`-component, or `..`-component value fails `APR_BROKER_PATH_INVALID`                                                    | Must already exist and pass anchor checks                   |
| macOS/Linux | absent `AI_PEER_REVIEW_ENDPOINT_ROOT`             | `endpointRootSource: cache-root`; `endpointRoot === cacheRoot` | N/A                                                                                                                                                            | Reuses the validated cache-root handle                      |
| Windows     | `AI_PEER_REVIEW_ENDPOINT_ROOT`                    | Ignored; `endpointRootSource: named-pipe`                      | All values ignored                                                                                                                                             | No endpoint directory                                       |

When a configured input fails, the error context names the specific variable;
root-anchor recovery therefore never has to infer which input selected the
observed path. Authority-cache anchor failures use
`APR_BROKER_CACHE_ROOT_UNAVAILABLE`; independently configured endpoint-anchor
failures use `APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE`. The explicit endpoint-root
setting is the supported recovery for a macOS home whose default endpoint would
be too long. It changes neither project identity nor the full-digest lock
location selected by that process.

The closed `cacheRootSource` value set is `platform-default`,
`xdg-configured`, and `home-default`. The closed `endpointRootSource` value set
is `configured`, `cache-root`, and `named-pipe`.

`authorityDirectories` is the deeply frozen ordered array
`[<user-cache>/ai-peer-review, <user-cache>/ai-peer-review/brokers,
<user-cache>/ai-peer-review/brokers/<digest>]`. The last entry equals
`directory`; neither the authority nor security layers reconstruct this chain
with `dirname`.

The lock and metadata directory remains:

```text
<user-cache>/ai-peer-review/brokers/<64-lowercase-hex-root-digest>/
  broker.lock
  broker.json
```

On macOS and Linux, the endpoint becomes:

```text
<endpoint-root>/aipr/v1/<52-character-lowercase-base32-root-digest>
```

There is no suffix. `aipr` is the stable package namespace and `v1` versions the
pathname encoding/layout, not the broker protocol or project identity. Package,
broker-protocol, and Node versions remain excluded from routing.

On macOS and Linux, `endpointDirectories` is the deeply frozen ordered array
`[<endpoint-root>/aipr, <endpoint-root>/aipr/v1]`. The path layer owns both
derivations; the security layer must not reconstruct them with
`dirname(endpoint)`. Both directories are per-user and shared by every
project-local broker for that user. Only the token leaf is per-project.

On Windows, `cacheRoot`, `authorityDirectories`, `directory`, `lock`, and
`metadata` have the same filesystem contract as on Unix. The endpoint remains:

```text
\\.\pipe\ai-peer-review-brokers-<64-lowercase-hex-root-digest>-broker.sock
```

Windows returns a deeply frozen empty `endpointDirectories` array because a
named pipe has no filesystem parent. Its security implementation receives that
empty array and validates the pipe's owner-only DACL and client token; applying
`dirname` to the logical pipe label is forbidden and tested. The historical
`-broker.sock` suffix is retained deliberately for compatibility.

The socket token is RFC 4648 base32 applied to the 32 bytes represented by the
validated lowercase hexadecimal digest, with the alphabet rendered lowercase
as `abcdefghijklmnopqrstuvwxyz234567` and padding omitted:

1. Decode exactly 64 lowercase hexadecimal characters to 32 bytes.
2. Read the bytes as one ordered bit stream, most-significant bit first.
3. Emit 5-bit groups using `abcdefghijklmnopqrstuvwxyz234567`.
4. Place the final data bit in the most-significant bit of the last 5-bit group
   and zero that group's remaining four bits.
5. Emit no `=` padding and no uppercase characters.

Every valid digest produces exactly 52 characters. Decoding that token recovers
all 32 original bytes. The path derivation never hashes again, truncates, or
normalizes caller-controlled text.

## Length boundary

POSIX endpoint length remains `Buffer.byteLength(endpoint, 'utf8')`; Windows
continues to use JavaScript string units for the injected named-pipe limit.

For the real macOS home in which the defect was reproduced:

```text
/Users/kpburson/Library/Caches/aipr/v1/<52-character-token>
```

is 91 UTF-8 bytes. The endpoint is always the endpoint root plus the 61-byte
`/aipr/v1/<token>` suffix. A configured endpoint root may therefore be at most
42 UTF-8 bytes on Darwin and 46 UTF-8 bytes on Linux. Under the macOS default,
the 42-byte root budget yields a 27-byte absolute home and therefore a
20-byte conventional `/Users/<short-name>` short-name limit. A longer default
path is not silently redirected: preflight throws
`APR_BROKER_ENDPOINT_TOO_LONG` before any directory, lock, metadata, or endpoint
resource is opened.

The macOS offline recovery gives one action: configure an existing shorter,
private absolute directory through `AI_PEER_REVIEW_ENDPOINT_ROOT` for every
owner and client process, then rerun. The chosen root and its ancestor chain must
pass the anchor checks and the recomputed endpoint must fit 103 bytes. A short
owner-only directory below the validated home is preferred; a root below a
world-writable ancestor is refused. Lock and metadata authority remain at
`~/Library/Caches`, so a second broker using the default endpoint root still
loses the same project lock. Linux recovery likewise may select a shorter
endpoint root. No test or runtime path may substitute an unrelated short socket
solely to bypass this check.
macOS `$TMPDIR` and `/tmp` are not viable shortcuts: the customary `$TMPDIR`
pathname exceeds the 42-byte root budget and traverses the `/var` symlink, while
`/tmp` has a world-writable ancestor. Both fail the same length or anchor checks.

If the validated home itself is too long to contain a conforming endpoint root,
the error states that condition rather than recommending an impossible under-home
path. Its exact action is to have an administrator provision one user-owned root
of at most 42 UTF-8 bytes beneath an ancestor chain that passes
`openPrivateRoot`, set `AI_PEER_REVIEW_ENDPOINT_ROOT` to it for every
participant, and retry. If the environment cannot provide such a root,
project-local brokering is unsupported on that account and remains fail-closed.

Darwin's injected maximum is 103 usable bytes because its active SDK declares
`sun_path[104]`. Linux declares `sun_path[108]`, so its injected maximum is 107
usable bytes. Tests exercise the same exact-limit/one-byte-over behavior against
each injected value; they do not imply that Darwin and Linux share a limit.

## Security and ownership

The compact token is routing information, not trust evidence. Authentication
continues to require the live handshake's full canonical root tuple, package
version, broker protocol version, Node major, the authority `cacheRoot`, instance
ID, nonce proof, and kernel-reported peer user. A responder reports its canonical
authority cache root as part of the authenticated handshake; it is never inferred
from the shared socket pathname or metadata. The bounded JSON handshake's closed
field set is the full root tuple, package version, broker protocol version, Node
major, authority `cacheRoot`, instance ID, and nonce proof; the implementation
also compares the kernel-reported peer user. A missing `cacheRoot`, any unknown
field, a truncated frame, a wrong project, or any version mismatch fails with the
existing broker-integrity error before any command is accepted.

Task 4 must treat both locations as protected resources. `cacheRoot` is the
authority trust anchor and `endpointRoot` is the POSIX routing trust anchor. Each
must be an absolute, user-owned, non-symlink directory that is not writable by
group or other before a package-private child is created. On platforms with
extended ACLs, the anchor and every package-owned directory must also have no
extended or inherited ACL entry that grants another identity traversal, write,
add-file, delete-child, or ownership-changing authority. A platform cache may be
shared by applications and need not be `0700`, but it must satisfy those
non-writable mode and ACL boundaries. Selecting absolute `XDG_CACHE_HOME` or
`AI_PEER_REVIEW_ENDPOINT_ROOT` is configuration, not proof of safety.

`openPrivateRoot({ path, source, role, home }) -> { handle, identity }` is the
single root-anchor operation. It traverses the absolute ancestor chain with
no-follow semantics from a retained filesystem-root or validated home handle,
requiring every ancestor to be a nonsymlink directory not writable by group or
other. The final anchor must additionally be owned by the calling user. For
`endpointRootSource: cache-root`, Task 4 reuses the already retained cache-root
handle; for `configured`, it independently opens, validates, and retains the
endpoint root through this operation.

The replacement for plan line 199 is closed: `platformSecurity()` exposes
`canonicalPath`, `userId`, `openPrivateRoot`, `openPrivateDirectory`,
`acquireExclusive`, `listenPrivate`, and `peerUser`. Locks still return
`{ instanceId, nonce, verify(), release() }`, and release still verifies
ownership. `acquireBrokerOwnership({ identity, paths, versions }, platform)` and
`connectBroker({ identity, paths, versions }, platform)` still return authenticated
owner/client handles or stable errors. Versions remain
`{ package_version, broker_protocol_version, node_major }`. The expanded `paths`
shape and retained-handle requirements in this correction are the only interface
changes.

Configured roots and platform-default roots must already exist; the package
never creates their arbitrary ancestors. The sole creation exception is the
Linux `home-default`: after validating and retaining the absolute home as a
user-owned, non-symlink directory not writable by group or other, Task 4 may
create its direct `.cache` child as `0700` relative to that retained home handle.
It then requires that newly created child to remain exactly `0700`; a pre-existing
`~/.cache` may additionally have group/other read or execute bits but must have no
group/other write bit or unsafe ACL. Both forms receive the same owner, type, and
no-symlink post-conditions before use. An absent root outside that exception, or any unsafe
authority root, fails closed with `APR_BROKER_CACHE_ROOT_UNAVAILABLE`; an absent
or unsafe independently configured endpoint root fails closed with
`APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE`. Each identifies its role, exact path,
source variable, and one recovery action.

Below that anchor, Task 4 creates and validates every package-owned level:

- `openPrivateDirectory(cacheRootHandle, paths.authorityDirectories)` receives
  the retained handle returned by `openPrivateRoot`; a cache-root pathname is
  insufficient. It creates
  each absent authority-directory level as owner-only (`0700`) and validates and
  retains the full chain through the full-digest metadata and lock directory. It
  returns the retained leaf-directory handle for subsequent ownership
  operations.
  After the first level is opened relative to the retained cache-root handle,
  every child is created and opened relative to its retained parent handle with
  no-follow semantics. A pre-existing level is accepted only after owner, mode,
  directory type, and no-symlink validation. A per-level `EEXIST` race is
  successful only after those same post-conditions pass. Every package-owned
  authority and endpoint directory is created as and must remain exactly `0700`;
  any pre-existing package-owned level with a different mode is "permissive" and
  fails with its matching `*_PARENT_UNSAFE` error. This exact predicate applies
  equally to created and pre-existing `ai-peer-review`, `brokers`, full-digest,
  `aipr`, and `aipr/v1` levels; it does not apply to the shared root anchor.
- On POSIX,
  `listenPrivate(paths.endpointDirectories, paths.endpoint, { lock, endpointRootHandle })`
  receives both ordered directories, the retained endpoint-root handle, and the
  live lock handle returned by `acquireExclusive`; an endpoint-root or lock pathname
  is not sufficient. Starting from that retained endpoint-root handle, it creates
  and opens the first endpoint directory relative to the handle and every
  subsequent directory relative to the retained handle for its parent, always
  with no-follow semantics. Each absent level is created owner-only (`0700`),
  and every level's owner, mode, directory type, and no-symlink post-conditions
  are validated before continuing. If concurrent brokers for different
  projects lose `mkdir` with `EEXIST` at either level, that race is successful
  only after the observed level passes those complete post-conditions. It
  delegates the synchronous socket creation and absolute-path bind to the native
  layer under process umask `0177`, restores the prior process-global umask in a
  `finally` path before returning the bound descriptor to Node, and performs the
  post-bind observation defined below before publishing `ready`. The brief
  process-global umask window can make unrelated concurrent creations more
  restrictive. Restoration is unconditional; the post-condition, not the umask,
  is the security authority. Any platform that cannot enforce the sequence fails closed. It retains the
  directory and endpoint identity handles through the owned lifetime.
- On Windows,
  `listenPrivate(paths.endpointDirectories, paths.endpoint, { lock })` treats
  the live lock handle as ownership authority, consumes the path layer's frozen
  empty directory array, creates no endpoint directory, and applies the existing
  owner-only named-pipe DACL and client-token checks.
- Owner verification detects replacement or unlink of the cache-root anchor,
  any authority-directory level, either endpoint-directory level, the lock
  evidence, or endpoint. Replacement or unlink of a shared authority parent or
  endpoint parent fences every broker that observes it; each preserves its own
  retained evidence and refuses further delivery. A per-project broker never
  removes a shared authority or endpoint directory, including when it appears
  empty.
- Only the verified holder of the full-digest `broker.lock` may unlink the
  endpoint whose token derives from that same digest. After acquiring that lock
  and reconciling project/provider authority, the holder probes a present socket;
  only a transport-level refusal that proves no listener accepted the connection
  (`ECONNREFUSED` or a platform-equivalent present-entry/no-listener result), plus
  retained lock ownership, permits removal of that exact stale socket before
  bind. Once any peer accepts the transport, it is live for reclamation purposes:
  malformed protocol, tuple, version, instance, nonce, peer-credential, or
  handshake failures are fail-closed integrity results and never removal
  authority. `ENOENT` ends reconciliation with no removal because no entry exists;
  the owner may continue to bind while retaining the lock. Without the lock,
  stale-looking socket state is never removed.
- After acquiring that lock and reconciling project/provider authority, a new
  owner also reads any existing metadata from the same full-digest authority
  directory. If it records a different endpoint root, the owner validates that
  root and its full endpoint-directory chain, derives only its own digest token,
  and probes that exact prior socket. Only a transport-level no-listener result
  permits unlinking that exact socket while the lock remains held; any accepting
  peer is preserved. The owner never uses recursive, wildcard, age-based, or
  cross-digest cleanup and never removes the shared directories.
- If a metadata-recorded superseded endpoint root is absent, unreachable, or
  fails root/parent validation, the owner does not recreate, repair, or traverse
  it and does not abort a start at its valid current root. A known-layout root
  proven absent is reconciled as empty and removed from the predecessor list
  without an unlink because no endpoint can remain beneath the absent root. An
  unreachable or unsafe root is retained with its exact observed condition after
  any inherited predecessors in current-instance `starting` and `ready` metadata
  for diagnostics, then startup proceeds. This is safe because
  clients route only from explicit local configuration and compare against the
  new current metadata before endpoint traversal; no client is redirected to the
  unreconciled root.
- If prior metadata carries an unrecognized non-null
  `endpoint_layout_version`, the owner does not derive a token for that layout,
  traverse its endpoint root, or probe its endpoint. It preserves the prior
  endpoint root and layout version after any inherited predecessors in its own
  current-instance `starting` and `ready` metadata, then may proceed at its valid
  current root.
- Owner reconciliation carries every inherited predecessor forward in oldest-to-
  newest order, removes an entry only after its exact root/layout socket is
  positively reconciled, and deduplicates by the byte-exact root plus layout
  version. It then appends the immediately prior record only when that record
  remains unreconciled. The list is capped at 16 entries. If adding a seventeenth
  genuinely unreconciled entry would exceed the cap, startup fails with
  `APR_BROKER_PREDECESSOR_LIMIT` before prior metadata is overwritten. Its one
  recovery action is to make the named oldest predecessor root safely reachable
  with a package version that supports its recorded layout, then retry; the next
  owner performs exact reconciliation and removes that entry. No unreconciled
  evidence is silently dropped. A later migration implementation
  therefore retains every accepted predecessor needed to discover and drain an
  unknown layout within the explicit fail-closed bound.

`broker.json` remains discovery-only. When Task 4 writes metadata schema v1, it
records the full root tuple and digest plus `cache_root`, `cache_root_source`,
`endpoint_root`, `endpoint_root_source`, and the path layer's
`endpoint_layout_version`. It also records the owning lock `instance_id`, nonce
binding, publication state `starting` or `ready`, and two closed diagnostic
groups:

- `unreconciled_predecessors` is an ordered array of zero to 16 closed objects,
  each containing exact `endpoint_root`, prior `endpoint_layout_version`, and
  `observed_condition`. The ordered array persists unchanged from
  current-instance `starting` into `ready` metadata.
- `startup_collision` is `null` for ordinary `starting` and every `ready`
  record, or an object on an already-bound failure containing `code`, exact
  `endpoint`, local `cache_root`, local `lock_path`, and `endpoint_root`.

On POSIX, `endpoint_layout_version` is required and non-null; a missing or null
value is schema-invalid and produces the existing broker-integrity error before
the unknown-non-null compatibility precedence. Windows requires `null`. Metadata
does not duplicate the derived endpoint token; diagnostics derive that token
through the same canonical path function. The recorded endpoint root is
diagnostic and never overrides a client's environment-derived path. Every owner
and client process for a configured endpoint must set the same variable. Adding
the token or another field later would require an explicit metadata-schema
change. Neither metadata nor the layout-version field could ever replace live
authentication. The metadata schema version and the independent pathname-layout
version do not move in lockstep.

When a probe reaches an accepting peer, the authenticated handshake compares the
responder's reported authority `cacheRoot` with the requester's canonical
authority cache root before instance/nonce disagreement can be interpreted. A
different cache root produces `APR_BROKER_AUTHORITY_CACHE_MISMATCH`, preserves
the live socket, and names both cache roots, both full-digest lock paths, and the
shared endpoint root. Its sole action is to converge the cache-root input each
platform reads—`home` on macOS, `XDG_CACHE_HOME` or `home` on Linux, and
`%LOCALAPPDATA%` on Windows—for every participant and retry. A peer that accepts transport but cannot
authenticate sufficiently to report a trusted cache root produces the existing
broker-integrity error and is likewise never unlinked.

Immediately after acquiring and verifying the lock, the owner reads prior
metadata for reconciliation, validates and retains its current endpoint-root and
endpoint-directory chain, and only then atomically publishes current-instance
`starting` metadata before the new endpoint can become connectable. A current
root that never passes validation therefore never becomes a predecessor record.
After bind
and all endpoint post-conditions pass, it atomically publishes `ready` metadata
for the same lock instance before accepting clients. A client treats metadata as
current only when its instance ID and nonce binding match the observed live lock.
A mismatched instance/nonce is stale and produces the existing broker-integrity
error before root comparison. Matching `starting` metadata produces
`APR_BROKER_START_FAILED` with the one action to retry the named owner startup.
Only matching `ready` metadata can produce an endpoint-root mismatch or permit a
connection attempt.

A pre-existing foreign-owned, non-directory, permissive, or symlinked
`ai-peer-review`, `brokers`, or full-digest authority-directory level fails with
`APR_BROKER_AUTHORITY_PARENT_UNSAFE`. Recovery is non-destructive and identifies
the exact observed condition. Mid-lifetime replacement or loss of any authority
level fails with `APR_BROKER_AUTHORITY_PARENT_LOST`, fences every broker that
observes a shared-level loss (or the affected project at the digest leaf), and
never permits stale-socket reclamation from the compromised lock path.

A pre-existing foreign-owned, non-directory, permissive, or symlinked `aipr` or
`aipr/v1` path fails with `APR_BROKER_ENDPOINT_PARENT_UNSAFE`. Recovery reports
the exact offending path and observed condition, directs the user to inspect and
remove or repair that path outside ai-peer-review only after establishing its
ownership and purpose, and then retry. It never suggests a caller-selected
endpoint pathname, recursive deletion, ownership takeover, or automatic
replacement.
If the foreign-owned path belongs to another account's legitimate broker, the
only recovery is provisioning a distinct safe per-user endpoint root and setting
`AI_PEER_REVIEW_ENDPOINT_ROOT` consistently for that account; this supported
root relocation does not permit choosing the digest-derived endpoint pathname,
and the other account's directory is never removed or modified.

The owner binds a Unix socket with the absolute `paths.endpoint` pathname—the
same UTF-8 bytes measured by preflight. Darwin and Linux provide no `bindat`
operation. Therefore, the accepted plan's directory-relative no-follow rule
continues to govern regular directory, lock, and metadata operations, while the
socket bind's no-symlink and ownership assurance comes from the retained
identity handles and post-condition checks for every `endpointDirectories`
entry. The implementation must not use `chdir` or a relative bind to shorten the
kernel-visible pathname.

Immediately after the native `bind()` succeeds, the **post-bind observation**
uses directory-relative `fstatat(endpointParentFd, token,
AT_SYMLINK_NOFOLLOW)` through issue #43's native layer; it does not `open()` the
socket entry, which is not portable. It verifies that the owner is the calling
user, the type is a socket, the mode is exactly `0600`, and the entry has no
unsafe extended ACL. It also `fstat`s the retained parent handle and performs
no-follow absolute `lstat` observations of the absolute endpoint parent and
`paths.endpoint`. Success requires the absolute parent device/inode to equal the
retained parent and the absolute endpoint device/inode, owner, type, mode, and
ACL result to equal the directory-relative observation. Only that correlated
entry identity becomes the owned-lifetime cleanup baseline. No expected device
or inode is derived from the listening socket descriptor: POSIX does not define
those descriptor fields as the filesystem entry's identity. Failure of any
post-condition closes the listener and unlinks neither the entry reached through
the retained `aipr/v1` handle nor the entry at the absolute `paths.endpoint`
pathname.

The exact creation mode removes the need for a pathname `chmod`. In particular,
the design does not depend on Linux
`fchmodat(..., AT_SYMLINK_NOFOLLOW)`, which is unavailable on supported Linux
runtimes, or on an unsafe following `chmod` fallback. The retained-handle
directory creation, `fstatat`, ACL inspection, synchronous socket creation/bind,
and descriptor handoff all require issue #43's native layer because Node core
does not expose the required `*at` family or the complete bind primitive.

A `bind()` result of `EADDRINUSE` or a platform-equivalent already-bound error is
`APR_BROKER_ENDPOINT_COLLISION`. It never authorizes an unlink or a post-failure
reclamation probe. The losing owner atomically annotates its already-published
`starting` metadata by replacing `startup_collision: null` with the schema's
collision object; it then releases its own lock and fails closed, leaving the
winner's endpoint untouched. Recovery is to converge the cache-root input each
platform reads—`home` on macOS, `XDG_CACHE_HOME` or `home` on Linux, and
`%LOCALAPPDATA%` on Windows—plus `AI_PEER_REVIEW_ENDPOINT_ROOT` on POSIX only,
across every participant, confirm the extant broker has completed or exited,
and retry. The
loser's metadata becomes stale when its lock is released and remains diagnostic
evidence for the next owner-side reconciliation.

Before ownership-sensitive cleanup, a second retained-parent observation checks
owner, type, and mode again and compares device and inode/file identity with the
recorded baseline. Any mismatch fails closed and unlinks neither observed entry.
This record-then-compare contract detects replacement that changes the observed
filesystem identity without pretending that `bindat` exists or comparing
unrelated socket identities.

Before connecting, a POSIX client derives and preflights its endpoint from its
own environment, then opens and validates only the authority cache root. It
observes the stable project lock before opening the derived endpoint root or
touching any `endpointDirectories` entry. If no live lock exists, it immediately
returns `APR_BROKER_START_FAILED` with the owner-election action before endpoint-
root traversal; only `acquireBrokerOwnership` may then read stale metadata for
reconciliation. With a live lock, the client reads metadata and first establishes
its currency from the lock instance and nonce binding.
Stale metadata takes precedence and produces the broker-integrity error;
an unrecognized non-null layout version produces `APR_BROKER_INCOMPATIBLE`
regardless of `starting` or `ready`; and current-instance, supported-layout
`starting` metadata produces `APR_BROKER_START_FAILED`. Only current-instance,
supported-layout `ready` metadata reaches root comparison.
The client then compares its derived endpoint root with the recorded root,
regardless of whether its derived socket path is absent or contains stale state.
A byte-identical root passes even when `endpoint_root_source` differs; the source
enum is diagnostic and excluded from routing equality.
A difference produces
`APR_BROKER_ENDPOINT_ROOT_MISMATCH` and one action: set
`AI_PEER_REVIEW_ENDPOINT_ROOT` to the recorded, independently revalidated root
and retry. Comparing metadata for diagnosis does not make it routing authority;
the client touches neither endpoint root until configuration converges.

Only after that comparison passes does the client open and validate its derived
endpoint-root anchor and reach existing `endpointDirectories` entries relative
to retained parents. A client never creates `aipr`, `aipr/v1`, or any authority
directory. With a live lock and matching roots, an absent endpoint directory
produces the named-owner `APR_BROKER_START_FAILED` reconciliation action. Present
endpoint directories with an absent socket under a live lock and matching
current-instance `ready` metadata use that same outcome rather than exposing raw
`ENOENT`. The client leaves the filesystem unchanged in every case. If the
derived endpoint is overlong, it fails before all resource access with the
platform-specific `APR_BROKER_ENDPOINT_TOO_LONG` recovery.

Absent, unreadable, or stale metadata under a live lock fails with the existing
broker-integrity error and never probes another endpoint; stale metadata without
a live lock is handled only through the accepted ownership-reconciliation path.
None of these checks establishes trust; peer credentials, full-tuple comparison,
instance identity, and nonce proof remain mandatory.

## Compatibility and migration

No published `0.2.x` release contains the project-local broker. Issue #56 lands
before the first `0.3.x` broker release, so there is no supported live endpoint
to migrate. The implementation does not probe, alias, unlink, or adopt the
unreleased long Unix pathname.

The pathname layout version is `v1` from its first supported release. Future
layout changes require a new namespace version and an explicit discovery/drain
design. Broker compatibility at a live corrected endpoint continues to require
exact package, protocol, and Node-major matches as defined by the accepted epic
design.

A v1 client that observes current-instance, `starting` or `ready` metadata with
an unrecognized `endpoint_layout_version` fails with existing
`APR_BROKER_INCOMPATIBLE` before root comparison or owner-election advice. Its
one action is to upgrade to an ai-peer-review version that supports the recorded
layout. It never probes an unknown-layout endpoint or attempts owner acquisition
against the live lock.

The full-digest lock directory intentionally remains unversioned and rooted only
at the resolved platform `cacheRoot`. Within one resolved cache root, it is the
mutual-exclusion point across every endpoint-root selection and layout version:
a second broker for the same canonical digest contends for that lock before
probing, draining, migrating, or binding any endpoint. The accepted platform
contract already requires all processes for a project to resolve the same
`XDG_CACHE_HOME`, `%LOCALAPPDATA%`, and home; divergent authority-cache
configuration remains a deployment error, but separating `endpointRoot` from
`cacheRoot` can now make two such lock domains converge on one socket pathname.
The lock therefore guarantees exclusivity only within its resolved cache root;
it does not authorize unlinking an accepting peer at a shared endpoint. Live
handshake comparison of `cacheRoot` diagnoses this cross-domain collision as
`APR_BROKER_AUTHORITY_CACHE_MISMATCH`, and the transport-failure-only cleanup
rule prevents either domain from unlinking the other's live socket. A future
design must not move or version the lock directory and thereby allow two
endpoint roots or layout versions within one resolved cache root to own one
project concurrently.

The short `aipr` cache name carries a residual local name-collision risk. An
unsafe foreign-owned, permissive, non-directory, or symlinked path is refused
and requires manual inspection. A plain owner-only directory created by another
same-user application passes the shared trust checks; the broker may create only
its own `v1` child and never removes or mutates the other application's entries.
For this package-owned level, owner-only means exact `0700`; a same-user `aipr`
directory at `0755` is permissive and fails closed even though it is not writable
by group or other.
The byte budget does not permit a longer package name at the exact supported
macOS boundary.

Because the default shared endpoint parent lives in a platform cache, OS or
third-party cache eviction is a realistic trigger for
`APR_BROKER_ENDPOINT_PARENT_LOST`. The deliberate consequence is the specified
whole-user broker fence; the package never responds to eviction by silently
recreating the shared parent. The frequency is not measurable before the first
supported broker release; operator recovery distinguishes simple absence from
unsafe replacement as specified under Failure behavior, and field incidence
should inform whether a future non-cache endpoint-root default is warranted.

The epic design's guarantee that an incompatible broker remains discoverable at
the same endpoint applies to package upgrades within pathname layout `v1`.
Shipping `v2` requires the explicit cross-endpoint discovery and drain design
described here; no future layout may assume the `v1` sentence is unconditional.

## Data flow

1. Canonical project identity computes the existing 64-hex root digest.
2. `brokerPaths` derives the full-digest metadata/lock directory.
3. On Unix, it losslessly base32-encodes the digest bytes and derives both
   compact shared directory levels plus the versioned absolute endpoint; on
   Windows it returns no endpoint directories and derives the existing named
   pipe.
4. Endpoint length preflight runs before any resource is opened.
5. Task 4 validates the cache-root anchor and authority-directory chain,
   acquires the full-digest lock, reconciles prior metadata, validates the
   endpoint-root anchor and endpoint-directory chain, then atomically publishes
   current-instance `starting` metadata.
6. With that live lock and retained endpoint chain, it binds and validates the
   compact endpoint, atomically publishes current-instance `ready` metadata,
   then accepts and authenticates the full tuple over live IPC.

## Failure behavior

- Invalid or noncanonical digest, or a missing/empty/relative/noncanonical root
  input: `APR_BROKER_PATH_INVALID`. Trailing separators plus `.` and `..`
  components are noncanonical for `home`, `XDG_CACHE_HOME`, `LOCALAPPDATA`, and
  `AI_PEER_REVIEW_ENDPOINT_ROOT`; relative input is invalid for all four, and
  the required inputs may not be missing or empty. Error context names the exact
  offending input, distinguishing all three environment variables from `home`
  and `identity.digest`.
- Missing, noninteger, or nonpositive platform limit, or a POSIX limit below 63
  bytes that cannot contain the 61-byte suffix plus a valid two-byte root:
  `APR_BROKER_ENDPOINT_LIMIT_INVALID`, before path derivation.
- UTF-8 pathname or named-pipe label over the observed limit:
  `APR_BROKER_ENDPOINT_TOO_LONG`. Its offline recovery is selected by platform:
  macOS/Linux configure a shorter validated `AI_PEER_REVIEW_ENDPOINT_ROOT` for
  every participant; Windows reports an invalid platform limit or unsupported
  runtime because its fixed 108-unit label fits the supported 256-unit limit.
  Darwin includes the 42-byte endpoint-root maximum, Linux the 46-byte maximum;
  if no safe conforming root exists, the error names the unsupported account
  condition and the administrator-provisioning action above. Error details
  carry the path layer's derived `maxEndpointRootBytes` on POSIX, never a
  duplicated literal; Windows returns that field as `null` and reports the
  unsupported-runtime condition.
- Whenever the stable project lock is live and readable matching-instance,
  supported-layout, `ready` metadata names a different endpoint root,
  before any endpoint-root traversal or connection
  attempt: `APR_BROKER_ENDPOINT_ROOT_MISMATCH`; set the same
  endpoint-root variable for every participant and retry, never auto-redirect.
  The rule is presence-independent: it applies when the client's derived socket
  is absent, stale, or apparently live. Metadata is diagnostic evidence only,
  never routing authority.
- Current-instance `starting` or `ready` metadata names an unrecognized endpoint layout:
  existing `APR_BROKER_INCOMPATIBLE`; upgrade to a package version supporting
  that layout. This takes precedence over root mismatch and
  `APR_BROKER_START_FAILED` owner-election advice.
- A safe endpoint directory is absent with no root mismatch:
  `APR_BROKER_START_FAILED`; enter owner acquisition when no live lock exists,
  or retry the named owner reconciliation when it does. A client never creates
  the missing directory. This existing error has situation-selected recovery:
  enter `acquireBrokerOwnership` when no live lock exists; retry the named owner
  reconciliation when a live lock accompanies an absent directory or socket;
  retry the named owner startup when current-instance `starting` metadata is
  observed.
- Missing, foreign-owned, non-directory, symlinked, or otherwise unusable
  `<user-cache>` trust anchor: `APR_BROKER_CACHE_ROOT_UNAVAILABLE`; no package
  directory or endpoint is created, except that an absent Linux `home-default`
  `.cache` is created and verified under the retained home handle as specified.
- Missing, foreign-owned, non-directory, symlinked, or otherwise unusable
  independently configured endpoint trust anchor:
  `APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE`; no endpoint directory or socket is
  created, and recovery identifies the exact configured variable and path.
- Unsafe, foreign-owned, permissive, non-directory, or symlinked Unix authority
  parent: `APR_BROKER_AUTHORITY_PARENT_UNSAFE` with exact-path inspection and
  manual repair guidance; never automatic removal.
- Mid-lifetime replacement or loss of an authority directory:
  `APR_BROKER_AUTHORITY_PARENT_LOST`; shared-level loss fences every observing
  broker, digest-leaf loss fences that project, and neither case authorizes
  cleanup through the compromised lock path.
- Unsafe, foreign-owned, permissive, non-directory, or symlinked Unix endpoint
  parent: `APR_BROKER_ENDPOINT_PARENT_UNSAFE` with exact-path inspection and
  manual repair guidance; never automatic removal.
- Mid-lifetime replacement or loss of either shared endpoint directory:
  `APR_BROKER_ENDPOINT_PARENT_LOST`. The error states that one shared-path event
  may have fenced every project broker for the user. Each broker retains its own
  lock and metadata evidence and refuses delivery. The error distinguishes a
  safely absent parent, consistent with cache eviction, from an unsafe
  replacement. Absence recovery restores the exact owner-only directory chain
  and reconciles affected projects; unsafe replacement requires full inspection
  before restoring both shared directories and reconciling every affected
  project's lock, metadata, endpoint, review registry, and provider state. The
  package never recreates the directory, unlinks sockets, takes ownership, or
  redirects an endpoint automatically after mid-lifetime loss.
- An accepting peer for the same project and endpoint root reports a different
  canonical authority cache root: `APR_BROKER_AUTHORITY_CACHE_MISMATCH`; preserve
  the socket, name both cache roots, both full-digest lock paths, and the shared
  endpoint root, then converge `home` on macOS, `XDG_CACHE_HOME` or `home` on
  Linux, or `%LOCALAPPDATA%` on Windows across every participant. No handshake
  failure from an accepting peer authorizes unlink.
- `bind()` reports `EADDRINUSE` or a platform-equivalent already-bound result:
  `APR_BROKER_ENDPOINT_COLLISION`; preserve the endpoint, annotate the losing
  owner's `starting` metadata, release only its own lock, converge the same
  platform-specific cache-root inputs and, on POSIX only,
  `AI_PEER_REVIEW_ENDPOINT_ROOT`, confirm the extant broker has completed or
  exited, and retry. A post-failure probe never grants unlink authority.
- Appending another genuinely unreconciled predecessor would exceed the 16-entry
  metadata bound: `APR_BROKER_PREDECESSOR_LIMIT`; preserve prior metadata and
  make the named oldest predecessor root safely reachable with a package version
  supporting its recorded layout, then retry so exact reconciliation can remove
  it.
- Unsupported platform: `APR_BROKER_ENDPOINT_UNSUPPORTED`.
- Ownership, symlink, peer, tuple, instance, nonce, or version mismatch: the
  existing Task 4 integrity and authentication errors; never endpoint fallback.

## Verification

Unit tests must prove:

- exact base32 vectors, including leading zero bytes and a 32-byte all-`ff`
  digest;
- every valid digest emits 52 lowercase case-fold-safe characters and round
  trips to the same 32 bytes in the test oracle;
- an all-zero digest encodes to 52 `a` characters, an all-`ff` digest encodes to
  51 `7` characters followed by `q`, and every valid token ends in only `a` or
  `q` because its final symbol carries one data bit and four zero pad bits;
- realistic macOS cache roots fit 103 bytes;
- a 27-byte macOS home produces exactly 103 bytes and the neighboring 28-byte
  home is refused at 104 bytes;
- a configured 42-byte Darwin endpoint root produces exactly 103 bytes and a
  43-byte root is refused at 104; Linux likewise accepts 46 bytes at 107 and
  refuses 47 bytes at 108;
- the default `/Users/<short-name>` macOS route accepts a 20-byte short name and
  refuses a 21-byte short name, while the same long-home case succeeds with a
  sufficiently short, safe `AI_PEER_REVIEW_ENDPOINT_ROOT`;
- absolute Linux `XDG_CACHE_HOME` values pin exact acceptance at the injected
  107-byte Linux limit and refusal at 108 bytes, exercising the same off-by-one
  behavior without reusing Darwin's number;
- Unicode cache roots are measured in UTF-8 bytes;
- distinct root digests derive distinct Unix endpoints;
- package/protocol/Node version inputs do not affect routing;
- overlong paths and invalid limits still fail before resource creation;
- POSIX `platform.maxEndpointLength: 62` fails with
  `APR_BROKER_ENDPOINT_LIMIT_INVALID` before digest/root validation even when a
  root input is also invalid, while limit `63` with root `/a` yields
  `maxEndpointRootBytes: 2` and an exact-limit endpoint;
- `APR_BROKER_ENDPOINT_TOO_LONG` has the platform-selected exact recovery above
  and no longer claims endpoints are never redirected or recommends moving the
  authority cache; its details carry the derived `maxEndpointRootBytes`;
- POSIX `endpointDirectories` is exactly
  `[<endpoint-root>/aipr, <endpoint-root>/aipr/v1]` in that order, is deeply frozen,
  and each entry is a UTF-8 byte prefix of `endpoint`;
- POSIX returns `endpointLayoutVersion: 1` and
  `maxEndpointRootBytes: 42` for an injected Darwin limit or `46` for an
  injected Linux `platform.maxEndpointLength` limit;
- every input-table row, invalid-value outcome, source enum, and creation policy
  is asserted per platform; `cacheRoot` remains exact,
  `authorityDirectories` is the exact deeply frozen root-to-digest chain, and
  `directory`, `lock`, and `metadata` remain byte-for-byte at the stable full
  64-hex authority paths under every endpoint-root selection;
- each platform rejects trailing separators plus `.` or `..` components only for
  the root inputs it reads: macOS `home`; Linux `home` or `XDG_CACHE_HOME`;
  Windows `LOCALAPPDATA`; and POSIX `AI_PEER_REVIEW_ENDPOINT_ROOT`, while ignored
  variables retain the input-table behavior. Each error names the exact variable;
  a case-only difference between canonical client and metadata roots, and an
  NFC-versus-NFD difference, fail with
  `APR_BROKER_ENDPOINT_ROOT_MISMATCH` rather than connecting;
- Windows output is asserted key-for-key, including an empty deeply frozen
  `endpointDirectories` array, `endpointRoot: null`,
  `endpointRootSource: named-pipe`, `endpointLayoutVersion: null`,
  `maxEndpointRootBytes: null`, the exact deeply frozen
  `authorityDirectories` chain, and the unchanged directory and named pipe.

Issue #43's registry and ownership tests must additionally prove:

- the ten explicitly enumerated new stable errors each exist in the offline
  registry with one exact recovery action;
- the Windows offline `explain` text for
  `APR_BROKER_AUTHORITY_CACHE_MISMATCH` and `APR_BROKER_ENDPOINT_COLLISION`
  names `%LOCALAPPDATA%` and never instructs the operator to set
  `AI_PEER_REVIEW_ENDPOINT_ROOT`;
- an absent Linux `home-default` cache root is created `0700` relative to the
  retained safe home, while an absent configured root is refused;
- every authority-root and endpoint-root source is refused when group- or
  other-writable;
- on ACL-capable platforms, every root anchor and package-owned directory is
  refused when an extended or inherited ACL grants another identity traversal,
  write, add-file, delete-child, or ownership-changing authority, even when mode
  bits are owner-only;
- an owner-only configured endpoint root below a group/other-writable or
  symlinked ancestor is refused with `APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE`, exact
  endpoint role, and source variable; the authority-cache counterpart is also
  refused with `APR_BROKER_CACHE_ROOT_UNAVAILABLE`;
- foreign-owned, non-directory, permissive, and symlinked conditions are each
  exercised at both endpoint-directory levels and all three authority levels,
  producing the matching `*_PARENT_UNSAFE` error with exact path/condition and
  no removal, replacement, or ownership change; exact `0700` is accepted at all
  package-owned levels and same-user `0755` is refused as permissive, while a
  pre-existing root anchor with only group/other read or execute bits is accepted;
- mid-lifetime endpoint-parent replacement fences every observing user broker,
  retains each lock/metadata record, refuses delivery, and never recreates the
  directory, unlinks a socket, or redirects; authority shared-level loss has the
  same all-broker fence, digest-leaf loss fences only that project, and neither
  permits cleanup through compromised lock evidence;
- mid-lifetime safe absence of either endpoint parent produces
  `APR_BROKER_ENDPOINT_PARENT_LOST` with the absence-specific recovery, fences
  every observing user broker while each retains its own lock and metadata
  evidence, and never recreates the directory, unlinks a socket, or redirects;
- two brokers for one digest under different endpoint roots still contend for
  one stable full-digest lock, and the loser cannot bind or deliver;
- two owners for one digest under different cache roots but one configured
  endpoint root can each hold its own lock, but the second probe authenticates
  the first peer's different `cacheRoot`, reports
  `APR_BROKER_AUTHORITY_CACHE_MISMATCH` with both roots and lock paths, and never
  unlinks the accepting peer's socket;
- a live handshake that omits `cacheRoot` or adds any field outside the closed
  field set fails with the existing broker-integrity error, accepts no command,
  unlinks nothing, and never produces `APR_BROKER_AUTHORITY_CACHE_MISMATCH`;
- two such owners that both observe no socket before binding force the losing
  bind to return `APR_BROKER_ENDPOINT_COLLISION`; the loser annotates its
  `starting` metadata, releases only its own lock, performs no reclamation probe,
  and never unlinks the winner's socket;
- two project brokers can race to create each shared parent safely, a
  per-project release never removes it, and a leftover socket is unlinked only
  while the matching full-digest lock is held and the connection fails at the
  transport layer; a peer that accepts transport but fails protocol, tuple,
  instance, nonce, credential, or cache-root authentication is never unlinked,
  and `ENOENT` performs no unlink;
- the native bind saves and restores the process-global umask in every outcome,
  uses `0177` only around the synchronous bind, and returns an endpoint that the
  post-bind `fstatat(..., AT_SYMLINK_NOFOLLOW)` observation validates as the
  calling user's socket with exact `0600`, no unsafe ACL, and a recorded cleanup
  baseline without opening the entry or comparing it to the listener descriptor;
- an injected replacement of the absolute endpoint parent between retention and
  bind makes the retained-parent and absolute parent/endpoint device-inode
  observations diverge, prevents `ready`, and unlinks neither the retained-path
  entry nor the absolute-path entry;
- the pre-cleanup observation revalidates owner/type/mode and compares device
  and inode/file identity with that baseline, and an injected mismatch closes
  the listener without unlinking either observed entry;
- `openPrivateDirectory` rejects a cache-root pathname where the retained
  cache-root handle is required, and `listenPrivate` rejects endpoint-root and
  lock pathnames where retained live handles are required;
- Windows never applies `dirname` to its logical pipe label;
- metadata schema v1 records both roots, both source enums, and POSIX
  `endpoint_layout_version: 1` (Windows `null`) without duplicating the endpoint
  token; it accepts and round-trips zero-to-16
  `unreconciled_predecessors` and `startup_collision` as either `null` or its
  exact closed object shape,
  rejects missing/null POSIX layout versions, and rejects non-null Windows layout
  versions;
- after lock acquisition, stale prior metadata cannot trigger root mismatch;
  current endpoint-root and directory validation precedes `starting`,
  current-instance `starting` metadata is visible before bind and produces only
  startup-in-progress recovery, and `ready` metadata is published before clients
  are accepted;
- current-instance `starting` or `ready` metadata with an unknown non-null layout version produces
  `APR_BROKER_INCOMPATIBLE` and upgrade guidance before root comparison,
  endpoint traversal, or owner-election advice;
- prior metadata with an unknown non-null layout version causes owner-side
  reconciliation to derive no token and traverse no prior root, while preserving
  both the predecessor root and layout version as unreconciled evidence in the
  new `starting` and `ready` metadata;
- an A → B → C endpoint-root sequence drops a known-layout A proven absent
  without unlink, carries unsafe or unknown A before unresolved B without loss or
  duplication, removes other entries only after exact reconciliation, and makes
  a seventeenth genuinely unresolved predecessor fail with
  `APR_BROKER_PREDECESSOR_LIMIT` before overwriting prior metadata and with its
  exact oldest-entry recovery;
- a client whose derived endpoint contains a stale socket under a superseded
  root still fails with `APR_BROKER_ENDPOINT_ROOT_MISMATCH`, not a handshake or
  integrity error;
- a restarting owner holding the project lock reconciles and removes exactly a
  dead socket recorded under the superseded endpoint root while leaving both
  shared directories in place;
- a restarting owner encountering a known-layout absent superseded endpoint root
  removes its predecessor record without unlink; an unsafe or unknown-layout root
  remains recorded with exact condition and is untouched while startup proceeds
  at the valid current root;
- a client with a missing or different endpoint-root setting never follows
  metadata as routing authority: an overlong default fails with the exact
  overlength recovery, a valid absent default under a live lock fails with
  `APR_BROKER_ENDPOINT_ROOT_MISMATCH`, and matching configuration connects;
- with absent client-side `aipr` and `aipr/v1`, a live-lock root mismatch fails
  before traversal and leaves the filesystem unchanged; without a live lock,
  the client short-circuits to owner election/start failure before endpoint-root
  traversal and likewise creates nothing;
- present endpoint directories with an absent socket under a live lock and
  matching current-instance `ready` metadata produce the named-owner
  `APR_BROKER_START_FAILED` reconciliation recovery and never expose raw
  `ENOENT` or mutate the filesystem; and
- every `APR_BROKER_PATH_INVALID` input reports its exact input label, with
  `AI_PEER_REVIEW_ENDPOINT_ROOT`, `XDG_CACHE_HOME`, `LOCALAPPDATA`, `home`, and
  `identity.digest` distinguishable.

Those are Task 4 registry and ownership operations, so #56 defines and hands off
the tests rather than creating a dependency cycle by implementing #43's native
lock/listener layer.

On macOS, an integration test must call production `brokerPaths` with the real
home directory and a unique full digest. If the default endpoint fits, it creates
only the derived private endpoint parent, binds a real `node:net` Unix server at
that production endpoint, exchanges one message with a real client, and removes
only the exact unique socket. If the real default is overlong, the test first
asserts the exact `APR_BROKER_ENDPOINT_TOO_LONG` recovery and derived root
budget, then performs the same production-derived bind/connect round trip under
a separately provisioned, validated short `AI_PEER_REVIEW_ENDPOINT_ROOT`. This
is the supported production path input, not an unrelated socket substitution.
Shared package directories remain even if the test created them, matching
production ownership semantics.

When a shared endpoint parent is lost, attribution proceeds forward rather than
requiring a production base32 decoder: enumerate the full-digest authority
directories, validate each candidate, and re-derive its endpoint token through
the canonical path function. Unknown or unsafe candidates are reported but
never adopted or removed.

A clean broker release, authenticated stale-owner recovery, and an authorized
live-project endpoint-root change remove the exact owned or superseded socket. A
socket whose project is permanently deleted or moved may remain orphaned because
no future broker can safely acquire and reconcile its former project authority.
This small per-user accumulation is accepted for v1; operator-initiated orphan
cleanup is outside #56 and never inferred from age or an unknown token alone.

## Acceptance

This correction is accepted only after independent peer review of this design
and its implementation plan, focused tests, a real macOS production-derived
bind/connect round trip, the complete fast and slow suites, lint, format, and an
independent implementation review. Issue #43 remains blocked until those gates
pass and the correction is landed on `feature/epic/39` without modifying its
preserved WIP files.
