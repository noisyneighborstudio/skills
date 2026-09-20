#!/usr/bin/env node
// jev_mcp.mjs — the `jev_decide` MCP tool: batched probabilistic judgments from
// TypeSafe Jev via OpenRouter's Decisions API.
//
// Single file, no dependencies, so the plugin runs straight from a marketplace
// checkout with nothing to install. Speaks MCP stdio (line-delimited JSON-RPC)
// and talks to the provider with fetch.
//
//   node jev_mcp.mjs              run the MCP server on stdio
//   node jev_mcp.mjs --doctor     check credentials and make one real decision
//   node jev_mcp.mjs --set-key    read a key from stdin into the private file
//
// Answers are returned exactly as the provider gave them. No thresholds, no
// booleanisation, no hidden uncertainty.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const CREDENTIAL_FILE = join(homedir(), ".config/agent-tools/jev.env");
const VERSION = "0.1.0";
const MAX_RECORDS = 256;
const MAX_QUESTIONS = 32;

// --- credentials -----------------------------------------------------------

// The private file is shared with a machine-wide Jev install, if there is one.
// An inherited environment value wins, so a host can override per session.
// Mode is enforced: a world-readable key file is a bug, not a warning.
function loadCredentialFile() {
  if (!existsSync(CREDENTIAL_FILE)) return;
  const stat = statSync(CREDENTIAL_FILE);
  const uid = process.getuid?.();
  if ((stat.mode & 0o077) !== 0 || (uid !== undefined && stat.uid !== uid)) {
    throw new Error(`${CREDENTIAL_FILE} must be owned by you with mode 0600`);
  }
  for (const line of readFileSync(CREDENTIAL_FILE, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function apiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      `OPENROUTER_API_KEY is not set. Store one privately: node ${fileURLToPath(import.meta.url)} --set-key`,
    );
  }
  return key;
}

function settings() {
  const concurrency = Number(process.env.JEV_CONCURRENCY ?? 8);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("JEV_CONCURRENCY must be an integer from 1 to 32");
  }
  return {
    model: process.env.JEV_MODEL ?? "~typesafe/jev-latest",
    concurrency,
    debug: process.env.JEV_DEBUG === "1",
  };
}

// Stdout carries MCP frames only; everything human goes to stderr. Request and
// response bodies are never logged — they are the caller's data.
function log(message) {
  process.stderr.write(`[jev] ${new Date().toISOString()} ${message}\n`);
}

// --- the decision call -----------------------------------------------------

// Jev evaluates ONE state per request, so a batch of records becomes one request
// per record carrying every question, run concurrently. 40 records x 3 questions
// is 40 requests, not 120, and not 1 — a state array is one shared state, not a
// provider batch.
function statesFor(state) {
  if (!state.records?.length) return [{ id: "state", state: state.description }];
  return state.records.map((record, i) => ({
    id: recordId(record, i),
    state: { context: state.description, record },
  }));
}

function recordId(record, index) {
  if (typeof record === "string") return record;
  if (record && typeof record === "object") {
    for (const key of ["id", "path", "file", "name"]) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return String(index);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function askProvider(state, questions, { model, key }) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "jev-mcp",
    },
    body: JSON.stringify({ model, state, questions }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // The body can quote the caller's own state back, so it stays out of the log.
    throw new Error(`provider returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function decide({ state, questions }) {
  const { model, concurrency, debug } = settings();
  const key = apiKey();
  const states = statesFor(state);
  const questionCount = Object.keys(questions).length;
  const started = performance.now();

  if (debug) log(`batch states=${states.length} questions=${questionCount} concurrency=${concurrency}`);

  const responses = await mapLimit(states, concurrency, async ({ state: one }) => {
    if (debug) log("provider request started");
    const result = await askProvider(one, questions, { model, key });
    if (debug) log("provider request completed");
    return result;
  });

  const elapsedMs = Math.round(performance.now() - started);
  const usage = responses.reduce(
    (acc, r) => {
      const u = r.usage ?? {};
      const cost = u.cost;
      return {
        input_tokens: acc.input_tokens + (u.input_tokens ?? u.inputTokens ?? 0),
        output_tokens: acc.output_tokens + (u.output_tokens ?? u.outputTokens ?? 0),
        cost: typeof cost === "number" ? (acc.cost ?? 0) + cost : acc.cost,
      };
    },
    { input_tokens: 0, output_tokens: 0, cost: null },
  );
  const resolved = responses[0]?.model ?? model;

  log(
    `model=${resolved} records=${state.records?.length ?? 0} questions=${questionCount} ` +
      `requests=${responses.length} elapsed=${elapsedMs}ms ` +
      `tokens=${usage.input_tokens}/${usage.output_tokens}` +
      (usage.cost === null ? "" : ` cost=$${usage.cost.toFixed(6)}`),
  );

  return {
    model: resolved,
    elapsed_ms: elapsedMs,
    requests: responses.length,
    usage,
    results: responses.map((r, index) => ({ index, id: states[index].id, answers: r.answers })),
  };
}

// --- tool schema and validation -------------------------------------------

const GUIDANCE = {
  anyOf: [{ type: "string" }, { type: "object" }, { type: "array" }],
  description: "Plain text, or an object or array of structured guidance.",
};

const INPUT_SCHEMA = {
  type: "object",
  required: ["state", "questions"],
  properties: {
    state: {
      type: "object",
      required: ["description"],
      properties: {
        description: {
          type: "string",
          minLength: 1,
          description: "Shared task context: the problem, the goal, what 'relevant' means here.",
        },
        records: {
          type: "array",
          minItems: 1,
          maxItems: MAX_RECORDS,
          description:
            "Independent items to judge (file paths, search hits, errors, hypotheses, tests). Each record is " +
            "evaluated separately against ALL questions; include short evidence per record, since a bare filename " +
            "is weak evidence. Omit to judge the description alone.",
        },
      },
    },
    questions: {
      type: "object",
      minProperties: 1,
      maxProperties: MAX_QUESTIONS,
      description: "Question id -> question. Every record gets every question.",
      additionalProperties: {
        oneOf: [
          {
            type: "object",
            required: ["type", "instructions"],
            properties: {
              type: { const: "noul" },
              instructions: { ...GUIDANCE, description: "The yes/no proposition to judge about the record." },
              criteria: {
                type: "object",
                required: ["true", "false"],
                properties: { true: GUIDANCE, false: GUIDANCE },
                description: "When the answer should be true vs false.",
              },
            },
          },
          {
            type: "object",
            required: ["type", "instructions", "criteria"],
            properties: {
              type: { const: "choice" },
              instructions: { ...GUIDANCE, description: "What to choose about the record." },
              criteria: {
                type: "object",
                minProperties: 2,
                additionalProperties: GUIDANCE,
                description: "Closed option set: option name -> description. At least two.",
              },
            },
          },
          {
            type: "object",
            required: ["type", "instructions", "criteria"],
            properties: {
              type: { const: "score" },
              instructions: { ...GUIDANCE, description: "What to rate about the record." },
              criteria: {
                type: "array",
                minItems: 2,
                items: GUIDANCE,
                description:
                  "Ordered levels, lowest first. The answer is a position on this scale where 0 is the first " +
                  "level, and may fall between levels.",
              },
            },
          },
        ],
      },
    },
  },
};

const TOOL = {
  name: "jev_decide",
  title: "Jev decide",
  description:
    "Fast probabilistic System-One judgments from TypeSafe Jev. Batch many independent records against a few " +
    "bounded questions in one call. Question types: noul (P(true) in [0,1]), choice (option + probability " +
    "distribution), score (level index + distribution). Returns raw probabilities; treat them as evidence, not " +
    "facts. Not for generation, design, explanation, or open-ended reasoning.",
  inputSchema: INPUT_SCHEMA,
};

const isGuidance = (v) => typeof v === "string" || (typeof v === "object" && v !== null);
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

// Rejects a malformed batch before any billable request goes out.
function validate(args) {
  if (!isPlainObject(args)) throw new Error("arguments must be an object");
  const { state, questions } = args;
  if (!isPlainObject(state)) throw new Error("state must be an object");
  if (typeof state.description !== "string" || !state.description.trim()) {
    throw new Error("state.description must be a non-empty string");
  }
  if (state.records !== undefined) {
    if (!Array.isArray(state.records)) throw new Error("state.records must be an array");
    if (state.records.length < 1) throw new Error("omit state.records rather than passing an empty array");
    if (state.records.length > MAX_RECORDS) throw new Error(`state.records holds at most ${MAX_RECORDS} items`);
  }
  if (!isPlainObject(questions)) throw new Error("questions must be an object of question id -> question");
  const ids = Object.keys(questions);
  if (ids.length < 1 || ids.length > MAX_QUESTIONS) throw new Error(`provide 1 to ${MAX_QUESTIONS} questions`);

  for (const id of ids) {
    const q = questions[id];
    const where = `questions.${id}`;
    if (!isPlainObject(q)) throw new Error(`${where} must be an object`);
    if (!isGuidance(q.instructions)) throw new Error(`${where}.instructions is required`);
    if (q.type === "noul") {
      if (q.criteria !== undefined) {
        if (!isPlainObject(q.criteria) || !isGuidance(q.criteria.true) || !isGuidance(q.criteria.false)) {
          throw new Error(`${where}.criteria needs both 'true' and 'false' guidance`);
        }
      }
    } else if (q.type === "choice") {
      if (!isPlainObject(q.criteria) || Object.keys(q.criteria).length < 2) {
        throw new Error(`${where}.criteria must map at least two option names to descriptions`);
      }
    } else if (q.type === "score") {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2) {
        throw new Error(`${where}.criteria must be an ordered array of at least two levels, lowest first`);
      }
    } else {
      throw new Error(`${where}.type must be noul, choice or score`);
    }
  }
  return { state, questions };
}

// --- MCP stdio server ------------------------------------------------------

// One JSON object per line, stdout reserved for frames.
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

async function handle(request) {
  switch (request.method) {
    case "initialize": {
      const asked = request.params?.protocolVersion;
      return {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "jev", version: VERSION },
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call": {
      if (request.params?.name !== TOOL.name) {
        const error = new Error(`unknown tool: ${request.params?.name}`);
        error.code = -32602;
        throw error;
      }
      let input;
      try {
        input = validate(request.params?.arguments ?? {});
      } catch (error) {
        // Caught separately so a schema mistake isn't dressed up as a provider fault.
        return { isError: true, content: [{ type: "text", text: `Invalid jev_decide input: ${error.message}` }] };
      }
      try {
        const result = await decide(input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        // A failed tool call is a result, not a protocol error: the model reads it.
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Jev decision failed: ${error.message}. Check credentials, model access and connectivity ` +
                `with --doctor. A partly completed batch may already have billed; retry deliberately.`,
            },
          ],
        };
      }
    }
    default: {
      const error = new Error(`unknown method: ${request.method}`);
      error.code = -32601;
      throw error;
    }
  }
}

function serve() {
  const lines = createInterface({ input: process.stdin });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      return;
    }
    // Notifications carry no id and get no reply.
    if (request.id === undefined || request.id === null) return;
    try {
      send({ jsonrpc: "2.0", id: request.id, result: await handle(request) });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: error.code ?? -32603, message: error.message },
      });
    }
  });
  lines.on("close", () => process.exit(0));
}

// --- CLI -------------------------------------------------------------------

async function doctor() {
  console.log(`node ${process.versions.node}`);
  console.log(`credential file ${existsSync(CREDENTIAL_FILE) ? "found" : "absent"} at ${CREDENTIAL_FILE}`);
  const { model } = settings();
  console.log(`key ${apiKey() ? "present" : "missing"}, model ${model}`);
  console.log("making one real decision (a fraction of a cent)…");
  const result = await decide({
    state: { description: "Doctor check.", records: ["an apple", "a hammer"] },
    questions: {
      fruit: {
        type: "noul",
        instructions: "Is this a fruit?",
        criteria: { true: "edible fruit", false: "anything else" },
      },
    },
  });
  for (const r of result.results) console.log(`  ${r.id}: P(fruit)=${r.answers.fruit.noul}`);
  console.log(`ok — ${result.model}, ${result.elapsed_ms}ms`);
}

// The key arrives on stdin so it never lands in argv, shell history or a log.
async function setKey() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const key = Buffer.concat(chunks).toString("utf8").trim();
  if (!key) throw new Error("no key on stdin (use: printf %s \"$KEY\" | jev --set-key)");
  mkdirSync(dirname(CREDENTIAL_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIAL_FILE, `OPENROUTER_API_KEY=${key}\n`, { mode: 0o600 });
  console.log(`Stored in ${CREDENTIAL_FILE} (mode 0600).`);
}

const mode = process.argv[2];
try {
  if (mode !== "--set-key") loadCredentialFile();
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Node 20 or newer required");
  if (!mode) serve();
  else if (mode === "--doctor") await doctor();
  else if (mode === "--set-key") await setKey();
  else {
    console.error("Usage: jev_mcp.mjs [--doctor | --set-key]");
    process.exitCode = mode === "--help" ? 0 : 2;
  }
} catch (error) {
  console.error(`[jev] ${error.message}`);
  process.exitCode = 1;
}
