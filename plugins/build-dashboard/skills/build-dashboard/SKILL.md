---
name: build-dashboard
description: Create a live progress dashboard for a long-running piece of work (more than 5 steps or 30 minutes), then keep it current in near real time. Use when starting such work, or when the user asks for a dashboard.
argument-hint: "[slug or a short description of the work]"
---

# Build a live progress dashboard

A dashboard is two files in `~/dashboards/`, so a design pass happens once and
every update after that is cheap:

- `<slug>.html` is the **layout**, designed once by the `dashboard-builder`
  subagent. It reads its data from the files below every 3 seconds, without
  reloading, and redraws.
- `<slug>.data.js` is the **data**, which you write directly after every step.
  It's one statement: `window.DASH = { … };`.
- `<slug>.layout.js` holds the layout's version (`window.LAYOUT`), written by
  the builder on every redesign. The open page reloads itself once when it
  changes, so a redesign reaches every open tab.
- `<slug>.live.js` is optional: a feeder script writes it continuously
  (`window.LIVE = { … };`) when the work has a live event source.

Loading the data as a script works under `file://`, so the page still opens
with a double-click.

## 1. Start

1. Choose a short slug from `$ARGUMENTS` or the work (kebab-case).
2. Get the time: `date "+%Y-%m-%dT%H:%M:%S%z"`.
3. Have `dashboard-builder` design `~/dashboards/<slug>.html` for this work.
   Give it the slug, the plan, and the data shape below, plus any extra panels
   the work needs. If it replies `NEED_STYLE`, ask the user for dark or light,
   dense or airy, and one accent color, then call it again with the answer.
   If the subagent isn't available in this session (it loads at session
   start), run it headless:
   `claude -p --agent dashboard-builder "<the same request>"`, with this
   session's `CLAUDECODE` and `CLAUDE_CODE_*` variables unset.
4. Write the first `<slug>.data.js` yourself.
5. Give the user the path to the file: double-clicking it opens the page. If
   they may not be at this machine, serve the folder
   (`python3 -m http.server <port> --bind 127.0.0.1 --directory ~/dashboards`)
   and expose it privately, for example with `tailscale serve`, never
   publicly.

## One-time setup

So dashboard-builder can write there without a permission prompt on every
update, allow the folder in your Claude Code settings:

```json
{ "permissions": {
    "additionalDirectories": ["~/dashboards"],
    "allow": ["Read(~/dashboards/**)", "Edit(~/dashboards/**)"] } }
```

The plugin's hook still keeps the agent inside `~/dashboards/` and its own
memory.

## 2. After every step (no subagent)

Rewrite `<slug>.data.js` in full with the current state and `updated` set to
the current time from `date`. Write to a temp file and `mv` it into place, so
the page never reads half a file. Only call `dashboard-builder` again if the
panels themselves need to change.

When a decision is needed from the user, add it to `questions` with the
default you're taking, and carry on with that default.

## 3. A live feeder (optional)

If the work has a stream to follow (a daemon's events, a log, a CI run),
start a small feeder in the background that rewrites `<slug>.live.js` on each
change, and tell the builder the page should render `window.LIVE`. Feeders
live in `~/dashboards/feeders/`. Stop the feeder when the work ends.

## The data shape

```js
window.DASH = {
  title: "…", subtitle: "…",
  updated: "2026-09-27T12:52:52-04:00",   // real clock time, with offset
  tasks: [{ name, status, since, detail }], // running|queued|done|failed|stuck|waiting
  questions: [{ q, default, asked }],       // waiting on the user, and the default taken
  deliverables: [{ name, detail, at, link }],
  stuck: [{ name, since, why }],
  events: [{ at, text }],                   // newest first, the recent history
  panels: { /* extra, work-specific panels the layout knows how to render */ }
};
```
