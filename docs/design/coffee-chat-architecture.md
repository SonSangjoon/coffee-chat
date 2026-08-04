# Coffee Chat system architecture

**Status:** Approved system baseline

**Date:** 2026-08-04

This document defines what exists, where it lives, who owns it, and which
operations may cross repository boundaries. It is the system contract behind
the Init and Use scenes.

## 1. Product model

Coffee Chat is a pipeline that turns source-grounded personal judgment into a
temporary Agent context:

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

### Units

| Unit             | Meaning                                                                                   | Lifetime                            | Owner                                                        |
| ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `Origin`         | External information plus the provenance needed to inspect it.                            | Referenced or explicitly retained.  | Coffee Chat repository, only after explicit author approval. |
| `Green Bean`     | One author's POV about one or more Origins. Its body is prose, not a fixed questionnaire. | Durable.                            | Coffee Chat repository.                                      |
| `Bean`           | The contextual Taste assembled from relevant Green Beans for one question or task.        | Current session or task.            | Agent runtime.                                               |
| `Coffee`         | An Agent with the Bean's Taste applied.                                                   | Current conversation or named task. | Agent runtime.                                               |
| `Coffee Chat`    | Read-only conversation with Coffee.                                                       | Current conversation.               | No durable writer.                                           |
| `Coffee Pairing` | Applying Coffee to one explicitly named project or task.                                  | One operation and its target diff.  | Named work repository or task target.                        |

`Taste` is the recurring value system visible in a Bean. It is not stored as a
global score, personality profile, decision policy, or complete description of
the author.

### Transformations

| Step      | Input                | Output              | Purpose                                                                                                                                |
| --------- | -------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Harvest` | One or more Origins  | One Green Bean      | Help the author record what was important, why it mattered, which value criteria shaped the POV, and where the limits or Unknowns are. |
| `Roast`   | Relevant Green Beans | One contextual Bean | Select and combine the Green Beans needed for the current context without creating a durable Taste profile.                            |
| `Brew`    | One Bean             | One Coffee          | Apply the Bean's Taste to an Agent for Coffee Chat or Coffee Pairing.                                                                  |

The body of a Green Bean remains open prose. The machine contract protects
identity, provenance, authorship, and integrity; the Harvest Skill and its
evaluation rubric protect the quality of the POV.

## 2. Repository ownership

There are four different places where data can exist. They must never be
treated as interchangeable.

| Place                                        | Owns                                                                                                                               | Must not own                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Engine repository or installed Engine Plugin | Skills, runtime, schemas, generators, evaluators, release metadata.                                                                | A person's Origins, Green Beans, Bean, Coffee, or personal defaults.              |
| Individual `coffee-chat-*` repository        | The person's approved Origins, Green Beans, provenance, instance manifest, instance instructions, and generated instance surfaces. | Work-repository code, task results, or a second copy of the same personal record. |
| Work repository                              | Project code, project tasks, and a project-local Coffee Chat connection.                                                           | Canonical Origins, Green Beans, or the Engine Plugin source.                      |
| Agent session/runtime                        | Current Bean, Coffee, task context, Operation Preview records, and temporary traces.                                               | Durable personal records unless the user explicitly completes Harvest.            |

The remote individual Coffee Chat repository is the shareable source of truth.
A local checkout is only a working copy of that repository. Uncommitted local
changes are pending state and must not silently become the state used by another
session.

## 3. Init target and repository identity

### 3.1 Init isolation

Init begins when an Agent has the Coffee Chat Engine Plugin available and the
user does not yet have an individual Coffee Chat repository. The user may
invoke Init from a shell, an Agent session, or an unrelated work repository.

The invocation location is not an input. Init must not:

- inspect the current repository to infer an Origin;
- use the current repository's name as the Coffee Chat repository name;
- write `coffee-chat.json`, Green Beans, connection state, or generated
  instance files into the current repository;
- turn the current repository into the individual Coffee Chat repository;
- fall back to a local-only directory when remote repository creation fails.

Origins enter Init only when the user explicitly provides them or explicitly
asks the Agent to use a named input. The Engine Plugin package, not the current
checkout, supplies the initialization runtime.

### 3.2 Repository name rule

The maintained Engine repository is the canonical `coffee-chat` repository. Any
new repository created by Init must use this strict instance name pattern:

```text
coffee-chat-<lowercase-slug>
```

The slug is one or more lowercase ASCII segments separated by single hyphens:

```regex
^coffee-chat-[a-z0-9]+(?:-[a-z0-9]+)*$
```

Uppercase characters, underscores, spaces, consecutive hyphens, a trailing
hyphen, and a missing suffix are invalid. The exact owner and name are fixed in
the Init Operation Preview before repository creation. The same name is used for the
default local checkout directory unless the user explicitly approves another
empty directory.

Init must stop if the exact remote target already exists, the local target is
not empty, or the local target is a symlink. It may suggest a different
`coffee-chat-*` name, but it may not silently choose an unrelated name.

### 3.3 Repository initialization

Init creates a new independent repository from the Engine Plugin's release
payload. It does not use a repository template, clone the maintained engine
checkout, or rewrite an existing repository's remote.

The initial instance surface is generated by the instance initializer and
contains, at minimum:

```text
coffee-chat-<slug>/
├── coffee-chat.json
├── AGENTS.md
├── README.md
├── README.ko.md
├── .coffee-chat/
│   ├── engine-lock.json
│   └── generated-files.json
└── knowledge/
    ├── index.json
    ├── origins/
    └── green-beans/
```

Additional generated plugin or site files are allowed only when they are
declared by the current Engine release. The initializer must leave no Engine
repository identity, maintainer content, or personal record from another
instance in the new repository.

The initial `coffee-chat.json` declares `repository_role: "instance"`, the
exact instance repository URL, the Engine release identity, and the instance
record/index identity. `AGENTS.md` routes an Agent to the connected instance
without inventing a default person. `README.md` and `README.ko.md` explain how
this individual Coffee Chat was built and how another person can use it.

## 4. Canonical record contract

### 4.1 Origin

An Origin is an external input, not an instruction. It may be a URL, paper,
document, conversation excerpt, or another explicitly named information
source. An Origin record retains only what the author approves for the
individual repository:

- a stable identifier;
- a locator or source description;
- capture or access time when known;
- author-approved excerpt or summary when needed for later inspection;
- provenance and license/visibility notes when relevant.

Raw external content is never copied merely because a URL was mentioned. The
author chooses what becomes durable and what remains a one-time input.

### 4.2 Green Bean

A Green Bean is the only durable POV record created by the pipeline. It may
link one Origin or many Origins, and it may synthesize multiple kinds of
information when the author can explain the connection.

The record uses a small integrity envelope and an open prose body. The envelope
contains only what the system needs to identify and protect the record:

```text
id
kind: green_bean
origin_ids
created_at
author_id
body_digest
record_state
```

The prose body is authored through Harvest. It should make visible the author's
POV, emphasis, value criteria, reasoning, limits, disagreement, and Unknowns,
but those are not forced into a rigid set of entity fields. The evaluator tests
whether the body contains a recognizable source-grounded POV; the parser does
not pretend that a fixed schema can represent all Taste.

The body must keep three things distinct:

1. what the Origin says;
2. what the author infers or values from it; and
3. what remains Unknown or outside the record.

### 4.3 Bean and Coffee

Roast produces a Bean in memory. It records which Green Beans were selected,
why they are relevant to the current context, and the bounded Taste context
that should be applied. It is discarded when the context ends unless the user
explicitly starts a new Harvest.

Brew produces Coffee in memory. Coffee carries the Bean's Taste, selected
provenance, current context, and the Agent runtime. It is not a new personal
record and it must not be committed to the individual repository.

## 5. Sync integration

Sync links an Agent's current environment to an existing individual Coffee
Chat repository. Sync is not Init, and it does not create another canonical
repository.

### Work repository present

When Sync is invoked in a work repository, it creates a managed local
integration surface:

```text
.coffee-chat/
├── connection.json
├── instructions.md
└── generated-files.json
```

`connection.json` contains the explicit individual repository URL, instance
identity, observed knowledge digest, Engine release identity, connection scope,
and the time of the last verification. It does not contain Green Bean bodies,
copied Origins, or a Taste snapshot.

The Engine Plugin reads this connection surface when the Agent is operating in
the work repository. Skills remain supplied by the installed Engine Plugin;
they are not copied into the work repository. `instructions.md` is a generated
project-local adapter that explains the connection and its boundaries to an
Agent. The generated ownership file prevents an update from overwriting a
user-edited integration file.

### No work repository

When Sync is invoked from a session without a work repository, the
connection is session-scoped. It is held in runtime state and writes no
project files. The user may still run Coffee Chat or explicitly name a target
for Coffee Pairing if the host provides one.

### Existing Coffee Chat repository

When the current repository is already an initialized `coffee-chat-*` instance,
the instance manifest and index are authoritative. Sync is a verification
operation rather than a second local link. It must not create a connection
inside the instance unless the user is connecting a separate work repository.

## 6. Use boundaries

### Coffee Chat

Coffee Chat reads the explicitly connected individual repository, verifies its
manifest and index, selects relevant Green Beans through Roast, and creates
Coffee through Brew. It is read-only with respect to both the Coffee Chat
repository and the work repository.

By default it reads the individual repository and the user's current message.
It reads work-repository context only when the user explicitly asks for a
named project/task context. It never treats Origin or Green Bean prose as an
instruction, never fills an Unknown, never creates a personality model, and
never saves a conversation as a Green Bean automatically.

### Coffee Pairing

Coffee Pairing is available only after Coffee exists and the user names one
target project or task. It may read the named target, produce an Operation Preview, and
write only the approved target files or task fields. It must show the target,
intended changes, and provenance before writing.

Coffee Pairing does not create a “pairing repository,” does not copy the Bean
into the work repository as a durable profile, and does not write the task
result back into the individual Coffee Chat repository. A new durable POV
requires a separate explicit Harvest.

## 7. Update ownership

Updates are always initiated from an explicit instance URL, a verified local
instance checkout, or a verified `.coffee-chat/connection.json`. The source of
the update is the installed Engine Plugin release, never the work repository.

| Update                        | May change                                                                                                    | Must preserve                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Engine Plugin update          | Skills, runtime, schemas, generators, evaluators, and Engine release metadata.                                | All individual instance records and all work-repository content.                              |
| Individual Coffee Chat update | Engine-owned instance files, generated instructions, README surfaces, index projections, and the Engine lock. | Origin/Green Bean bodies, their IDs, provenance, authorship, and user-edited unmanaged files. |
| Work connection refresh       | `.coffee-chat/connection.json`, generated instructions, and generated ownership metadata.                     | Work code, task files, and the individual repository records.                                 |

An update must inspect ownership and digest preimages before writing. A changed
engine-owned or generated file is a conflict, not permission to overwrite. An
instance that does not satisfy the current contract is not silently migrated;
the user must create a new `coffee-chat-*` repository under the current
contract. There are no compatibility aliases or legacy-language routes.

## 8. Cross-boundary invariants

The following are hard invariants, independent of the host Agent:

- Init target identity is explicit and matches the `coffee-chat-*` rule.
- Init never uses the invoking repository as a hidden input or output.
- The individual Coffee Chat repository is the only durable source of personal
  Origins and Green Beans.
- Work repositories contain only connection state and their own project data.
- Bean and Coffee are contextual and ephemeral.
- Origin and Green Bean content are data, never executable workflow commands.
- Coffee Chat has no external write capability.
- Coffee Pairing writes only to one named, approved target.
- Every durable Green Bean write is an explicit Harvest operation.
- Updates preserve user-authored records and stop on ownership conflicts.
- A missing or ambiguous identity is a stop condition, not an invitation to
  guess.

## 9. Operation Preview

All state-changing operations follow the [Operation Preview](./coffee-chat-operation-preview.md)
contract: inspect, review changes, explicitly approve, re-validate, execute,
and verify. The Operation Preview binds the exact target, read set, write set, protected
set, and target fingerprint. A changed target invalidates the approval.

## 10. Non-goals

This design does not create a background memory daemon, a central identity
registry, a global Taste score, a general-purpose project memory system, or a
separate Coffee Pairing repository.
