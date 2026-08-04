---
name: coffee-roast
description: Use when Coffee Chat or Coffee Pairing needs Green Beans roasted into Taste Beans.
compatibility: Requires a verified public Coffee Chat instance and a current conversation or Coffee Pairing task scope.
---

# Coffee Roast

Read the [shared method](references/method.md) completely before selecting any
Green Bean.

Roast is the transformation from Green Bean to Bean. It selects the relevant
approved Green Beans for the current Coffee Chat session or Coffee Pairing
task, then identifies the recurring criteria, emphases, tensions, and Unknown
boundaries supported by those records.

Roast is contextual and ephemeral:

- it does not build a global Taste profile;
- it does not expose Taste as a public summary;
- it does not write a Taste schema, graph node, cache, or query record;
- it preserves the Green Bean and Origin provenance used for the result.

Coffee Brew, Coffee Chat, and Coffee Pairing may invoke Roast internally. Do not
start a separate public conversation from a Roast result.
