#!/bin/bash
# Keeps dashboard-builder inside ~/dashboards/ and its own memory. A
# plugin-level PreToolUse hook that runs for every Read, Write, Edit and Glob
# call but only restricts calls made by the dashboard-builder agent
# (agent_type), since Claude Code ignores hooks in a plugin agent's own front
# matter. It it reads the tool call as JSON on stdin, and exit code 2
# blocks the call and shows stderr to the agent. The path and the allowed
# directories are both resolved through symlinks before they're compared.
input=$(cat)
[[ "$(jq -r '.agent_type // empty' <<<"$input")" == *dashboard-builder ]] || exit 0
path=$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<<"$input")
[[ -z "$path" ]] && { echo "dashboard-builder: give a path under ~/dashboards/" >&2; exit 2; }
python3 - "$path" <<'PY' && exit 0
import os, sys
real = lambda p: os.path.realpath(os.path.expanduser(p))
path = real(sys.argv[1])
if path == real("~/dashboards") or path.startswith(real("~/dashboards") + os.sep):
    sys.exit(0)
# Its own memory: <config dir>/agent-memory/<name containing dashboard-builder>/...
parts = path.split(os.sep)
if "agent-memory" in parts:
    i = parts.index("agent-memory")
    if i + 1 < len(parts) and "dashboard-builder" in parts[i + 1]:
        sys.exit(0)
sys.exit(1)
PY
echo "dashboard-builder may only use ~/dashboards/ and its memory, not $path" >&2
exit 2
