---
name: coffee-brew
description: Use internally when a Bean must be applied to an Agent; read-only execution returns Coffee with bounded context and writes nothing.
compatibility: Requires a verified Coffee Chat repository and a current conversation or named task context.
---

# Brew Bean into Coffee

Read the [shared method](references/method.md) completely before applying a
Bean to an Agent.

Brew takes the contextual Bean produced by Roast and applies its Taste to the
Agent for one bounded conversation or named task. Coffee is the resulting
Agent with Taste applied.

## Boundary

- Coffee is ephemeral Agent context, not a stored personality model.
- Brew does not change Agent configuration, global memory, or project code.
- Brew preserves the Green Bean and Origin references selected by Roast.
- Brew ends when the current Coffee Chat or Coffee Pairing operation ends.

Brew is read-only. It returns Coffee and its trace references without writing
the Coffee Chat repository, Bean, Green Bean, or a query cache.
