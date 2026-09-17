#!/usr/bin/env bash
# Pull vendored files from their source repos. Needs `gh` with read access to each repo.
# Review `git diff`, bump versions for changed plugins, commit.
set -euo pipefail
cd "$(dirname "$0")/.."

# repo  source-path  vendored-path
while read -r repo src dst; do
  [ -z "$repo" ] && continue
  mkdir -p "$(dirname "$dst")"
  gh api "repos/$repo/contents/$src" -H "Accept: application/vnd.github.raw" > "$dst.tmp"
  mv "$dst.tmp" "$dst"
  echo "synced $dst"
done <<'MAP'
noisyneighborstudio/which-agent-next skill/SKILL.md plugins/which-agent-next/skills/which-agent-next/SKILL.md
noisyneighborstudio/agent-os-crew mcp/crew_os_mcp.py plugins/agent-os-crew/mcp/crew_os_mcp.py
sethwebster/skills plugins/consensus/skills/consensus/SKILL.md plugins/consensus/skills/consensus/SKILL.md
sethwebster/skills plugins/dispatch/skills/dispatch/SKILL.md plugins/dispatch/skills/dispatch/SKILL.md
sethwebster/skills plugins/dispatch/skills/dispatch/scripts/dispatch.mjs plugins/dispatch/skills/dispatch/scripts/dispatch.mjs
sethwebster/skills plugins/dispatch/skills/dispatch/references/pass-mode.md plugins/dispatch/skills/dispatch/references/pass-mode.md
sethwebster/skills plugins/dispatch/skills/dispatch/references/live-mode.md plugins/dispatch/skills/dispatch/references/live-mode.md
sethwebster/skills plugins/dispatch/hooks/hooks.json plugins/dispatch/hooks/hooks.json
MAP

git status --short
