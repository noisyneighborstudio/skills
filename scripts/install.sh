#!/usr/bin/env bash
# Install or update every noisyneighbor plugin into each agent CLI present: claude, codex, grok.
# Idempotent. Replaces the older personal copies of consensus/dispatch so skills don't load twice.
#   curl -fsSL https://raw.githubusercontent.com/noisyneighborstudio/skills/main/scripts/install.sh | bash
set -uo pipefail
REPO=noisyneighborstudio/skills
MP=noisyneighbor
PLUGINS=(which-agent-next claudes agent-os-crew consensus dispatch)
BACKUP="$HOME/.skill-backups/$(date +%Y%m%d%H%M%S)"
fail=0

run() { echo "+ $*"; "$@" || { echo "  ! failed: $*"; fail=1; }; }
retire() {  # move a superseded standalone skill dir aside
  [ -e "$1" ] || return 0
  mkdir -p "$BACKUP"; echo "+ retire $1 -> $BACKUP"; mv "$1" "$BACKUP/$(echo "$1" | tr / _)"
}

if command -v claude >/dev/null; then
  echo "== claude"
  if claude plugin marketplace list 2>/dev/null | grep "$MP" >/dev/null; then
    run claude plugin marketplace update "$MP"
  else
    run claude plugin marketplace add "$REPO"
  fi
  installed=$(claude plugin list 2>/dev/null)
  for p in consensus dispatch; do
    grep "$p@skills" <<<"$installed" >/dev/null && run claude plugin uninstall "$p@skills"
    retire "$HOME/.claude/skills/$p"
  done
  for p in "${PLUGINS[@]}"; do
    if grep "$p@$MP" <<<"$installed" >/dev/null; then
      run claude plugin update "$p@$MP"
    else
      run claude plugin install "$p@$MP"
    fi
  done
fi

if command -v codex >/dev/null; then
  echo "== codex"
  if codex plugin marketplace list 2>/dev/null | grep "^$MP " >/dev/null; then
    run codex plugin marketplace upgrade "$MP"
  else
    run codex plugin marketplace add "$REPO"
  fi
  installed=$(codex plugin list 2>/dev/null)
  for p in consensus dispatch; do
    grep -E "^$p@skills +installed" <<<"$installed" >/dev/null && run codex plugin remove "$p@skills"
    retire "$HOME/.codex/skills/$p"
    retire "$HOME/.agents/skills/$p"
  done
  for p in "${PLUGINS[@]}"; do run codex plugin add "$p@$MP"; done
fi

# Grok loads every plugin Claude Code installed (~/.claude/plugins/installed_plugins.json),
# so it needs nothing of its own. Only drop grok-native copies that would load twice.
if command -v grok >/dev/null; then
  echo "== grok (inherits claude plugins)"
  installed=$(grok plugin list 2>/dev/null)
  for p in "${PLUGINS[@]}"; do
    grep -E "^ *$p-[0-9a-f]+:" <<<"$installed" >/dev/null && run grok plugin uninstall "$p"
  done
  for p in "${PLUGINS[@]}"; do retire "$HOME/.grok/skills/$p"; done
  command -v claude >/dev/null || { echo "  ! grok needs claude installed to see these plugins"; fail=1; }
fi

exit $fail
