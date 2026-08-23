# #1388 Hosted CI Mermaid Sandbox Repair

## Goal

Make the opt-in GitHub slow lane run the real article publishing end-to-end test successfully on hosted Linux without changing local or production Mermaid rendering defaults.

## Root cause

PR #1385 proved that 52 of 53 slow files pass in GitHub Actions. The remaining article publisher test invokes Mermaid CLI, whose bundled Chromium cannot use its normal user-namespace sandbox on the hosted Ubuntu runner. The failure occurs before article assertions execute and is absent locally.

## Design

Keep the publisher unchanged. Add a repository-owned Puppeteer JSON configuration under `.github/` containing the CI-only Chromium arguments. In the slow job, pass that file to Mermaid CLI through an environment variable consumed by the publisher's Mermaid boundary. The boundary must add `--puppeteerConfigFile` only when the variable is explicitly present; ordinary local and production calls retain their current arguments.

## Implementation sequence

1. Extend `scripts/tests/slow/task-tracker/core/ci-lane-wiring.test.mjs` with a failing assertion that the slow job alone exports the repository-owned configuration and that the configuration contains the expected hosted-runner arguments.
2. Add the minimal `.github/puppeteer-ci.json` asset and slow-job environment wiring.
3. Extend the Mermaid launcher to consume the explicit configuration variable without defaulting it on other hosts.
4. Run the focused wiring test and real article publishing end-to-end test locally.
5. Run lint, format, and the complete slow lane; commit with `[#1388]` attribution.
6. Push the exact head to PR #1385 and require both provider lanes to pass before resuming #1380 delivery.

## Safety boundaries

- Do not skip or filter the article publisher test.
- Do not change article output or Mermaid rendering parameters.
- Do not make `--no-sandbox` a local or production default.
- Do not weaken delivery's provider-check validation.
- Preserve the existing exact-head Test and Review evidence discipline after the branch head changes.

## Verification

- `node --test scripts/tests/slow/task-tracker/core/ci-lane-wiring.test.mjs`
- `node --test scripts/tests/slow/articles/publish-articles-e2e.test.mjs`
- `npm run test:slow`
- `npm run lint`
- `npm run format:check`
- GitHub PR #1385 fast and slow lanes at the final exact head
