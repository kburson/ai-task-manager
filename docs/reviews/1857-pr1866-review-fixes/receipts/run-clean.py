import os, subprocess, sys
prefixes = ('AI_TASK_MANAGER_', 'TASK_TRACKER_', 'AITM_', 'CLAUDE_', 'CODEX_', 'GIT_', 'TT_')
env = {k:v for k,v in os.environ.items() if not k.startswith(prefixes)}
sys.exit(subprocess.call(sys.argv[1:], env=env))
