# Coffee Chat README v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the implementation-first README with a short, bilingual product introduction that explains Taste, its relevance as AI makes information abundant, and the single Coffee Chat journey from Taste creation to Agent and Project use.

**Architecture:** Keep `tools/readme.ts` as the single renderer for `README.md` and `README.ko.md`. Keep the approved cover unchanged and replace the legacy diagrams with two small Coffee Chat metaphor PNGs: `Sources → Perspective (Roast) → Taste (coffee beans)` and `Taste → Agent (coffee) → Coffee Chat / Project`. Keep technical vocabulary, trust boundaries, installation details, and design links below the product explanation or inside collapsible sections.

**Tech Stack:** TypeScript renderer, Vitest projection tests, PNG asset contract, Markdown README projections.

## Global Constraints

- Preserve `docs/assets/readme/coffee-chat-cover.png` byte-for-byte.
- Do not present Taste as a score, personality profile, or agent decision rule.
- Explain Taste as a recurring value-judgment system; mention stability across Sources without claiming identical conclusions.
- The front of the README must use plain product language; core engineering terms remain below the product section and in `docs/design/coffee-chat.md`.
- The engine README must remain neutral and must not invent a personal instance or demo URL.
- Do not include Hacker News, Hada.io, or local-person references in tracked content.

---

### Task 1: Replace the README visual asset contract

**Files:**

- Create: `docs/assets/readme/coffee-chat-taste.en.png`
- Create: `docs/assets/readme/coffee-chat-agent.en.png`
- Delete: `docs/assets/readme/coffee-chat-flow.en.png`
- Delete: `docs/assets/readme/coffee-chat-trust.en.png`
- Modify: `tools/readme-assets.ts`
- Test: `tests/readme-assets.test.ts`

- [ ] Define two new 1200 x 760 PNG contracts for the Taste and Agent metaphor stages and remove the legacy asset contracts.
- [ ] Preserve the cover contract and update the asset list to contain exactly the cover plus the Taste and Agent images.
- [ ] Update asset tests to assert the new filename, dimensions, byte limit, directory contents, and stable drift diagnostics.

### Task 2: Rebuild the bilingual product narrative

**Files:**

- Modify: `tools/readme.ts`
- Test: `tests/readme-projections.test.ts`
- Test: `tests/taste-vocabulary.test.ts`

- [ ] Keep the cover and language switch at the top.
- [ ] Lead with `Same Source. Different Taste.` and the plain distinction between knowledge and Taste.
- [ ] Add a short `Why Taste matters` section: AI increases access to information and output; Taste is the recurring value system that makes a perspective recognizable across changing Sources.
- [ ] Add two simple images: Source/Perspective/Taste with seed, Roast, and beans; Taste/Agent/uses with beans, brewed coffee, Coffee Chat, and Project.
- [ ] Replace the dense front-half flow, trust table, and project-participation image narrative with short storage boundaries and links to the maintained design contract.
- [ ] Keep engine neutrality, explicit-instance rules, install commands, lifecycle safety, license terms, and generated README behavior intact.
- [ ] Remove deprecated or overly abstract front-facing phrases from generated README output while retaining required core terms in the technical section.
- [ ] Update tests to assert heading order, copy, both product-flow assets, neutral engine behavior, reciprocal localization, and absence of legacy diagrams/terms.

### Task 3: Align the canonical design contract

**Files:**

- Modify: `docs/design/coffee-chat.md`
- Modify: `docs/research/2026-08-04-coffee-chat-ux-research.md` only if the current README contract contradicts the approved v3 structure

- [ ] Record the README contract: product thesis first, short Taste rationale second, two simple metaphor stages third, technical boundary later.
- [ ] Define the user-facing wording for Taste as a recurring value-judgment system with recognizable criteria across Sources, not a global profile.
- [ ] Define the user journey and its two uses: put Taste on an Agent, then use it for Coffee Chat or a Project.
- [ ] State that the Taste and Agent images are the only non-cover README visual assets.

### Task 4: Regenerate and verify projections

**Files:**

- Modify: `README.md`
- Modify: `README.ko.md`

- [ ] Run the repository's projection command to regenerate both READMEs from the renderer.
- [ ] Confirm the generated README files contain only the cover and the two new product-flow image links.
- [ ] Confirm no local personal data or sharing-site names entered tracked output.
- [ ] Run focused README tests, then the complete test suite and build/check command used by CI.
- [ ] Review the final diff for copy clarity, asset drift, generated-file ownership, and accidental unrelated changes.
