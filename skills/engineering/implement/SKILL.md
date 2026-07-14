---
name: implement
description: "Implement a piece of work based on a spec or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the spec or issues.

When the user gives an explicit source child issue, read the configured tracker operations and claim that child before editing. If a runner or coordinator owns lifecycle transitions, leave tracker state untouched and emit its required claim/completion signals instead.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.

After successful review and commit, complete every explicit source child through the configured tracker: close Beads or hosted-tracker work, or set local Markdown `status: closed` and commit that tracked transition. Record the implementation commit and verification evidence on the child. If a runner or coordinator owns completion, leave tracker state untouched and emit its required completion signal instead. Never close the coordination parent/spec.
