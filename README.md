# skills

Agent skills from [Noisy Neighbor Studio](https://noisyneighbor.studio), packaged as a Claude Code plugin marketplace.

## Use

```
/plugin marketplace add noisyneighborstudio/skills
/plugin install which-agent-next@noisyneighbor
```

Or with the open skills CLI:

```bash
npx skills add noisyneighborstudio/skills --skill claudes
```

## Install everywhere

Installs or updates every plugin into Claude Code and Codex, and removes older duplicate copies. Grok loads Claude Code's plugins by itself.

```sh
curl -fsSL https://raw.githubusercontent.com/noisyneighborstudio/skills/main/scripts/install.sh | bash
```

## Plugins

| Plugin | What it teaches the agent | Needs |
| --- | --- | --- |
| [which-agent-next](./plugins/which-agent-next) | Pick the agent CLI or profile with the most quota left (`wan`) | `@sethwebster/which-agent-next` |
| [claudes](./plugins/claudes) | Pin, rotate, and move sessions across Claude accounts | [Claudes](https://github.com/noisyneighborstudio/claudes) (macOS) |
| [agent-os-crew](./plugins/agent-os-crew) | Skill + `crew-os` MCP server (36 tools): drive a headless Linux desktop, vault fill, human handoff | `uv`, a running Crew OS |
| [consensus](./plugins/consensus) | One question to many model CLIs, synthesized answer with dissent | `consensus` CLI |
| [dispatch](./plugins/dispatch) | Delegate or hand off work to a remote machine and collect a verified result | ssh + tmux on the worker |

## Maintenance

Plugin files are vendored from their source repos, which stay canonical. Never edit a vendored file here; change it upstream, then:

```sh
./scripts/sync.sh   # pulls every vendored file via gh, prints what changed
```

Bump `version` for each changed plugin in both `plugins/<name>/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, then commit. The mapping lives in `scripts/sync.sh`.
