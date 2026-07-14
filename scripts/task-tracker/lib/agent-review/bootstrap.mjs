// Agent Review Gate — validator bootstrap (#809).
//
// Importing this module registers every built-in validator (V1–V6) on the
// shared singleton registry as a side effect, mirroring `guard-bootstrap.mjs`.
// The `/task review` verb imports it once so the registry is populated before
// `runAgentReviewGate` runs.
//
// The framework child (#809) ships with ZERO validators registered — the gate
// is a vacuous pass until V1 lands. Each validator PR appends its own import
// line below; because every import self-registers on the shared singleton, the
// order of these lines is the registry run order.

import './registry.mjs';

// V1–V6 validator imports are appended here as they land; because every import
// self-registers on the shared singleton, the order of these lines is the
// registry run order.
import './validators/body-sections.mjs';
import './validators/required-comments.mjs';
import './validators/timing-log-sequence.mjs';
// import './validators/v4-new-tests-content.mjs';
// import './validators/v5-ac-dod-vc-attributes.mjs';
// import './validators/v6-marker-organization.mjs';
