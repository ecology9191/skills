---
name: git-guardrails-opencode
description: Set up opencode permissions to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants git safety guardrails, bash permission rules, or protection from destructive git operations in opencode.
---

# Git Guardrails For opencode

Sets up opencode `permission.bash` rules that deny destructive git commands before they execute.

## What Gets Blocked

- `git push` and force-push variants
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

## Steps

### 1. Ask Scope

Ask the user: install for **this project only** (`opencode.json`) or **all projects** (`~/.config/opencode/opencode.json`)?

### 2. Edit Config

Merge these rules into the chosen `opencode.json` file. Preserve existing fields.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "ask",
      "git push*": "deny",
      "git * push*": "deny",
      "git reset --hard*": "deny",
      "git clean -f*": "deny",
      "git clean -fd*": "deny",
      "git branch -D*": "deny",
      "git checkout .": "deny",
      "git restore .": "deny"
    }
  }
}
```

If `permission.bash` already exists, add the deny rules after broader rules. opencode uses the last matching permission rule.

### 3. Ask About Customization

Ask if the user wants to add or remove blocked patterns. Keep destructive defaults denied unless the user explicitly opts out.

### 4. Verify

Tell the user to quit and restart opencode. Config is loaded once at startup.

After restart, ask opencode to run a blocked command such as `git reset --hard`. It should deny the command before execution.
