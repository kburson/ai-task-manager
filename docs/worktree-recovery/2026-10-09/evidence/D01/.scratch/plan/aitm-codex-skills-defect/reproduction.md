1. Use a Codex workspace whose AGENTS.md contains the AITM Codex Superpowers bootstrap and whose hook resolves to the packaged AITM bash guard.
2. From that workspace, run a read-only command such as sed -n '1,80p' /Users/kpburson/.codex/skills/using-superpowers/SKILL.md.
3. Observe the PreToolUse hook blocks with: Access to path outside allowed scope ... reads permitted in project root, ~/.claude/, and system binaries.
