# GraphQL usage collection

Usage collection is opt-in metadata recording for one consuming Git repository.
Set `AITM_GRAPHQL_USAGE=1` when running `aitm` or `ai-task-manager`; no active issue
or action-capture enrollment is required. Set it to `0` to disable collection.
The setting never enables action payload storage.

For direct Node scripts and shell entry points, launch from the consuming project:

```sh
node node_modules/@kburson/ai-task-manager/scripts/task-tracker/graphql-usage-launch.mjs \
  node node_modules/@kburson/ai-task-manager/scripts/gh/verify-priority-p3.mjs

node node_modules/@kburson/ai-task-manager/scripts/task-tracker/graphql-usage-launch.mjs \
  bash node_modules/@kburson/ai-task-manager/scripts/gh/init-project-config.sh
```

The launcher defaults usage on, honors an explicit `0`, and propagates the same
existing `gh` shim into its process tree. `bin/aitm.mjs` and `bin/cli.mjs` enroll
before dispatch, including the legacy initialization shell route. The shell's
GraphQL calls and page loop, synchronous verifier, shared `github-projects.gql`,
and report HTTP adapter have offline integration coverage.

The bootstrap hashes an explicit provider session ID when available. Otherwise it
allocates a measurement session for the process tree. Nested launches preserve
that identity and originating route. An invalid inherited context yields unknown
session attribution. Enrollment and participant records use the Task 2 common
Git directory sink. No payloads, tokens, query text, or variable values are saved
in usage records. Independently enabled action capture retains its own policy.

An operator may supply `AITM_GRAPHQL_USAGE_PERMISSION_CONTEXT` as a non-secret
identity for the actual permission context. Change it when starting a different
sandbox or permission context. With no identity, each boundary probes again;
collection never assumes that an inherited successful probe grants permission.
Successful matching enrollment is reusable for at most 60 minutes. Each append
still handles storage failure. Nothing falls back to another storage root.

The shim owns one opaque invocation record, flushes before normal exit, and
preserves stdout, stderr, exits, and signals. It never adds `--include`. Its budget
headers are explicitly transport-unavailable. REST and authentication calls are
excluded. Internal `gh` retries and pagination remain unknown. Known query
builders add a collision-free `rateLimit { cost }` alias and strip only that alias;
mutations and unsupported documents execute unchanged. A returned CLI cost covers
only its visible response. The HTTP adapter records each transport attempt and
available rate-limit headers; caller-supplied logical IDs and page indices group
visible retry/page attempts without creating additional calls.

Issue identity comes from explicit request arguments or variables. Multi-issue
requests stay undivided. No unrelated active issue is inferred. Lifecycle state
is unknown unless the dispatching adapter supplies trustworthy local context.
Recording and context capture perform no GitHub lookup.

Direct execution without the launcher or inherited environment, absolute-path
`gh` executables, replaced PATHs, and unrelated clients are uncovered. Source
inventory rows marked planned require the documented launch context; they do not
prove a particular historical session was enrolled. Opaque traffic never proves
an HTTP request total. Abrupt termination can lose in-flight observations; failed
or absent storage is unknown coverage, never zero traffic. Reporting, cleanup,
and a decision-grade live baseline belong to the later spike tasks.
