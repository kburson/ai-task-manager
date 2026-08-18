<!-- @story #1292 -->

# Co-Review Fixture Cost Reduction Design

## Status and authority

This design reduces the load sensitivity of the co-review test corpus without
changing co-review protocol behavior, production Git semantics, or the
governed unit runner's 600-second section ceiling. It was selected under the
user's Full-Auto instruction after the issue's measured idle and loaded
baselines were reviewed.

## Problem statement

The co-review unit entrypoint currently registers 61 cases from one test file
and four imported case modules. Most cases create a fresh Git repository, and
protocol calls repeatedly execute Git for root discovery, ignore/tracked-state
checks, branch and commit identity, reachability, index/HEAD comparison, and
published artifact bytes. Fifteen paths also spawn the external Node CLI.

The focused corpus passes in 23.36 seconds on an idle host. In #1276's loaded
governed unit run, the same integration-heavy shape expanded until the
exclusive-serial section exceeded its unchanged 600-second ceiling. The defect
is not a loop or network dependency; it is unit-level behavior paying repeated
process and repository-boundary cost that becomes nonlinear under contention.

## Alternatives considered

### Reuse or clone a seeded real repository

Create one canonical repository and clone or copy it for every test. This
removes repeated configuration and initial commits, but every protocol action
still spawns Git. It improves the idle baseline while retaining the source of
load sensitivity and makes copy-on-write behavior another platform-dependent
test concern.

### Extract a fully pure protocol reducer

Split the 1,131-line protocol module into a pure state reducer and a separate
effect interpreter, then test the reducer directly. This is architecturally
clean, but it expands #1292 from fixture-cost repair into a broad production
rewrite. It also risks moving validation across atomicity boundaries that the
existing protocol already enforces correctly.

### Inject a narrow repository boundary

Move the existing Git queries behind one small adapter. Production uses a
default real-Git implementation. Pure tests inject an in-process repository
model, while a small real-boundary suite continues to exercise security,
provenance, publication, concurrency, and CLI routing.

This is the selected approach. It attacks the measured process cost, preserves
the current protocol transaction structure, and creates an explicit seam that
can be parity-tested against real Git.

## Architecture

### Repository boundary

`scripts/review/lib/repository-boundary.mjs` owns the real implementation. Its
surface is intentionally behavior-oriented rather than a generic Git wrapper:

- resolve the physical repository root;
- determine whether a runtime path is ignored and untracked;
- read tracked worktree, index, and HEAD artifact identities;
- resolve and validate an exact reachable commit;
- read committed artifact bytes and blob identity;
- report current branch and HEAD identity.

Methods return normalized values or throw the same `ProtocolError` categories
the current inline helpers expose. Raw Git argv remains private to the real
adapter. The protocol receives the boundary through an optional dependency
object and defaults to a singleton real implementation.

`archive.mjs` consumes the same boundary for root and ignore checks so archive
destination behavior does not retain a hidden second Git path.

### Deterministic test repository

`scripts/tests/fixtures/co-review-memory-repository.mjs` models only the
repository facts the protocol consumes. It stores branch, HEAD, reachable
commits, tracked paths, worktree/index/commit bytes, ignore rules, and stable
blob identities. Fixture operations such as `commitArtifact` update both the
filesystem artifact and the model explicitly.

The model is not a Git emulator. Unsupported repository behavior is a test
failure, keeping the seam narrow and preventing accidental reliance on
semantics the model does not represent. A parity test runs representative states through both the
memory model and a real temporary repository.

### Test split

The fast unit entrypoint keeps protocol lifecycle, budget, handoff, supplement,
state-integrity, idempotency, and refusal behavior. Its helpers use the memory
repository and the existing direct `runCli` function, so they create isolated
runtime directories but launch neither Git nor an external Node process.

The slow boundary entrypoint retains the minimum cases needed to prove:

- physical repository and symlink containment;
- ignored/untracked runtime enforcement;
- worktree/index/HEAD drift detection;
- exact and reachable commit validation;
- committed artifact and publication integrity;
- surviving mutex and identical concurrent claim behavior;
- representative external CLI help, initialization, status, claim/wait, and
  terminal workflow routing.

Each boundary is tested at least once with the real implementation. Redundant
CLI permutations move to direct in-process routing tests.

## Data flow

Production commands call the protocol with no test dependencies. The protocol
selects the real repository boundary, performs the same filesystem and Git
validations as today, and writes state/events under the existing mutex.

Pure tests construct a temporary runtime directory and memory repository,
write artifact bytes through fixture helpers, and pass the model to protocol or
direct CLI calls. Protocol state and event files remain real filesystem bytes;
only repository observations are modeled. This preserves atomic write,
integrity, lock, and containment behavior in the fast corpus.

Boundary tests construct a real Git repository and omit the injected adapter,
proving the default production path and public CLI remain unchanged.

## Error handling

The real adapter preserves current `ProtocolError` codes and detail sources.
The memory adapter throws on unknown paths, commits, or operations so false
positives cannot silently pass. Protocol mutations continue to validate all
inputs and repository facts before acquiring or committing state changes;
refusal cases retain byte-for-byte state immutability assertions.

No production fallback converts a repository error into modeled behavior. The
memory adapter is available only through explicit dependency injection.

## Verification strategy

The fixture-cost test instruments both process seams and proves pure helpers
make zero real Git and external Node CLI calls. Adapter parity tests compare
root, ignored/tracked status, commit resolution, branch/HEAD, artifact bytes,
and drift failures.

The complete fast and boundary corpus must retain the current 61 behavioral
outcomes. The governed `npm run test:unit` lane remains the end-to-end timing
proof: all sections must pass below the unchanged 600-second ceiling. Timing is
not asserted with a brittle per-test wall-clock threshold; architecture is
asserted by process-call counts, and the existing governed runner owns the
real load-sensitive ceiling.

Repository-wide lint, format, fast, and slow lanes remain required. No security
or provenance assertion may be removed merely to improve timing.

## Scope boundaries

This story does not relax test ceilings, change co-review protocol schemas,
alter production CLI output, add network behavior, introduce a general Git
client abstraction, or redesign the state machine. Further production
decomposition can be considered separately after this measured fixture repair.
