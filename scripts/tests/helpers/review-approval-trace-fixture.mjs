// @story #80
export function reviewApprovalTraceComment(headSha) {
  return [
    '### 🔗 Commits',
    '',
    `<!-- aitm-commits: ${headSha} -->`,
    '',
    '| SHA | Subject | Author | When |',
    '|---|---|---|---|',
    `| [\`${headSha.slice(0, 7)}\`](https://github.com/test-owner/test-repo/commit/${headSha}) | s | a | t |`,
  ].join('\n');
}
