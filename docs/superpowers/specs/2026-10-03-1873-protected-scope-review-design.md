# Protected Scope review normalization design — #1873

Agent Review must preserve the location and raw bytes of the standalone `aitm-scope-evidence-policy` marker. Its position is protected by the reviewed Scope mutation coordinator. The current V6 normalizer gathers that marker under AITM Progress Markers, so the genuine Review result cannot be persisted. This blocks delivery of ai-peer-review #140 despite passing tests and validators.

The bounded correction keeps this marker in place after standalone marker classification and before hoist/gather. Fenced examples and inline evidence remain untouched through existing handling. State/version markers still hoist and ordinary progress markers still gather. Duplicate or malformed policy declarations remain available for the existing guard to reject.

The reviewed Scope guard, evidence stamper, provider identity, and lifecycle transitions remain unchanged. No review result is fabricated. The owning agent implements, inspects, and verifies directly under the user's explicit instruction against delegation.

Regressions must show normalization preserves policy and evidence positions and permits authentic Agent Review evidence after a genuine validator run. Controls retain ordinary organization, idempotence, fenced examples, raw policy whitespace, and guard refusal of policy relocation and pointer tampering.
