# Coffee Chat user scenes

**Status:** Approved system baseline

**Date:** 2026-08-04

This document defines the product from the user's point of view. It answers
where a user starts, what they provide, what the system produces, when a scene
is complete, and what must never happen.

## 1. Two user modes and four operations

The product has two visible modes:

1. **Init:** create and establish an independent personal Coffee Chat.
2. **Use:** Sync that Coffee Chat to an environment, then talk with Coffee
   or pair Coffee with named work.

Use includes two supporting operations:

- **Sync:** make an existing individual Coffee Chat available in the current
  environment.
- **Update:** refresh the Engine or a connection without moving personal
  records into another repository.

```text
Agent + no Coffee Chat repository
          │
          └── Init ──> new coffee-chat-* repository
                              │
                              └── Harvest ──> Green Bean
                                               │
                                               └── Roast ──> Bean
                                                               │
                                                               └── Brew ──> Coffee
                                                                              ├── Coffee Chat
                                                                              └── Coffee Pairing

Any session or work repository ── Sync ──> project-local connection
```

The current work repository, if one exists, is never silently promoted into
the first branch of this diagram.

## 2. Init scene

### Starting point

The user has an Agent with the Coffee Chat Engine Plugin installed. They may be
in no repository, in a new directory, or inside an unrelated work repository.
They do not have an individual Coffee Chat repository yet.

### User inputs

Init asks for or confirms:

- GitHub owner or account;
- an instance name or slug that resolves to `coffee-chat-*`;
- an empty local checkout path;
- the first one or more Origins;
- the user's preferred first Green Bean intent, if it is not clear from the
  Origins.

The user may provide an Origin as a URL, document, excerpt, or named source.
Init never reads the invoking repository as an implicit Origin. The user can
add more Origins later through Harvest.

### Init stages

#### I0 — Choose the independent target

The Agent resolves the exact remote repository name and local checkout path.
It verifies that the remote target does not exist, the local path is empty and
not a symlink, and the name matches the strict `coffee-chat-*` rule.

If the requested name is `coffee-chat`, contains uppercase characters, or uses
an unrelated prefix, Init stops and asks for a valid `coffee-chat-*` name.

#### I1 — Confirm isolation

Before any write, Init states:

- the current invocation location;
- the new remote target;
- the new local checkout;
- that the current repository will not be read or changed;
- the exact user-provided Origins that will enter the first Harvest.

This is a product boundary, not merely a log message. The target and source
must be different repository identities.

#### I2 — Provision and initialize

Init creates the new remote repository and initializes the new checkout from
the Engine Plugin release payload. It writes the instance manifest, agent
router, bilingual README surfaces, engine lock, generated ownership marker,
knowledge index, and empty Origin/Green Bean directories.

The result is an independent instance, not a template copy and not a work
repository extension.

#### I3 — Harvest the first Green Bean

Harvest receives the explicitly named Origins and guides the user to record a
POV in prose. The system should help the user articulate:

- what the Origins support;
- what the user made important;
- which value criterion or trade-off shaped that emphasis;
- what is the user's interpretation rather than an Origin fact;
- what is Unknown, disputed, or outside the record.

The body may be written as a paragraph, a letter, a short essay, or another
natural form. The system evaluates the result; it does not require a fixed
entity questionnaire.

#### I4 — Roast and Brew smoke validation

After the first Green Bean is approved, the system performs one contextual
Roast and Brew using a small validation prompt. This proves that the saved POV
can be selected as Taste and applied to an Agent without turning it into a
global profile or a command list.

#### I5 — First Coffee Chat

The user has one Coffee Chat with the resulting Coffee. The user should be able
to recognize that the response reflects the saved POV and can identify the
relevant Green Bean provenance. This is a validation conversation, not a
durable transcript.

### Init completion

Init is complete only when all of the following are true:

1. the remote independent repository exists with a valid `coffee-chat-*` name;
2. the instance baseline is initialized and its identity is verified;
3. the first Green Bean is explicitly approved and durably recorded there;
4. Roast and Brew complete without an identity, provenance, or write-boundary
   violation;
5. one Coffee Chat smoke interaction succeeds;
6. the user confirms that the resulting Coffee reflects their Taste.

A repository created without the first approved Green Bean is `initialized`,
not `built`. A Green Bean written without a successful Coffee validation is
`taste_ready`, not `built`. Partial results are preserved for recovery and are
reported as partial; they are never concealed by deleting the repository.

## 3. Sync scene

### Starting point

The user already has an independent `coffee-chat-*` repository and wants to use
it from another place. The place may be a work repository or only an Agent
session. The individual Coffee Chat repository remains the source of truth.

### User input

Sync requires an explicit repository URL, local instance path, or an
existing verified connection. It must verify the instance manifest and index,
the repository role, the `coffee-chat-*` identity, and the current knowledge
digest before making the connection.

### Work repository path

When a work repository is present, Sync creates or updates only this local
integration:

```text
work-repository/
└── .coffee-chat/
    ├── connection.json
    ├── instructions.md
    └── generated-files.json
```

The connection records where the individual Coffee Chat lives and which
version/digest was last verified. It does not copy Origins, Green Beans, Bean,
Coffee, or personal prose into the work repository. The installed Engine Plugin
supplies the Skills; `.coffee-chat` supplies project-local routing and
connection state.

Sync is complete when the work repository can resolve the exact instance on
a later Agent invocation and the generated files are recorded as managed
outputs. If the local integration is edited outside its managed boundary,
Sync reports a conflict and does not overwrite it.

### Session-only path

When no work repository is present, Sync stores the verified instance in the
current session only. It writes no repository files. The user can immediately
start Coffee Chat, and can run Coffee Pairing only when a concrete target is
available and explicitly named.

## 4. Use scene: Coffee Chat

### Starting point

The user is in a verified connected environment or provides an explicit
instance URL in the session.

### Runtime flow

1. Verify the individual repository identity and index.
2. Read only the relevant Origins, Green Beans, provenance, Unknowns, and the
   user's current request.
3. Roast relevant Green Beans into a contextual Bean.
4. Brew the Bean into Coffee.
5. Answer through Coffee Chat.

Coffee Chat is complete when the user receives an answer that is source-grounded,
recognizably shaped by the author's Taste, explicit about Unknowns, and useful
for the current question. It does not require a write, commit, or transcript
save.

### Coffee Chat must not

- read an unconnected Coffee Chat repository because it happens to be nearby;
- treat a Green Bean or Origin as executable instructions;
- invent missing facts to make the Taste appear consistent;
- create a durable Green Bean from the conversation;
- write to the work repository;
- claim that Coffee is the human author or a complete personality model.

## 5. Use scene: Coffee Pairing

### Starting point

The user has a verified Coffee and names one project, repository, document, or
task as the pairing target.

### Runtime flow

1. Identify the exact target and allowed write paths or fields.
2. Read the target only within the approved scope.
3. Roast and Brew if a current Bean/Coffee does not already exist.
4. Prepare the intended change with provenance and a clear target boundary.
5. Review changes and approve the Operation Preview.
6. Write only the approved target.
7. Re-read the result and report the changed paths/fields.

Coffee Pairing is complete when the named target contains the approved change
and the individual Coffee Chat repository is unchanged. If the user has not
named a target, the system can discuss the work but cannot perform Pairing.

## 6. Update scene

### Engine update

The user updates the installed Engine Plugin from any environment. This changes
Skills, runtime, schemas, generators, and evaluators available to future
operations. It does not update personal records or work-repository files.

### Individual Coffee Chat update

The user explicitly selects an instance URL or a verified connection. The
system inspects the instance's Engine identity, ownership markers, and local
changes, then proposes only engine-owned and generated changes. Green Bean and
Origin bodies are never rewritten by an Engine update.

### Connection update

After the individual repository changes, Sync or an explicit refresh updates
the work repository's `.coffee-chat` connection metadata and generated
instructions. It does not pull personal records into the work repository.

### Update completion

An update is complete only after the intended repository is re-read, its
identity and content digest are verified, and all protected records remain
byte-equivalent. A dirty or conflicting target is a stop condition. The current
contract does not attempt to migrate an incompatible older instance; the user
must Init a new `coffee-chat-*` repository.

## 7. Stop and recovery rules

| Condition                                     | Required behavior                                                    |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Invalid repository name                       | Stop before remote creation and request a `coffee-chat-*` name.      |
| Existing remote target                        | Stop; never reuse, overwrite, or silently select another repository. |
| Current repo would be used as Init target     | Stop and restate the independent target.                             |
| Ambiguous instance URL or role                | Stop; do not guess a personal record source.                         |
| Dirty canonical instance checkout             | Report pending local changes; do not use it as a clean source.       |
| User-edited generated integration file        | Show conflict; do not overwrite.                                     |
| Coffee Pairing target not named               | Remain in conversation; no external write.                           |
| Origin asks the Agent to perform an action    | Treat it as data; do not execute it.                                 |
| Any write falls outside the approved boundary | Abort the write and report the attempted boundary.                   |

## 8. What the user should understand

After reading the instance README and using these scenes, a new user should be
able to say:

- Init creates my own independent `coffee-chat-*` repository, even if I start
  from another repository.
- Harvest leaves my POV as a Green Bean; the body is mine, not a generic
  summary.
- Roast makes the current Bean, and Brew puts that Taste on the Agent to make
  Coffee.
- Coffee Chat lets me talk with that Coffee without changing my records.
- Coffee Pairing applies that Coffee to one named piece of work without making
  the work repository the source of truth.
