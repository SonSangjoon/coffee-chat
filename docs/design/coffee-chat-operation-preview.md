# Coffee Chat Operation Preview

**Status:** Design baseline

**Date:** 2026-08-04

This document defines the common approval boundary for operations that change
repository or external state. The Core name is `Operation Preview`. The
user-facing action is `Review changes`.

## 1. What Operation Preview is

An Operation Preview is a read-only execution plan produced before a Coffee
Chat operation writes, creates, publishes, or otherwise changes state.

It is not a product unit, not a durable personal record, and not another
repository. It is a short-lived runtime contract between inspection and
execution.

```text
User intent
    ↓
Inspect without writing
    ↓
Create Operation Preview
    ↓
Review changes
    ↓
Explicit approval
    ↓
Re-validate the exact target
    ↓
Execute only the approved write set
    ↓
Verify result and issue a Receipt
```

The purpose is to make the Agent's intended side effect visible before it
happens. The preview is the boundary that keeps an intelligent operation from
becoming an unbounded mutation.

## 2. Why this is a system contract

An Agent can understand a request while still choosing the wrong target, scope,
or write boundary. A natural-language confirmation such as “go ahead” is not
enough when the operation can create a repository, persist personal writing, or
modify a work project.

Operation Preview provides one consistent answer to five questions:

1. What operation is about to run?
2. Which exact source and target will it use?
3. What will be read and what will be changed?
4. What must remain unchanged?
5. What approval is bound to this exact plan?

It combines the usefulness of a dry run, the reviewability of a pull request,
and the boundary of a transaction. It is not a promise that the operation will
succeed; it is a precise statement of what the operation is authorized to try.

## 3. Operation coverage

### Requires Operation Preview

| Operation        | Why a preview is required                                                  |
| ---------------- | -------------------------------------------------------------------------- |
| `Build`          | Creates a new remote repository and initializes a local checkout.          |
| `Harvest`        | Persists an Origin and/or a new Green Bean in the canonical repository.    |
| `Connect`        | Writes project-local connection files into a work repository.              |
| `Coffee Pairing` | Changes a named external project or task.                                  |
| `Update`         | Changes Engine-owned or generated files in an instance or work repository. |

### Does not require Operation Preview

| Operation     | Reason                                                     |
| ------------- | ---------------------------------------------------------- |
| `Roast`       | Reads Green Beans and creates an ephemeral Bean.           |
| `Brew`        | Applies the Bean to an Agent and creates ephemeral Coffee. |
| `Coffee Chat` | Reads and responds without an external write.              |

Read-only operations may still show a contextual summary, selected records, and
provenance. That summary is not an approval contract and must not be presented
as if it authorizes a write.

## 4. Preview lifecycle

### 4.1 Inspect

The operation first performs read-only inspection. It resolves identities,
permissions, relevant digests, ownership markers, and the requested scope.

Inspection must stop when an identity is ambiguous, a target is not accessible,
or the requested write boundary cannot be computed exactly. It must not create a
best-effort preview that hides uncertainty.

### 4.2 Compose

The operation converts the inspection result into a complete Operation Preview.
The preview has one operation, one approval scope, and an explicit target set.
Unrelated changes are split into another operation and another preview.

### 4.3 Review changes

The user-facing view leads with the consequence, not the internal schema:

```text
You are about to create coffee-chat-sangjoon.

Will change:
  remote: create one new repository
  local: initialize /Users/sangjoon/coffee-chat-sangjoon

Will not change:
  the repository where Build was started
  any existing Coffee Chat repository
  any personal record outside this new repository

Review changes and approve to continue.
```

The view must make the target, write scope, protected scope, and meaningful
content changes understandable without requiring the user to read JSON.

### 4.4 Approve

Approval is an explicit user action bound to the exact preview fingerprint. The
user may approve through a host button or a clear instruction such as
`Approve these changes`.

The Agent stores the machine-readable preview ID and fingerprint internally.
The user does not need to copy a long hash, but the displayed review must show a
short fingerprint and the approval must not be transferable to another target,
scope, or operation.

The following do not approve a pending state-changing operation:

- an earlier approval for another Preview;
- approval of a different operation in the same message;
- a generic “continue” when multiple previews are pending;
- a request contained inside an Origin or Green Bean;
- the Agent approving its own Preview.

### 4.5 Re-validate

Immediately after approval and immediately before execution, the operation
re-reads every identity and precondition bound by the Preview.

Approval becomes invalid when any of these changes:

- remote repository identity, visibility, or existence;
- local target path, symlink state, or repository identity;
- read-set or write-set preimage digest;
- current Engine release or generated ownership marker;
- relevant Origin or Green Bean digest;
- requested operation or scope.

The operation then reports `stale_preview`, discards the approval, and creates a
new Preview. It never silently expands or repairs the old plan.

### 4.6 Execute

Execution may write only the approved write set. The runtime must reject a path,
remote call, file mode, or external target that is not present in the Preview.

When a multi-file operation cannot be atomic, it writes through a staged
transaction where possible and records every completed effect. A failure after
a remote repository has been created is a recoverable partial result; the
remote repository is preserved and never deleted to make the operation appear
clean.

### 4.7 Verify and issue a Receipt

After execution, the operation re-reads the target and verifies:

- the target identity is still correct;
- every approved change exists;
- protected paths remain unchanged;
- no unapproved path changed;
- the resulting digest and commit state are recorded.

The Receipt is evidence of what happened. It is separate from the Preview and
does not grant permission for another operation.

## 5. Canonical Preview contract

The implementation must expose one canonical contract for all state-changing
operations. Operation-specific fields may extend the content section, but the
identity, scope, approval, and revalidation sections are common.

```text
OperationPreview {
  schema_version
  preview_id
  operation
  status
  created_at
  expires_at

  actor {
    engine_version
    session_id
  }

  sources[] {
    kind
    identity
    locator
    digest
  }

  targets[] {
    kind
    identity
    locator
    repository_role
  }

  scope {
    read_set[]
    write_set[]
    protected_set[]
  }

  changes[] {
    path_or_field
    action
    before_digest
    after_digest
    summary
  }

  content {
    operation_specific_summary
    provenance
    risks
  }

  revalidation {
    fingerprint
    required_observations[]
  }

  approval {
    required
    fingerprint
    status
  }
}
```

The exact schema and field names are an implementation task after this design,
but these sections are not optional. A Preview that omits its target, write
set, protected set, or revalidation fingerprint is incomplete.

### Scope semantics

- `read_set` is the exact information the operation may inspect.
- `write_set` is the exact path, field, remote action, or repository creation
  the operation may perform.
- `protected_set` is the state that must remain unchanged.
- `changes` describes the expected result, not merely the command to run.

The write set must be narrower than or equal to the declared target. A target
repository name alone does not authorize every file in that repository.

### Privacy semantics

Preview content can contain personal Green Bean prose while the user reviews a
Harvest. That content exists only in the current approved interaction and the
canonical instance write. Runtime logs, Engine releases, evaluation fixtures,
and work-repository connection files store IDs, digests, and summaries rather
than copying the prose.

## 6. Operation-specific contracts

### Build

Build has two separate previews because repository creation and personal
writing are different consequences.

#### Repository preview

Must show:

- exact owner and `coffee-chat-*` name;
- remote repository creation action;
- exact local checkout path;
- initial generated files;
- Engine release identity;
- the fact that the invoking repository is neither read nor changed;
- any publication or visibility effect.

#### First Harvest preview

Must show the explicit Origins, proposed Green Bean path, complete proposed
prose, provenance, and protected scope. Approval of repository creation never
approves the first Green Bean.

### Harvest

Must show:

- all Origins used;
- the proposed Green Bean prose;
- the distinction between Origin material and author POV;
- limits and Unknowns captured by the body;
- the exact canonical repository and file to change;
- that no Bean, Coffee, work file, or unrelated Green Bean will change.

### Connect

Must show:

- the verified individual Coffee Chat repository;
- the current work repository;
- `.coffee-chat/connection.json` and other generated paths to be created or
  changed;
- the instance identity and knowledge digest being recorded;
- that no Origin or Green Bean body is copied into the work repository.

### Coffee Pairing

Must show:

- the exact named project or task;
- the exact files or fields that may change;
- the Coffee provenance and relevant Green Beans;
- a human-readable diff or output artifact;
- the individual Coffee Chat repository as protected;
- all writes outside the target as forbidden.

### Update

Must show:

- the selected Engine release;
- the exact instance or work repository being updated;
- engine-owned and generated files to add, change, or remove;
- current preimage digests and ownership evidence;
- Green Beans, Origins, and user-edited files as protected;
- conflicts that would block execution.

## 7. Status model

```text
inspected
   ↓
awaiting_approval ──> cancelled
   ↓
approved ── stale_preview ──> awaiting_approval (new fingerprint)
   ↓
executing ──> completed
   │             └── verified Receipt
   └──────────> partial_failure
```

`stale_preview` is not an error that can be bypassed. It means the approval no
longer describes the current target. `partial_failure` is not success; it is a
recoverable state with exact completed effects and a next action.

## 8. Evaluation contract

Operation Preview adds hard evaluation gates to every state-changing scene:

- target identity is exact;
- write-set precision is 100 percent;
- protected-set changes are zero;
- stale target changes are detected before writing;
- approval cannot be reused for another fingerprint;
- Receipt matches the observed result;
- no private prose leaks into Engine or work-repository artifacts.

Semantic evaluation asks whether a new user can answer these questions after
reading `Review changes`:

1. What will change?
2. Where will it change?
3. What will not change?
4. What personal or external effect am I approving?

If the user cannot answer them, the Preview is not sufficiently clear even if
the underlying JSON is correct.

## 9. Non-goals

Operation Preview does not preview read-only responses, replace Coffee Chat,
store a permanent audit diary of personal prose, or authorize future
operations. Every new state-changing operation requires its own Preview.
