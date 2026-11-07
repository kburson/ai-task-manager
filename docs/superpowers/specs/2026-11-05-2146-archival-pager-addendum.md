# #2146 fixed Git runner pager addendum

The genuine owner environment contains GIT_PAGER=cat. The accepted design otherwise refuses every nonempty GIT_* variable except GIT_TERMINAL_PROMPT=0 and GIT_OPTIONAL_LOCKS=0. No reconstruction command was attempted; the inherited setting was observed by name and exact-value comparison only.

Proposed narrow adjustment: allow the exact inherited pair GIT_PAGER=cat, without deleting or changing it, and require --no-pager as the first argument of every Git subprocess in the fixed archival runner, including configuration reads. Refuse every other nonempty GIT_PAGER value, and continue refusing all other unsupported GIT_* variables. No shell, environment rewrite, hook/config override or generic command runner is added. --no-pager controls presentation only and does not change hook/transport/native policy.

Tests must prove an unsupported pager value refuses before spawning, GIT_DIR/GIT_INDEX_FILE/GIT_CONFIG_COUNT still refuse before spawning, and every admitted fixed Git invocation carries --no-pager. Actual candidate reconstruction must retain the genuine inherited environment. This proposal requires independent review before implementation/execution; the existing strict policy remains until accepted.
