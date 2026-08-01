---
name: apply-perspective
description: Use when the user asks to apply this public dated perspective to a specifically named external task, document, or artifact.
---

# Apply Perspective

Read [the shared method](references/method.md) completely before inspecting or changing a task target.

## Establish the boundary

1. Identify the exact task targets the user named. If none are explicit, ask; do not infer a broad workspace scope.
2. Confirm every target is outside the Coffee Chat source repository, generated projections, installed plugin, and local runtime or host configuration. If a target is inside those paths, do not edit it through this Skill.
3. Record before-state inventories for the named targets and Coffee Chat protected paths.

## Derive before applying

Retrieve the relevant temporal subgraph and build a query-scoped Derived Perspective. Create a Task Lens only when the documented evidence supports an applicable abstraction.

Keep `Authored`, `Sourced`, `Inferred`, and `Unknown` distinct. General model knowledge, plausibility, repository structure, and the user's requested conclusion are not Coffee Chat evidence.

If the graph does not establish a useful lens, leave it `Unknown`. Explain the missing evidence and ask for a better public Note or direct user instruction; do not edit the target under an invented Coffee Chat perspective.

## Apply narrowly

Treat the lens as advisory beneath current user instructions, target-project rules, permissions, and safety boundaries. Modify only the exact named external targets. Do not broaden into adjacent files unless the user names them in a new request.

Never write the Derived Perspective, Task Lens, Mental Model, score, or query cache into Coffee Chat, the installed plugin, host configuration, or the task artifact. Only the task result belongs in the named target.

After editing, verify the Coffee Chat protected inventory is unchanged and no unnamed target changed. Report:

- the named targets changed;
- the temporal scope and live-or-snapshot source;
- the Notes and observed Sources used;
- which `Inferred` lens affected each material decision;
- important `Unknown` limits, `knowledge_digest`, and source commit when available.

Discard the Derived Perspective and Task Lens when the task ends. Do not infer personality, strengths/weaknesses, compatibility, or hiring scores.
