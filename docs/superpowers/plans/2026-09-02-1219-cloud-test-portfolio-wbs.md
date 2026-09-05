# Cloud Test Automation Portfolio WBS

**Issue:** #1219

**Purpose:** Materialize the six nested delivery epics and 29 uniquely owned
stories that implement the governing cloud Test design plus its accepted
continuous-agent-delivery amendment. Detailed executable steps remain in the
pinned implementation plans owned by each nested epic.

**Governing specifications:**

- `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md`
- `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at `1375edfd4b29c98e407ae428a15f992dbdff2cd6`

**Accepted amendment plan:**
`docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
at `7187854e13e21b357b4272afe349fc4b74f92767`

## Migrated story order

The stable portfolio order preserves all 22 existing stories and inserts each
new prerequisite immediately before its first dependent:

`#1226–#1236`, `#1518`, `#1519`, `#1237–#1239`, `#1240`, `#1241`, `#1520`,
`#1242`, `#1243`, `#1521`, `#1522`, `#1523`, `#1524`, and `#1244–#1247`.

The six in-place replacements are #1237/A3, #1238/A4, #1239/A5, #1242/A7,
with #1243/A8 and #1247/A13 completing that set. Six of the seven new contracts
are #1518/A1, #1519/A2, #1520/A6, #1521/A9, #1522/A10, and #1523/A11. The last
new contract is #1524/A12.
Numeric board Rank
for a new story remains unset in Backlog and is assigned through its governed
Refine transaction using then-current human-approved values.

### Task 1: 🧑‍🧒‍🧒 [Epic] Cloud Test Calibration and Shard Bootstrap

Deliver nested epic #1220 and its ordered children #1226–#1228. Produce a fresh
exact-head baseline, deterministic shard execution, and a five-run canary
selection record before production topology is adopted.

**Verification Commands:**

```bash
npx aitm board 1220
```

### Task 2: 🧑‍🧒‍🧒 [Epic] Cloud Test Repository Execution

Deliver nested epic #1221 and its children #1229–#1231 and #1234–#1235. Own
Slow-impact authority, repository budgets, family policy, production fan-out,
and stable native policy gates.

**Verification Commands:**

```bash
npx aitm board 1221
```

### Task 3: 🧑‍🧒‍🧒 [Epic] Cloud Test Local Behavior

Deliver nested epic #1222 and its children #1232–#1233. Keep Develop feedback
bounded and enforce machine-wide local worker admission with explicit cloud
overflow.

**Verification Commands:**

```bash
npx aitm board 1222
```

### Task 4: 🧑‍🧒‍🧒 [Epic] Cloud Test Record Lifecycle

Deliver nested epic #1223 and its children #1236, #1518, #1519, together with
issues #1237–#1239. Retain original Task O11 at #1236; deliver amendment Tasks A1–A5
through #1518, #1519, and the rewritten #1237–#1239 contracts. Establish the
trusted execution root, literal enrollment authority, candidate lifecycle,
clean-context flow review, and governed finding disposition.

**Verification Commands:**

```bash
npx aitm board 1223
```

### Task 5: 🧑‍🧒‍🧒 [Epic] Cloud Test External Protection and Integration

Deliver nested epic #1224 and its children #1240, #1241, #1520, #1242, #1243,
together with #1521 and #1522. Retain original Tasks O15–O16 at #1240–#1241; deliver
amendment Tasks A6–A10 through #1520, rewritten #1242–#1243, and #1521–#1522.
Preserve target protection and freezes while adding independent human approval,
Test-owned delivery, hierarchical merge-back, collateral Review, and idempotent
epic close aggregation.

**Verification Commands:**

```bash
npx aitm board 1224
```

### Task 6: 🧑‍🧒‍🧒 [Epic] Cloud Test Measured Follow-On and Operations

Deliver nested epic #1225 and its children #1523, #1524, and #1244–#1247.
Retain original Tasks O19–O21 at #1244–#1246; deliver amendment Tasks A11–A13
through #1523, #1524, and rewritten #1247. Add closed-story crossover
assurance, stage-aware migration and trusted activation, then run the protected
pilot at #1244 before documentation and default rollout. Keep #1245–#1246 as
measurement-gated follow-on work; they do not block #1247.

**Verification Commands:**

```bash
npx aitm board 1225
```
