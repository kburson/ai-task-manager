As a maintainer promoting a story from Develop to Test
I want to run a local AI code-review pass against the pull request's diff while CI validates it in the cloud, and post its findings as PR comments
So that a story cannot merge to trunk unless both automated CI and an independent code-review pass are clean, without bloating git history with transient review artifacts
