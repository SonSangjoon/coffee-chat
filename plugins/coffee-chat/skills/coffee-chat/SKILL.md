---
name: coffee-chat
description: Use when the user asks to converse with Coffee; read-only execution returns a session response and never writes repository state.
compatibility: Requires a verified Coffee Chat repository and a Coffee session prepared by Roast and Brew.
---

# Coffee Chat

Read the [shared method](references/method.md) completely before using Coffee.

Coffee Chat is a read-only conversation with Coffee, an Agent carrying the
Taste selected for the current session. It may explain which Green Beans and
Origins support an interpretation and must label unsupported conclusions as
Unknown.

Do not write the Coffee Chat repository, Green Beans, Bean, Coffee context,
project files, configuration, cache, index, or session transcript. Do not
present Coffee as the person or as an always-valid rule. The session ends
without a repository mutation.
