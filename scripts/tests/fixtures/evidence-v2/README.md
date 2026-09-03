# Evidence v2 rehearsal fixtures

Story #1496, epic #1495. Helpers generate synthetic repositories and issue IDs at or above 1000000. The executable repository namespace is `aitm-rehearsal/<run-id>`; all observations and reports are ineligible as production evidence.

Legacy terminal records use the existing `aitm.delivered-close/v1` codec. References to #1490, #1488 and #1485 describe historical failure shapes only. Their original records, bindings, Git objects and worktrees are not copied or changed by these fixtures. The later rehearsal child owns authorized consistent capture and import.

Each sandbox initializes its own source repository, object store, local bare remote, empty hooks directory, synthetic home and persistent provider file. Every command uses a fresh process with filesystem permissions and a test-only transport bootstrap. Ordinary runtime preflight and dispatcher logic execute. Unknown provider operations and unapproved subprocesses refuse; they never return a fabricated success. V1 remains the production default, and this harness cannot enroll a production issue.

The process bootstrap currently supports the public status path, refusal paths, direct production body-writer transport, and explicit provider operations. Delivery and close consumers extend the same boundary in their owning children. These foundation tests do not claim that a complete v2 delivery or close already works.

Explicit `sourceSnapshots` import full pinned commit objects with pack/unpack into independent storage. Tests use disposable control repositories, verify byte-for-byte source protection, and prove imported objects survive source disposal. The sandbox ownership manifest guards deletion. Provider reads, writes, stale observations and fault consumption persist across cold processes; retries retain operation identities. Merely setting the context environment variable does not install recorded transport and the dispatcher refuses that unguarded invocation.
