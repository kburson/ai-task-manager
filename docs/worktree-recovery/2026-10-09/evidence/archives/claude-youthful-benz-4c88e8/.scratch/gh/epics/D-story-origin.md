**Kind:** epic

**Provenance:** Follow-on epic from spike #680. Design recorded in `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`, section "Epic D — Gate & Action Plugin API", together with the threat-model section and decisions D2 and D14 through D18.

**Relationships:**

- Origin spike: #680
- Depends on: the pipeline-as-config epic, for the gate resolution registry and edge-bound guard binding
- Couples to: the ask-the-script epic, whose Guard `remediation` field must be shaped against this epic's verdict schema rather than retrofitted to it
- Interacts with #659: external gates live outside the installed guard tree, so the consumer-edit interlock is unaffected. The interlock and this extension seam are complementary, not in tension.

**Design history worth preserving:** the design initially took the opposite position — that configuration should compose only code-resident gates, with an unknown gate id as a compile error — on the grounds that a project-root, pull-request-editable file must not become a behavior-injection channel. That was reversed once the distinction became clear: the injection risk is configuration *prose* reaching the model, and a gate script is executed rather than interpreted. What the closed vocabulary was actually buying is preserved by additive-only attachment plus structured remediation, which are narrower controls and do not cost extensibility.

**Size guess:** L
