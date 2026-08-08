// @story #560
// GitHub issue-form templates extracted from the two issue-form heredocs in
// scripts/gh/init-project-config.sh. The strings are byte-for-byte the heredoc
// bodies (a single-quoted heredoc does no shell interpolation, so a JS template
// literal with no `${}` reproduces them exactly).

import fs from 'node:fs';
import path from 'node:path';

export const TASK_TEMPLATE = `name: Task
description: Manual task entry compatible with AI Task Manager
title: "[Task] "
labels: []
body:
  - type: markdown
    attributes:
      value: |
        Fill in the planning fields below. AI Task Manager will create the hidden
        field database and timing-log comment the first time an agent picks up
        this issue with \`/task #<issue-number>\`.

  - type: textarea
    id: description
    attributes:
      label: Description
      description: What needs to be done and why?
    validations:
      required: true

  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How will we know this is done?
      value: |
        - [ ]
        - [ ]
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0 - Critical / blocking
        - P1 - High / this sprint
        - P2 - Normal / backlog
        - P3 - Chore
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Size
      description: Estimated effort
      options:
        - "XS - 1-2 hours"
        - "S - 3-4 hours"
        - "M - 6-10 hours"
        - "L - 12-20 hours"
        - "XL - 24+ hours"
    validations:
      required: true

  - type: input
    id: estimate
    attributes:
      label: Estimate
      description: Mid-point estimate in hours, for example 4 or 4h.
      placeholder: "4"
    validations:
      required: true

  - type: input
    id: rank
    attributes:
      label: Rank
      description: Optional fan-out/order number used by AITM orchestration.
      placeholder: "1"
    validations:
      required: false

  - type: textarea
    id: dependencies
    attributes:
      label: Dependencies
      description: Optional issue numbers or work items that should complete first.
      placeholder: "#12, auth setup, database migration"
    validations:
      required: false
`;

export const BUG_TEMPLATE = `name: Bug
description: Manual bug entry compatible with AI Task Manager
title: "🐞 [BUG] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Fill in the planning fields below. AI Task Manager will create the hidden
        field database and timing-log comment the first time an agent picks up
        this issue with \`/task #<issue-number>\`.

  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: Describe the bug and what you expected instead.
    validations:
      required: true

  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      value: |
        1.
        2.
        3.

  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How will we know this fix is done?
      value: |
        - [ ]
        - [ ]
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0 - Critical / blocking
        - P1 - High / this sprint
        - P2 - Normal / backlog
        - P3 - Chore
    validations:
      required: true

  - type: dropdown
    id: size
    attributes:
      label: Size
      description: Estimated fix effort
      options:
        - "XS - 1-2 hours"
        - "S - 3-4 hours"
        - "M - 6-10 hours"
        - "L - 12-20 hours"
        - "XL - 24+ hours"
    validations:
      required: true

  - type: input
    id: estimate
    attributes:
      label: Estimate
      description: Mid-point fix estimate in hours, for example 2 or 2h.
      placeholder: "2"
    validations:
      required: true

  - type: input
    id: rank
    attributes:
      label: Rank
      description: Optional fan-out/order number used by AITM orchestration.
      placeholder: "1"
    validations:
      required: false
`;

export const ISSUE_TEMPLATES = [
  { filename: 'task.yml', content: TASK_TEMPLATE },
  { filename: 'bug.yml', content: BUG_TEMPLATE },
];

// writeIssueTemplates(targetDir, deps) → writes task.yml + bug.yml into
// <targetDir>/.github/ISSUE_TEMPLATE/, creating the directory. Returns the
// list of written file paths. Replaces the mkdir + two heredoc writes.
export function writeIssueTemplates(targetDir, deps = {}) {
  const mkdir = deps.mkdirSync || fs.mkdirSync;
  const writer = deps.writeFileSync || fs.writeFileSync;
  const templateDir = path.join(targetDir, '.github', 'ISSUE_TEMPLATE');
  mkdir(templateDir, { recursive: true });
  const written = [];
  for (const { filename, content } of ISSUE_TEMPLATES) {
    const dest = path.join(templateDir, filename);
    writer(dest, content);
    written.push(dest);
  }
  return written;
}
