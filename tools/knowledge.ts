import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { dirname, posix } from "node:path";
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { fromMarkdown } from "mdast-util-from-markdown";
import {
  type Diagnostic,
  UnableToComplete,
  ValidationFailure,
  containsUnpairedUnicodeSurrogate,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import type { Snapshot } from "./snapshot.ts";
import { createBaseSnapshot } from "./snapshot.ts";
import {
  decodeCanonicalText,
  parseMarkdownDocument,
  parseStrictJson,
  parseStrictYaml,
} from "./strict-input.ts";
import { expandPartialDate, expandTemporalCoverage } from "./temporal.ts";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fullDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const schemaFiles = [
  "coffee-chat.schema.json",
  "note-frontmatter.schema.json",
  "entity-registry.schema.json",
  "knowledge-index.schema.json",
] as const;

export type Citation = {
  url: string;
  title: string;
  published_on?: string;
  accessed_on?: string;
};

export type NoteFrontmatter = {
  id: string;
  title: string;
  temporal_coverage: string;
  recorded_on: string;
  sources: Citation[];
  entities?: string[];
};

export type Entity = {
  id: string;
  label: string;
  aliases?: string[];
  kind?: string;
  same_as?: string[];
};

export type EngineManifest = {
  schema_url: string;
  schema_version: string;
  repository_role: "engine";
  repository: { url: string; default_branch: string };
  pages_url: string;
  plugin: { name: "coffee-chat"; version: string; description: string };
  marketplace_name: "coffee-chat-marketplace";
  paths: { skills: string; method: string };
};

export type InstanceManifest = {
  schema_url: string;
  schema_version: string;
  repository_role: "instance";
  time_zone: string;
  profile: { id: string; display_name: string; short_name: string };
  repository: { url: string; default_branch: string };
  pages_url: string;
  plugin: { name: string; version: string; description: string };
  marketplace_name: string;
  paths: { knowledge_index: string; skills: string; method: string };
};

export type Manifest = EngineManifest | InstanceManifest;

export function isEngineManifest(value: Manifest): value is EngineManifest {
  return value.repository_role === "engine";
}

export function isInstanceManifest(value: Manifest): value is InstanceManifest {
  return value.repository_role === "instance";
}

export type LoadedNote = {
  path: string;
  bytes: Buffer;
  frontmatter: NoteFrontmatter;
  body: string;
  noteLinks: string[];
};

export type EngineGraph = {
  manifest: EngineManifest;
  entities: [];
  notes: [];
};

export type InstanceGraph = {
  manifest: InstanceManifest;
  entities: Entity[];
  notes: LoadedNote[];
};

export type KnowledgeGraph = EngineGraph | InstanceGraph;

export function isInstanceGraph(graph: KnowledgeGraph): graph is InstanceGraph {
  return isInstanceManifest(graph.manifest);
}

export type ValidationResult = {
  diagnostics: Diagnostic[];
  graph?: KnowledgeGraph;
};

type Validators = {
  manifest: ValidateFunction;
  note: ValidateFunction;
  entities: ValidateFunction;
  index: ValidateFunction;
};

async function strictText(
  snapshot: Snapshot,
  path: string,
): Promise<{ bytes: Buffer; text: string }> {
  const bytes = await snapshot.read(path);
  return { bytes, text: decodeCanonicalText(bytes, path) };
}

async function validators(snapshot: Snapshot): Promise<Validators> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  try {
    for (const file of schemaFiles) {
      const path = `schemas/${file}`;
      const { text } = await strictText(snapshot, path);
      ajv.addSchema(parseStrictJson(text, path) as object);
    }
  } catch {
    throw new UnableToComplete({
      code: "schema-load-failed",
      path: "./schemas",
      message: "Repository schemas could not be loaded safely.",
    });
  }
  const get = (id: string): ValidateFunction => {
    const validate = ajv.getSchema(`https://coffee-chat.dev/schemas/${id}`);
    if (!validate) {
      throw new UnableToComplete({
        code: "schema-load-failed",
        path: `./schemas/${id}`,
        message: "Required repository schema is unavailable.",
      });
    }
    return validate;
  };
  return {
    manifest: get("coffee-chat.schema.json"),
    note: get("note-frontmatter.schema.json"),
    entities: get("entity-registry.schema.json"),
    index: get("knowledge-index.schema.json"),
  };
}

function pointerFor(error: ErrorObject): string | undefined {
  if (error.keyword === "required") {
    const property = (error.params as { missingProperty?: string })
      .missingProperty;
    return property
      ? `${error.instancePath}/${property.replaceAll("~", "~0").replaceAll("/", "~1")}`
      : error.instancePath || undefined;
  }
  if (error.keyword === "additionalProperties") {
    const property = (error.params as { additionalProperty?: string })
      .additionalProperty;
    return property
      ? `${error.instancePath}/${property.replaceAll("~", "~0").replaceAll("/", "~1")}`
      : error.instancePath || undefined;
  }
  return error.instancePath || undefined;
}

function schemaDiagnostics(
  validate: ValidateFunction,
  value: unknown,
  path: string,
): Diagnostic[] {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => ({
    code: "schema-validation",
    path: repositoryPath(path),
    ...(pointerFor(error) ? { pointer: pointerFor(error) } : {}),
    message: `Value violates the ${error.keyword} schema constraint.`,
  }));
}

function addFailure(diagnostics: Diagnostic[], error: unknown): void {
  if (error instanceof ValidationFailure) diagnostics.push(error.diagnostic);
  else throw error;
}

function unicodeScalarDiagnostic(
  value: unknown,
  path: string,
): Diagnostic | undefined {
  return containsUnpairedUnicodeSurrogate(value)
    ? {
        code: "invalid-unicode-scalar",
        path: repositoryPath(path),
        message:
          "Canonical strings and object keys must not contain unpaired Unicode surrogates.",
      }
    : undefined;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && uuidV4Pattern.test(value);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function dateDiagnostic(
  value: unknown,
  path: string,
  pointer: string,
  kind: "partial" | "full" | "coverage",
): Diagnostic | undefined {
  if (typeof value !== "string") return undefined;
  try {
    if (kind === "coverage") expandTemporalCoverage(value);
    else {
      if (kind === "full" && !fullDatePattern.test(value))
        throw new Error("full");
      expandPartialDate(value);
    }
    return undefined;
  } catch (error) {
    return {
      code:
        error instanceof Error && /Reversed/.test(error.message)
          ? "reversed-temporal-range"
          : "invalid-calendar-date",
      path: repositoryPath(path),
      pointer,
      message:
        kind === "coverage"
          ? "Temporal coverage must be a valid non-reversed Gregorian position or range."
          : "Date must be a valid Gregorian calendar unit at the declared precision.",
    };
  }
}

function isPublicUrl(
  value: string,
): "ok" | "unsafe" | "private" | "credential" {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "unsafe";
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname)
    return "unsafe";
  if (url.username || url.password) return "credential";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    (isIP(host) === 4 && isPrivateIpv4(host)) ||
    (isIP(host) === 6 && isPrivateIpv6(host))
  )
    return "private";
  if (
    [...url.searchParams.keys()].some((key) => {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        new Set([
          "token",
          "accesstoken",
          "apikey",
          "key",
          "secret",
          "clientsecret",
          "signature",
          "sig",
          "awsaccesskeyid",
          "xamzcredential",
          "xamzsecuritytoken",
          "xamzsignature",
          "xgoogcredential",
          "xgoogsignature",
          "xmssignature",
        ]).has(normalized) || normalized.endsWith("signature")
      );
    })
  ) {
    return "credential";
  }
  return "ok";
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4) return false;
  const [first, second] = octets as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(host: string): boolean {
  const halves = host.split("::");
  if (halves.length > 2) return true;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return true;
  const hextets = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part || "0", 16));
  if (hextets.length !== 8 || hextets.some((part) => !Number.isFinite(part)))
    return true;
  const first = hextets[0] as number;
  const unspecified = hextets.every((part) => part === 0);
  const loopback =
    hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1;
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  const linkLocal = (first & 0xffc0) === 0xfe80;
  const multicast = (first & 0xff00) === 0xff00;
  const ipv4Mapped =
    hextets.slice(0, 5).every((part) => part === 0) &&
    (hextets[5] === 0 || hextets[5] === 0xffff);
  if (ipv4Mapped) {
    const ipv4 = [
      (hextets[6] as number) >> 8,
      (hextets[6] as number) & 0xff,
      (hextets[7] as number) >> 8,
      (hextets[7] as number) & 0xff,
    ].join(".");
    if (isPrivateIpv4(ipv4)) return true;
  }
  return unspecified || loopback || uniqueLocal || linkLocal || multicast;
}

function publicUrlDiagnostic(
  value: unknown,
  path: string,
  pointer?: string,
): Diagnostic | undefined {
  if (typeof value !== "string") return undefined;
  const status = isPublicUrl(value);
  if (status === "ok") return undefined;
  return {
    code:
      status === "credential"
        ? "credential-bearing-url"
        : status === "private"
          ? "private-source-url"
          : "unsafe-url",
    path: repositoryPath(path),
    ...(pointer ? { pointer } : {}),
    message:
      status === "credential"
        ? "URL must not contain credentials or signed access parameters."
        : status === "private"
          ? "Canonical Sources must not point to private or local hosts."
          : "Canonical Source must be an absolute HTTP(S) URL.",
  };
}

function secretDiagnostic(text: string, path: string): Diagnostic | undefined {
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  ];
  return patterns.some((pattern) => pattern.test(text))
    ? {
        code: "detected-secret",
        path: repositoryPath(path),
        message:
          "Canonical content contains a secret-like value; the value is redacted.",
      }
    : undefined;
}

type MarkdownNode = {
  type?: string;
  url?: string;
  identifier?: string;
  value?: string;
  children?: MarkdownNode[];
};

function markdownLinks(
  body: string,
  notePath: string,
  sourceUrls: Set<string>,
  notePaths: Set<string>,
): { diagnostics: Diagnostic[]; noteLinks: string[] } {
  const diagnostics: Diagnostic[] = [];
  const links = new Set<string>();
  let tree: MarkdownNode;
  try {
    tree = fromMarkdown(body) as MarkdownNode;
  } catch {
    return {
      diagnostics: [
        {
          code: "invalid-markdown",
          path: repositoryPath(notePath),
          message: "Note body Markdown could not be parsed.",
        },
      ],
      noteLinks: [],
    };
  }
  const definitions = new Map<string, string>();
  const collect = (node: MarkdownNode): void => {
    if (
      node.type === "definition" &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, node.url);
    for (const child of node.children ?? []) collect(child);
  };
  collect(tree);

  const checkUrl = (url: string, image: boolean): void => {
    if (/^https?:/i.test(url)) {
      if (image) {
        diagnostics.push({
          code: "remote-image",
          path: repositoryPath(notePath),
          message: "Remote images are not supported in canonical Notes.",
        });
      } else if (!sourceUrls.has(url)) {
        diagnostics.push({
          code: "undeclared-external-link",
          path: repositoryPath(notePath),
          message:
            "Every external Markdown link must exactly match a declared Source URL.",
        });
      }
      const publicFailure = publicUrlDiagnostic(url, notePath);
      if (publicFailure) diagnostics.push(publicFailure);
      return;
    }
    if (url.startsWith("#")) return;
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(url) ||
      url.startsWith("//") ||
      url.startsWith("/")
    ) {
      diagnostics.push({
        code: "unsafe-link",
        path: repositoryPath(notePath),
        message: "Markdown link uses an unsupported or unsafe target.",
      });
      return;
    }
    if (image) return;
    const clean = url.split(/[?#]/, 1)[0] as string;
    const target = clean.startsWith("./knowledge/notes/")
      ? clean.slice(2)
      : posix.normalize(posix.join(dirname(notePath), clean));
    if (
      clean.includes("\\") ||
      clean.split("/").includes("..") ||
      !target.startsWith("knowledge/notes/") ||
      !notePaths.has(target)
    ) {
      diagnostics.push({
        code: "broken-note-link",
        path: repositoryPath(notePath),
        message:
          "Internal Note link must resolve to an existing canonical Note.",
      });
      return;
    }
    links.add(target);
  };

  const walk = (node: MarkdownNode): void => {
    if (node.type === "link" && node.url) checkUrl(node.url, false);
    if (node.type === "image" && node.url) checkUrl(node.url, true);
    if (
      (node.type === "linkReference" || node.type === "imageReference") &&
      node.identifier
    ) {
      const url = definitions.get(node.identifier);
      if (url) checkUrl(url, node.type === "imageReference");
    }
    if (
      node.type === "html" &&
      node.value &&
      /<(?:img|iframe|embed|object|video|audio)\b[^>]*(?:https?:)?\/\//i.test(
        node.value,
      )
    ) {
      diagnostics.push({
        code: "remote-embed",
        path: repositoryPath(notePath),
        message: "Remote embeds are not supported in canonical Notes.",
      });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return { diagnostics, noteLinks: [...links].sort() };
}

function supportedSchemaVersion(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return Boolean(match && Number(match[1]) === 1 && Number(match[2]) <= 0);
}

function validTimeZone(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

async function compareBase(
  selected: KnowledgeGraph,
  snapshot: Snapshot,
  reference: string,
): Promise<Diagnostic[]> {
  const baseSnapshot = await createBaseSnapshot(snapshot.root, reference);
  const baseResult = await validateKnowledge(baseSnapshot);
  if (!baseResult.graph || baseResult.diagnostics.length > 0) {
    throw new UnableToComplete({
      code: "base-ref-invalid",
      path: ".",
      message:
        "Requested base reference does not contain a valid comparable graph.",
    });
  }
  const base = baseResult.graph;
  const diagnostics: Diagnostic[] = [];
  if (
    isInstanceGraph(base) &&
    isInstanceGraph(selected) &&
    selected.manifest.profile.id !== base.manifest.profile.id
  ) {
    diagnostics.push({
      code: "immutable-profile-id",
      path: "./coffee-chat.json",
      pointer: "/profile/id",
      message: "Existing Profile ID is immutable.",
    });
  }
  const selectedNotes = new Map(
    selected.notes.map((note) => [note.frontmatter.id, note]),
  );
  for (const baseNote of base.notes) {
    const current = selectedNotes.get(baseNote.frontmatter.id);
    if (!current) {
      diagnostics.push({
        code: "immutable-note-id",
        path: repositoryPath(baseNote.path),
        pointer: "/id",
        message: "Existing Note ID is immutable.",
      });
    } else if (
      current.frontmatter.recorded_on !== baseNote.frontmatter.recorded_on
    ) {
      diagnostics.push({
        code: "immutable-recorded-on",
        path: repositoryPath(current.path),
        pointer: "/recorded_on",
        message: "A Note's first-recorded date is immutable.",
      });
    }
  }
  const currentEntityIds = new Set(
    selected.entities.map((entity) => entity.id),
  );
  for (const entity of base.entities) {
    if (!currentEntityIds.has(entity.id)) {
      diagnostics.push({
        code: "immutable-entity-id",
        path: "./knowledge/entities.yml",
        message: "Existing Entity IDs are immutable.",
      });
    }
  }
  return diagnostics;
}

export async function validateKnowledge(
  snapshot: Snapshot,
  options: { baseRef?: string; validateIndex?: boolean } = {},
): Promise<ValidationResult> {
  const diagnostics: Diagnostic[] = [];
  const schema = await validators(snapshot);
  let manifest: Manifest | undefined;
  try {
    const { text } = await strictText(snapshot, "coffee-chat.json");
    const secret = secretDiagnostic(text, "coffee-chat.json");
    if (secret) diagnostics.push(secret);
    const value = parseStrictJson(text, "coffee-chat.json");
    const unicodeFailure = unicodeScalarDiagnostic(value, "coffee-chat.json");
    if (unicodeFailure) diagnostics.push(unicodeFailure);
    const rawProfile = recordValue(recordValue(value)?.profile);
    if (rawProfile?.id !== undefined && !validUuid(rawProfile.id)) {
      diagnostics.push({
        code: "invalid-uuid-v4",
        path: "./coffee-chat.json",
        pointer: "/profile/id",
        message: "ID must be a canonical lowercase UUIDv4.",
      });
    }
    const manifestSchemaDiagnostics = schemaDiagnostics(
      schema.manifest,
      value,
      "coffee-chat.json",
    );
    diagnostics.push(...manifestSchemaDiagnostics);
    if (manifestSchemaDiagnostics.length === 0) {
      manifest = value as Manifest;
      if (!supportedSchemaVersion(manifest.schema_version)) {
        diagnostics.push({
          code: "unsupported-schema-version",
          path: "./coffee-chat.json",
          pointer: "/schema_version",
          message: "Schema version is newer than this validator supports.",
        });
      }
      if (isInstanceManifest(manifest) && !validTimeZone(manifest.time_zone)) {
        diagnostics.push({
          code: "invalid-time-zone",
          path: "./coffee-chat.json",
          pointer: "/time_zone",
          message: "Configured time zone must be a valid IANA zone.",
        });
      }
      if (manifest.marketplace_name !== `${manifest.plugin.name}-marketplace`) {
        diagnostics.push({
          code: "marketplace-name-mismatch",
          path: "./coffee-chat.json",
          pointer: "/marketplace_name",
          message:
            "Marketplace name must be derived from the plugin namespace.",
        });
      }
      for (const [pointer, url] of [
        ["/repository/url", manifest.repository.url],
        ["/pages_url", manifest.pages_url],
      ] as const) {
        const failure = publicUrlDiagnostic(url, "coffee-chat.json", pointer);
        if (failure) diagnostics.push(failure);
      }
      for (const declaredPath of [
        manifest.schema_url,
        ...(isInstanceManifest(manifest)
          ? [manifest.paths.knowledge_index]
          : []),
        manifest.paths.skills,
        manifest.paths.method,
      ]) {
        const path = declaredPath.replace(/^\.\//, "").replace(/\/$/, "");
        await snapshot.assertSafe(path);
      }
    }
  } catch (error) {
    addFailure(diagnostics, error);
  }
  if (!manifest || typeof manifest !== "object") {
    return { diagnostics: sortDiagnostics(diagnostics) };
  }

  if (isEngineManifest(manifest)) {
    const knowledgePaths = await snapshot.list("knowledge");
    if (knowledgePaths.length > 0) {
      diagnostics.push({
        code: "engine-has-knowledge",
        path: "./knowledge",
        message: "An engine repository must not track canonical knowledge.",
      });
    }
    const graph: EngineGraph = { manifest, entities: [], notes: [] };
    if (options.baseRef && diagnostics.length === 0) {
      diagnostics.push(
        ...(await compareBase(graph, snapshot, options.baseRef)),
      );
    }
    return {
      diagnostics: sortDiagnostics(diagnostics),
      ...(diagnostics.length === 0 ? { graph } : {}),
    };
  }

  const notePaths = new Set(
    (await snapshot.list("knowledge/notes")).filter((path) =>
      path.endsWith(".md"),
    ),
  );
  const allNoteEntries = await snapshot.list("knowledge/notes");
  for (const path of allNoteEntries) {
    if (
      !/^knowledge\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/.test(
        path,
      )
    ) {
      diagnostics.push({
        code: "invalid-note-path",
        path: repositoryPath(path),
        message:
          "Canonical Note filename must be its lowercase UUIDv4 plus .md.",
      });
    }
  }

  let entities: Entity[] = [];
  if (!(await snapshot.exists("knowledge/entities.yml"))) {
    diagnostics.push({
      code: "missing-entity-registry",
      path: "./knowledge/entities.yml",
      message: "Initialized graph requires an Entity Registry.",
    });
  } else {
    try {
      const { text } = await strictText(snapshot, "knowledge/entities.yml");
      const secret = secretDiagnostic(text, "knowledge/entities.yml");
      if (secret) diagnostics.push(secret);
      const value = parseStrictYaml(text, "knowledge/entities.yml");
      const unicodeFailure = unicodeScalarDiagnostic(
        value,
        "knowledge/entities.yml",
      );
      if (unicodeFailure) diagnostics.push(unicodeFailure);
      if (Array.isArray(value)) {
        for (const [index, rawEntity] of value.entries()) {
          const id = recordValue(rawEntity)?.id;
          if (id !== undefined && !validUuid(id)) {
            diagnostics.push({
              code: "invalid-uuid-v4",
              path: "./knowledge/entities.yml",
              pointer: `/${index}/id`,
              message: "ID must be a canonical lowercase UUIDv4.",
            });
          }
        }
      }
      const entitySchemaDiagnostics = schemaDiagnostics(
        schema.entities,
        value,
        "knowledge/entities.yml",
      );
      diagnostics.push(...entitySchemaDiagnostics);
      if (entitySchemaDiagnostics.length === 0) entities = value as Entity[];
    } catch (error) {
      addFailure(diagnostics, error);
    }
  }

  const entityIds = new Set<string>();
  for (const [index, entity] of entities.entries()) {
    if (!validUuid(entity?.id)) {
      diagnostics.push({
        code: "invalid-uuid-v4",
        path: "./knowledge/entities.yml",
        pointer: `/${index}/id`,
        message: "ID must be a canonical lowercase UUIDv4.",
      });
    } else if (entityIds.has(entity.id)) {
      diagnostics.push({
        code: "duplicate-id",
        path: "./knowledge/entities.yml",
        pointer: `/${index}/id`,
        message: "Stable IDs must be unique across canonical records.",
      });
    } else entityIds.add(entity.id);
    for (const [sameAsIndex, url] of (entity.same_as ?? []).entries()) {
      const failure = publicUrlDiagnostic(
        url,
        "knowledge/entities.yml",
        `/${index}/same_as/${sameAsIndex}`,
      );
      if (failure) diagnostics.push(failure);
    }
  }

  const notes: LoadedNote[] = [];
  for (const path of [...notePaths].sort()) {
    try {
      const { bytes, text } = await strictText(snapshot, path);
      const secret = secretDiagnostic(text, path);
      if (secret) diagnostics.push(secret);
      const parsed = parseMarkdownDocument(text, path);
      const unicodeFailure = unicodeScalarDiagnostic(parsed.frontmatter, path);
      if (unicodeFailure) diagnostics.push(unicodeFailure);
      const rawNoteId = recordValue(parsed.frontmatter)?.id;
      if (rawNoteId !== undefined && !validUuid(rawNoteId)) {
        diagnostics.push({
          code: "invalid-uuid-v4",
          path: repositoryPath(path),
          pointer: "/id",
          message: "ID must be a canonical lowercase UUIDv4.",
        });
      }
      const noteSchemaDiagnostics = schemaDiagnostics(
        schema.note,
        parsed.frontmatter,
        path,
      );
      diagnostics.push(...noteSchemaDiagnostics);
      if (noteSchemaDiagnostics.length > 0) continue;
      const frontmatter = parsed.frontmatter as NoteFrontmatter;
      if (!validUuid(frontmatter.id)) {
        diagnostics.push({
          code: "invalid-uuid-v4",
          path: repositoryPath(path),
          pointer: "/id",
          message: "ID must be a canonical lowercase UUIDv4.",
        });
      }
      const filename = posix.basename(path, ".md");
      if (frontmatter.id !== filename) {
        diagnostics.push({
          code: "note-id-filename-mismatch",
          path: repositoryPath(path),
          pointer: "/id",
          message: "Note filename ID must equal its frontmatter ID.",
        });
      }
      const coverageFailure = dateDiagnostic(
        frontmatter.temporal_coverage,
        path,
        "/temporal_coverage",
        "coverage",
      );
      if (coverageFailure) diagnostics.push(coverageFailure);
      const recordedFailure = dateDiagnostic(
        frontmatter.recorded_on,
        path,
        "/recorded_on",
        "full",
      );
      if (recordedFailure) diagnostics.push(recordedFailure);
      const sourceUrls = new Set<string>();
      for (const [sourceIndex, citation] of (Array.isArray(frontmatter.sources)
        ? frontmatter.sources
        : []
      ).entries()) {
        if (sourceUrls.has(citation.url)) {
          diagnostics.push({
            code: "duplicate-source-url",
            path: repositoryPath(path),
            pointer: `/sources/${sourceIndex}/url`,
            message: "An exact Source URL may appear only once within a Note.",
          });
        } else if (typeof citation.url === "string")
          sourceUrls.add(citation.url);
        const urlFailure = publicUrlDiagnostic(
          citation.url,
          path,
          `/sources/${sourceIndex}/url`,
        );
        if (urlFailure) diagnostics.push(urlFailure);
        const publishedFailure = dateDiagnostic(
          citation.published_on,
          path,
          `/sources/${sourceIndex}/published_on`,
          "partial",
        );
        if (publishedFailure) diagnostics.push(publishedFailure);
        const accessedFailure = dateDiagnostic(
          citation.accessed_on,
          path,
          `/sources/${sourceIndex}/accessed_on`,
          "full",
        );
        if (accessedFailure) diagnostics.push(accessedFailure);
      }
      for (const [entityIndex, id] of (Array.isArray(frontmatter.entities)
        ? frontmatter.entities
        : []
      ).entries()) {
        if (!entityIds.has(id)) {
          diagnostics.push({
            code: "unknown-entity",
            path: repositoryPath(path),
            pointer: `/entities/${entityIndex}`,
            message: "Note references an Entity ID absent from the Registry.",
          });
        }
      }
      const markdown = markdownLinks(parsed.body, path, sourceUrls, notePaths);
      diagnostics.push(...markdown.diagnostics);
      notes.push({
        path,
        bytes,
        frontmatter,
        body: parsed.body,
        noteLinks: markdown.noteLinks,
      });
    } catch (error) {
      addFailure(diagnostics, error);
    }
  }

  const allIds = new Map<string, string>();
  allIds.set(manifest.profile.id, "./coffee-chat.json");
  for (const entity of entities) {
    if (!validUuid(entity.id)) continue;
    if (allIds.has(entity.id))
      diagnostics.push({
        code: "duplicate-id",
        path: "./knowledge/entities.yml",
        message: "Stable IDs must be unique across canonical records.",
      });
    else allIds.set(entity.id, "./knowledge/entities.yml");
  }
  for (const note of notes) {
    if (!validUuid(note.frontmatter.id)) continue;
    if (allIds.has(note.frontmatter.id))
      diagnostics.push({
        code: "duplicate-id",
        path: repositoryPath(note.path),
        pointer: "/id",
        message: "Stable IDs must be unique across canonical records.",
      });
    else allIds.set(note.frontmatter.id, repositoryPath(note.path));
  }

  if (
    options.validateIndex !== false &&
    (await snapshot.exists("knowledge/index.json"))
  ) {
    try {
      const { text } = await strictText(snapshot, "knowledge/index.json");
      const value = parseStrictJson(text, "knowledge/index.json");
      const unicodeFailure = unicodeScalarDiagnostic(
        value,
        "knowledge/index.json",
      );
      if (unicodeFailure) diagnostics.push(unicodeFailure);
      diagnostics.push(
        ...schemaDiagnostics(schema.index, value, "knowledge/index.json"),
      );
    } catch (error) {
      addFailure(diagnostics, error);
    }
  }

  const graph: InstanceGraph = { manifest, entities, notes };
  if (options.baseRef && diagnostics.length === 0) {
    diagnostics.push(...(await compareBase(graph, snapshot, options.baseRef)));
  }
  return {
    diagnostics: sortDiagnostics(diagnostics),
    ...(diagnostics.length === 0 ? { graph } : {}),
  };
}

export function sha256(bytes: string | Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
