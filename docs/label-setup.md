# Label Setup

One-time setup performed by `/task new` in plan mode before any issue is created. Loaded on demand by the plan-mode-backlog rule file.

## A. Master plan label

Derive a slug from the title argument: lowercase, special chars → hyphen, spaces → hyphen, collapse consecutive hyphens, max 30 chars. Announce and proceed (no confirmation):

```bash
gh label create "plan:<slug>" --color "#0075ca" --description "Plan: <full title>" 2>/dev/null || true
```

## B. Purpose labels

Create (skip-if-exists) the standard set: `infrastructure`, `backend`, `client`, `test`, `dx`, `security`, `data`. Inference rules:

| Label            | Apply when scope mentions...                                                             |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `infrastructure` | CI/CD, env vars, secrets, deployment, Docker, Railway, cron, migrations                  |
| `backend`        | APIs (REST/GraphQL), business logic, data models, ORM, auth middleware, tokens, sessions |
| `client`         | React, UI, components, pages, CSS, charts, frontend state, Playwright                    |
| `test`           | test suites, fixtures, coverage, integration tests, unit tests                           |
| `dx`             | developer experience, docs, onboarding, scripts, tooling, README                         |
| `security`       | auth hardening, MFA, rate limiting, CVE, audit, encryption, CSRF, token rotation         |
| `data`           | analytics, metrics, exports, aggregations, reporting, dashboards                         |

## C. Read config values via `config-get.mjs`

Never `cat … | python3`:

```bash
node node_modules/ai-task-manager/scripts/task-tracker/config-get.mjs projectId
node node_modules/ai-task-manager/scripts/task-tracker/config-get.mjs assignee @me
node node_modules/ai-task-manager/scripts/task-tracker/config-get.mjs repo
```

Store as `PROJECT_ID`, `ASSIGNEE`, `REPO`.

## D. Look up Size + Sequence field IDs

Once per session, via GraphQL on the project. Capture `XS`, `S`, `M`, `L`, `XL` option IDs and `SEQUENCE_FIELD_ID`.
