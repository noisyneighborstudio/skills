---
name: claudes
description: >-
  Run Claude Code under a specific Claude account, or move work to another
  account when one runs out of usage. Drives the `claudes` CLI, which keeps
  multiple isolated Claude profiles on one Mac (each its own CLAUDE_CONFIG_DIR
  under ~/.claude-profiles/<Name>). Use when the user names a profile or account
  (work, personal, client), asks which account has usage left, hits a Claude rate
  or usage limit mid-task, wants to continue a session on another account, move
  or list sessions across profiles, or launch `claude` pinned to a profile.
license: MIT
---

# claudes

`claudes` manages isolated Claude accounts on one Mac. One **profile** = one
CLI config dir (`~/.claude-profiles/<Name>`) plus a cloned desktop app.

Requires the CLI (macOS only):
`curl -fsSL https://raw.githubusercontent.com/noisyneighborstudio/claudes/main/install.sh | zsh`.
Check with `command -v claudes`. If it is missing, tell the user; don't install
it unasked.

## Look before acting

```sh
claudes list        # profiles: ✓ globally active, 🟢 running
claudes active      # just the active profile name
claudes best        # server-side usage per profile: 5h% · 7d% · resets
claudes sessions    # id · date · project · first prompt (add a profile name to narrow)
```

`claudes best` reads the same numbers as `/usage` in Claude Code, all devices
included. Report the binding window, e.g. "Work: 12% of 5h used, 81% of 7d used,
resets Thu".

## Running Claude on a profile

```sh
claude-work -p "summarize this repo"   # per-profile shim, real executable on PATH
claude-as Work --resume                 # same, explicit
claudes run Work                        # what both call
claudes run --best                      # account with the most 5h headroom
claudes run --next                      # blind round-robin
```

Anything after the profile is passed to `claude`. For a single invocation,
`CLAUDE_CONFIG_DIR=~/.claude-profiles/Work claude …` works too.

## Out of usage mid-task

Move the session to another account and resume it there:

```sh
claudes run --best --start-from-session=<id>
```

That finds the session in whatever profile holds it, moves it to the best other
profile (never its current one), cd's to its project dir, and resumes it.
Get `<id>` from `claudes sessions`. Use `--next` instead of `--best` only when
usage can't be read.

To move without resuming:

```sh
claudes transfer <id> --to Work     # or --next / --best
```

A transfer **moves** the transcript and its side data (todos, file history,
session env). Nothing stays behind, and the destination refuses an id it already
has. Moving a session that is still running in another terminal will break
that terminal's session, so check first.

## Commands that need the user's say-so

These change global or persistent state. Confirm before running them:

| Command | Effect |
| --- | --- |
| `claudes use <Profile>` | Repoints `~/.claude` at that profile for **every** tool on the machine |
| `claudes new <Name>` | Clones and patches Claude.app, then needs an interactive login |
| `claudes delete <Name> [--everything]` | Removes a profile; `--everything` deletes its data |
| `claudes repatch [Name]` | Rebuilds desktop clones |

Prefer pinning one invocation (`claude-<profile>`, `claudes run <P>`) over
`claudes use`.

## Failure modes

- `claude-<profile>: command not found`: run `claudes shims`.
- A profile that shows as logged out needs an interactive `/login` in that
  profile. That step belongs to the user; you can't do it for them.
- If a profile shows no usage numbers, the check failed. That doesn't mean the
  account has quota. Say it is unknown.

For the same decision across Codex, Gemini and other CLIs, not just Claude
profiles, use `which-agent-next`.
