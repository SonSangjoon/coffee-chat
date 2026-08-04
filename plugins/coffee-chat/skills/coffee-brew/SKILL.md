---
name: coffee-brew
description: Use when an owner wants to brew a Taste Bean into Coffee for a Coffee Chat or Coffee Pairing task.
compatibility: Requires a verified public Coffee Chat instance and a current conversation or named task scope.
---

# Coffee Brew

Read the [shared method](references/method.md) completely before preparing
Agent context.

Coffee Brew turns the current Taste/Bean into Coffee: it invokes Coffee Roast
for the current session or task, then gives the Agent that Taste for the bounded
scope.

## Boundary

- Coffee is the Agent context with Taste applied; Brew does not change Agent
  configuration, system prompts, or global memory.
- Brew does not persist Taste, Agent context, or query output.
- Brew preserves the Green Bean and Origin provenance selected by Roast.
- Brew ends when the Coffee Chat session or Coffee Pairing task ends.

Coffee Harvest is the only canonical writer. Route every Green Bean mutation
through its external Candidate, complete Preview, and later literal digest
approval. Never persist agent-conditioned interpretations, scores, or query
caches.
