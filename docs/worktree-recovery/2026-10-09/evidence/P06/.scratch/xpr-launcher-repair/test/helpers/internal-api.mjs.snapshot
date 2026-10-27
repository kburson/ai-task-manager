// Test-only access to mutation surfaces that are intentionally excluded from
// the package's bounded public adapter API.
export {
  advanceReview,
  abandonReview,
  continueReview,
  finalizeReview,
  joinReview,
  recoverReview,
  registerSupplement,
  resumeReview,
  run,
  startReview,
  statusReview,
  supersedeReview,
  submitAuthorTurn,
  submitReviewTurn,
} from '../../src/cli/run.mjs';
export { parseCommand } from '../../src/cli/parse.mjs';
export { commitExactPaths, createGitTransactionRepository } from '../../src/git/transaction.mjs';
export { sealNoCommitHandoff } from '../../src/protocol/service.mjs';
export { hydrateTemplate } from '../../src/templates/index.mjs';
export { createResumeTransport } from '../../src/transport/resume.mjs';
export {
  buildClaudeReviewerLaunch,
  buildClaudeReviewerResume,
  classifyClaudeReviewerOutcome,
  runClaudeReviewerLaunch,
} from '../../src/provider/claude-launch.mjs';
