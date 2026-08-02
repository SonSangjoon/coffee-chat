---
name: apply-perspective
description: Use when the user asks to apply this public dated perspective to a specifically named external task, document, or artifact.
compatibility: Requires access to public URLs, local files, Git, and explicitly named task files.
---

# Apply Perspective

Read the [shared method](references/method.md) completely before inspecting or changing a task target.

## Role and target

- Engine: require an explicit public instance `repository.url` or `pages_url`; verify its instance manifest and generated index through the shared method before deriving or editing.
- Instance: use only its verified live public target, with disclosed snapshot fallback when live retrieval fails.
- Task: require exact user-named targets outside Coffee Chat canonical, generated, plugin, Pages, cache, runtime, and configuration paths. Ask when any target or boundary is ambiguous.
- Evidence: if verification fails or the graph does not support an applicable Task Lens, return `Unknown` and leave every target unchanged.

## Side effects

Edit only exact named external task targets, then verify the complete diff against before-state inventories. Never edit protected or unnamed paths, and never persist the Derived Perspective, Task Lens, Mental Model, score, or query cache anywhere—including in the task artifact. Discard query-time derivations after reporting their evidence and limits.
