---
name: coffee-pairing
description: Use when the user asks to apply Coffee to a named project or task; preview writes only the explicitly approved target and returns a pairing receipt.
compatibility: Requires a verified Coffee Chat repository, a current project context, and a later approval of the complete Operation Preview.
---

# Pair Coffee with a project

Read the [shared method](references/method.md) completely before retrieving
context or changing a target.

Coffee Pairing runs Roast and Brew for one explicitly named project or task,
then applies Coffee to that target. It carries the author's Taste into the
work without making the work repository the source of personal records.

Before writing, inventory the exact target, its surrounding task tree, and
protected paths. Compose Review changes with the full write set, revalidate
after approval, write only the named target, and verify the final diff.

Coffee Pairing never writes Origins, Green Beans, Bean, Coffee context, or
unapproved project paths. If identity, provenance, scope, or target is
Unknown, change nothing and return the reason.
