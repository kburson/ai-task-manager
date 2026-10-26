### Task 3: Run complete verification and prepare corrective delivery

**Files:**

- Verify only: complete AITM repository and package dry-run output.

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces: exact local verification, ancestry, and diff evidence for the
  corrective pull request decision.

- [ ] **Step 1: Reconfirm the exact worktree before full verification**

Run:

```bash
test "$(git rev-parse --show-toplevel)" = "$PWD"
test "$(git branch --show-current)" = "claude/articles-book-publication-6a7dfe"
node -e "if (require('node:fs').realpathSync('node_modules/ai-task-manager') !== process.cwd()) process.exit(1)"
git status --short
```

Expected: exact linked worktree, exact existing branch, correct self-link, and
no uncommitted changes.

- [ ] **Step 2: Run focused current-state verification**

```bash
node --test \
  scripts/tests/integration/meta/test-tree-layout.test.mjs \
  scripts/tests/integration/meta/package-test-corpus.test.mjs \
  scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs \
  scripts/tests/unit/task-tracker/core/residue-audit-scope.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
npm run lint:test-reach
```

Expected: PASS with no deleted module or fixture load.

- [ ] **Step 3: Run the complete fast and slow lanes**

```bash
npm run quality
npm run test:slow
```

Expected: both commands exit `0`; report exact test-file and assertion totals
from their fresh output rather than reusing earlier evidence.

- [ ] **Step 4: Audit the package contents**

```bash
npm pack --dry-run --json > .tmp/aitm-baseline-reset-pack.json
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const [packed] = JSON.parse(readFileSync('.tmp/aitm-baseline-reset-pack.json', 'utf8'));
const paths = packed.files.map(({ path }) => path);
const forbidden = paths.filter((path) =>
  path.startsWith('scripts/tests/') ||
  path.startsWith('scripts/articles/') ||
  path.startsWith('docs/articles/') ||
  path.includes('frozen-test-retire') ||
  path.includes('test-corpus-post-snapshot') ||
  path.includes('test-corpus-pre-move')
);
if (forbidden.length) {
  console.error(forbidden.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ files: paths.length, forbidden: forbidden.length }));
NODE
```

Expected: `forbidden` is `0` and the package contains the required runtime
assets already asserted by `package-test-corpus.test.mjs`.

- [ ] **Step 5: Show exact branch and delivery evidence, then stop**

```bash
git fetch origin trunk claude/articles-book-publication-6a7dfe
git status --short --branch
git rev-parse HEAD
git rev-parse origin/trunk
git merge-base --is-ancestor origin/trunk HEAD
git rev-list --left-right --count origin/trunk...HEAD
git log --oneline --decorate origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
git diff --name-status origin/trunk...HEAD
gh pr list --head claude/articles-book-publication-6a7dfe --state open --json number,title,url,headRefOid,baseRefName
```

Expected: exact current refs, ancestry, divergence, complete corrective delta,
and current pull-request state are available for review. Do not push, force
rewrite, open, update, or merge the corrective pull request without the user's
explicit delivery approval.
