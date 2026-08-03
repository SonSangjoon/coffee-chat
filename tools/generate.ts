import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  containsUnpairedUnicodeSurrogate,
  repositoryPath,
} from "./contracts.ts";
import type { InstanceGraph } from "./knowledge.ts";
import { sha256 } from "./knowledge.ts";
import type { Snapshot } from "./snapshot.ts";

export const KNOWLEDGE_INDEX_SCHEMA_VERSION = "1.0.0" as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(
    left,
    (character) => character.codePointAt(0) as number,
  );
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0) as number,
  );
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index += 1
  ) {
    const difference =
      (leftPoints[index] as number) - (rightPoints[index] as number);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function canonicalizeJson(value: Json): string {
  if (typeof value === "string") {
    assertUnicodeScalarValue(value);
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("RFC 8785 excludes non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  for (const key of keys) assertUnicodeScalarValue(key);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key] as Json)}`).join(",")}}`;
}

function assertUnicodeScalarValue(value: string): void {
  if (containsUnpairedUnicodeSurrogate(value))
    throw new Error("RFC 8785 rejects unpaired UTF-16 surrogate code units");
}

function sortedUnique(values: string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  return [...new Set(values)].sort(compareCodePoints);
}

export function buildKnowledgeIndex(
  graph: InstanceGraph,
): Record<string, Json> {
  const profileId = graph.manifest.profile.id;

  const nodes: Array<Record<string, Json>> = [];
  for (const entity of graph.entities) {
    nodes.push({
      id: entity.id,
      type: "entity",
      label: entity.label,
      ...(entity.aliases !== undefined
        ? { aliases: sortedUnique(entity.aliases) as string[] }
        : {}),
      ...(entity.kind !== undefined ? { kind: entity.kind } : {}),
      ...(entity.same_as !== undefined
        ? { same_as: sortedUnique(entity.same_as) as string[] }
        : {}),
    });
  }
  for (const note of graph.notes) {
    nodes.push({
      id: note.frontmatter.id,
      type: "note",
      path: repositoryPath(note.path),
      content_digest: sha256(note.bytes),
      title: note.frontmatter.title,
      temporal_coverage: note.frontmatter.temporal_coverage,
      recorded_on: note.frontmatter.recorded_on,
    });
  }
  const sourceIds = new Set(
    graph.notes.flatMap((note) =>
      note.frontmatter.sources.map((source) => source.url),
    ),
  );
  for (const id of sourceIds) nodes.push({ id, type: "source" });
  nodes.sort((left, right) =>
    compareCodePoints(
      `${left.type as string}\u0000${left.id as string}`,
      `${right.type as string}\u0000${right.id as string}`,
    ),
  );

  const noteIdByPath = new Map(
    graph.notes.map((note) => [note.path, note.frontmatter.id]),
  );
  const edges = new Map<string, Record<string, Json>>();
  for (const note of graph.notes) {
    for (const citation of note.frontmatter.sources) {
      const edge = {
        subject: note.frontmatter.id,
        predicate: "cites",
        object: citation.url,
        citation_metadata: {
          title: citation.title,
          ...(citation.published_on !== undefined
            ? { published_on: citation.published_on }
            : {}),
          ...(citation.accessed_on !== undefined
            ? { accessed_on: citation.accessed_on }
            : {}),
        },
      } satisfies Record<string, Json>;
      edges.set(
        `${edge.subject}\u0000${edge.predicate}\u0000${edge.object}`,
        edge,
      );
    }
    for (const entityId of note.frontmatter.entities ?? []) {
      const edge = {
        subject: note.frontmatter.id,
        predicate: "mentions",
        object: entityId,
      } satisfies Record<string, Json>;
      edges.set(
        `${edge.subject}\u0000${edge.predicate}\u0000${edge.object}`,
        edge,
      );
    }
    for (const linkedPath of note.noteLinks) {
      const object = noteIdByPath.get(linkedPath);
      if (!object) continue;
      const edge = {
        subject: note.frontmatter.id,
        predicate: "links_to",
        object,
      } satisfies Record<string, Json>;
      edges.set(
        `${edge.subject}\u0000${edge.predicate}\u0000${edge.object}`,
        edge,
      );
    }
  }
  const sortedEdges = [...edges.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([, edge]) => edge);

  const digestInput: Record<string, Json> = {
    schema_version: KNOWLEDGE_INDEX_SCHEMA_VERSION,
    profile_id: profileId,
    nodes,
    edges: sortedEdges,
  };
  return {
    schema_version: KNOWLEDGE_INDEX_SCHEMA_VERSION,
    profile_id: profileId,
    knowledge_digest: sha256(canonicalizeJson(digestInput)),
    nodes,
    edges: sortedEdges,
  };
}

export function generatedIndexBytes(graph: InstanceGraph): Buffer {
  const index = buildKnowledgeIndex(graph);
  return Buffer.from(`${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export async function checkGeneratedIndex(
  snapshot: Snapshot,
  graph: InstanceGraph,
): Promise<Diagnostic[]> {
  const expected = generatedIndexBytes(graph);
  const configured = graph.manifest.paths.knowledge_index;
  const path = configured.startsWith("./") ? configured.slice(2) : configured;
  if (!(await snapshot.exists(path))) {
    return [
      {
        code: "stale-generated-index",
        path: repositoryPath(path),
        message: "Generated knowledge index is missing or stale.",
      },
    ];
  }
  const actual = await snapshot.read(path);
  return actual.equals(expected)
    ? []
    : [
        {
          code: "stale-generated-index",
          path: repositoryPath(path),
          message: "Generated knowledge index is missing or stale.",
        },
      ];
}

export async function writeGeneratedIndex(
  root: string,
  graph: InstanceGraph,
): Promise<void> {
  const bytes = generatedIndexBytes(graph);
  const configured = graph.manifest.paths.knowledge_index;
  const path = configured.startsWith("./") ? configured.slice(2) : configured;
  const absolute = resolve(root, ...path.split("/"));
  const [canonicalRoot, canonicalParent] = await Promise.all([
    realpath(root),
    realpath(dirname(absolute)),
  ]);
  const fromRoot = relative(canonicalRoot, canonicalParent);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new ValidationFailure({
      code: "symlink-escape",
      path: repositoryPath(path),
      message: "Generated output path must resolve inside the repository.",
    });
  }
  try {
    if ((await lstat(absolute)).isSymbolicLink()) {
      throw new ValidationFailure({
        code: "symlink-escape",
        path: repositoryPath(path),
        message: "Generated output path must not be a symbolic link.",
      });
    }
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(absolute, bytes);
  const confirmed = await readFile(absolute);
  if (!confirmed.equals(bytes))
    throw new Error("Generated bytes could not be verified");
}
