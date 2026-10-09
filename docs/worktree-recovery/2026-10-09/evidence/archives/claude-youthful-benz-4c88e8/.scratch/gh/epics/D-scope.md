Open the gate library. Today `installed-guard-path.mjs` (#659) forbids consumers from editing the installed guard tree, and there is no sanctioned seam for a team to add a gate of their own. A process engine whose checks cannot be extended is a process engine for exactly one process.

This epic defines the API standard for gates and actions: a process contract, a verdict schema, a discovery path outside the installed tree, and a conformance kit third-party authors can validate against. The gates ai-task-manager already ships become the reference implementations of that standard.

**The safety model, which is the load-bearing part**

Extension is **additive only**. Configuration may attach gates to an edge; it may never detach a core one. Without that property, declaring an empty edge would delete the gate system.

Three threats were identified in the design, and each has a named control:

- _Arbitrary code execution._ A gate is code, and running it is the same exposure as `package.json` scripts or eslint plugins. Control is repository governance — code-owner review on the gate paths, the config file, and the manifest and lockfile, backed by branch protection. The package ships an example and a posture check rather than owning the problem.
- _Checkout precedes merge._ Code-owner review gates merging, not checking out. Reviewing a pull request is exactly when a maintainer runs the pipeline against it, so a gate introduced by that branch would execute before anyone approved it. Control is resolving gates and config from the trunk ref rather than the working tree, reusing `lib/trunk-ref.mjs`.
- _The explanation string._ A gate's refusal reason reaches the agent as next-action guidance. Control is that a gate **selects** a remediation from a closed registry and never authors one; free-text messages render to the agent as quoted untrusted data; and third-party gates may never emit a remediation invoking an override or bypass flag.

Gate execution fails closed: a non-zero exit, a timeout, or unparseable output is a refusal. #751 is the precedent — the bash guard silently disabled itself when it failed open.

**In scope**

- The gate process contract and verdict schema, with bounded timeouts and fail-closed semantics.
- The remediation-id registry and its override/bypass allowlist.
- Untrusted-message rendering rules for gate output that reaches agent context.
- Discovery and additive attachment of gates and actions living outside the installed tree.
- Trunk-resolved gate loading, with a development escape hatch that is refused wherever nobody would see its warning.
- A conformance test kit, an example code-owners file and branch-protection guide, a governance posture check, and author documentation.

**Out of scope**

- Distributing gates as published packages. A local gate file appears in the pull-request diff; a transitive dependency of a published gate package does not. That deserves its own threat model before it ships.

Design: `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md` (Epic D section, decisions D2 and D14 through D18, and the threat model section).
