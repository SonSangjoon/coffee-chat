# Coffee Chat Skill architecture

**Status:** Design baseline

**Date:** 2026-08-04

Skills are the Agent-facing execution guides for Coffee Chat operations. Every
Skill uses the `coffee-*` namespace, while its description makes the trigger,
purpose, and boundary discoverable before the Skill body is loaded.

## 1. Naming contract

Every Skill name must:

- start with `coffee-`;
- use lowercase ASCII letters, digits, and single hyphens;
- name the operation it performs, not an internal file or implementation;
- remain short enough to recognize in an Agent Skill list;
- have no compatibility alias or retired duplicate name.

`Operation Preview` is not a Skill. It is the common protocol used by
state-changing Skills.

## 2. Description contract

The frontmatter `description` is the Skill's discovery contract. It must start
with `Use when` and answer three questions in one concise sentence:

1. What user request or runtime condition triggers this Skill?
2. What product operation does it perform?
3. What boundary does it respect or what result does it produce?

The description may state the operation's purpose and output, but it must not
try to contain the full workflow. Detailed steps, safety rules, references, and
Operation Preview handling belong in the Skill body.

Descriptions for internal transformations explicitly say `Use internally when`
so they are not mistaken for direct user commands.

## 3. Canonical Skill set

| Skill            | Canonical description                                                                                                                                                                                                  | Role                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `coffee-build`   | `Use when a user wants to build a new independent Coffee Chat from an Agent with no existing Coffee Chat repository; create a new coffee-chat-* instance without using the invoking repository as a source or target.` | User-facing orchestration.          |
| `coffee-connect` | `Use when a user wants to connect an existing coffee-chat-* instance to the current session or work repository; create only project-local connection state and never copy personal records.`                           | User-facing connection.             |
| `coffee-harvest` | `Use when a user wants to turn one or more explicit Origins into a durable Green Bean that records their POV in the canonical Coffee Chat repository.`                                                                 | Durable authoring.                  |
| `coffee-roast`   | `Use internally when Coffee Chat or Coffee Pairing needs relevant Green Beans selected and formed into an ephemeral contextual Bean for the current question or task.`                                                 | Internal contextual selection.      |
| `coffee-brew`    | `Use internally when a Bean must be applied to an Agent to create ephemeral Coffee for the current Coffee Chat or Coffee Pairing context.`                                                                             | Internal Agent conditioning.        |
| `coffee-chat`    | `Use when a user wants a read-only conversation with Coffee from an explicit verified coffee-chat-* instance; do not write to the instance or work repository.`                                                        | User-facing conversation.           |
| `coffee-pairing` | `Use when a user wants to apply Coffee to one explicitly named project or task; write only the approved target after Review changes.`                                                                                  | User-facing controlled application. |
| `coffee-update`  | `Use when a user explicitly requests an Engine, Coffee Chat instance, or connected work-repository update; preserve personal records and require exact ownership checks.`                                              | User-facing lifecycle update.       |

The descriptions are intentionally explicit about `coffee-chat-*`, durability,
and write boundaries. A Skill list should let an Agent distinguish Build from
Connect, Harvest from Roast, and Coffee Chat from Coffee Pairing without reading
the full bodies.

## 4. Skill responsibilities

### `coffee-build`

Own the Build scene from target selection through independent repository
initialization. Build creates the repository baseline but does not silently
create the first Green Bean. Repository creation and first Harvest use separate
Operation Previews.

### `coffee-connect`

Verify an explicit individual instance and create or refresh only the
project-local `.coffee-chat` integration. Connect does not copy Origins, Green
Beans, Bean, Coffee, or personal prose into the work repository.

### `coffee-harvest`

Own the only durable POV write. Harvest may write approved Origin metadata and
Green Bean prose to the canonical instance after `Review changes`. It must keep
Origin material, author POV, and Unknowns distinct.

### `coffee-roast`

Select relevant Green Beans for the current context and produce an ephemeral
Bean. Roast does not write a Taste profile or modify the canonical repository.

### `coffee-brew`

Apply the contextual Bean to the Agent and produce ephemeral Coffee. Brew does
not write the Bean, Coffee, task result, or personal record.

### `coffee-chat`

Conduct a read-only conversation with verified Coffee. Coffee Chat may read
relevant provenance and Green Beans but must not mutate the instance, work
repository, or current task.

### `coffee-pairing`

Apply Coffee to one explicitly named project or task. Pairing requires an
Operation Preview and can write only the approved target. It never writes the
result back into the canonical Coffee Chat repository.

### `coffee-update`

Coordinate explicit Engine, instance, or connection updates. It checks
ownership and preimage digests, preserves Origins and Green Beans, and stops on
conflicts. It does not provide a silent migration or compatibility route.

## 5. Loading and routing

The Agent selects a Skill by reading the current repository role and the Skill
description before loading the Skill body. The body then supplies the full
operation contract and references.

Only the selected Skill and its direct references should be loaded. Internal
`coffee-roast` and `coffee-brew` are invoked by `coffee-chat` or
`coffee-pairing`; they are not offered as independent user journeys.

State-changing Skills must invoke the Operation Preview contract. Read-only
Skills may expose context and provenance summaries but do not request write
approval.

## 6. Replacement rule

The implementation must rename and route Skills directly to this canonical set.
The old names are not retained as aliases, and old descriptions are not
preserved for compatibility. Skill bodies, generated manifests, `AGENTS.md`,
tests, fixtures, and host plugin projections must move together.

## 7. Evaluation requirements

Each Skill needs both metadata and behavior checks:

- metadata test: name matches `coffee-*` and description contains a concrete
  trigger, purpose, and boundary;
- routing test: the correct Skill is selected for its scene;
- boundary test: the Skill does not perform another Skill's write;
- quality test: its output satisfies the scene's evaluation rubric;
- Operation Preview test: every state-changing Skill produces a complete,
  target-bound Preview before writing.

Updating a description without updating its body, route, and evaluation is an
incomplete Skill change.
