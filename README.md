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

## Plugins

| Plugin | What it teaches the agent | Needs |
| --- | --- | --- |
| [which-agent-next](./plugins/which-agent-next) | Pick the agent CLI or profile with the most quota left (`wan`) | `@sethwebster/which-agent-next` |
| [claudes](./plugins/claudes) | Pin, rotate, and move sessions across Claude accounts | [Claudes](https://github.com/noisyneighborstudio/claudes) (macOS) |
| [agent-os-crew](./plugins/agent-os-crew) | Drive a headless Linux desktop: input, browser, vault fill, human handoff | a running agent-os-crew box |
| [consensus](./plugins/consensus) | One question to many model CLIs, synthesized answer with dissent | `consensus` CLI |
| [dispatch](./plugins/dispatch) | Delegate or hand off work to a remote machine and collect a verified result | ssh + tmux on the worker |

## Maintenance

Skills are vendored under `plugins/<name>/skills/<name>/`, and the source project stays canonical. When a skill changes upstream, copy it here and bump `version` in both `plugins/<name>/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
