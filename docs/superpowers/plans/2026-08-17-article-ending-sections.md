# Article 11-14 Ending Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Articles 11 through 14 end with a complete series roadmap, a tailored LinkedIn article shape, and a grounded bibliography.

**Architecture:** This is one documentation-only deliverable across four existing Markdown files. Reuse one 14-row roadmap, vary only the `Current` row, and provide article-specific companion-post copy and citations. Use the existing article publisher as the RED/GREEN structural test because it already refuses missing or malformed roadmaps and LinkedIn shapes.

**Tech Stack:** Markdown, Node.js article publisher, article-citation lint, Prettier

## Global Constraints

- Update only Articles 11 through 14; leave Article 1 unchanged.
- Preserve every existing article body, argument, image, diagram, and link.
- End each target article with `Series Roadmap`, `LinkedIn Article Shape`, and `Bibliography`, in that order.
- Use all 14 published article entries and mark exactly one matching row `Current` in each roadmap.
- Keep Article 12's existing bibliography content; relocate it after the new sections without duplicating it.
- The four target files contain pre-existing uncommitted prose edits. Do not stage or commit those edits as if they were produced by this task.

---

### Task 1: Complete the four article endings

**Files:**

- Modify: `docs/articles/11-the-agentic-concurrency-deficiency.md`
- Modify: `docs/articles/12-the-xp-survival-anomaly.md`
- Modify: `docs/articles/13-the-diff-displacement.md`
- Modify: `docs/articles/14-the-second-reviewer-corollary.md`

**Interfaces:**

- Consumes: `scripts/articles/publish-articles.mjs` structural rules for `Series Roadmap` and `LinkedIn Article Shape`
- Produces: four publishable Markdown articles with structurally identical closing sections

- [ ] **Step 1: Capture the pre-existing target-file state**

Run:

```bash
git status --short -- docs/articles/11-the-agentic-concurrency-deficiency.md docs/articles/12-the-xp-survival-anomaly.md docs/articles/13-the-diff-displacement.md docs/articles/14-the-second-reviewer-corollary.md
```

Expected: all four files are already modified. Treat those changes as user-owned baseline work and preserve them.

- [ ] **Step 2: Run the publisher to establish RED**

Run each command independently:

```bash
npm run publish:articles -- --article 11 --skip-diagrams
npm run publish:articles -- --article 12 --skip-diagrams
npm run publish:articles -- --article 13 --skip-diagrams
npm run publish:articles -- --article 14 --skip-diagrams
```

Expected: each command exits nonzero with `article has no \`## LinkedIn Article Shape\` section`.

- [ ] **Step 3: Add the complete roadmap to each article**

Insert this table as the `## Series Roadmap` section. In each file, replace exactly one unbolded row with the matching `Current` row listed after the table.

```markdown
## Series Roadmap

| Status | #   | Article                                                                            | Role In Series                                                  |
| ------ | --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
|        | 01  | [The Refactoring Bloat Precursor](01-the-refactoring-bloat-precursor.md)           | Prequel: history of AI-assisted coding before agents            |
|        | 02  | [The Backlog Governance Postulate](02-the-backlog-governance-postulate.md)         | Industry thesis: Technical Product Operations                   |
|        | 03  | [The Vibe Coding Deficiency](03-the-vibe-coding-deficiency.md)                     | Failure mode: vibe slop and review debt                         |
|        | 04  | [The Spec-Driven Insufficiency](04-the-spec-driven-insufficiency.md)               | Why specifications need execution governance                    |
|        | 05  | [The Product Owner Escalation](05-the-product-owner-escalation.md)                 | Human operator: TPO/TPM as delivery architect                   |
|        | 06  | [The Backlog Control-Plane Conjecture](06-the-backlog-control-plane-conjecture.md) | Backlog as executable control surface                           |
|        | 07  | [The Just-In-Time Planning Paradox](07-the-just-in-time-planning-paradox.md)       | Progressive decomposition and deep dives                        |
|        | 08  | [The Context Durability Corollary](08-the-context-durability-corollary.md)         | JIT loading and post-compaction recovery                        |
|        | 09  | [The Evidence-Over-Trust Theorem](09-the-evidence-over-trust-theorem.md)           | Evidence gates and auditability                                 |
|        | 10  | [The Adapter Convergence](10-the-adapter-convergence.md)                           | Backlog and agent-platform adapters                             |
|        | 11  | [The Agentic Concurrency Deficiency](11-the-agentic-concurrency-deficiency.md)     | Parallelism limits: isolation, validation, and merge contention |
|        | 12  | [The XP Survival Anomaly](12-the-xp-survival-anomaly.md)                           | XP practices mechanized, moved, or left behind                  |
|        | 13  | [The Diff Displacement](13-the-diff-displacement.md)                               | Review judgment moves from code toward intent                   |
|        | 14  | [The Second Reviewer Corollary](14-the-second-reviewer-corollary.md)               | Cross-model perspective and the human tiebreak                  |
```

Use these exact `Current` rows:

```markdown
| **Current** | **11** | **[The Agentic Concurrency Deficiency](11-the-agentic-concurrency-deficiency.md)** | Parallelism limits: isolation, validation, and merge contention |
| **Current** | **12** | **[The XP Survival Anomaly](12-the-xp-survival-anomaly.md)** | XP practices mechanized, moved, or left behind |
| **Current** | **13** | **[The Diff Displacement](13-the-diff-displacement.md)** | Review judgment moves from code toward intent |
| **Current** | **14** | **[The Second Reviewer Corollary](14-the-second-reviewer-corollary.md)** | Cross-model perspective and the human tiebreak |
```

- [ ] **Step 4: Add Article 11's tailored shape and bibliography**

Append the following after Article 11's roadmap:

```markdown
## LinkedIn Article Shape

Opening hook:

> Fifty parallel coding agents do not give you fifty times the throughput. They give you fifty sources of contention.

Middle:

- Separate mechanical isolation from semantic independence.
- Trace the validation load created by parallel completion.
- Show why merge contention makes integration the real concurrency ceiling.

Close:

> Agentic concurrency is useful when the work is independent. The hard part is proving that independence before the agents start.

## Bibliography

- Amdahl, Gene M. "Validity of the Single Processor Approach to Achieving Large Scale Computing Capabilities." https://doi.org/10.1145/1465482.1465560
- Git. "git-worktree Documentation." https://git-scm.com/docs/git-worktree.html
- GitHub Docs. "Managing a Merge Queue." https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- Meta Engineering. "Predictive Test Selection to Ensure Reliable Code Changes." https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/
- Microsoft Research. "Data-Driven Test Selection at Scale." https://www.microsoft.com/en-us/research/publication/data-driven-test-selection-at-scale/
```

- [ ] **Step 5: Add Article 12's tailored shape and retain its bibliography**

Move Article 12's existing `## Bibliography` section so it follows the new roadmap and shape. Do not duplicate or rewrite its four entries. Insert this shape between the roadmap and bibliography:

```markdown
## LinkedIn Article Shape

Opening hook:

> XP's practices survived agentic delivery. The reasons we still perform them did not.

Middle:

- Separate the original purpose of six XP practices from their surviving ritual.
- Sort the practices into mechanized, moved, and broken outcomes.
- Name collective ownership and knowledge transfer as the unresolved gap.

Close:

> The review bottleneck moved, and most of XP's scaffolding moved with it. The piece that did not is the one worth watching.
```

- [ ] **Step 6: Add Article 13's tailored shape and bibliography**

Append the following after Article 13's roadmap:

```markdown
## LinkedIn Article Shape

Opening hook:

> When an agent writes the implementation, the diff is no longer the artifact that tells you whether your intent survived.

Middle:

- Trace code review's climb from mechanical checks to contextual judgment.
- Explain why spec-driven delivery moves the human-authored artifact upstream.
- Show the risk of treating one plausible review as sufficient ground truth.

Close:

> If the specification is where your judgment lives, that is where the strongest review has to begin.

## Bibliography

- Sadowski, Caitlin, et al. "Modern Code Review: A Case Study at Google." https://research.google/pubs/modern-code-review-a-case-study-at-google/
- Vijayvergiya, Manushree, et al. "AI-Assisted Assessment of Coding Practices in Industrial Code Review." https://research.google/pubs/ai-assisted-assessment-of-coding-practices-in-industrial-code-review/
- GitHub Docs. "About GitHub Copilot Code Review." https://docs.github.com/en/copilot/concepts/agents/code-review
- Kiro Docs. "Specs." https://kiro.dev/docs/specs/
```

- [ ] **Step 7: Add Article 14's tailored shape and bibliography**

Append the following after Article 14's roadmap:

```markdown
## LinkedIn Article Shape

Opening hook:

> A second opinion only becomes a second perspective when it can fail differently from the first.

Middle:

- Contrast repeated sampling from one model with differently trained reviewers.
- Explain the fixed author-reviewer loop and its durable evidence trail.
- Name convergence theater and the human tiebreak as the remaining control.

Close:

> Agreement is useful evidence only when the reviewers reached it independently and a human can still challenge the result.

## Bibliography

- Wang, Xuezhi, et al. "Self-Consistency Improves Chain of Thought Reasoning in Language Models." https://arxiv.org/abs/2203.11171
- Wang, Junlin, et al. "Mixture-of-Agents Enhances Large Language Model Capabilities." https://arxiv.org/abs/2406.04692
- Anthropic. "How We Built Our Multi-Agent Research System." https://www.anthropic.com/engineering/multi-agent-research-system
- AI Task Manager. "Co-Review Finalization and Turn-Budget Control Design." https://github.com/kburson/ai-task-manager/blob/trunk/docs/superpowers/specs/2026-08-15-co-review-finalization-and-turn-budget-control-design.md
```

- [ ] **Step 8: Verify heading order, roadmap coverage, and the matching Current row**

Run the exact verifier below:

```javascript
import { readFile } from 'node:fs/promises';

const names = {
  11: '11-the-agentic-concurrency-deficiency.md',
  12: '12-the-xp-survival-anomaly.md',
  13: '13-the-diff-displacement.md',
  14: '14-the-second-reviewer-corollary.md',
};
for (const [number, name] of Object.entries(names)) {
  const source = await readFile(`docs/articles/${name}`, 'utf8');
  const headings = [...source.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const expected = ['Series Roadmap', 'LinkedIn Article Shape', 'Bibliography'];
  if (JSON.stringify(headings.slice(-3)) !== JSON.stringify(expected)) {
    throw new Error(`${number}: wrong final headings: ${headings.slice(-3).join(', ')}`);
  }
  const roadmap = source.slice(
    source.indexOf('## Series Roadmap'),
    source.indexOf('## LinkedIn Article Shape')
  );
  const rows = roadmap
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2);
  if (rows.length !== 14)
    throw new Error(`${number}: expected 14 roadmap rows, found ${rows.length}`);
  const current = rows.filter((line) => line.includes('**Current**'));
  if (current.length !== 1 || !current[0].includes(`**${number}**`)) {
    throw new Error(`${number}: Current row does not match article`);
  }
}
console.log('Articles 11-14: ending structure and roadmaps valid');
```

Save the verifier temporarily under `.tmp/plan/verify-article-endings.mjs`, run `node .tmp/plan/verify-article-endings.mjs`, and expect `Articles 11-14: ending structure and roadmaps valid`.

- [ ] **Step 9: Run the publisher to verify GREEN**

Run each command independently:

```bash
npm run publish:articles -- --article 11 --skip-diagrams
npm run publish:articles -- --article 12 --skip-diagrams
npm run publish:articles -- --article 13 --skip-diagrams
npm run publish:articles -- --article 14 --skip-diagrams
```

Expected: all four commands exit zero and create the corresponding publish folder under `.tmp/published/`.

- [ ] **Step 10: Run focused quality checks**

Run:

```bash
npm run lint:article-citations
npx prettier --check docs/articles/11-the-agentic-concurrency-deficiency.md docs/articles/12-the-xp-survival-anomaly.md docs/articles/13-the-diff-displacement.md docs/articles/14-the-second-reviewer-corollary.md
git diff --check -- docs/articles/11-the-agentic-concurrency-deficiency.md docs/articles/12-the-xp-survival-anomaly.md docs/articles/13-the-diff-displacement.md docs/articles/14-the-second-reviewer-corollary.md
```

Expected: citation lint reports all article bibliographies clean, Prettier reports all four files formatted, and `git diff --check` prints nothing.

- [ ] **Step 11: Review and hand off without claiming ownership of baseline edits**

Run:

```bash
git diff -- docs/articles/11-the-agentic-concurrency-deficiency.md docs/articles/12-the-xp-survival-anomaly.md docs/articles/13-the-diff-displacement.md docs/articles/14-the-second-reviewer-corollary.md
```

Expected: the diff includes the new ending sections plus pre-existing user-owned prose changes. Do not stage or commit the four files from this dirty baseline. Report verification results and leave the combined working-tree changes for the owner to review and commit deliberately.
