# jev

A `jev_decide` MCP tool plus a skill that teaches an agent when to reach for it.

Jev is a decision model, not a text model. You hand it a batch of items and a few
bounded questions; it hands back calibrated probabilities. The agent spends its
own reasoning on the cases that turn out to matter.

```
/plugin marketplace add noisyneighborstudio/skills
/plugin install jev@noisyneighbor
```

Then restart the host and set a key once:

```sh
printf %s "$OPENROUTER_API_KEY" | jev --set-key
jev doctor
```

`jev` lands on PATH via [`scripts/install.sh`](../../scripts/install.sh). Without
it, call the server directly at `mcp/jev_mcp.mjs`.

## Needs

Node 20 or newer, and an [OpenRouter](https://openrouter.ai) key with access to
`~typesafe/jev-latest`. No npm install: the server is one file with no
dependencies, so a marketplace checkout is ready to run.

## What it is for

Three question types, batched in a single call:

| Type | Ask | Answer |
| --- | --- | --- |
| `noul` | a yes/no proposition | P(true) |
| `choice` | one of a closed option set | the option, plus the whole distribution |
| `score` | an ordered scale | a position on the scale, plus the distribution |

Good uses are relevance filtering, triaging candidate files, classifying errors
or logs, ranking investigation leads, judging change risk, and choosing among
hypotheses the agent has already written down.

Bad uses are generating code or prose, architectural design, causal debugging,
and anything whose possible answers cannot be written down in advance. A call
that replaces one trivial judgment is not worth its overhead; one that keeps an
agent from reading thirty irrelevant files is.

Probabilities come back raw. Nothing is thresholded into a boolean, and no
result is filtered out on the agent's behalf.

## Credentials and data

The key is read from `OPENROUTER_API_KEY`, falling back to
`~/.config/agent-tools/jev.env`, which must be mode 0600 and owned by you. The
server refuses to read it otherwise. A machine-wide Jev install shares that same
file, so the plugin and the standalone tool can coexist.

State and questions are sent to OpenRouter and TypeSafe. Send only what is
allowed to leave the machine. Logs record counts, timing, tokens and cost;
request and response bodies are never written to them, including under
`JEV_DEBUG=1`.

`JEV_MODEL` overrides the model. `JEV_CONCURRENCY` accepts 1 to 32 and defaults
to 8.
