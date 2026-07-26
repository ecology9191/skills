---
name: opensrc
description: Inspect package or repository source code as a hard source of truth.
disable-model-invocation: true
---

# opensrc

Use `opensrc` when package or upstream repository source code is the source of truth.

`opensrc` resolves packages from registry APIs, shallow-clones the matching source, and caches it globally at `~/.opensrc/`. It is already installed globally.

## Agent Usage

1. Identify the package, registry package, or repository that should be checked.
2. Run `opensrc path <source>` to get its local source path.
3. Search and read files inside that path with normal local code tools.
4. Prefer source evidence over memory, docs, examples, or assumptions.
5. Use `--cwd <repo>` when the current project's lockfile should determine an npm package version.

Examples:

```bash
opensrc path zod
opensrc path zod@3.22.0
opensrc path pypi:requests
opensrc path pypi:flask@3.0.0
opensrc path crates:serde
opensrc path vercel/next.js
opensrc path gitlab:owner/repo
opensrc path bitbucket:owner/repo
```

Compose the returned path with local tools:

```bash
rg "parse" "$(opensrc path zod)"
rg "Router" "$(opensrc path vercel/next.js)/packages/next/src"
ls "$(opensrc path crates:serde)/src"
```

Multiple sources can be resolved together:

```bash
opensrc path zod react next
```

## Source Specifiers

- npm: `zod`, `npm:zod`, `zod@3.22.0`
- PyPI: `pypi:requests`, `pip:requests`, `python:requests`
- crates.io: `crates:serde`, `cargo:serde`, `rust:serde`
- GitHub: `owner/repo` or a GitHub URL
- GitLab: `gitlab:owner/repo` or a GitLab URL
- Bitbucket: `bitbucket:owner/repo` or a Bitbucket URL

## Cache Commands

Use these only when needed:

```bash
opensrc fetch zod pypi:requests crates:serde
opensrc list
opensrc list --json
opensrc remove zod
opensrc clean
```
