---
name: jev
description: Use Jev for batches of bounded probabilistic judgments, including relevance filtering, classification, triage, prioritization, and scoring. Also use when explicitly asked to consult Jev. Suitable when answers can be specified in advance; generation and causal reasoning stay with the calling agent.
license: MIT
---

# Jev

Jev is a probabilistic decision model behind the `jev_decide` MCP tool, registered as server `jev`. A host may expose it as `mcp__jev__jev_decide` or `jev_jev_decide`. The server ships with this plugin and works in any repository.

Use it when a batch of bounded judgments saves meaningful reading or reasoning. Keep architecture, causal debugging, generation, explanations, and synthesis with the calling agent. One trivial judgment usually does not justify a call.

## Make a decision request

1. Describe the task and what each judgment means in `state.description`.
2. Put independent items in `state.records`. Include stable `id` or `path` fields and short evidence or purpose descriptions. Filename-only judgments are weaker evidence. Omit records when judging the description alone.
3. Define a map of question IDs to questions. Every record receives every question.
4. Call the discovered `jev_decide` tool once for the batch. Preserve the returned distributions and investigate ambiguous or consequential cases yourself.

```json
{
  "state": {
    "description": "Find files worth inspecting for a persistence bug. Use the supplied evidence, not filename alone.",
    "records": [
      {"id":"database","path":"src/storage/database.ts","purpose":"Opens SQLite and writes records"},
      {"id":"button","path":"src/ui/Button.tsx","purpose":"Renders a button and invokes an onPress callback"}
    ]
  },
  "questions": {
    "relevant": {"type":"noul","instructions":"Does this file likely implement persistence?"},
    "subsystem": {"type":"choice","instructions":"Choose the best supported subsystem.","criteria":{"storage":"Persistence and queries","ui":"Presentation and interaction","other":"Neither or insufficient evidence"}},
    "priority": {"type":"score","instructions":"How valuable is inspecting this file for this task?","criteria":["Low","Moderate","High"]}
  }
}
```

`noul` asks a yes/no proposition, with optional `criteria` containing `true` and `false` guidance. Its answer is `{ "type": "noul", "noul": 0.91 }`, where `noul` is P(true).

`choice` requires a closed map of at least two options. Its answer includes `choice`, `confidence`, and `probabilities`.

`score` requires an ordered criteria array with at least two levels, lowest first. Its answer includes `score`, `confidence`, `probabilities`, and a `legend` when supplied by Jev. `score` is a position on the scale where 0 is the first level, and it may fall between levels.

Results preserve input order and include `index`, `id`, and `answers`, plus model, elapsed time, request count and usage. A selected option is not a replacement for its distribution. Weigh uncertainty, conflicting evidence, consequences and the cost of checking before acting. A low probability is not proof of irrelevance; a split score can be useful evidence to inspect further. Keep deterministic business rules in code.

## Batching and limits

One MCP invocation fans out to one provider request per record, all questions per request. Forty records and three questions means forty provider requests. A state array is not a provider batch. The server defaults to eight concurrent requests. Use 1–256 records and 1–32 questions per invocation; split larger workloads deliberately. Omit `records` rather than passing an empty array. Failed batches can have completed billable requests; inspect the failure before retrying.

## Data and discovery

Supplied state and questions go to OpenRouter/TypeSafe. Send only task-relevant information allowed to leave this machine; exclude credentials and secrets. The server owns authentication. No repository environment file is needed.

If the tool is absent, restart the host so it reloads plugin MCP servers. The plugin's own server is `mcp/jev_mcp.mjs` beside this skill; a machine-wide installation may register the same tool instead, and either satisfies this skill.

Diagnostics run one real, billable decision costing a fraction of a cent:

```
node <plugin>/mcp/jev_mcp.mjs --doctor
```

`jev doctor` runs the same check when the repository's install script placed that shim on PATH. A missing key is stored privately with `printf %s "$KEY" | node <plugin>/mcp/jev_mcp.mjs --set-key`, which writes `~/.config/agent-tools/jev.env` at mode 0600. Never print the key into agent output.

Use the capability deliberately. It adds no hooks, automatic interception, routing or orchestration.
