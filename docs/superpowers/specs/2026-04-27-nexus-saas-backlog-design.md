# Nexus SaaS — Backlog Design Spec

**Date:** 2026-04-27
**Purpose:** Test backlog for exercising GH issue creation directives, pickup directive, and sizing workflow. Issues are fictional but formatted as production-ready.
**Product:** Nexus — B2B team collaboration SaaS (Node/TypeScript, PostgreSQL, Stripe, React)

---

## Sizing Key

| Size | Estimate Range |
|------|---------------|
| XS   | < 1h          |
| S    | 1–3h          |
| M    | 3–6h          |
| L    | 6–12h         |
| XL   | 12h+          |

## Priority Key

| Priority | Meaning |
|----------|---------|
| P0 | Blocking — must ship before launch |
| P1 | High — ships in current milestone |
| P2 | Normal — ships when capacity allows |

---

## Definition of Done (all issues)

- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

## Solo Tasks

### S1 — Set up GitHub Actions CI pipeline

**Priority:** P1 | **Size:** S | **Estimate:** 2h

#### Scope

Configure a GitHub Actions workflow that runs on every push and PR to `main`. The pipeline must lint, type-check, and run the full test suite. On `main` pushes, build and push a Docker image to GHCR.

#### Acceptance Criteria

- [ ] `.github/workflows/ci.yml` exists and triggers on `push` and `pull_request` to `main`
- [ ] Pipeline stages: `lint` → `typecheck` → `test` → `build` (sequential, fail-fast)
- [ ] Docker image tagged with commit SHA and pushed to `ghcr.io/nexus-app/nexus` on `main` merge
- [ ] Pipeline runs in under 4 minutes on a cold cache
- [ ] Branch protection rule requires CI green before merge
- [ ] Secrets documented in `docs/env-vars.md`

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

### S2 — Configure production environment and secrets

**Priority:** P1 | **Size:** XS | **Estimate:** 1h

#### Scope

Provision the production environment on Railway. Set all required environment variables via the Railway dashboard and document them. No `.env` files in version control.

#### Acceptance Criteria

- [ ] Production service created in Railway project `nexus-prod`
- [ ] All env vars from `docs/env-vars.md` set in Railway dashboard
- [ ] `DATABASE_URL`, `STRIPE_SECRET_KEY`, `JWT_SECRET`, `SMTP_PASSWORD` confirmed populated
- [ ] Health check endpoint `/api/health` returns `200` in production
- [ ] Deployment succeeds from `main` branch via Railway GitHub integration
- [ ] `docs/env-vars.md` updated with all var names, types, and example values (no real secrets)

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

### S3 — Dependency security audit and remediation

**Priority:** P1 | **Size:** S | **Estimate:** 2h

#### Scope

Run `npm audit` and `npx snyk test` against the full dependency tree. Resolve all critical and high vulnerabilities. Document any accepted medium/low risks with justification.

#### Acceptance Criteria

- [ ] `npm audit --audit-level=high` exits 0
- [ ] `npx snyk test --severity-threshold=high` exits 0
- [ ] All critical/high CVEs patched or replaced with safe alternatives
- [ ] `docs/security/audit-2026-04-27.md` documents: tool versions, findings, actions taken, accepted risks
- [ ] CI pipeline includes `npm audit --audit-level=high` as a gate (fails build on new criticals)
- [ ] No `npm audit fix --force` used without explicit justification

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

### S4 — Write user onboarding documentation

**Priority:** P2 | **Size:** M | **Estimate:** 4h

#### Scope

Write the end-user onboarding guide covering account creation through first successful team workspace. Publish to the `/docs` route in the app (static MDX rendered by the frontend). Audience: non-technical SaaS buyers.

#### Acceptance Criteria

- [ ] `docs/onboarding/getting-started.mdx` covers: sign up, verify email, create workspace, invite first teammate, send first message
- [ ] Each step has a screenshot placeholder (`<!-- screenshot: step-N -->`) so design can fill later
- [ ] Reading level: Flesch-Kincaid Grade 8 or below (check via `npx readable`)
- [ ] Renders correctly on `/docs/getting-started` in local dev
- [ ] Internal links checked — no dead anchors
- [ ] Product team review complete (tag `@product` in PR)

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

## Epic 1 — User Authentication & Identity

**Priority:** P0 | **Size:** XL | **Estimate:** 16h (roll-up)

### Epic Scope

Implement the full authentication and identity layer for Nexus. Users must be able to register with email/password, sign in via Google OAuth, protect accounts with TOTP-based MFA, and have their sessions maintained securely with short-lived JWTs and rotating refresh tokens.

### Epic Acceptance Criteria

- [ ] All sub-issues closed
- [ ] Auth flows covered by integration tests with a real test database
- [ ] Security review complete — no session fixation, no token leakage, CSRF protection confirmed
- [ ] Rate limiting on all auth endpoints (10 req/min per IP on login)

### Sub-Issues

#### E1-S1 — Implement email/password registration and login

**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Parent:** Epic 1

##### Scope

Build the `POST /api/auth/register` and `POST /api/auth/login` endpoints. Passwords hashed with bcrypt (cost 12). Return a signed JWT (15m expiry) and a refresh token (httpOnly cookie, 30d). Store users in `users` table. Validate email format and enforce minimum password strength (zxcvbn score ≥ 2).

##### Acceptance Criteria

- [ ] `POST /api/auth/register` creates user, sends verification email, returns `201` with JWT
- [ ] `POST /api/auth/login` returns `200` with JWT + sets refresh token cookie; `401` on bad creds
- [ ] Passwords stored as bcrypt hash (cost 12) — plaintext never logged or returned
- [ ] Email verification required before login succeeds (`403` with `EMAIL_NOT_VERIFIED` code)
- [ ] Rate limit: 10 requests/min per IP; returns `429` with `Retry-After` header
- [ ] Integration tests cover: happy path, duplicate email, wrong password, unverified email, rate limit
- [ ] `zxcvbn` score < 2 returns `400` with human-readable password feedback

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E1-S2 — Add Google OAuth integration

**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Parent:** Epic 1

##### Scope

Implement the Google OAuth 2.0 flow using `passport-google-oauth20`. On first login, create a user record linked to the Google profile. On subsequent logins, look up by `google_id`. If the email matches an existing email/password account, link them. Use the same JWT/refresh token infrastructure as E1-S1.

##### Acceptance Criteria

- [ ] `GET /api/auth/google` redirects to Google consent screen
- [ ] `GET /api/auth/google/callback` exchanges code, creates/links user, redirects to `/app` with JWT cookie
- [ ] Google accounts linked to existing email/password accounts by matching email (with user confirmation prompt)
- [ ] Profile picture URL stored in `users.avatar_url`
- [ ] OAuth state parameter validated to prevent CSRF
- [ ] Integration tests cover: new user, returning user, email collision with confirmation, invalid state param
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` documented in `docs/env-vars.md`

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E1-S3 — Implement MFA (TOTP)

**Priority:** P0 | **Size:** L | **Estimate:** 6h | **Parent:** Epic 1

##### Scope

Add opt-in TOTP-based MFA using `otplib`. Enrollment flow: generate secret → display QR code → user scans with authenticator app → user submits a 6-digit code to confirm enrollment. On login with MFA enabled, after password check, prompt for TOTP code before issuing JWT. Provide backup codes (10 single-use, bcrypt-hashed).

##### Acceptance Criteria

- [ ] `POST /api/auth/mfa/enroll` generates TOTP secret and returns QR code data URL + raw secret
- [ ] `POST /api/auth/mfa/confirm` validates a live TOTP code and marks MFA enabled on the account
- [ ] Login flow: after password OK, if MFA enabled, return `202` with `MFA_REQUIRED` — no JWT yet
- [ ] `POST /api/auth/mfa/verify` accepts 6-digit code; on success issues full JWT
- [ ] 10 single-use backup codes generated at enrollment, stored hashed, displayed once
- [ ] `POST /api/auth/mfa/disable` requires current TOTP code + password confirmation
- [ ] Time window tolerance: ±1 step (30s steps → 90s window)
- [ ] Integration tests cover: full enrollment, login with MFA, wrong code, replay attack, backup code use
- [ ] Brute-force protection: 5 failed TOTP attempts locks MFA for 15 minutes

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E1-S4 — Session management and token refresh

**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Parent:** Epic 1

##### Scope

Implement the refresh token rotation lifecycle. `POST /api/auth/refresh` accepts the httpOnly refresh token cookie, validates it against the `refresh_tokens` table, issues a new JWT, and rotates the refresh token (old one invalidated). Implement family detection — if a consumed token is reused, revoke the entire family. Implement `POST /api/auth/logout` which revokes the current refresh token and clears the cookie.

##### Acceptance Criteria

- [ ] `POST /api/auth/refresh` returns new JWT + rotates refresh token cookie
- [ ] Reuse of a previously consumed refresh token revokes all tokens in that family and returns `401`
- [ ] `POST /api/auth/logout` invalidates the refresh token and clears the cookie
- [ ] `GET /api/auth/sessions` returns all active sessions for the current user (device hint, IP, last used)
- [ ] `DELETE /api/auth/sessions/:id` lets users revoke individual sessions
- [ ] Expired refresh tokens cleaned up by a daily cron job (`scripts/cleanup-expired-tokens.ts`)
- [ ] Integration tests cover: happy rotation, token reuse detection, logout, session list, remote revoke

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

## Epic 2 — Billing & Subscriptions

**Priority:** P0 | **Size:** XL | **Estimate:** 19h (roll-up)

### Epic Scope

Integrate Stripe to power Nexus's subscription model. Three tiers: Free, Pro (`$29/mo`), Team (`$99/mo`). Implement plan enforcement (feature gates), invoice delivery, and a reliable webhook handler. Billing state is the source of truth from Stripe — never trust local DB alone.

### Epic Acceptance Criteria

- [ ] All sub-issues closed
- [ ] Stripe test mode passes all Stripe CLI event tests (`stripe trigger`)
- [ ] Plan downgrade properly restricts access within 1 request of webhook receipt
- [ ] No double-charge possible — idempotency keys used on all Stripe API calls

### Sub-Issues

#### E2-S1 — Stripe customer and product setup

**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Parent:** Epic 2

##### Scope

Create Stripe Products and Prices for Free/Pro/Team tiers (via Stripe dashboard + IDs in env). On user registration, create a Stripe Customer and store `stripe_customer_id` on the `users` table. Implement `POST /api/billing/portal` to open the Stripe Customer Portal for self-serve plan management.

##### Acceptance Criteria

- [ ] Stripe Products and Prices exist for Free, Pro, Team in both test and live mode
- [ ] `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM` env vars documented in `docs/env-vars.md`
- [ ] `stripe_customer_id` stored on `users` table; created synchronously at registration
- [ ] `POST /api/billing/checkout` creates a Stripe Checkout Session and returns the URL
- [ ] `POST /api/billing/portal` creates a Customer Portal session and returns the URL
- [ ] Idempotency key used on `stripe.customers.create` (key: `user-reg-{userId}`)
- [ ] Integration tests cover: customer creation, checkout session, portal session, missing customer edge case

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E2-S2 — Plan tier enforcement and feature gating

**Priority:** P0 | **Size:** L | **Estimate:** 8h | **Parent:** Epic 2

##### Scope

Implement a `requirePlan(tier)` middleware that reads the user's current plan from the `subscriptions` table and rejects requests that exceed the tier. Define the feature matrix for Free/Pro/Team. Gate: workspace member count, message history retention, file upload size limit, and API rate limits. Plan is cached on the JWT claims for performance (TTL: 1 hour), with a forced refresh on plan change webhook.

##### Acceptance Criteria

- [ ] `subscriptions` table stores `userId`, `stripeSubscriptionId`, `plan`, `status`, `currentPeriodEnd`
- [ ] `requirePlan('pro')` middleware returns `403` with `PLAN_REQUIRED` body for Free users
- [ ] Feature matrix enforced: Free (5 members, 7d history, 5MB uploads), Pro (50 members, 90d, 25MB), Team (unlimited, unlimited, 100MB)
- [ ] Plan downgrade enforced within 1 webhook cycle (no grace beyond `currentPeriodEnd`)
- [ ] JWT plan claim refreshed on `customer.subscription.updated` webhook
- [ ] `GET /api/billing/plan` returns current plan, status, renewal date, and usage against limits
- [ ] Integration tests cover: each tier boundary, downgrade enforcement, expired subscription, trial period

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E2-S3 — Invoice generation and email delivery

**Priority:** P1 | **Size:** M | **Estimate:** 4h | **Parent:** Epic 2

##### Scope

On `invoice.paid` webhook from Stripe, generate a PDF invoice using `puppeteer` and email it to the billing contact via SendGrid. Store invoice records in the `invoices` table. Expose `GET /api/billing/invoices` for the in-app invoice list and `GET /api/billing/invoices/:id/pdf` for download.

##### Acceptance Criteria

- [ ] `invoices` table: `id`, `userId`, `stripeInvoiceId`, `amountCents`, `currency`, `paidAt`, `pdfUrl`
- [ ] PDF generated from a Handlebars template (`templates/invoice.hbs`) and uploaded to S3
- [ ] Email sent via SendGrid template `d-nexus-invoice` within 60s of `invoice.paid` event
- [ ] `GET /api/billing/invoices` returns paginated list (20/page) sorted by `paidAt` desc
- [ ] `GET /api/billing/invoices/:id/pdf` returns a signed S3 URL (1h expiry)
- [ ] Duplicate `invoice.paid` events handled idempotently (check `stripeInvoiceId` before insert)
- [ ] Integration tests cover: PDF generation, email send (mocked SendGrid), duplicate event, S3 upload

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E2-S4 — Stripe webhook handler

**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Parent:** Epic 2

##### Scope

Implement `POST /api/webhooks/stripe` — the single entry point for all Stripe events. Verify the `Stripe-Signature` header using `stripe.webhooks.constructEvent`. Route events to typed handlers. Use a `webhook_events` table to deduplicate (store `stripeEventId`). Handle: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.

##### Acceptance Criteria

- [ ] Signature verification rejects unsigned requests with `400`
- [ ] `webhook_events` table deduplicates on `stripeEventId` — re-delivered events return `200` and no-op
- [ ] `checkout.session.completed` → upsert subscription record, set plan on user
- [ ] `customer.subscription.updated` → update plan/status/`currentPeriodEnd`, refresh JWT claim cache
- [ ] `customer.subscription.deleted` → downgrade to Free, clear `stripeSubscriptionId`
- [ ] `invoice.payment_failed` → email user, set subscription status to `past_due`
- [ ] All handlers wrapped in DB transaction — partial updates impossible
- [ ] Integration tests use `stripe trigger` events replayed via Stripe CLI fixture files
- [ ] Unrecognized event types log a warning and return `200` (forward-compatible)

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

## Epic 3 — Core Dashboard & Analytics

**Priority:** P0 | **Size:** XL | **Estimate:** 23h (roll-up)

### Epic Scope

Build the Nexus analytics dashboard: collect usage metrics, render them as interactive charts, let users export their data, and manage their team. The dashboard is the primary post-login surface — it must load in under 2 seconds on a cold cache.

### Epic Acceptance Criteria

- [ ] All sub-issues closed
- [ ] Dashboard Lighthouse performance score ≥ 85 on a simulated mobile 4G connection
- [ ] All data access scoped to the authenticated user's workspace (no cross-tenant leakage)
- [ ] Export compliance: GDPR data portability requirement met (all personal data included)

### Sub-Issues

#### E3-S1 — Usage metrics collection and storage

**Priority:** P0 | **Size:** L | **Estimate:** 6h | **Parent:** Epic 3

##### Scope

Instrument the backend to emit usage events (messages sent, files uploaded, API calls made, active users per day) into a `usage_events` table. Run a nightly aggregation job that rolls up daily/weekly/monthly summaries into `usage_summaries`. `usage_events` is append-only and partitioned by month. Expose `GET /api/analytics/summary` and `GET /api/analytics/events`.

##### Acceptance Criteria

- [ ] `usage_events` table: `id`, `workspaceId`, `userId`, `eventType`, `metadata` (jsonb), `occurredAt`
- [ ] Events emitted for: `message.sent`, `file.uploaded`, `api.call`, `user.active_day`
- [ ] Nightly cron (`0 2 * * *`) aggregates into `usage_summaries` (daily, weekly, monthly granularity)
- [ ] `GET /api/analytics/summary?period=7d|30d|90d` returns aggregated counts by type
- [ ] `GET /api/analytics/events?type=&from=&to=&limit=` returns paginated raw events
- [ ] Table partitioned by month; partitions created 2 months ahead by a scheduled job
- [ ] All queries scoped to `workspaceId` derived from JWT — no raw `userId` filtering
- [ ] Integration tests cover: event emission, aggregation correctness, cross-workspace isolation

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E3-S2 — Dashboard charts and visualizations

**Priority:** P0 | **Size:** L | **Estimate:** 8h | **Parent:** Epic 3

##### Scope

Build the `/app/dashboard` React page. Use Recharts for all charts. Display: daily active users (line chart), messages sent per day (bar chart), storage used (gauge), plan usage vs. limits (progress bars). All charts fetch from `/api/analytics/summary` with a period picker (7d/30d/90d). Skeleton loading states while data fetches. Empty state illustrations when no data yet.

##### Acceptance Criteria

- [ ] `/app/dashboard` renders without error for Free, Pro, and Team plan users
- [ ] Period picker updates all charts simultaneously (single API call, not one per chart)
- [ ] Daily active users line chart renders with correct domain and formatted date axis
- [ ] Messages bar chart groups by day, correct totals match `usage_summaries`
- [ ] Storage gauge shows used/total with plan limit clearly marked
- [ ] Plan usage bars: member count, history retention, file size limit — each with % and hard numbers
- [ ] Skeleton states render during fetch; no layout shift on data load
- [ ] Empty state shown when `usage_summaries` has no rows for the selected period
- [ ] Lighthouse performance ≥ 85 on mobile 4G (measure with `npx lighthouse`)
- [ ] Playwright tests cover: period switch, empty state, plan tier rendering differences

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E3-S3 — CSV and JSON data export

**Priority:** P1 | **Size:** M | **Estimate:** 3h | **Parent:** Epic 3

##### Scope

Let users export their workspace data (messages, files metadata, usage events, member list) as CSV or JSON. Exports are generated asynchronously, zipped, uploaded to S3, and delivered via email link. Large exports (>10k rows) are always async. Small exports (<10k rows) can be synchronous with a streaming response.

##### Acceptance Criteria

- [ ] `POST /api/exports` accepts `{ format: 'csv'|'json', datasets: string[], from: ISO, to: ISO }`
- [ ] Exports < 10k rows: streamed as `Content-Disposition: attachment` response
- [ ] Exports ≥ 10k rows: job queued, email sent with S3 link when ready (signed URL, 24h expiry)
- [ ] ZIP contains one file per dataset (e.g., `messages.csv`, `usage_events.json`)
- [ ] CSV files include a header row matching column names
- [ ] GDPR completeness: all personal data fields included (validated against `docs/gdpr-fields.md`)
- [ ] `GET /api/exports` returns export history with status (`pending`, `ready`, `expired`)
- [ ] Integration tests cover: sync export, async export trigger, GDPR completeness, expired link

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

#### E3-S4 — Team member management (invite, roles, remove)

**Priority:** P0 | **Size:** L | **Estimate:** 6h | **Parent:** Epic 3

##### Scope

Implement workspace team management. Roles: `owner`, `admin`, `member`. Invitations sent via email with a signed token (7d expiry). Role-based access enforced on all workspace-scoped endpoints via `requireRole(role)` middleware. Owner cannot be removed; ownership can be transferred. Plan enforcement hooks into member count limits (E2-S2).

##### Acceptance Criteria

- [ ] `POST /api/workspace/invite` sends invite email with signed JWT token (7d expiry)
- [ ] `POST /api/workspace/accept-invite` validates token, creates membership, redirects to `/app`
- [ ] Roles enforced: `owner` and `admin` can invite/remove; `member` cannot
- [ ] `DELETE /api/workspace/members/:userId` removes member; cannot remove owner
- [ ] `PATCH /api/workspace/members/:userId/role` changes role; only owner can promote to admin
- [ ] `POST /api/workspace/transfer-ownership` atomically swaps owner role
- [ ] Member count checked against plan limit at invite time (returns `402` if over limit)
- [ ] `GET /api/workspace/members` returns paginated member list with role, joined date, last active
- [ ] Invite tokens are single-use; accepting invalidates the token
- [ ] Integration tests cover: full invite flow, role enforcement, ownership transfer, plan limit rejection

## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Actual Session Time + Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---

## Summary

| Type | Count | Total Estimate |
|------|-------|---------------|
| Solo tasks | 4 | 9h |
| Epics | 3 | — (roll-up) |
| Sub-issues | 12 | 58h |
| **Total** | **19 issues** | **67h** |

### Issue Creation Order

1. Create epics first (need their numbers to set `--parent` on sub-issues)
2. Create solo tasks (no dependencies)
3. Create sub-issues with `--parent <epic#>`
4. Set Size, Estimate, and Priority on every issue before moving any to In Progress
