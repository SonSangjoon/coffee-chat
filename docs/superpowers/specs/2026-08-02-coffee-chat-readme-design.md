# Coffee Chat README Redesign

**Status:** Revised after core-thesis clarification; awaiting final review

**Date:** 2026-08-02

**Scope:** Engine and generated instance README files, plus the minimum visual assets they require

This specification supersedes the README language-layout and section-order requirements in section 9.1 of the approved v1 design. All knowledge, Candidate, agent-behavior, plugin, safety, and Pages contracts remain unchanged.

## 1. Product thesis

Coffee Chat begins from a scarcity shift:

> **AI makes execution abundant. Taste decides what is worth making.**

Taste is not newly important because of AI. As implementation and iteration become cheaper, the bottleneck becomes the judgment that chooses a problem, defines quality, selects trade-offs, recognizes meaningful failure, decides what to remove, and knows when to continue or stop.

In Coffee Chat, Taste means this trained judgment under uncertainty. It is not a personality label, aesthetic profile, self-assigned strength, or canonical ontology object.

Coffee Chat stores the public evidence from which relevant perspective can emerge:

- public Sources;
- dated, author-approved Notes;
- neutral Entities and temporal relationships.

It does not store a fixed POV, Mental Model, Taste profile, or Task Lens. For each question or named task, an agent retrieves the relevant temporal subgraph and derives a bounded Perspective and optional Task Lens. That synthesis ends with the question or task and is never written back.

The same graph serves two equal needs:

| For you and your agents                                                             | For other people and their agents                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Build a durable, source-grounded record of your judgment.                           | Understand how your documented judgment formed and changed.                    |
| Recover relevant POV and Mental Models without re-explaining them in every session. | Ask their own questions instead of reading every Note or relying on a profile. |
| Apply your Taste to a named task while keeping the supporting record visible.       | Carefully apply a relevant perspective with attribution, limits, and Unknowns. |

This is why the project is called Coffee Chat. A coffee chat is not a static profile or a fact lookup. It is a question-led way to understand how someone sees, chooses, and reasons. Coffee Chat makes that interaction asynchronous, source-grounded, time-aware, and agent-readable:

- your own agent can have a Coffee Chat with your public record before beginning work;
- another person or their agent can have a Coffee Chat with the same record before meeting, collaborating with, learning from, or evaluating your work.

Recruiting is one useful example, not the product identity. A recruiter, collaborator, peer, client, or reader may use Coffee Chat to understand the record and prepare better questions. Coffee Chat never replaces the person or produces a personality, compatibility, hiring, or fit score.

The supporting product category is:

> An open, portable perspective layer for people and AI agents.

The README must explain that Coffee Chat:

- makes Taste legible through evidence without reducing it to a fixed field;
- starts from public Sources and dated, author-approved Notes;
- preserves how documented judgment formed and changed;
- distinguishes Authored, Sourced, Inferred, and Unknown;
- lets the owner and their agents work from a relevant derived perspective;
- lets other people and their agents ask questions by URL without installing anything;
- may compare the public record with a named role or project by surfacing documented alignment, tension, and Unknown;
- never produces a personality, compatibility, hiring, or fit score;
- never persists a fixed POV, Mental Model, Taste profile, or Task Lens.

## 2. Honest differentiation

The knowledge graph itself is not claimed as the innovation. Personal knowledge bases already connect notes, RAG systems retrieve from corpora, temporal knowledge graphs preserve changing facts and relationships, and agent-memory products retain user context.

Coffee Chat differs through its product and epistemic contract:

| Category                 | Primary question                               | Coffee Chat boundary                                                                                      |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Personal knowledge base  | What has the owner saved or learned?           | What does the author's approved public record show about how they judged this issue?                      |
| RAG or GraphRAG          | What does this corpus say?                     | Which parts are authored judgment, source content, bounded inference, or unknown?                         |
| Temporal knowledge graph | What fact or relationship changed over time?   | How did a recorded view evolve, coexist by context, remain in tension, or stay unknown?                   |
| Agent memory             | What should the agent remember about the user? | Only approved public records persist; query- and task-specific synthesis does not.                        |
| Persona or digital self  | Can an AI speak or act as this person?         | Coffee Chat never claims to be the person or invents present beliefs, personality, or private experience. |

The README compresses this into:

> A knowledge base retrieves what someone knows. Coffee Chat lets people and agents work with how that person's documented judgment has evolved.

## 3. README surfaces

English and Korean are separate generated documents:

- README.md: English default
- README.ko.md: Korean

Each file starts with a reciprocal language link:

- English: [한국어](./README.ko.md)
- Korean: [English](./README.md)

Both files use ordinary GitHub-flavored Markdown. They do not depend on custom CSS, centered HTML blocks, JavaScript, remote embeds, or runtime rendering. Local images use descriptive alt text.

The generator remains the source of README output. Hand-editing either generated README is not supported.

### 3.1 Engine README

The engine represents no person. It presents two equal entry points:

- **Have a Coffee Chat:** provide an initialized instance URL;
- **Build your Coffee Chat:** create a separate personal instance beginning with one public Source and one dated thought.

It never treats the engine maintainer or test fixtures as a perspective target.

### 3.2 Instance README

An initialized instance renders the same balanced owner-and-conversation structure with:

- the author's approved public display name;
- its canonical instance URL in the copyable prompt;
- an explicit path for the owner and their agents to use the graph in their own work;
- direct links to the instance Timeline and Graph when Pages are configured;
- its namespaced plugin installation and removal commands;
- a link back to the neutral engine for **Build your Coffee Chat**.

## 4. Markdown information architecture

The README section order is fixed because it must establish the Taste thesis, explain the Coffee Chat metaphor, and give equal visibility to the owner's compounding loop and another person's conversation path.

### 4.1 Cover and hero

1. Local cover image
2. Language switch
3. # Coffee Chat
4. ## AI makes execution abundant. Taste decides what is worth making.
5. Three short paragraphs:
   - the operational definition of Taste;
   - how Coffee Chat makes documented judgment usable by people and agents;
   - the explicit non-impersonation and query-time synthesis boundary.
6. Two ordinary Markdown links:
   - **Have a Coffee Chat — no install**
   - **Build your Coffee Chat**

No badges appear above the first action.

Recommended English copy:

> AI makes execution abundant. Taste decides what is worth making.
>
> Taste here means judgment under uncertainty: what you notice, value, choose, refine, reject, and stop. Coffee Chat turns public Sources and dated, author-approved thinking into a temporal perspective graph that people and agents can question and use.
>
> It does not clone a person or store a fixed Mental Model. It derives only the perspective relevant to the current question or task, shows what supports it, and makes the boundary of the public record visible.

Recommended Korean copy:

> AI가 실행을 풍부하게 만들수록, 무엇을 만들 가치가 있는지 결정하는 Taste가 중요해집니다.
>
> 여기서 Taste는 미적 취향이나 성격이 아니라 불확실성 속에서 무엇을 보고·선택하고·다듬고·버리며·멈출지를 정하는 판단입니다. Coffee Chat은 공개 Source와 날짜가 있는 작성자 승인 기록을, 사람과 Agent가 질문하고 활용할 수 있는 시계열 관점 그래프로 만듭니다.
>
> Coffee Chat은 사람을 복제하거나 고정된 Mental Model을 저장하지 않습니다. 현재 질문이나 작업에 필요한 관점만 도출하고, 무엇이 그 관점을 뒷받침하는지와 공개 기록의 경계를 함께 보여줍니다.

### 4.2 Why Coffee Chat

This section makes the name explicit:

> A coffee chat helps you understand how someone sees and decides through your own questions. Coffee Chat gives people and agents that same entry point into a documented point of view—with Sources, dates, and visible limits.

It immediately names both forms:

- **Your agent has a Coffee Chat with you:** it reads the relevant record before a task and derives a temporary POV, Mental Model, or Task Lens.
- **Someone else has a Coffee Chat with you:** they or their agent ask their own questions to understand, compare, or carefully apply the recorded perspective.

The section states that this is an interface to the documented public record, not a claim that the model is the person.

### 4.3 Two needs, one graph

A short native Markdown table gives the two product loops equal weight:

| Build and use your Taste                                                 | Understand and use another perspective                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Add one public Source and your dated thought through an agent interview. | Open an instance URL and ask a question without installing.              |
| Let your own Agent retrieve the relevant record before a named task.     | Trace the response to dated Notes and public Sources.                    |
| Derive a temporary POV, Mental Model, or Task Lens without storing it.   | Surface alignment, tension, and Unknown without impersonation or scores. |

### 4.4 Have a Coffee Chat without installing

The first executable example is a one-time, zero-install prompt:

    Open <COFFEE_CHAT_INSTANCE_URL>.
    Read coffee-chat.json, then AGENTS.md.
    Start a one-time Coffee Chat. Do not install anything.

    Help me understand how this person approaches <ROLE_OR_PROJECT>.
    Show documented alignment, tension, and Unknown.
    Distinguish Authored, Sourced, Inferred, and Unknown.
    Do not score the person or make a hiring decision.

The conversation partner may be the owner's own agent, another person's agent, or a person working through an agent. The instance version substitutes its canonical URL. The engine version retains the explicit placeholder and explains that the URL must identify an initialized instance.

Suggested questions immediately follow:

- What does this person optimize for when making this kind of decision?
- What public evidence shaped that judgment?
- How has the view changed over time, and why?
- Where might this role or project align with or challenge the documented view?
- What should I ask the person directly because the public record cannot answer it?

Role or hiring comparison is only one optional question pattern. It does not define the section or the product.

### 4.5 One record, two directions

One local SVG diagram explains the complete product without requiring ontology vocabulary first:

    Public Source + dated judgment
                  |
            approved Note
                  |
      temporal perspective graph
           /                 \
    you + your Agent    people + their Agents
           |                 |
    relevant Task Lens  grounded Coffee Chat
           |                 |
    work with your Taste  understand or apply with limits

The diagram includes a small footer:

> Derived Perspective and Task Lens are used for the current question or task and are not written back.

The surrounding Markdown explains:

- **Build:** the author's compounding loop, beginning with one public Source and one dated thought;
- **Use:** the owner and their agents recover relevant judgment for a named task;
- **Talk:** another person or agent explores the documented point of view without installation;
- **Apply:** a trusted perspective may inform a relevant task with attribution and limits.

### 4.6 Why this is not another knowledge base

Use a concise Markdown comparison rather than another image. The graph is described as the trust substrate, not the headline feature.

The comparison remains a native Markdown table. Semantic tables are not rasterized because readers must be able to copy, translate, navigate, and diff their contents.

The section leads with:

> Other systems make information retrievable or teach an AI to remember or represent a user. Coffee Chat makes documented judgment usable by its owner and their agents, inspectable by other people, and selectively applicable by their agents.

### 4.7 How it earns trust

The section begins with the localized trust-layer SVG defined in section 5.4. Its meaning is repeated in Markdown immediately below it.

Keep six compact bullets:

- public Source anchor;
- author-approved dated Note;
- visible change over time;
- Authored, Sourced, Inferred, and Unknown;
- no stored personality or fixed Mental Model;
- derived perspectives are not persisted.

The section ends with:

> Use it to make work more consistent and conversations more informed—not to freeze or replace a person.

### 4.8 Put Taste to work

This section appears after the two-sided product model and trust contract. It covers the owner using their own Taste as well as another user applying a perspective after it earns trust.

It explains that:

- the user names an exact external task and target;
- the agent retrieves only relevant dated records;
- the resulting Task Lens is advisory and its supporting Notes are disclosed;
- only explicitly named task targets may be changed;
- Coffee Chat canonical knowledge and installed plugin data remain untouched.

It includes an owner-and-Agent prompt with equal prominence to the zero-install conversation:

    Use <YOUR_COFFEE_CHAT_URL> as the perspective source for <TASK>.
    Retrieve only the public, dated records relevant to the task.
    Derive a temporary POV, Mental Model, and Task Lens.
    Explain which judgment criteria affect the work and cite the supporting Notes.
    Work only on <TARGET>.
    Do not write the synthesis back to Coffee Chat.

The engine README explains the generic workflow. The instance README supplies its exact plugin commands.

### 4.9 Build your Coffee Chat

The creation flow is short and outcome-led:

    one public reference + your dated thought
    → agent interview
    → public Preview and approval
    → first Note and temporal graph
    → Coffee Chat and task use

It states that authors do not fill in a personality profile or write a fixed Mental Model. The first useful result is one approved Note that can immediately support a question or relevant task.

The primary retention loop is the owner using the graph with their own agents. Public conversation and careful reuse by others are distribution and collaboration loops built from the same record.

### 4.10 Install, remove, contribute, and license

Technical commands remain near the bottom:

- Codex install and remove
- Claude Code install and remove
- hook inspection, installation, and removal
- contribution scope
- testing link
- code and content license boundaries

Commands are role-aware projections from canonical metadata.

## 5. Visual assets

The README uses one shared cover and two localized explanatory visuals. This creates five tracked files: one raster cover, two English SVGs, and two Korean SVGs. Every asset has one named position in the README; unused decorative variants are not tracked.

### 5.1 Design inheritance

Every visual inherits the approved cover rather than starting from a new style prompt:

- warm off-white: #EEE9DF;
- charcoal: #25221F;
- coffee brown: #75503D;
- muted clay: #9A7059;
- restrained sage accent: #697166;
- realistic matte ceramic and paper texture for raster artwork;
- thin imperfect orbit curves, small asymmetric nodes, and one partial coffee-stain ring;
- quiet negative space, no gradients, no neon, no glossy 3D, and no AI iconography;
- pixel influence limited to isolated non-glyph dither details visible only on close inspection.

The approved cover is always supplied as the visual reference for additional raster generation or refinement. Each size or crop is derived from the same approved master; independently regenerating each ratio is forbidden because it would introduce visual drift.

Image generation supplies raster illustration and texture only. It never supplies final typography, diagram labels, table content, or other semantic text. Exact text is composed deterministically after generation. Diagrams use deterministic SVG and comparisons use native Markdown while inheriting the approved palette, orbit motif, spacing, and matte restraint.

### 5.2 Cover

Path:

docs/assets/readme/coffee-chat-cover.png

Contract:

- 1280 × 640 PNG;
- solid warm off-white background;
- under 1 MB, matching [GitHub's recommended social-preview format](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview);
- based on the approved realistic top-down coffee-cup composition;
- cup and temporal orbit remain on the right;
- left side retains quiet negative space;
- four small nodes, three restrained curved paths, one partial coffee-stain orbit;
- matte paper and ceramic texture;
- pixel influence limited to a tiny non-glyph dither break;
- no AI clichés, people, laptop, robot, brain, neon, gradient, remote asset, or watermark.

The approved source image is identified by SHA-256:

3a47a283ef60316ea1ef6bd0191bc4e15f49d251a90b364e88d58455828b8052

Deterministic typography is added during implementation rather than generated by the image model:

- COFFEE CHAT
- A point of view, with a history.

Typography occupies the left negative space and remains readable at social-preview size. The Markdown hero repeats the accessible product name and message, so the image is not the sole carrier of meaning.

The same PNG is referenced from both README languages and is suitable for manual upload to GitHub's repository Social Preview setting. Repository files alone cannot activate that setting.

### 5.3 Product-flow diagram

Paths:

- docs/assets/readme/coffee-chat-flow.en.svg
- docs/assets/readme/coffee-chat-flow.ko.svg

Contract:

- deterministic, hand-authored SVG;
- no scripts, remote fonts, embedded raster images, animation, or external references;
- same off-white, charcoal, coffee-brown, clay, and muted-sage palette as the cover;
- matte flat shapes, thin curved connectors, generous spacing;
- viewBox 0 0 960 720, a 4:3 stacked layout rather than a desktop-only ultra-wide flow;
- English labels: Public Source, Dated Judgment, Approved Note, Temporal Perspective Graph, You + Your Agent, People + Their Agents, Relevant Task Lens, Grounded Coffee Chat, Work with Your Taste, and Understand or Apply with Limits;
- Korean labels: 공개 Source, 날짜가 있는 판단, 승인된 Note, 시계열 관점 그래프, 나와 나의 Agent, 다른 사람과 그들의 Agent, 관련 Task Lens, 근거 기반 Coffee Chat, 내 Taste를 반영한 업무, and 경계가 있는 이해·활용;
- matching geometry, reading order, color roles, and semantics across locales;
- the same meaning repeated in localized Markdown so the image is never the only explanation;
- responsive viewBox, readable at narrow GitHub widths;
- useful alt text in each README.

### 5.4 Trust-layer diagram

Paths:

- docs/assets/readme/coffee-chat-trust.en.svg
- docs/assets/readme/coffee-chat-trust.ko.svg

Contract:

- viewBox 0 0 1200 600, a compact 2:1 layout suited to a mid-README section;
- four clearly separated layers: Authored, Sourced, Inferred, and Unknown;
- Korean layer labels: 작성자 기록, 출처 내용, 제한된 추론, and 기록으로 알 수 없음;
- no hierarchy implying that inference is authored truth;
- one subtle orbit line connecting the layers without merging their boundaries;
- one short localized definition per layer;
- matching geometry and semantics across locales;
- all safety, accessibility, and palette constraints from the product-flow SVG.

Generated-image tooling is not used for semantic diagrams because exact terminology, accessibility, and deterministic diffs are more important than illustrative texture. The diagrams still visibly inherit the image-generated cover through their palette, orbit geometry, node proportions, negative space, and restrained dither accents.

No additional asset is added unless it has a named README section and materially improves understanding.

## 6. Generation and file ownership

The implementation updates:

- tools/projections.ts to render English and Korean README variants for engine and instance roles;
- tools/artifact-inventory.ts to track README.ko.md;
- projection and Candidate-output tests to expect both README files;
- generated-file drift checks;
- formatting ignore or include configuration as required;
- README link and asset validation;
- locale-aware selection of the two diagram pairs;
- raster dimension and size validation plus deterministic SVG safety validation;
- the prior README contract documentation that currently requires paired bilingual lines.

Canonical Coffee Chat knowledge and schema behavior do not change.

Visual source files are repository-owned MIT-licensed engine assets. They are not personal Notes and do not enter the knowledge graph.

## 7. Failure behavior and validation

Generation fails without modifying tracked outputs when:

- either locale cannot render;
- a role-specific URL, plugin identity, or author field is missing;
- a local README asset is missing;
- the cover is not 1280 × 640, exceeds 1 MB, or is not a PNG;
- any SVG contains scripts, event handlers, remote references, animation, or embedded raster data;
- the English and Korean SVG pairs differ in geometry, semantic order, or color roles;
- a generated README links to a missing local path;
- a generated README omits either **Have a Coffee Chat** or **Build your Coffee Chat**;
- engine copy implies that the engine represents a person;
- instance copy leaves engine placeholders in public actions.

generate --check and check must detect byte drift for both README files and all tracked README assets where generated or copied deterministically.

## 8. Tests and acceptance

The change is complete when:

1. engine README.md and README.ko.md are separate and reciprocal;
2. the hero leads with the AI-abundance and Taste thesis, then defines Taste as judgment rather than personality or aesthetic preference;
3. building and using one's own Taste and understanding or carefully applying another person's perspective receive equal first-page visibility;
4. the README explicitly explains why an owner Agent and another person or Agent can each have a Coffee Chat with the same record;
5. initialized instance projections render the same two-language contract with exact instance identity and URL;
6. the zero-install Coffee Chat action is valid while the owner-and-Agent task path remains equally discoverable;
7. recruiter and collaborator copy is an example rather than the product identity, permits alignment, tension, and Unknown, and forbids scores and hiring decisions;
8. the comparison section distinguishes Coffee Chat from a generic KB without claiming that graph or temporal storage is unique;
9. the cover renders in GitHub Markdown, is 1280 × 640, and remains below 1 MB;
10. both localized SVG pairs remain legible at narrow and wide widths, contain no unsafe or remote content, and preserve matching semantics and geometry;
11. all local Markdown links and image paths resolve;
12. generation is byte-identical on two consecutive runs;
13. existing engine, instance, Candidate, validation, plugin, and Pages tests continue to pass.

Visual review covers GitHub-like light and dark surroundings at desktop and mobile content widths. The solid cover background must remain intentional on both. Review also confirms that every visual inherits the approved cover and that no generated glyph artifact can be mistaken for text.

## 9. Out of scope

- hosted chat UI;
- automatic hiring or compatibility evaluation;
- personality inference;
- a stored Taste type, Taste score, fixed Mental Model, or self-authored personality profile;
- private-source ingestion;
- an automatic GitHub Social Preview upload;
- redesigning GitHub Pages;
- badges or visual assets without a named explanatory role;
- more than the approved cover, product-flow pair, and trust-layer pair;
- creating the separate personal flagship instance.

The separate personal instance remains the eventual proof surface, but this change keeps the engine neutral and knowledge-free.
