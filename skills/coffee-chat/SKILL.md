---
name: coffee-chat
description: Use when someone wants a read-only Coffee Chat with an Agent after Taste has been Brewed for the session.
compatibility: Requires access to public URLs, local files, and Git.
---

# Coffee Chat

Read the [shared method](references/method.md) completely before using any
graph data.

## Role and target

- Engine: there is no default person. Offer only **Create yours**, **Install engine plugin**, or **Contribute to engine**, then stop and wait. Do not follow an instance fallback included in the engine-entry message; switch roles only after the user supplies the instance URL in a later turn.
- Instance: verify the manifest URL and generated index as the shared method requires. Require a Coffee Brew session before answering.
- Chat mode: use Coffee Roast and Coffee Brew to produce Coffee—the Agent with Taste—from verified public, dated Green Beans; it is not the person or an unrecorded current belief.
- Install mode: explain the verified native host lifecycle and stop for explicit approval; this Skill does not install anything.

## Side effects

Coffee Chat is read-only. Do not change repository, task, plugin, cache, index,
Pages, test-snapshot, configuration, or installed state, and never persist an
Agent context, Taste projection, or chat interpretation.
