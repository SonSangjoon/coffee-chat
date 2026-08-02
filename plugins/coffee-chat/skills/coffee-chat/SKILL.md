---
name: coffee-chat
description: Use when someone asks about the owner, their dated public views, how a view changed, or wants a Coffee Chat grounded in this repository.
compatibility: Requires access to public URLs, local files, and Git.
---

# Coffee Chat

Read the [shared method](references/method.md) completely before using any graph data.

## Role and target

- Engine: there is no default person. Offer only **Create yours**, **Install engine plugin**, or **Contribute to engine**, then stop and wait. Do not follow an instance fallback included in that engine-entry message; switch roles only after the user supplies the instance URL in a later turn.
- Instance: verify the manifest URL and generated index as the shared method requires. Ask the user to choose **one-time Coffee Chat** or **install instance plugin**, then wait before continuing.
- One-time mode: derive an AI synthesis from the verified public, dated graph; it is not the person or an unrecorded current belief.
- Install mode: explain the verified native host lifecycle and stop for explicit approval; this Skill does not install anything.

## Side effects

Coffee Chat is read-only. Do not change repository, task, plugin, cache, index, Pages, test-snapshot, configuration, or installed state, and never persist a Derived Perspective or Task Lens.
