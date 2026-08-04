---
name: coffee-sync
description: Use when the user asks to synchronize a work repository with an explicit Coffee Chat repository; preview writes only .coffee-chat sync metadata and returns a sync receipt.
compatibility: Requires an explicit public Coffee Chat repository URL and a later approval of the complete Operation Preview.
---

# Synchronize a work repository with Coffee Chat

Read the [shared method](references/method.md) completely before inspecting a
work repository or an instance URL.

Sync links an existing work repository with an independent Coffee Chat
repository. The Coffee Chat repository remains the single source of truth;
the work repository stores only the relationship needed by the current Agent.

## Required verification

- Read the work repository instructions and coffee-chat.json.
- Read the explicit Coffee Chat repository's coffee-chat.json and
  knowledge/index.json.
- Confirm the public URL, repository role, instance identity, and index
  fingerprint match the requested target.
- Inspect the exact work-repository path before preparing the preview.

## Operation Preview

Compose Review changes with the source URL, target fingerprint, read set, exact
write set, protected set, generated instructions, and risk. Stop until the
user approves that exact digest. Revalidate the URL, fingerprint, and target
preimage immediately before writing.

## Write boundary

Sync may write only .coffee-chat/connection.json in the named work
repository and the external connect receipt. It must not write Origins, Green
Beans, Bean, Coffee, project code, configuration outside .coffee-chat, or the
independent Coffee Chat repository.

Sync is complete only when the metadata points to the verified instance and
the receipt proves that every protected path is unchanged.
