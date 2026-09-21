---
model: 'gpt-6-astra'
effort: 'high'
filepath: 'docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md'
commit_sha: '0d2033b854e46db4bbab4424a2e798bc347f78a3'
reviewed_file_sha256: 'dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23'
turn_ordinal: 'SAR r1'
turn_description: 'Single Agent Review revision 1'
role: 'author/self-review'
input_worktree_status: 'clean'
reviewed_input_matches_commit: true
review_recorded_at: '2026-09-20T22:39:36.022682+00:00'
substantive_findings: 4
spec_changed: true
---

# SAR r1: substantive review and correction record

## Input and method

Reviewed the complete 1,224-line input at the commit and digest above, with a
clean worktree and byte-identical committed artifact. This is the same Astra
Author with retained XPR-to-SPR context. No reviewer was delegated and no
consensus protocol was invoked. The result is an Author assessment, not an
independent acceptance or human approval.

Read the current artifact from beginning to end. Checked ADR 0002's authority,
append-first, coordination, and required mitigation sections; ADR 0001's test
boundary; current package metadata; `github-comment-store.mjs`;
`worktree-binding-guard.mjs`; `cut-child-worktree.mjs`; and the narrowly cited
creation/status-mutation implementation. Searches were limited to that target
artifact and explicit implementation files. No memory, other worktree, trunk,
comparison-side evidence, or unrelated design/plan search was used.

## Coverage and reasoning

- Kernel and transports: traced discovery, typed/generic/extension routing,
  invocation identity, actor/policy checks, and parity. Found F1 and F2 below.
- Ports and configuration: checked that every declared capability has an owner
  in the stated supported compositions. Found F3 below.
- Plugin compatibility/trust and installation: checked static versus executable
  discovery, package/ABI ranges, public exports, lifecycle-script approval,
  tracked configuration, and clone restoration. Found F4 below.
- Authority and recovery: traced request read-back, dispatch intent, ambiguous
  effects, outcome/projection recovery, scoped grants, non-CAS exclusion, and
  retained invocation identity. Existing conservative recovery and no automatic
  non-CAS failover remain necessary; the false-negative error issue is F2.
- Help/learning: checked bounded discovery, pagination, reference resolution,
  canonical serialization, and generated memory's non-authoritative role.
- Host assurance: checked that ordinary hosts cannot infer strict from a token
  probe and that the named isolation boundary has certification gates.
- Migration and verification: checked retention of ADR mitigations, versioned
  compatibility, no bulk authority rewrite, phased gates, and AC 1-17. The new
  corrections need corresponding explicit verification coverage.

## Findings and dispositions

### SAR-R1-F1: promoted extensions can bypass withheld typed-tool permissions

**Finding.** The portable route rejects any action with a dedicated typed tool,
but the exclusive registry assignment is stated only for core actions. The
extension section allows promotion to a typed tool while listing generic
extension rejections only for core IDs and orchestrator-only IDs. A promoted
extension could therefore remain callable through `aitm_invoke_extension` when
its dedicated tool is withheld, violating the same permission boundary that the
core rule protects.

**Provenance qualification.** This is a carry-forward observation from this
side's earlier XPR optional suggestions, retained in Author context. SAR now
classifies and resolves its governance consequence. It is not claimed as a new,
independent discovery or proof of SAR superiority.

**Disposition.** Apply one assigned invocation route to every externally
callable core or extension action. Promotion changes the published route and
capability fingerprint; both generic routes refuse IDs assigned a typed tool,
including when that tool is unavailable to the caller. Add negative parity and
AC coverage. Preserve the shared domain contract across route changes.

### SAR-R1-F2: pre-binding errors can falsely deny a prior invocation's effects

**Finding.** The retry contract correctly requires a caller-retained key, but
its prose says a before-binding error reports that no provider effects occurred.
The global mutation diagram validates current capability/policy before locating
an existing invocation, and the stale-setup error example emits
`effects.committed: false` without proving absence of a prior same-key binding.
After an issue is created and its response is lost, a retry may hit new setup
drift or a read outage before recovering that binding. A refusal for the current
attempt is not proof the original invocation had no effects.

This is a concrete semantic conflict between the new lost-response contract and
the error shape. `create-issue.mjs` already distinguishes possible partial issue
creation from clean failure, and the spec's own dispatch-intent table requires
unknown outcomes to remain unknown. The error must not encourage a new key by
falsely declaring the first operation effect-free.

**Disposition.** Separate effects in this transport attempt from cumulative
invocation outcome. Authenticate first, then resolve an existing key/binding
before first-attempt action admission when safe read capability is available.
A diagnostic-only runtime may inspect receipts read-only, but cannot repair
projections or cause any new mutation. Unavailable or unauthorized lookup reports
unknown/not-disclosed prior effects, not false. Only verified absence plus no
dispatch can support invocation-wide `none` at an observed boundary. Document
lookup/admission serialization at the project's identity scope and add retry
with drift/outage tests. Update the diagram and error examples accordingly.

### SAR-R1-F3: the repository port has no selected implementation owner

**Finding.** The spec declares a repository port for local Git state, branches,
commits, and worktrees, but none of the provider table's candidates supplies it.
Every listed valid composition selects only remote work-items/forge/CI/identity
ports. The default GitHub adapter therefore cannot complete the port graph as
written, while the kernel and transports are forbidden from implementing the
underlying adapter behavior themselves.

`cut-child-worktree.mjs` demonstrates real local Git effects: the CLI currently
wires `git worktree add` into its helper. `worktree-binding-guard.mjs` resolves the
physical worktree and branch to refuse foreign-checkout execution. Those
responsibilities need an explicit destination when extracted, rather than being
mistaken for remote forge operations or left inside an MCP handler.

**Disposition.** Declare a bundled `local-git` repository adapter independently
of remote provider bindings, using the public port/conformance contract. Assign
local process/Git mechanics there while keeping policy in the kernel. Require
an explicit resolved execution context, worktree/branch/HEAD checks, and governed
local-effect receipts in the configured external authority. Carry the binding
into setup, Phase 1 extraction, parity, and conformance criteria.

### SAR-R1-F4: filesystem plugin experiments can violate clone portability

**Finding.** Discovery permits arbitrary filesystem paths and workspace packages,
then says selected plugins are restored by the package lock and that a committed
clone works after only npm ci. An absolute or outside-checkout plugin path, an
untracked workspace source, or an escaping symlink cannot be restored in a fresh
clone merely by committing its reference. Repository-relative generated commands
do not fix the dependency's absent source. The portability exception currently
names machine-global host registration only.

**Disposition.** Before declaring a portable installation, require every selected
plugin to be resolvable from locked registry artifacts or fully tracked in-repo
sources with bounded symlinks and restorable build inputs. Normalize local paths
into one of those forms, or report plugin-local-required and keep experiments
explicitly not portable with machine-local overrides. A fresh consumer must not
silently scan or substitute a missing plugin. Add negative clone cases and update
setup/AC coverage without removing local experimentation.

## Qualifications and non-findings

No defect quota was applied. Details such as the exact canonical JSON algorithm,
provider retention limits, capability schema field names, and host-specific
attestation formats remain bounded phase-specification work, with existing
schema/conformance gates. The staleness table already distinguishes normal live
work-item state from installation drift; this pass does not infer a defect merely
because lower-level fingerprint schemas are not yet written. No claim is made
that a trusted in-process plugin is sandboxed from the AITM process.

The prior optional prose-wrap observations are editorial only and are not counted
as substantive findings. Relevant touched paragraphs may be rewrapped without
changing their meaning.

## Revision and validation

The four findings are accepted for correction in this round. The spec and this
record will be committed before the next complete pass. Input provenance above
remains immutable; the actual result commit and resulting hash are recorded in
the subsequent experiment-log mapping rather than inserted self-referentially.

Validation results are appended below after the correction is checked. No runtime
implementation or architecture test is built or executed as part of this review.

### Recorded validation outcome

All four corrections are present. Exact-file Markdown lint and CSpell passed
after correcting two vocabulary flags by using plain alternatives; no dictionary or lint-rule exception was added.
Prettier formatting/checks passed. Seven embedded JSON examples parsed, local
Markdown links passed, repository doc-anchor lint passed (38 anchors across
three unchanged guides), and diff whitespace checks passed. The XPR and SPR
evidence roots were unchanged against the stage-start HEAD.

Spelling failed initially and again when the same flagged words were quoted in
the validation log. The quotations were replaced with this description; no
other validation failure was observed in this round. One long combined source read was truncated by the tool output budget;
the affected source sections were read in smaller targeted follow-ups. No
substantive evidence from another experiment or unrelated design was exposed.

The revised artifact SHA256 before commit is
`72b8730f8e4b41db6c3f7e888403428f363ef66555278a8b4176b9ec4dde0613`.
Observed validation record time: 2026-09-20T22:42:41.020571+00:00.
This is a wall-clock checkpoint, not measured review/compute time. The input
was clean; the artifact is now intentionally dirty from these documented edits
until the correction commit. A next-round pass will use committed bytes.
