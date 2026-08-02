# Coffee Chat README Redesign

**Status:** Revised after visual-system approval; awaiting final review

**Date:** 2026-08-02

**Scope:** Engine and generated instance README files, plus the minimum visual assets they require

This specification supersedes the README language-layout and section-order requirements in section 9.1 of the approved v1 design. All knowledge, Candidate, agent-behavior, plugin, safety, and Pages contracts remain unchanged.

## 1. Product message

Coffee Chat is not presented as a generic personal knowledge base, an AI clone, or a hiring evaluator.

Its public promise is:

> Coffee Chat makes a person's documented judgment inspectable by other people and selectively usable by agents.

The first reader is someone who received a Coffee Chat URL: a collaborator, hiring-team member, peer, client, or reader who wants to understand how the author approaches a relevant problem before speaking or working with them.

The core headline is:

> **Meet the thinking before you meet the person.**

The supporting product category remains:

> An open, portable perspective layer for AI agents.

The README must explain that Coffee Chat:

- starts from public Sources and dated, author-approved Notes;
- preserves how documented judgment formed and changed;
- distinguishes Authored, Sourced, Inferred, and Unknown;
- allows a visitor to ask questions by URL without installing anything;
- may compare the public record with a named role or project by surfacing documented alignment, tension, and Unknown;
- never produces a personality, compatibility, hiring, or fit score;
- allows a trusted perspective to be applied to a relevant named task;
- never stores a fixed POV, Mental Model, or Task Lens.

The recruiter and collaborator boundary is:

> Use Coffee Chat to understand the record, prepare better questions, and identify supported alignment, tension, and Unknown. Do not use it to replace the person or make a hiring decision.

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

> A knowledge base tells you what someone has saved. Coffee Chat helps you understand how their documented judgment has evolved.

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

The engine represents no person. Its first action invites a visitor to provide an initialized Coffee Chat instance URL. It never treats the engine maintainer or test fixtures as a perspective target.

Its secondary action is **Create yours**.

### 3.2 Instance README

An initialized instance renders the same reader-first structure with:

- the author's approved public display name;
- its canonical instance URL in the copyable prompt;
- direct links to the instance Timeline and Graph when Pages are configured;
- its namespaced plugin installation and removal commands;
- a link back to the neutral engine for **Create yours**.

## 4. Markdown information architecture

The README section order is fixed because it represents the visitor journey.

### 4.1 Cover and hero

1. Local cover image
2. Language switch
3. # Coffee Chat
4. ## Meet the thinking before you meet the person.
5. Two short paragraphs:
   - what the reader can learn;
   - the explicit non-impersonation and public-record boundary.
6. Two ordinary Markdown links:
   - **Start a Coffee Chat — no install**
   - **Create yours**

No badges appear above the first action.

Recommended English copy:

> Coffee Chat turns public Sources and dated, author-approved thinking into a point of view you can question by URL—and, after it earns your trust, apply to relevant work in Codex or Claude Code.
>
> It does not speak as the person. It shows what the public record supports, how it changed, and where it stops.

Recommended Korean copy:

> Coffee Chat은 공개 Source와 날짜가 있는 작성자 승인 기록을, URL로 질문할 수 있는 관점으로 만듭니다. 그 관점이 신뢰를 얻은 뒤에는 Codex나 Claude Code의 관련 업무에도 적용할 수 있습니다.
>
> Coffee Chat은 본인인 것처럼 말하지 않습니다. 공개 기록이 뒷받침하는 생각, 그 변화, 그리고 기록만으로 알 수 없는 경계를 보여줍니다.

### 4.2 Start without installing

The first executable example is a one-time, zero-install prompt:

    Open <COFFEE_CHAT_INSTANCE_URL>.
    Read coffee-chat.json, then AGENTS.md.
    Start a one-time Coffee Chat. Do not install anything.

    Help me understand how this person approaches <ROLE_OR_PROJECT>.
    Show documented alignment, tension, and Unknown.
    Distinguish Authored, Sourced, Inferred, and Unknown.
    Do not score the person or make a hiring decision.

The instance version substitutes its canonical URL. The engine version retains the explicit placeholder and explains that the URL must identify an initialized instance.

Suggested questions immediately follow:

- What does this person optimize for when making this kind of decision?
- What public evidence shaped that judgment?
- How has the view changed over time, and why?
- Where might this role or project align with or challenge the documented view?
- What should I ask the person directly because the public record cannot answer it?

### 4.3 One record, two interfaces

One local SVG diagram explains the complete product without requiring ontology vocabulary first:

    Public Source + dated thought
                |
         approved public record
                |
          temporal graph
            /        \
     question by URL  named task
           |             |
     grounded answer   temporary Task Lens
           |             |
     better questions  relevant work

The diagram includes a small footer:

> Derived Perspective and Task Lens are used for the current question or task and are not written back.

The surrounding Markdown explains:

- **Talk:** acquisition and understanding; no installation;
- **Apply:** repeated, task-scoped use after the perspective earns trust;
- **Build:** the author's compounding loop, beginning with one public reference and one dated thought.

### 4.4 Why this is not another knowledge base

Use a concise Markdown comparison rather than another image. The graph is described as the trust substrate, not the headline feature.

The comparison remains a native Markdown table. Semantic tables are not rasterized because readers must be able to copy, translate, navigate, and diff their contents.

The section leads with:

> Other systems make information retrievable or teach an AI to remember or represent a user. Coffee Chat makes documented judgment inspectable by other people and selectively usable by agents.

### 4.5 How it earns trust

The section begins with the localized trust-layer SVG defined in section 5.4. Its meaning is repeated in Markdown immediately below it.

Keep six compact bullets:

- public Source anchor;
- author-approved dated Note;
- visible change over time;
- Authored, Sourced, Inferred, and Unknown;
- no stored personality or fixed Mental Model;
- derived perspectives are not persisted.

The section ends with:

> Use it to prepare a better conversation, not to replace one.

### 4.6 Put a point of view to work

This section appears only after the zero-install experience and trust contract.

It explains that:

- the user names an exact external task and target;
- the agent retrieves only relevant dated records;
- the resulting Task Lens is advisory and its supporting Notes are disclosed;
- only explicitly named task targets may be changed;
- Coffee Chat canonical knowledge and installed plugin data remain untouched.

The engine README explains the generic workflow. The instance README supplies its exact plugin commands.

### 4.7 Create yours

The creation flow is short and outcome-led:

    one public reference + your dated thought
    → agent interview
    → public Preview and approval
    → first Note and temporal graph
    → Coffee Chat and task use

It states that authors do not fill in a personality profile or write a fixed Mental Model. The first useful result is one approved Note that can immediately support a question or relevant task.

### 4.8 Install, remove, contribute, and license

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
- English labels: Public Source, Dated Thought, Approved Record, Temporal Graph, Question by URL, Named Task, Grounded Answer, Temporary Task Lens, Better Questions, and Relevant Work;
- Korean labels: 공개 Source, 날짜가 있는 생각, 승인된 공개 기록, 시계열 그래프, URL 질문, 명시된 작업, 근거 기반 답변, 임시 Task Lens, 더 나은 질문, and 관련 업무;
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
- engine copy implies that the engine represents a person;
- instance copy leaves engine placeholders in public actions.

generate --check and check must detect byte drift for both README files and all tracked README assets where generated or copied deterministically.

## 8. Tests and acceptance

The change is complete when:

1. engine README.md and README.ko.md are separate, reciprocal, and reader-first;
2. initialized instance projections render the same two-language contract with exact instance identity and URL;
3. the first action is a valid zero-install Coffee Chat prompt;
4. recruiter and collaborator copy permits alignment, tension, and Unknown but forbids scores and hiring decisions;
5. the comparison section distinguishes Coffee Chat from a generic KB without claiming that graph or temporal storage is unique;
6. the cover renders in GitHub Markdown, is 1280 × 640, and remains below 1 MB;
7. both localized SVG pairs remain legible at narrow and wide widths, contain no unsafe or remote content, and preserve matching semantics and geometry;
8. all local Markdown links and image paths resolve;
9. generation is byte-identical on two consecutive runs;
10. existing engine, instance, Candidate, validation, plugin, and Pages tests continue to pass.

Visual review covers GitHub-like light and dark surroundings at desktop and mobile content widths. The solid cover background must remain intentional on both. Review also confirms that every visual inherits the approved cover and that no generated glyph artifact can be mistaken for text.

## 9. Out of scope

- hosted chat UI;
- automatic hiring or compatibility evaluation;
- personality inference;
- private-source ingestion;
- an automatic GitHub Social Preview upload;
- redesigning GitHub Pages;
- badges or visual assets without a named explanatory role;
- more than the approved cover, product-flow pair, and trust-layer pair;
- creating the separate personal flagship instance.

The separate personal instance remains the eventual proof surface, but this change keeps the engine neutral and knowledge-free.
