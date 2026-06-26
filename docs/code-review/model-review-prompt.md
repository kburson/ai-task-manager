# Independent Model Review Prompt

Use this prompt with another AI model to validate this code review and produce a backlog.

```text
You are performing an independent code-review validation for the AI Task Manager repository.

Repository root:
/Users/kpburson/projects/Vibe-Coding/ai-task-manager

Review package:
docs/code-review/

Your job:
1. Treat docs/code-review/findings.md as claims to verify, not as ground truth.
2. Use docs/code-review/evidence.md as the starting evidence log.
3. Inspect the repository directly before confirming any conclusion.
4. For each finding, classify it as Confirmed, Partially Confirmed, Rejected, or Needs More Evidence.
5. Identify missing evidence, overstatements, or conclusions that should be softened.
6. Convert confirmed or partially confirmed weaknesses into a prioritized backlog.

Scope to validate:
- Structure and organization.
- SOLID adherence in the JavaScript/Node architecture.
- Fragility, rigidity, immobility, viscosity, and needless complexity.
- AI skill structure and whether it helps agents understand and follow the package rules.
- Enforcement of non-adherence prevention, especially around issue creation and state movement.

Important workspace rules:
- Read and obey AGENTS.md before recommending or creating issues.
- Never call `gh issue create` directly.
- Never call `move-state.mjs <N> <state>` directly to jump arbitrary states.
- If creating issues, use the project-approved wrapper path described in AGENTS.md.

Recommended commands:
- `git status --short`
- `npm test`
- `npm pack --dry-run --json`
- `find .github/workflows -maxdepth 1 -type f -print | sort`
- `find scripts/task-tracker/tests scripts/providers/tests -type f -name '*.test.mjs' | wc -l`

Expected output:
1. A validation table with columns: finding, classification, evidence, correction.
2. A list of additional findings not captured in docs/code-review/findings.md.
3. A prioritized backlog with user stories and acceptance criteria.
4. A short risk summary covering what should be fixed first and why.
```
