# #1296 package introduction docs

Publish `docs/introduction/` through `package.json#files`. The package-boundary test must assert the exact complete current set of eight Markdown files and three PNG assets, not merely a count or directory presence. Re-derive and document a bounded `ENTRY_CEILING` from the post-change `npm pack --dry-run` count. Update the Package Publishing Note in `docs/introduction/install-and-setup.md` so it exactly reflects the shipped documentation. Keep `docs/architecture/` and `docs/internals/` out of scope.

Verification authority: live issue #1296 and deep-dive comment https://github.com/kburson/ai-task-manager/issues/1296#issuecomment-5470019496.
