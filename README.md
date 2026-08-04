![Coffee Chat cover showing a coffee cup, orbit lines, and four colored nodes](./docs/assets/readme/coffee-chat-cover.png)

[한국어](./README.ko.md)

# Coffee Chat

## Same Origin. Different Taste.

AI made information cheap. It did not make judgment personal.

Your Agent may already know a lot. It still does not know what matters to you.

## When information is not enough

The same information can lead to different judgments. People notice different things, assign importance differently, and make different value judgments.

Taste is the recurring value system behind how a person interprets information and assigns importance. It is not a score, a personality profile, or a decision rule. Its criteria remain recognizable across different Origins and situations, even when conclusions change.

That recurring consistency is why Taste matters. It makes a person's way of seeing information recognizable to other people and useful to an Agent.

## Your Agent needs more than knowledge

- People who use Agents for real work and keep explaining what matters to them.

- People who share information but want to show their point of view, not only a summary.

- People who want to understand each other's criteria before collaborating.

> Your Agent already knows a lot. Coffee Chat helps it understand what matters to you.

## From Origin to Taste

Coffee Chat is an open-source workflow for turning Origin-based points of view into contextual Taste, putting that Taste on an Agent, and using it in conversation or work.

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

### Build your Taste

![Origin becomes Green Bean through Harvest, then Bean through Roast](./docs/assets/readme/coffee-chat-taste.en.png)

Harvest one or more Origins into Green Beans. Roast the relevant Green Beans into a contextual Bean that carries Taste for the current question or task.

## Put your Taste to work

![Bean becomes Coffee through Brew, then branches to Coffee Chat and Coffee Pairing](./docs/assets/readme/coffee-chat-agent.en.png)

Brew that Bean into Coffee—the Agent with your Taste—for the current Coffee Chat or task. The Taste context is dynamic and is not shown as a fixed profile.

Have a Coffee Chat with that Coffee, or use Coffee Pairing to apply it to a named project or task.

## What makes it different

Coffee Chat does not store everything you know or every decision you make. It keeps how you interpreted an Origin and what you considered important.

- Origin: the information and its provenance
- Green Bean: your authored point of view
- Bean: the Taste needed for the current context
- Coffee: an Agent with that Taste applied

A Green Bean may connect one or more Origins. Taste is not a global profile or an executable rule; Roast builds the Bean needed for the current context.

This is the neutral engine. It has no default person or Taste, and no personal record to answer for.

## Try a Coffee Chat

This repository is the neutral engine, not a ready-made personal instance. There is no default person or Taste here.

Create a public instance first, then give that explicit URL to an agent. Coffee Roast and Coffee Brew should begin from the instance's `coffee-chat.json` and `AGENTS.md` before the first Coffee Chat.

> **My personal Coffee Chat** — coming soon.
> This space is reserved for my public Coffee Chat.
<!-- PERSONAL_COFFEE_CHAT_URL: replace this marker with your public Coffee Chat link -->

## Build your Coffee Chat

Start with one or more public Origins and prepare how you interpreted them, what you considered important, and which values guided that judgment.

Harvest public Origins into Green Beans, Roast them into contextual Beans that carry Taste, and Brew a Bean into Coffee—the Agent with your Taste—for Coffee Chat or Coffee Pairing.

## Choose your next action

- **Create yours** — create a separate public instance from the GitHub Template, then Harvest its first Origin into a Green Bean.
- **Install engine plugin** — add the neutral engine Skills to your agent for authoring and maintenance.
- **Contribute to engine** — improve schemas, validation, Skills, and the public presentation.

This engine has no default person or Taste. It contains no personal Origin, Green Bean, Bean, or Coffee to chat with.

Do not treat this engine URL as a personal Coffee Chat. Create or open an explicit initialized instance URL first.

## Install, maintain, and contribute

Install the engine plugin for reusable authoring and maintenance. Install an instance plugin only when you need repeated access to a particular public record.

<details><summary>Codex install and remove</summary>

```sh
codex plugin marketplace add https://github.com/SonSangjoon/coffee-chat
codex plugin add coffee-chat@coffee-chat-marketplace

codex plugin remove coffee-chat@coffee-chat-marketplace
codex plugin marketplace remove coffee-chat-marketplace
```

</details>

<details><summary>Claude Code install and remove</summary>

```sh
claude plugin marketplace add https://github.com/SonSangjoon/coffee-chat --scope local
claude plugin install coffee-chat@coffee-chat-marketplace --scope local

claude plugin uninstall coffee-chat@coffee-chat-marketplace --scope local
claude plugin marketplace remove coffee-chat-marketplace
```

</details>

<details><summary>Hooks, lifecycle, update, cache, and removal receipt</summary>

Inspect the resolved repository hook before installation. Install only after a safe inspection; uninstall removes only the Coffee Chat-managed hook and repository-local runtime. Do not bypass, silently chain, or overwrite an unmanaged hook.

```sh
npm run cc -- hooks inspect --format json
npm run cc -- hooks install --format json
npm run cc -- hooks uninstall --format json
```

```sh
codex plugin add --help
codex plugin marketplace upgrade coffee-chat-marketplace
codex plugin list --json
codex plugin marketplace list --json
```

```sh
claude plugin update coffee-chat@coffee-chat-marketplace --scope local
claude plugin list --json
claude plugin marketplace list --json
```

Codex exposes no plugin scope selector in `plugin add` and no separate plugin update command. Treat unreported scope or host-managed paths as Unknown. Marketplace upgrade refreshes the source snapshot; the two read-only list commands are the removal receipt for this exact plugin and marketplace.

Claude Code `local` scope is the narrowest temporary choice. Its update command refreshes this namespaced plugin; the two list commands are the same presence-or-absence receipt. Host-managed caches, conversation history, logs, and retention may remain after removal.

Only approved Green Beans are durable. A Bean or Coffee Pairing result is temporary and is not appended to the installed snapshot at runtime.

</details>

Read the [maintained design contract](https://github.com/SonSangjoon/coffee-chat/blob/main/docs/design/coffee-chat.md), [UX research](https://github.com/SonSangjoon/coffee-chat/blob/main/docs/research/2026-08-04-coffee-chat-ux-research.md), and [testing and acceptance guide](https://github.com/SonSangjoon/coffee-chat/blob/main/docs/testing.md) before changing the engine.

Code, schemas, templates, and Skills use the [MIT License](./LICENSE); original Green Beans and public prose use the [content terms](./CONTENT_LICENSE.md).
