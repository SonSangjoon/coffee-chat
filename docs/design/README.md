# Coffee Chat design

**Status:** Approved system baseline

This directory contains the maintained design baseline for Coffee Chat. The
README explains the product. These documents explain the system that must make
the product true.

## Canonical product language

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

`Origin`, `Green Bean`, `Bean`, and `Coffee` are product units. `Harvest`,
`Roast`, and `Brew` are transformations between units. `Taste` is the value
system carried by a contextual `Bean`; it is not a separate durable profile.

All new user-facing contracts, Skills, schemas, generated files, and
documentation use this language. Compatibility aliases and migration layers
are not part of this design baseline.

## Document map

| Document | Responsibility |
| --- | --- |
| [`coffee-chat.md`](./coffee-chat.md) | Short canonical contract and pipeline summary. |
| [`coffee-chat-architecture.md`](./coffee-chat-architecture.md) | Repository ownership, data lifecycle, source of truth, and security boundaries. |
| [`coffee-chat-user-scenes.md`](./coffee-chat-user-scenes.md) | Build, Connect, Use, and Update journeys, including completion and stop conditions. |
| [`coffee-chat-evaluation.md`](./coffee-chat-evaluation.md) | Evaluation-first quality gates and gold cases for every transformation and experience. |
| [`coffee-chat-operation-preview.md`](./coffee-chat-operation-preview.md) | The common approval, scope, revalidation, and Receipt contract for state-changing operations. |
| [`coffee-chat-skills.md`](./coffee-chat-skills.md) | Canonical Skill names, descriptions, responsibilities, routing, and evaluation rules. |
| [`../research/2026-08-04-coffee-chat-ux-research.md`](../research/2026-08-04-coffee-chat-ux-research.md) | Product reasoning behind the language and two-step journey. |

## Fixed decisions

1. Build starts with an Agent and no existing Coffee Chat repository.
2. Build always creates a new independent Coffee Chat repository.
3. The repository that invoked Build is never the Build target, storage
   location, or implicit Origin.
4. Every new instance repository must match
   `^coffee-chat-[a-z0-9]+(?:-[a-z0-9]+)*$`.
5. The individual `coffee-chat-*` repository is the single source of truth for
   that person's Origins, Green Beans, provenance, and instance configuration.
6. Connect creates a project-local integration surface; it does not copy
   personal records into the work repository.
7. Coffee Chat is read-only. Coffee Pairing can write only to one explicitly
   named work target.
8. Bean and Coffee exist only for the current conversation or named task.
9. Operation Preview is the common approval boundary for every state-changing
   operation. Its user-facing action is `Review changes`.
10. Every Skill uses the `coffee-*` namespace, and its description states the
    trigger, operation, and boundary clearly.

## Design status

This is the design baseline for the next implementation cycle. It is not a
claim that the current implementation already satisfies every contract. The
implementation must be changed to conform to these documents, with evaluation
cases written before each behavior is rebuilt.
