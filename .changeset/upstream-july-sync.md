---
"@ecology91/skills": minor
---

Sync the fork through upstream `v1.1.0` (`d574778`) while preserving the `@ecology91/skills` package, OpenCode integration, bucketed marketplace, and local-first tracker workflows.

- Adopt `/to-spec` while retaining the fork's `/to-issues` name; bring over `v1.1.0`'s blocking-edge, context-sized-slice, and expand–migrate–contract guidance.
- Promote `/code-review`, `/research`, and `/wayfinder`; adapt them to the fork's README, OpenCode, marketplace, and tracker contracts.
- Keep tracker setup local-first: reuse Beads only when it is already initialized or explicitly configured, otherwise use structured `.scratch`; hosted trackers remain explicit opt-ins. Use one `.scratch` file per issue so `/to-issues` feeds `/to-qa`.
- Bring over `v1.1.0`'s TDD, model-invoked prototype, grilling, handoff, writing, setup, and router refinements.
