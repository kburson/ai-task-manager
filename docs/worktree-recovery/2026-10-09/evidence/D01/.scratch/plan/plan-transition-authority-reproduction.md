1. Put a well-formed Full-Auto issue in Plan with completed planning evidence but no `aitm-plan-approved` marker.
2. Record an active workflow exception whose requirement set includes `approval.plan`.
3. Promote the issue from Plan to Develop. Observe that the transition succeeds under the waiver.
4. Inspect the issue body and transition audit. In the #61 incident, no durable `aitm-plan-approved` marker or equivalent transition-bound authority record was written.
5. Revoke the workflow exception without changing the already-completed transition.
6. Run a later gate that evaluates Plan approval. It sees neither a current waiver nor an approval marker and treats the Plan provenance as missing, even though the historical transition was governed when it occurred.

Concrete incident evidence: `kburson/ai-peer-review#61`; recovery-only predecessor: `kburson/ai-task-manager#1716`.
