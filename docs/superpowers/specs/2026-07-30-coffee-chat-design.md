# Coffee Chat Design Specification

- Status: Revised design; awaiting written-spec approval
- Date: 2026-07-30
- Product shape: Public temporal personal knowledge graph, shared agent method, and installable multi-skill plugin
- Primary distribution: GitHub repository
- Secondary projection: GitHub Pages

## 1. Product definition

Coffee Chat turns public sources and a person's dated thoughts into a source-grounded temporal knowledge graph. An agent can use that graph in two ways:

1. Coffee Chat: reconstruct a topic-specific point of view for one conversation without installing anything.
2. Coffee Chat plugin: install a package of related skills that can converse with the graph, apply a relevant point of view to work, or help the owner extend the graph.

The repository is simultaneously:

- a public personal knowledge base and wiki;
- a temporal knowledge graph;
- a source for an AI-mediated coffee chat;
- a source of perspective for agents working with or on behalf of the author;
- a reusable template that other people can fork.

Career and recruiting are important use cases, but the product does not present itself as a resume chatbot. Its explicit purpose is to preserve how a person reads, interprets, applies, revisits, and changes ideas over time. Career value should emerge from the quality and traceability of those records.

Coffee Chat produces an AI-generated synthesis of public, dated records. It is not the person, does not claim access to private thoughts, and must not invent personality traits, strengths, weaknesses, experiences, or present beliefs.

The whole design reduces to two flows:

1. Build the public record: public Sources plus dated thoughts become authored Notes and Entity mappings; a deterministic index turns them into a temporal knowledge graph.
2. Use the public record: an agent selects the relevant temporal subgraph, synthesizes a Derived Perspective and optional Task Lens for the question or task, uses them with citations, and never writes them back to Coffee Chat.

| Layer | Contains | Persistence |
| --- | --- | --- |
| Authored public record | Notes and Entity Registry | Stored in Git after exact owner approval |
| Deterministic projection | Source nodes, structural edges, index, package adapters, and Pages | Rebuilt from authored inputs; no new worldview |
| Query-time synthesis | Derived Perspective and optional Task Lens | Not stored by Coffee Chat |

## 2. Design principles

### 2.1 Public-source grounding

Every Note cites one or more public Sources. A Source anchors the topic publicly; it does not need to contain every detail of the author's experience or interpretation. The authored layer may contain experience, retrospective analysis, interpretation, rebuttal, or application as long as the topic remains grounded in public material.

This is the corpus boundary, not a quality score: a Note needs a public topic anchor, while extra Sources never promote it mechanically.

Private documents, login-only material, signed share URLs, secrets, and private correspondence are outside the canonical graph.

### 2.2 Time is semantic data

Perspectives change. A later view is not automatically a correction or contradiction. The graph preserves:

- when a public Source was published, when known;
- when a thought or experience applies, `temporal_coverage`;
- when it was written into the repository, `recorded_on`;
- why a later view differs, when the author can explain it.

Git history is useful audit history, but it cannot replace explicit semantic time.

### 2.3 Stored records and query-time synthesis are separate

Git stores public Sources, dated authored Notes, and neutral Entity identity. It does not store a fixed POV, personality profile, or Mental Model.

Derived Perspective and Task Lens are query-time syntheses for a particular question, time, situation, or task. Coffee Chat never writes them back into the repository, generated projections, or plugin snapshots. They preserve the product intent of POV and a task-specific Mental Model without becoming stored ontology types; host conversation retention remains host-controlled.

### 2.4 Canonical authority

Canonical authority does not mean putting the whole product in one file. It means that each meaning has one authoritative authored location:

- coffee-chat.json owns public profile and package metadata;
- knowledge/notes owns dated authored thoughts;
- knowledge/entities.yml owns Entity identity and aliases;
- method owns shared provenance, synthesis behavior, and disclosure language;
- README.md owns the short bilingual layout and action order, while importing generated metadata and disclosure fragments;
- each skill owns only its trigger and task-specific boundary.

Indexes, generated README fragments, skill-local method references, platform manifests, marketplace catalogs, and Pages output are generated projections. No generated surface may introduce a new opinion or worldview.

### 2.5 Structural guardrails, not semantic gates

Automation may enforce parseability, identity, referential integrity, secrets, public-safety boundaries, deterministic generation, packaging, and deployment. It must not score or promote ideas, count Sources as confidence, impose a closed relation taxonomy, or decide whether a view is correct, mature, consistent, or important.

### 2.6 Agent-first, human-simple

The owner talks to an authoring agent instead of filling out a schema. A visitor pastes the repository URL into an agent instead of learning the repository layout. Conventional names, stable IDs, explicit time, an Entity Registry, and a generated machine index provide rigor behind that simple interface.

## 3. Users and top-level journeys

### 3.1 Owner

The owner forks the repository, explicitly chooses Make mine, opens it in Codex or Claude Code, initializes the public profile, and adds knowledge by giving the agent one or more public Source links plus their thoughts. The agent handles the schema, temporal links, Entity mapping, generated files, and validation.

### 3.2 Visitor or collaborator

The visitor passes the repository URL to a web-capable agent. The agent reads the root manifest and first asks:

1. Do you want a one-time Coffee Chat?
2. Do you want to install the Coffee Chat plugin?

One-time Coffee Chat does not modify the repository and leaves no installed configuration. Plugin installation uses the host's native marketplace and plugin lifecycle.

### 3.3 Human web reader

The reader uses GitHub Pages to browse Notes, Sources, Entities, backlinks, the timeline, and the graph. Pages does not modify data and does not host a chatbot, login, comments, or editing workflow.

## 4. System architecture

The repository is the authoritative public record and the plugin source.

~~~text
coffee-chat/
├── README.md
├── AGENTS.md                     # source-repository agent bootstrap
├── CLAUDE.md                     # Claude adapter to the same bootstrap
├── coffee-chat.json
├── knowledge/
│   ├── notes/
│   │   └── <stable-note-id>.md
│   ├── entities.yml
│   └── index.json                 # generated, tracked machine interface
├── method/                        # shared provenance and synthesis method
├── skills/
│   ├── coffee-chat/
│   │   ├── SKILL.md
│   │   └── references/method.md   # generated delivery projection
│   ├── apply-perspective/
│   │   ├── SKILL.md
│   │   └── references/method.md   # generated delivery projection
│   └── build-kg/
│       ├── SKILL.md
│       └── references/method.md   # generated delivery projection
├── schemas/
├── tools/                         # generation and validation entry points
├── site/                          # Pages source, not built output
├── .codex-plugin/plugin.json      # generated
├── .claude-plugin/plugin.json     # generated
├── .agents/plugins/marketplace.json       # generated
├── .claude-plugin/marketplace.json        # generated
├── .gitignore
├── .pre-commit-config.yaml
└── .github/workflows/
~~~

This tree is a design boundary, not a requirement to choose a particular programming language or site generator. Those choices belong in the implementation plan.

Local brainstorming-companion output under `.superpowers/` is ignored. It is never canonical knowledge, a generated product projection, or Pages input.

### 4.1 Root machine manifest

coffee-chat.json is the root machine-readable discovery manifest. Its canonical property shape is:

~~~json
{
  "schema_url": "./schemas/coffee-chat.schema.json",
  "schema_version": "1.0.0",
  "time_zone": "Asia/Seoul",
  "profile": {
    "id": "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
    "display_name": "Public display name"
  },
  "repository": {
    "url": "https://github.com/example/coffee-chat",
    "default_branch": "main"
  },
  "pages_url": "https://example.github.io/coffee-chat/",
  "plugin": {
    "name": "coffee-chat-example",
    "version": "1.0.0",
    "description": "Converse with and apply a public, dated perspective graph."
  },
  "paths": {
    "knowledge_index": "./knowledge/index.json",
    "skills": "./skills/",
    "method": "./method/"
  }
}
~~~

`schema_url` is the repository-relative location of the instance schema; `$schema` and `$id` remain reserved for the schema documents themselves. The root `schema_version` governs `coffee-chat.json`, all authored Notes, the Entity Registry, and the generated index, so authored files do not repeat it. A schema major release is incompatible and requires an explicit, previewed migration; a minor release adds backward-compatible optional capability; a patch release clarifies validation without changing valid data meaning. A validator accepts older versions within its supported major, but rejects a newer major or minor until that validator explicitly supports it.

`schema_version` and `plugin.version` are independently versioned [SemVer](https://semver.org/) strings. Platform marketplace catalogs and manifests derive their shared identity, repository, version, and paths from this file. Root `time_zone` is an [IANA time zone](https://www.iana.org/time-zones) used only to turn agent-observed instants into public calendar dates. It is not a residence claim, and an owner who does not want to publish a local zone may choose `Etc/UTC`.

`plugin.name` is the fork's install namespace, not a global product constant. Initialization proposes a unique lowercase kebab-case name such as `coffee-chat-<public-handle>`, shows it for approval, and generates the same identity into both platform manifests. A collision is never resolved by overwriting another installed Coffee Chat.

It contains no personality, fixed POV, private configuration, or secret.

### 4.2 Generated index

knowledge/index.json is committed because a visitor's remote agent must be able to discover the graph without cloning or running a build. It is generated-only and contains:

- schema and profile identity;
- a deterministic knowledge digest;
- Note, Source, and Entity nodes;
- `cites`, `mentions`, and `links_to` edges;
- stable paths and time metadata needed to retrieve canonical Markdown.

Each generated node uses `id` and `type`; a Note node also exposes its canonical `path` and `content_digest`. Each structural edge follows the conventional triple shape `subject`, `predicate`, and `object`; `predicate` is one of `cites`, `mentions`, or `links_to`. A `cites` edge additionally carries `citation_metadata`, containing the exact Note-local `title`, optional `published_on`, and optional `accessed_on` for that Citation. The index may include additional deterministic retrieval fields defined by its versioned JSON Schema, but it cannot introduce authored meaning.

The triple `(subject, predicate, object)` is the structural edge identity, so a duplicate triple is emitted once. Citation observations remain distinct because a Note may contain an exact Source URL only once while the same Source URL can be cited by many Notes.

The generated index has this normative top-level and record shape:

~~~json
{
  "schema_version": "1.0.0",
  "profile_id": "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
  "knowledge_digest": "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
  "nodes": [
    {
      "id": "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
      "type": "entity",
      "label": "Retrieval-augmented generation",
      "aliases": ["RAG"],
      "kind": "concept",
      "same_as": ["https://en.wikipedia.org/wiki/Retrieval-augmented_generation"]
    },
    {
      "id": "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
      "type": "note",
      "path": "./knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      "content_digest": "sha256:260304ee1f19f5f31c3d5d338bd112f56833669335a177fd129d4129c16375e0",
      "title": "What changed my view on agent evaluation",
      "temporal_coverage": "2025-03/2025-06",
      "recorded_on": "2026-07-30"
    },
    {
      "id": "https://example.com/article",
      "type": "source"
    }
  ],
  "edges": [
    {
      "subject": "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
      "predicate": "cites",
      "object": "https://example.com/article",
      "citation_metadata": {
        "title": "Article title",
        "published_on": "2025-02-14",
        "accessed_on": "2026-07-30"
      }
    },
    {
      "subject": "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
      "predicate": "mentions",
      "object": "48d1c840-5d38-48d0-8e74-7187d9f0c2fd"
    }
  ]
}
~~~

The index does not contain a Derived Perspective, Task Lens, personality summary, confidence score, or semantic rank. It omits wall-clock build times and machine-specific paths so repeated generation is byte-deterministic.

GitHub Pages output is built and deployed but not committed.

### 4.3 Source-repository agent bootstrap

`AGENTS.md` is the thin, vendor-neutral bootstrap for an agent working inside the source repository. It identifies `coffee-chat.json` and routes an explicit owner request to the relevant canonical skill under `skills/`. It does not duplicate the skill or shared method.

`CLAUDE.md` is a thin Claude Code adapter that imports or points to `AGENTS.md` rather than maintaining a second set of project instructions. The installed plugin continues to discover the same canonical skills through the plugin's `skills/` directory.

This distinction keeps both paths simple:

- a cloned source repository becomes authorable through its root agent instructions;
- an installed plugin exposes namespaced skills through the host's native plugin discovery.

## 5. Canonical knowledge model

### 5.1 Vocabulary contract

Coffee Chat uses a small project vocabulary mapped to established knowledge-graph, provenance, and web metadata concepts. The mapping provides interoperability and naming discipline without requiring RDF or JSON-LD in authored files.

| Concept | Coffee Chat term | Machine term | Standards anchor |
| --- | --- | --- | --- |
| One dated authored record | Note | `note` | [Schema.org CreativeWork](https://schema.org/CreativeWork); [PROV Entity](https://www.w3.org/TR/prov-o/#Entity) |
| One public external resource | Source | `source` | [URI](https://www.rfc-editor.org/rfc/rfc3986.html); [Schema.org CreativeWork](https://schema.org/CreativeWork) |
| Note-to-Source relationship | Citation | `cites` | [Schema.org citation](https://schema.org/citation) |
| Disambiguated person, organization, project, technology, or concept | Entity | `entity` | Knowledge-graph entity linking; [Schema.org Thing](https://schema.org/Thing) and [sameAs](https://schema.org/sameAs) |
| Note-to-Entity relationship | Mention | `mentions` | Entity linking; [Schema.org mentions](https://schema.org/mentions) |
| Note-to-Note link | Link | `links_to` | Web and wiki link |
| Question-specific synthesized POV | Derived Perspective | `derived_perspective` | Query-time grounded synthesis; never canonical data |
| Task-specific mental model | Task Lens | `task_lens` | Query-time grounded synthesis; never canonical data |

POV and Mental Model remain product concepts, not stored ontology classes. Derived Perspective and Task Lens make their temporary, scoped nature explicit.

The repository is not named agent memory, persona, avatar, or GraphRAG in machine or public contracts. Those terms imply host-managed persistence, identity simulation, or retrieval infrastructure that v1 does not provide. Coffee Chat uses public dated record for the human-facing corpus and temporal knowledge graph for its technical data model.

### 5.2 Naming, identity, and version conventions

- Coffee Chat-owned YAML and JSON properties use lower `snake_case`.
- Human-facing schema concepts use singular Title Case, such as Note, Source, Citation, and Entity; machine type values remain lowercase.
- Repository-owned path names use lowercase `kebab-case` except host-defined files such as `README.md`, `AGENTS.md`, `CLAUDE.md`, and `SKILL.md`.
- Machine-readable repository paths use `/`, start with `./`, contain no `..`, and must resolve inside the repository without a symlink escape.
- Plugin and Agent Skill identifiers use lowercase `kebab-case`, including `coffee-chat`, `apply-perspective`, and `build-kg`.
- Vendor-defined manifest fields keep the exact casing required by that platform; generated adapters never rename them for stylistic consistency.
- Schema documents use [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) with `$schema` and stable `$id` values. Root `schema_version` governs canonical instances; plugin versions do not double as data-schema versions.
- JSON inputs use strict RFC 8259 parsing before schema validation. Duplicate member names and non-standard extensions such as comments, trailing commas, NaN, or Infinity are structural errors.
- Authored YAML is the JSON-compatible subset of [YAML 1.2.2](https://yaml.org/spec/1.2.2/). The validator rejects duplicate keys, merge keys, aliases, custom tags, and non-JSON values.
- Canonical Coffee Chat objects reject unknown properties so spelling mistakes cannot silently fork the model. New structural properties require a schema release; open Entity kinds, natural-language relationships, and the Markdown body remain semantically extensible.
- Profile, Note, and Entity IDs are canonical lowercase [RFC 9562 UUIDv4](https://www.rfc-editor.org/rfc/rfc9562.html) strings generated before the first Public-content Preview and never edited. They provide identity only and contain no semantic or ordering signal.
- A Source's graph identity is one author-approved absolute HTTP(S) URL stored exactly as written. URL strings are compared byte for byte; the system does not silently normalize them or merge different URLs from titles, similarity, redirects, or inferred canonicalization.
- Optional properties are omitted when unknown. Empty strings, synthetic missing-value labels, and null do not represent missing knowledge.
- IDs, URLs, dates, and temporal ranges are quoted strings in YAML so parsers cannot silently coerce them.
- Canonical text files use UTF-8, LF line endings, and one final newline; the validator rejects other encodings or newline forms instead of silently changing approved bytes.
- Authored frontmatter uses the canonical property order shown below for readable diffs. Property order has no semantic meaning.
- Node type values are singular lowercase nouns: `note`, `source`, `entity`. Structural predicates are present-tense verbs: `cites`, `mentions`, `links_to`.
- A Note node's `content_digest` is the SHA-256 of the complete canonical Markdown file bytes encoded as UTF-8 with LF line endings and one final newline. It uses the same `sha256:<64 lowercase hex characters>` form and makes body changes visible to the graph digest.
- Before digesting, nodes are sorted by `(type, id)` and edges by `(subject, predicate, object)` using Unicode code-point order; generated set-like scalar arrays such as `aliases` and `same_as` are also de-duplicated and sorted. `knowledge_digest` is the SHA-256 of the [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) canonical JSON representation of every top-level index field except `knowledge_digest`; it uses the exact form `sha256:<64 lowercase hex characters>`. The committed JSON uses two-space indentation, UTF-8, LF line endings, and one final newline.

The digests attest to repository content only. They do not attest to remote Source bytes, continued availability, or unchanged meaning at the linked URL.

### 5.3 Note

A Note is one independently revisable authored record with one declared temporal scope. It is stored as Markdown with structured frontmatter. Its filename is `<id>.md`, and the filename ID must equal the frontmatter ID.

Required properties:

| Property | Meaning | Authority |
| --- | --- | --- |
| `id` | Immutable UUIDv4 Note identity | Agent-generated before Public-content Preview |
| `title` | Human-readable title; never an identity key | Author-approved |
| `temporal_coverage` | Time or period to which the thought or experience applies | Author-approved when not explicit |
| `recorded_on` | Calendar date the approved Note was first written in the repository | Agent-generated before Public-content Preview and fixed on write |
| `sources` | One or more public Source records | Source-observed and author-approved |

Optional properties:

| Property | Meaning | Authority |
| --- | --- | --- |
| `entities` | UUIDv4 IDs from the Entity Registry | Agent-proposed and author-approved |

Source record properties:

| Property | Requirement | Meaning |
| --- | --- | --- |
| `url` | Required | Exact approved absolute public URL and Source identity |
| `title` | Required | Source title observed by the agent or confirmed by the author |
| `published_on` | Optional | Source publication date when known |
| `accessed_on` | Optional | Agent-generated date only when retrieval succeeded |

`url` follows RFC 3986 HTTP(S) syntax. `title` and `published_on` map conceptually to Schema.org [`name`](https://schema.org/name) and [`datePublished`](https://schema.org/datePublished); `accessed_on` remains a Note-local Citation observation rather than a Source claim.

The body is free Markdown. It may contain experience, retrospective analysis, learning, interpretation, rebuttal, or application. Those are not separate content types or mandatory sections.

~~~yaml
---
id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61"
title: "What changed my view on agent evaluation"
temporal_coverage: "2025-03/2025-06"
recorded_on: "2026-07-30"
sources:
  - url: "https://example.com/article"
    title: "Article title"
    published_on: "2025-02-14"
    accessed_on: "2026-07-30"
entities:
  - "48d1c840-5d38-48d0-8e74-7187d9f0c2fd"
---

The authored thought begins here.
~~~

### 5.4 Temporal coverage and provenance time

`temporal_coverage` follows the [Schema.org `temporalCoverage`](https://schema.org/temporalCoverage) concept and represents semantic or domain time: when the Note's thought or experience applies. It supports:

- one known position: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`;
- one known closed interval: `<start>/<end>`, where each side uses one of those precisions.

A single position is a dated observation, not an assertion that the view remains valid forever. Reduced precision represents known calendar granularity, not continuous validity. Values must be valid proleptic-Gregorian calendar units. A closed interval includes both endpoint units; comparison expands the start to the first day of its unit and the end to the last day of its unit, and rejects a reversed range. The system never invents a more precise date in authored data.

A selected calendar day matches when it falls inside the expanded coverage; a selected period matches when the two expanded periods overlap. This is filtering behavior, not a claim that the view was continuously held throughout a reduced-precision unit.

Notes that share the same temporal bucket are co-temporal unless their text explicitly relates them. A stable display tie-breaker may order them visually, but IDs, filenames, array positions, and Git commit order never create semantic precedence or causality.

For retrospective writing, `temporal_coverage` states the period the Note says its thought or experience applies to, while `recorded_on` states when that interpretation entered the repository. Query-time synthesis compares both; it never treats either field alone as a complete belief chronology.

These are two complementary temporal axes, not a claim that the repository is a bitemporal database. Human-facing copy calls them perspective time and first recorded date: the first says what period the Note is about, and the second says when that account first became part of the public record.

`recorded_on` is provenance time at calendar-day precision: the date in root `time_zone` on which the approved Note first entered the repository. It maps conceptually to [PROV `generatedAtTime`](https://www.w3.org/TR/prov-o/#generatedAtTime) without claiming instant precision or requiring PROV serialization. The agent freezes it immediately before Public-content Preview; a date rollover before write requires a regenerated preview. `published_on` is Source publication time and preserves known `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` precision. `accessed_on` is the full date in root `time_zone` on which the agent successfully retrieved that Source. These fields are never substituted for one another.

`recorded_on` remains unchanged when a Note receives a factual correction; it is not amendment time. A Citation's `accessed_on` is also frozen with the approved Note; later availability checks report external status without silently rewriting it. The current graph contains the corrected Note, while an actual as-of repository reconstruction must read the historical Git revision. A semantic change creates a new Note instead.

Changing root `time_zone` affects only dates observed after the approved configuration change. It never rewrites existing `recorded_on` or `accessed_on` values.

### 5.5 Source identity and reuse

Sources and Notes have a many-to-many relationship:

- one Note may cite several public Sources;
- the same Source may appear in any number of Notes;
- each Note-to-Source Citation is preserved with its Note, time, and natural-language context.

There is no separately authored Source registry. The Citation record inside each Note is the only authored location for its Source URL and observed title/date metadata; Source nodes are generated from those records.

Within one Note, an exact stored URL appears once in `sources`; a duplicate is a structural error, while repeated body links remain available as Markdown context. Across Notes, a Source may recur without limit.

The `sources` array is the authoritative set of external resources cited by that Note. Every external HTTP(S) Markdown link in the body must exactly match one declared Source URL; the agent adds it during preview rather than asking the owner to maintain both places. Internal Note links remain separate, and remote images or embeds are not supported in canonical Note Markdown in v1.

The generated index groups the same exact approved URL as one Source node while retaining every `cites` edge and its Note-local metadata. If repeated Citations captured different titles or dates, the index preserves the distinct observations instead of selecting one as authoritative. Repetition never becomes independent corroboration, confidence, importance, or endorsement. Different URLs remain distinct Sources unless the owner explicitly changes the canonical data through the approved authoring flow.

### 5.6 Entity Registry

knowledge/entities.yml is the only authored identity-mapping entry point.

| Property | Requirement | Meaning |
| --- | --- | --- |
| `id` | Required | Immutable UUIDv4 Entity identity, minted before Public-content Preview |
| `label` | Required | Author-approved primary display label; never an identity key |
| `aliases` | Optional | Other observed names used for deterministic mention lookup |
| `kind` | Optional | Open-text disambiguation hint, not a closed taxonomy |
| `same_as` | Optional | Exact public URLs that unambiguously identify the same Entity |

~~~yaml
- id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd"
  label: "Retrieval-augmented generation"
  aliases:
    - "RAG"
  kind: "concept"
  same_as:
    - "https://en.wikipedia.org/wiki/Retrieval-augmented_generation"
~~~

`same_as` follows the [Schema.org `sameAs`](https://schema.org/sameAs) meaning: a public URL that unambiguously identifies the same thing. The Registry answers whether differently worded mentions refer to the same concept, technology, project, person, or organization. It stores neutral identity and disambiguation, not the author's opinion about the Entity.

Entity kinds remain open. There is no required hierarchy or closed allowlist. If an identity match is ambiguous, the authoring agent asks or leaves the Note unlinked.

An Entity keeps its ID while its real-world referent remains the same; label, alias, kind, or `same_as` corrections do not mint a new identity. Entity merge or split is never automatic. The Public-content Preview shows every affected Note mapping, new ID, and retired unreferenced record; Git history provides the audit trail rather than a stored redirect ontology in v1.

### 5.7 Relationships and lightweight ontology

The ontology is intentionally lightweight:

- Notes, Sources, and Entities are nodes;
- `cites` and `mentions` are generated structural edges;
- internal Markdown links to canonical Note paths generate `links_to` edges between Notes;
- link-adjacent natural language carries the relationship's meaning;
- `temporal_coverage` enables timeline and historical reconstruction.

The system does not persist supports, contradicts, supersedes, maturity, or confidence as a closed semantic taxonomy. A graph database, RDF store, or manually maintained ontology file is not required in v1.

### 5.8 Correction, evolution, and contextual coexistence

The authoring agent distinguishes three cases:

1. Correction: the Note did not express what was true at its own `temporal_coverage`. Edit the existing Note, preserve its ID and original `recorded_on`, and retain the Git diff.
2. Evolution: the earlier Note was valid then, but experience or learning changed the view. Preserve it, create a new Note, and link the change in natural language.
3. Contextual coexistence: different views remain valid under different conditions. Preserve separate Notes and explain their applicable situations.

Similarity, recency, frequency, and Source count never choose a case automatically. The agent asks when the distinction is unclear.

## 6. Query-time synthesis

A perspective is not retrieved as a stored object. The agent synthesizes it on demand from a relevant temporal subgraph.

### 6.1 Shared method

All skills that answer from the graph use the same method:

1. Scope: identify the question, task, Entity aliases, requested time, and situation.
2. Retrieve: select relevant Notes, Sources, Entities, backlinks, earlier views, later views, and materially different directions.
3. Reconstruct: compare `temporal_coverage` with `recorded_on`, then interpret explicit change explanations and situational differences.
4. Synthesize: form a question-specific Derived Perspective and, only when useful and supported, a Task Lens.
5. Apply: answer or perform the task while exposing the relevant evidence and limitations.
6. Do not write back: never persist the Derived Perspective or Task Lens in Coffee Chat data, generated projections, or plugin snapshots.

### 6.2 Provenance labels

Answers preserve four provenance and support labels:

- Authored: what the owner directly wrote in a Note.
- Sourced: what a linked public Source says.
- Inferred: what the agent synthesizes for this question or task.
- Unknown: what the graph does not establish, including unresolved tension.

Presentation may be conversational and adaptive. Every answer does not need a rigid template, but these labels must remain distinguishable whenever confusion is possible. They communicate provenance and support, not confidence scores.

### 6.3 Temporal interpretation

The agent interprets difference before naming contradiction:

- different times may represent evolution;
- different situations may allow both views to coexist;
- incompatible views without an explained relationship remain unresolved tension;
- the latest Note is not automatically the current view for every situation.

A historical question may constrain perspective time, record time, or both. If that difference would materially change the answer, the agent asks which meaning the user intends:

- a perspective-time query selects Notes whose `temporal_coverage` matches the requested period; a later-recorded retrospective may be used only when its later `recorded_on` is disclosed as hindsight, never as contemporaneous evidence;
- a first-recorded cutoff filters the current corrected corpus by `recorded_on`, excluding every Note first recorded after the requested date regardless of what earlier period it describes; it does not reconstruct pre-correction bytes;
- a combined query applies both constraints.

If the user asks what the repository actually contained at a past date, the agent resolves and reads the corresponding Git revision and labels the result as an as-of repository snapshot. If that revision is unavailable, the answer is Unknown rather than a reconstruction from today's files.

For a current query, the agent reconstructs the latest relevant trajectory rather than selecting the newest Note mechanically. If no Note establishes a current applicable view, the result remains Unknown.

### 6.4 Derived Perspective and Task Lens

Derived Perspective answers:

> How does the author appear to view this topic at this time and in this situation, and why?

Task Lens answers:

> What provisional decision lens can be synthesized from the relevant documented perspectives for this task?

A Task Lens is the product's task-specific Mental Model. It is not a personality description or a universal rule about the author. The agent creates it only when the relevant graph supports a useful abstraction, and states its evidence, applicability, and important limitations.

### 6.5 Conversation and application modes

Coffee Chat:

- must not modify the repository;
- discloses that it is an AI-generated synthesis of public, dated records;
- speaks conversationally without claiming to literally be the person;
- does not invent private or unrecorded experience;
- cites Note and public Source links near material claims;
- may compare a visitor's stated work situation with documented perspectives and surface supported alignments, tensions, and Unknowns without producing a personality, compatibility, or hiring score;
- asks natural follow-up questions when useful.

Apply Perspective:

- reads knowledge without modifying it;
- performs the user's current task;
- reports which Notes and Derived Perspective influenced material decisions;
- treats the derived lens as advisory;
- never overrides current user instructions, project rules, permissions, or safety boundaries.

Both modes have a hard Coffee Chat write firewall. Coffee Chat initiates no persistent repository, installation, or configuration mutation. It may retrieve public Sources, and the host may retain normal conversation logs or transient caches under its own policy. Apply Perspective may modify only task targets the user explicitly named and only outside the Coffee Chat source repository or installed plugin; it never writes its synthesis back to Coffee Chat. Agent Skills do not provide a cross-platform read-only permission primitive, so host permissions remain authoritative and evaluations verify these boundaries.

Each result identifies the selected temporal scope, whether live knowledge or a snapshot was used, and the `knowledge_digest` and source commit when available. This receipt supports reproduction without forcing the conversation into a rigid answer template.

## 7. Build KG authoring workflow

Only `build-kg` may initialize public Coffee Chat metadata or write canonical knowledge, and only inside the authoritative source checkout.

### 7.1 Flow

1. Give: the owner supplies one or more public Source links and their thoughts.
2. Connect: the agent reads the Sources as untrusted data, retrieves related Notes and Entities, and identifies possible temporal relationships.
3. Clarify: the agent asks a compact adaptive set only for material ambiguity and follows up only when an answer creates a new material ambiguity.
4. Materialize and validate: without touching canonical files, the agent mints new IDs, freezes observed dates, builds the complete candidate state and deterministic projections, and validates them.
5. Preview: the agent displays one complete Public-content Preview bound to the candidate and current repository state.
6. Approve: the owner chooses Approve local write or Revise.
7. Preflight: immediately before mutation, the agent rechecks the candidate, repository base, frozen observations, calendar date, and every approved setup-effect target. Any change invalidates approval and returns to Preview.
8. Write: the agent applies only the approved canonical diff and regenerates its deterministic projections.
9. Apply setup effects: the agent performs only the separately approved repo-local setup effects, then verifies their exact targets. It never overwrites or silently chains an unmanaged hook.
10. Revalidate: the agent proves the applied canonical state matches the approved candidate and passes the shared validator; it never auto-repairs authored meaning.
11. Receipt: the agent reports stable IDs, changed files, applied setup effects, validation results, candidate knowledge digest, and expected Pages paths. A setup failure is reported as a partial local result and is never hidden or treated as permission to improvise a different hook change.

No canonical write occurs during Source reading, retrieval, interviewing, drafting, candidate materialization, or validation. Approval is invalid if the candidate, frozen Source observations, configured-zone calendar date, any canonical input read to create it, or an approved setup-effect target changes before Preflight completes. Commit, push, and Pages publication remain separate explicit actions.

### 7.2 Adaptive interview

The agent does not ask for fields already established by the Source, existing graph, or conversation. It asks only when needed about:

- the owner's actual interpretation;
- `temporal_coverage`;
- correction versus evolution versus contextual coexistence;
- ambiguous Entity identity;
- whether one conversation contains thoughts that should remain independently revisable;
- wording or details that will become public.

Interpretation, rebuttal, and application are encouraged when meaningful, but no fixed question set, minimum length, or field count is imposed.

### 7.3 Public-content Preview

The preview shows:

- all new and edited Note fields, including proposed IDs, `temporal_coverage`, and `recorded_on`;
- the complete public Markdown body;
- every Citation with its public Source URL and observed metadata;
- reused Entities and complete proposed Entity Registry records;
- links to earlier views and the described change;
- the canonical diff, base commit and relevant pre-existing worktree changes;
- affected generated paths and candidate `knowledge_digest`;
- separately labeled local-only setup effects, including the exact repository hook path when initialization installs pre-commit;
- a passing candidate-validation result;
- unresolved Source limitations;
- secret and privacy warnings.

Approval authorizes only the exact local write and separately listed repo-local setup effect represented by that preview. It does not authorize a commit, push, release, or Pages publication. Generated bytes need not be printed inline when their affected paths and candidate digest are shown and the complete candidate remains inspectable.

### 7.4 Source and privacy handling

Fetched pages are untrusted evidence. The agent ignores prompt-like instructions embedded in a Source.

Canonical Notes, Citation metadata, Entity records, and the generated index are also evidence data, not execution instructions. Only the user's current request, host/project instructions, the selected `SKILL.md`, and its generated shared-method reference may direct agent behavior.

If a link is unavailable, the agent does not reconstruct its contents from a title, search snippet, URL, or model memory. It requests an alternate public link or explicit owner confirmation of the publicly available material and marks any access limitation in the preview. Private, signed, credential-bearing, or local-file Sources are rejected.

Public availability alone does not make aggregation harmless. The preview flags exact location, contact details, third-party personal data, minors, and sensitive health or financial details. Secrets are blocked rather than warned.

The agent must not infer endorsement, importance, causality, current truth, `temporal_coverage`, Entity identity, or relationship meaning from selection, silence, similarity, recency, frequency, or counts.

## 8. Plugin architecture and lifecycle

Coffee Chat is distributed as one plugin with several focused skills. This matches the common plugin shape supported by Codex and Claude while keeping workflow logic task-specific.

### 8.1 Skills

| Skill | Purpose | Required side-effect behavior |
| --- | --- | --- |
| `coffee-chat` | One conversation about the author's documented views | Initiates no persistent repository, installation, or configuration mutation |
| `apply-perspective` | Apply a Derived Perspective and optional Task Lens to a task | May edit explicitly named task targets, but never the Coffee Chat source repository, installed plugin, or their generated projections |
| `build-kg` | Initialize the fork or extend its canonical graph through the approved authoring flow | May write approved paths in the source repository only after exact Public-content Preview approval |

Each `SKILL.md` is a thin router with a precise trigger and boundary. Shared provenance, temporal reconstruction, and side-effect behavior live once under `method/`.

For Agent Skills-compatible progressive disclosure, each skill receives a generated local `references/method.md` projection. The root `method/` remains the only authored copy; skill-local projections are tracked delivery artifacts, never edited by hand, and validation fails on drift.

These are Coffee Chat behavior contracts, not claims of a native cross-platform Agent Skills permission system. Host permissions and user instructions remain authoritative.

If `build-kg` is invoked from an installed plugin cache or any directory that is not the authoritative source checkout, it must not edit the cached package. It directs the user to open or fork the source repository first.

### 8.2 Cross-platform packaging

The common skills/ layout and method are shared. Platform-specific manifests and marketplace catalogs are generated from coffee-chat.json:

- .codex-plugin/plugin.json;
- .claude-plugin/plugin.json;
- Codex marketplace catalog;
- Claude marketplace catalog.

Generated manifests must agree on shared identity, version, repository, and skill inventory while allowing platform-specific presentation fields.

Every skill follows the open [Agent Skills format](https://agentskills.io/specification): the frontmatter `name` matches its parent directory, the `description` states both what the skill does and when it should activate, and detailed material is loaded progressively. Platform-specific frontmatter is added only when the host requires it and cannot redefine the shared method.

The optional Agent Skills `compatibility` field discloses required network, filesystem, and Git access. The experimental `allowed-tools` field may improve host ergonomics where supported, but Coffee Chat never treats it as a cross-platform permission or no-write security boundary.

### 8.3 Live knowledge and fallback

Both direct Coffee Chat and the installed plugin prefer the canonical public knowledge index. Adding a new Note does not require publishing a new workflow version.

The installed plugin may include a generated knowledge snapshot for offline fallback. A fallback answer must disclose:

- that the snapshot, not the live graph, is in use;
- its knowledge digest;
- its installed plugin version and source commit when the host exposes one;
- its derived `latest_recorded_on`, if the snapshot contains Notes.

The snapshot is a cache, never a second authority.

### 8.4 Installation and removal

The initial agent handoff asks the user to choose Coffee Chat or install the plugin. One-time Coffee Chat is the zero-install path. Before installing, the agent shows the host-supported scopes, recommends the narrowest scope that satisfies the request, and discloses the marketplace source, files or cache affected by the host, update behavior, and official removal command. It never selects a shared project/workspace scope without explicit approval.

The installer verifies that the package matches the declared skill-only v1 shape. Unexpected hooks, MCP servers, agent definitions, LSP servers, background monitors, settings, binaries, or manifest drift stop installation and are shown to the user.

Codex and Claude native plugin managers own installation, enablement, update, disablement, and removal. Coffee Chat does not copy arbitrary global files or modify unrelated skills and project instructions.

Distinct forks use distinct plugin namespaces so they can coexist. Removing one Coffee Chat uses the host's official command and must not remove another fork, marketplace source, unrelated skill, or project instruction; host-owned caches follow the host's documented lifecycle. The removal receipt states what was removed, whether the marketplace remains configured, and any host-owned cache or data the official command intentionally retains.

Plugin runtime hooks are excluded from v1. Implicit hooks could run in unrelated sessions, differ by host, and become a hidden behavioral or semantic rule engine. Repository validation hooks remain owner-side only.

No MCP server is required in v1. The static public graph, agent instructions, and existing web/filesystem tools are sufficient. An MCP server remains a future option if controlled remote retrieval or hosted tooling becomes necessary.

## 9. README and GitHub Pages

### 9.1 README

The README is short, bilingual, and action-first. English and Korean appear as paired lines rather than two long duplicated documents.

Above the fold it contains:

1. product name;
2. one-sentence purpose;
3. AI-generated synthesis disclaimer;
4. Coffee Chat action;
5. Install plugin action;
6. secondary links to Make mine and Browse the KG.

The disclosure is explicit and paired bilingually:

> This is an AI-generated synthesis of public, dated records—not the person and not a statement of unrecorded beliefs.
>
> 공개된 날짜별 기록을 바탕으로 AI가 만든 해석입니다. 본인이 아니며, 기록되지 않은 생각을 대신 말하지 않습니다.

The copyable universal prompt tells the agent to open the repository, follow coffee-chat.json, ask which mode the user wants, use only public dated evidence, and distinguish Authored, Sourced, Inferred, and Unknown content.

Architecture, schemas, detailed commands, and contribution notes remain below the first screen or in linked documentation. Installation commands are generated from canonical metadata so forks cannot leave stale owner, repository, or plugin names in the README.

Immediately after the actions, the README explains the product in exactly two short conceptual blocks:

1. Build the public record: public Sources plus dated thoughts become linked Notes, Sources, and Entities in a temporal knowledge graph.
2. Use the public record: an agent retrieves the relevant temporal subgraph, produces a Derived Perspective and optional Task Lens, uses them with evidence, and never writes that synthesis back to the public record.

These are explanatory blocks, not additional setup steps or a second schema.

### 9.2 Fork onboarding

The public onboarding is:

1. Fork the repository.
2. Explicitly choose **Make mine** or **Contribute**. The agent never infers intent from fork ownership, repository name, or existing files.
3. Open the fork in Codex or Claude Code.
4. For **Make mine**, ask the agent to initialize Coffee Chat and add the first public Source. For **Contribute**, preserve the upstream profile, Notes, Entities, and plugin namespace and follow the contribution path without initialization or personal-data cleanup.

Initialization configures the public profile, plugin identity, Pages URL, generated files, and repo-local pre-commit hooks. Before the first public write, it explains that public Git history, forks, clones, and caches are difficult to retract.

Initialization is handled by `build-kg` and uses the same materialize, validate, Public-content Preview, and exact local-write approval boundary as a Note. In the normal first-run journey, profile/plugin configuration and the first Note are one candidate, so the owner does not complete a separate schema setup wizard.

For Make mine, upstream personal Notes and Entity mappings are never adopted as the new owner's knowledge. The initialization candidate removes them from the current tree, creates a new Profile ID and plugin namespace, retains only Entities required by the approved first Note, and regenerates every projection. It does not rewrite shared Git history; the preview discloses that the upstream public records remain visible in fork history but are absent from the new canonical graph. The **Contribute** branch never runs this re-identification flow.

### 9.3 GitHub Pages

Top-level views:

- Home: intent, disclosure, quick actions, latest available graph metadata.
- Timeline: Notes and linked changes with both temporal coverage and recorded date visible.
- Graph: Note, Source, and Entity connections.
- Detail: canonical thought, temporal coverage, public Sources, Entities, and backlinks.

A Source detail view uses the URL as identity and lists Note-local title and date observations by Citation. It does not select a canonical title or date when the records differ.

Shared Perspective time and First recorded by controls apply the temporal comparison rules from sections 5.4 and 6.3 to the current corrected corpus in Timeline and Graph. The interface says that this is not a historical repository snapshot. Every derived view exposes both selected axes, the authoritative repository, knowledge digest, and source commit available to the build.

Pages does not derive or publish a Derived Perspective or Task Lens. If Pages, a plugin cache, and the repository disagree, the repository wins.

Pages treats Note Markdown, Citation metadata, and Entity labels as untrusted presentation input: it disables or sanitizes raw HTML, permits only approved HTTP(S) and repository-relative link schemes, never embeds fetched Source bodies, and prevents external links from controlling the opener page.

## 10. Guardrails and automation

### 10.1 One validator

One deterministic repository-owned validator is called by:

- build-kg on the existing repository, the materialized candidate, and the applied approved write;
- local pre-commit for staged changes;
- GitHub Actions for the whole repository.

Each validation error has a stable lowercase kebab-case `code`, repository-relative POSIX `path`, optional [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901.html) `pointer`, and a redacted human-readable `message`. Exit code 0 means no errors, 1 means one or more validation errors, and 2 means the validator itself could not complete. The validator does not emit semantic quality scores or warnings.

CI is the authoritative release and merge gate because Git hooks are local and can be absent or deliberately bypassed. The maintained repository requires its validation status through a branch ruleset; fork initialization offers to configure an equivalent rule when the host and user permissions allow it.

### 10.2 Deterministic hard failures

| Area | Hard failure |
| --- | --- |
| Schema | Unparseable Markdown/YAML/JSON, non-canonical text encoding/newlines, unsupported schema version, duplicate YAML key or JSON member, wrong required type, duplicate Source URL within one Note, or missing required public Source |
| Identity | Duplicate or illegally changed stable IDs, Note filename/ID mismatch, or unknown Entity IDs |
| Time | Invalid IANA time zone, invalid supported date syntax, or reversed interval |
| Links and paths | Broken internal Note link, path escape, undeclared external body link, remote image/embed, unsafe scheme, or credential-bearing/private/local URL |
| Security | Secret, token, API key, private key, or tracked credential file |
| Generation | Non-deterministic index, stale generated file, skill-local method projection drift, or manifest/catalog drift |
| Packaging | Missing skill or asset, invalid platform package, or undeclared v1 hook/MCP/agent/LSP/monitor/settings/binary component |
| Publication | Pages build failure, or Derived Perspective, Task Lens, query-time cache, or excluded local artifact entering Git or Pages |

Unreachable or drifting external Sources, ambiguous Entity candidates, uncertain temporal precision, sensitive-data aggregation, and host availability are adaptive authoring or use-time observations. The agent exposes them in the Public-content Preview or answer without converting them into validator rules, counts, scores, or CI failures. Diagnostics and Gitleaks output never print a matched sensitive value.

### 10.3 Gitleaks pre-commit gate

The repository includes Gitleaks in `.pre-commit-config.yaml` pinned to a full immutable commit SHA, with the human-readable release tag retained as a comment.

Fork initialization runs `pre-commit install` for that clone. On `git commit`:

1. Gitleaks scans staged content in redacted mode.
2. A finding exits non-zero and the commit is not created.
3. The Coffee Chat structural validator runs.
4. The commit is created only when both pass.

Agents must not use `--no-verify`, `SKIP=gitleaks`, or automatically create an allowlist to force a commit. A suspected false positive is shown to the owner for explicit review. Allowlists contain narrowly explained patterns or paths, never a copied real secret.

Initialization inspects `.git/hooks/pre-commit` before installation and shows the exact change. It never overwrites or silently chains an unmanaged existing hook; a conflict pauses for explicit owner-directed integration. `pre-commit uninstall` removes only the framework-managed hook for that clone.

GitHub Actions runs the same pinned Gitleaks configuration explicitly so local hook bypass does not make a change mergeable. GitHub secret scanning and push protection are enabled where available as independent defense-in-depth controls.

### 10.4 CI and Pages deployment

Pull request workflow:

1. read-only checkout;
2. full schema, identity, time, internal/public-URL, and secret validation;
3. clean deterministic regeneration and zero diff;
4. Codex and Claude package validation;
5. Pages build and offline asset/link inspection.

It uses pull_request rather than pull_request_target, receives no repository secrets, defaults to `contents: read`, and pins every Action and tool dependency to a full immutable commit or artifact digest with a readable version comment.

Main-branch workflow repeats validation and build, uploads only the explicit site output, and deploys through a separate `github-pages` environment job. Only that job receives `pages: write` and `id-token: write`; all other permissions remain disabled or read-only.

### 10.5 Explicit non-gates

Hooks and CI never enforce:

- a minimum number of Sources beyond the defining requirement that a Note is publicly grounded;
- content length;
- confidence or importance scores;
- personality, compatibility, or hiring scores;
- graph density;
- a closed author-assigned semantic-relation vocabulary beyond the three generated structural predicates;
- Entity taxonomy completeness;
- Derived Perspective maturity or promotion;
- consistency of the author's views;
- whether a thought is correct.

## 11. Error handling

| Situation | Required behavior |
| --- | --- |
| Public Source cannot be fetched | Do not guess; request alternate public evidence or owner confirmation and expose the limitation |
| Private or signed Source | Reject it from canonical knowledge |
| `temporal_coverage` is ambiguous | Ask; do not substitute `published_on`, `accessed_on`, or `recorded_on` |
| Historical query says only “then” or “as of” and the two axes change the answer | Ask whether the user means perspective time, a first-recorded cutoff over today's corrected corpus, an actual as-of Git snapshot, or a combination |
| Entity match is ambiguous | Show candidates or leave unlinked; never merge from similarity alone |
| Sources disagree | Attribute the disagreement; do not resolve by vote or Source count |
| Candidate, observed metadata, date, or base state changes after approval | Invalidate approval and show a new Public-content Preview |
| Agent loses the candidate or approval context | Re-materialize, revalidate, and show a new Public-content Preview; never reconstruct approval from Git state or an old receipt |
| Validation fails after write | Do not commit or publish; preserve a clear recoverable diff and explain the failure |
| Source later changes or disappears | Keep the historical Note; report the failed access during use without changing the deterministic index; request owner review |
| Live KG unavailable to plugin | Use an identified snapshot only if available; otherwise state that evidence cannot be accessed |
| Plugin namespace already installed from another source | Show the existing and requested sources; do not overwrite, and ask the user to rename the fork or remove the existing installation explicitly |
| Existing unmanaged pre-commit hook | Do not overwrite or silently chain it; show the conflict and request explicit integration direction |
| Pages lags or fails | Keep repository authoritative and show the last successfully built source commit |

## 12. Testing strategy

### 12.1 Data and generator tests

- valid and invalid Note frontmatter;
- partial and ranged dates without invented precision;
- valid calendar units, inclusive mixed-precision interval comparison, and reversed-range rejection;
- IANA time-zone validation and configured-zone date rollover;
- quoted temporal and identifier values without YAML coercion;
- YAML duplicate-key, alias, merge-key, tag, and non-JSON-value rejection;
- JSON duplicate-member and non-standard syntax rejection before schema validation;
- UUIDv4 canonical syntax and immutability for Profile, Note, and Entity IDs;
- Note filename/frontmatter ID equality and base-branch ID mutation detection;
- duplicate and mutated IDs;
- Entity alias resolution and ambiguous identity;
- approved Entity label correction, merge, and split with all affected Note mappings and no dangling IDs;
- one Note with several Sources;
- duplicate exact Source URLs rejected within one Note;
- external body links require an exact declared Source URL, while repeated inline occurrences remain valid;
- one Source reused across several Notes;
- preservation of every `cites` edge;
- preservation of distinct Note-local Citation metadata for one repeated URL;
- frozen `recorded_on` and `accessed_on` values after approval;
- Markdown links and backlinks;
- repository-relative path normalization and symlink-escape rejection;
- byte-identical repeated index generation, Note content digests, normative sort order, and RFC 8785 knowledge-digest calculation;
- a Note body-only change changes both its `content_digest` and `knowledge_digest`;
- exclusion of Derived Perspective, Task Lens, query-time cache, site build output, and local `.superpowers/` artifacts.

### 12.2 Query-time skill evaluations

Representative fixtures verify that:

- coffee-chat asks for the initial mode when entered from a repository URL;
- perspective-time answers label later-recorded retrospectives as hindsight rather than contemporaneous evidence;
- first-recorded cutoff answers exclude Notes recorded after the cutoff and disclose that the corpus contains current corrected content;
- actual as-of repository questions read the matching historical Git revision or return Unknown when it is unavailable;
- combined historical queries apply both temporal axes;
- current answers reconstruct a trajectory rather than choosing the newest Note blindly;
- situational differences are not mislabeled as contradictions;
- repeated Sources do not inflate evidence;
- Authored, Sourced, Inferred, and Unknown remain distinguishable;
- apply-perspective identifies which Notes and Derived Perspective affected a task;
- coffee-chat produces no repository writes;
- apply-perspective may change explicitly requested task artifacts but never canonical Coffee Chat knowledge;
- build-kg validates the candidate and requires exact Public-content Preview approval;
- changes to candidate inputs or approved setup-effect targets invalidate approval before write;
- initialization applies and verifies only the exact approved pre-commit setup effect, and reports a partial result if that setup fails;
- no skill invents personality or private experience or produces a compatibility or hiring score.

### 12.3 Packaging and lifecycle tests

- generated skill-local method references match the canonical root method inputs;
- both generated manifests parse and expose the same skill inventory;
- Agent Skill names, descriptions, compatibility declarations, and progressive-disclosure references validate against the open format;
- the packaged v1 inventory contains no hook, MCP server, agent definition, LSP server, monitor, settings, or binary component;
- marketplace entries resolve to the plugin source;
- opening the source repository in Codex or Claude Code routes owner requests through the thin AGENTS.md and CLAUDE.md bootstraps to the canonical skills;
- install, reload/new-session discovery, update, disable, and remove smoke tests for supported Codex and Claude surfaces;
- co-install two fork namespaces and remove one without changing the other or unrelated host configuration;
- live KG preference and snapshot disclosure;
- the first fork action requires an explicit Make mine or Contribute choice;
- a Make mine fork removes upstream knowledge from the current graph and regenerates all owner-specific metadata without stale upstream values;
- a Contribute fork leaves upstream profile and knowledge identity unchanged and cannot enter re-identification cleanup.

### 12.4 Security and release tests

- representative secrets are blocked before commit and in CI;
- logs redact detected values;
- credential-bearing URLs and private file paths fail;
- authoring fixtures surface likely aggregation risks in the preview without automatic rejection;
- agents do not bypass hooks;
- prompt-like text seeded in a Source, Note, Citation title, Entity label, or index field cannot redirect the selected workflow;
- Pages contains only the approved public artifact inventory.
- rendered Markdown and metadata fixtures cannot execute script or opener-control payloads.

### 12.5 End-to-end acceptance path

The primary end-to-end test is:

1. create a fork and explicitly choose Make mine;
2. initialize it with an agent;
3. add one public Source and complete one adaptive interview;
4. approve a Public-content Preview for the exact local write;
5. generate a valid first Note and Entity mapping;
6. block a seeded secret before commit;
7. pass CI;
8. deploy Pages;
9. run one URL-based Coffee Chat;
10. install and remove the plugin on supported hosts.

## 13. Success criteria

The first release succeeds when:

- a person with no schema knowledge can fork the repository and create a complete first Note through an agent;
- a visitor can paste the repository URL into an agent and choose Coffee Chat or plugin installation;
- the graph supports multiple and repeated Sources without treating repetition as confidence;
- a time-aware query explains an earlier view, change context, later view, and unresolved gaps;
- no Derived Perspective, Task Lens, personality profile, or fixed Mental Model exists in Git or Pages;
- Codex and Claude packages consume the same skills and shared method;
- the plugin can be installed and removed through native managers without modifying unrelated workflow files;
- Gitleaks prevents a detected staged secret from becoming a normal commit and CI repeats the check;
- GitHub Pages exposes the same Notes, Sources, Entities, timeline, graph, backlinks, perspective-time state, and first-recorded cutoff as the current canonical repository;
- all generated surfaces can be recreated from canonical inputs without drift.

## 14. Explicit v1 non-goals

- hosted chat backend or model API;
- account system, comments, or web editing;
- private-source ingestion;
- full-text source archiving;
- manually authored Derived Perspective, Task Lens, POV, or Mental Model pages;
- personality simulation or first-person impersonation;
- graph database, RDF store, or Palantir-scale ontology system;
- semantic ranking, confidence scoring, or promotion workflow;
- plugin MCP server or runtime hooks;
- automatic publication or push without owner approval;
- public marketplace submission before local and Git-repository marketplace validation.

The exact implementation language, static-site framework, graph visualization library, and packaging scripts are intentionally left to the implementation plan. They may change without changing this product contract.

## 15. Implementation slices

This is one product specification because the data, query-time synthesis, packaging, and public projection share one contract. Implementation should still proceed in independently verifiable slices:

1. Core knowledge: schemas, Note and Entity fixtures, deterministic index, and validator.
2. Agent behavior: shared method, source-repository bootstraps, coffee-chat, apply-perspective, and build-kg.
3. Distribution: canonical plugin metadata, Codex and Claude manifests, marketplace catalogs, and lifecycle smoke tests.
4. Public projection: concise bilingual README, Timeline, Graph, Detail, and two-axis temporal behavior.
5. Release safety: Gitleaks pre-commit, CI, generated-file drift checks, and Pages deployment.

Each slice depends only on the stable contracts defined above and must pass its own tests before the next slice relies on it.

## 16. Official standards and compatibility references

- [OpenAI Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [OpenAI Plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI agent skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code plugin discovery and lifecycle](https://code.claude.com/docs/en/discover-plugins)
- [Agent Skills specification](https://agentskills.io/specification)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [YAML 1.2.2](https://yaml.org/spec/1.2.2/)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [Schema.org citation](https://schema.org/citation)
- [Schema.org mentions](https://schema.org/mentions)
- [Schema.org name](https://schema.org/name)
- [Schema.org datePublished](https://schema.org/datePublished)
- [Schema.org temporalCoverage](https://schema.org/temporalCoverage)
- [Schema.org sameAs](https://schema.org/sameAs)
- [RFC 3986 URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986.html)
- [RFC 8259 JSON](https://www.rfc-editor.org/rfc/rfc8259.html)
- [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901.html)
- [RFC 9562 UUIDs](https://www.rfc-editor.org/rfc/rfc9562.html)
- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub secret-removal prevention guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Gitleaks pre-commit integration](https://github.com/gitleaks/gitleaks#pre-commit)
- [Obsidian links, backlinks, and graph concepts](https://obsidian.md/help/links)
- [W3C Time Ontology](https://www.w3.org/TR/owl-time/)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/)
