import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { assertArtifactBoundary } from "../../tools/artifact-inventory.ts";
import { ValidationFailure } from "../../tools/contracts.ts";
import {
  buildKnowledgeIndex,
  checkGeneratedIndex,
  compareCodePoints,
} from "../../tools/generate.ts";
import {
  isInstanceGraph,
  type Citation,
  type EngineManifest,
  type Entity,
  type InstanceManifest,
  type LoadedNote,
  validateKnowledge,
} from "../../tools/knowledge.ts";
import { createSnapshot } from "../../tools/snapshot.ts";
import {
  recordedOnThrough,
  temporalCoverageOverlaps,
} from "../../tools/temporal.ts";
import {
  bindSiteBuildRequest,
  siteBasePath,
  type SiteBuildRequest,
} from "./build-context.ts";

const execFileAsync = promisify(execFile);

function sanitizedGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith("GIT_"),
    ),
  );
}

async function assertCanonicalSiteDependencies(
  root: string,
  dependencies: string[],
): Promise<void> {
  for (const dependency of dependencies) {
    let current = root;
    for (const segment of dependency.split("/")) {
      current = resolve(current, segment);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new ValidationFailure({
            code: "site-source-symlink",
            path: `./${dependency}`,
            message:
              "Published canonical inputs must not resolve through symbolic links.",
          });
      } catch (error) {
        if (error instanceof ValidationFailure) throw error;
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw new ValidationFailure({
          code: "site-source-path-unsafe",
          path: `./${dependency}`,
          message:
            "Published canonical input provenance could not be verified.",
        });
      }
    }
  }
}

export type SiteEdge = {
  subject: string;
  predicate: "cites" | "mentions" | "links_to";
  object: string;
  citation_metadata?: {
    title: string;
    published_on?: string;
    accessed_on?: string;
  };
};

export type SiteNote = {
  id: string;
  path: string;
  title: string;
  temporal_coverage: string;
  recorded_on: string;
  body: string;
  source_urls: string[];
  entity_ids: string[];
  linked_note_ids: string[];
};

export type SiteEntity = Entity & { note_ids: string[] };

export type SiteSourceObservation = Citation & { note_id: string };

export type SiteSource = {
  url: string;
  slug: string;
  observations: SiteSourceObservation[];
  note_ids: string[];
};

export type EngineDocsModel = {
  source_commit: string;
  base_path: string;
  dependencies: string[];
  routes: ["home"];
};

export type InstanceSiteModel = {
  source_commit: string;
  base_path: string;
  knowledge_digest: string;
  latest_recorded_on: string | null;
  dependencies: string[];
  notes: SiteNote[];
  entities: SiteEntity[];
  sources: SiteSource[];
  edges: SiteEdge[];
};

export type SiteModel =
  | {
      role: "engine";
      manifest: EngineManifest;
      documentation: EngineDocsModel;
    }
  | {
      role: "instance";
      manifest: InstanceManifest;
      graph: InstanceSiteModel;
    };

export function sourceRouteSlug(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

async function gitSourceCommit(root: string): Promise<string> {
  try {
    const [{ stdout: commitOutput }, { stdout: topLevelOutput }, sourceRoot] =
      await Promise.all([
        execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          env: sanitizedGitEnvironment(),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        }),
        execFileAsync("git", ["rev-parse", "--show-toplevel"], {
          cwd: root,
          env: sanitizedGitEnvironment(),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        }),
        realpath(root),
      ]);
    if ((await realpath(topLevelOutput.trim())) !== sourceRoot)
      throw new Error("source is not the Git root");
    const commit = commitOutput.trim();
    if (!/^[0-9a-f]+$/.test(commit)) throw new Error("invalid commit");
    return commit;
  } catch {
    throw new ValidationFailure({
      code: "site-source-commit-unavailable",
      path: ".",
      message: "The bound site source must resolve an actual Git HEAD.",
    });
  }
}

function siteEdges(index: Record<string, unknown>): SiteEdge[] {
  return (index.edges as SiteEdge[]).map((edge) => structuredClone(edge));
}

function siteNotes(notes: LoadedNote[], edges: SiteEdge[]): SiteNote[] {
  const linkedByNote = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.predicate !== "links_to") continue;
    const links = linkedByNote.get(edge.subject) ?? [];
    links.push(edge.object);
    linkedByNote.set(edge.subject, links);
  }
  return notes
    .map((note) => ({
      id: note.frontmatter.id,
      path: note.path,
      title: note.frontmatter.title,
      temporal_coverage: note.frontmatter.temporal_coverage,
      recorded_on: note.frontmatter.recorded_on,
      body: note.body,
      source_urls: note.frontmatter.sources.map((source) => source.url),
      entity_ids: [...(note.frontmatter.entities ?? [])],
      linked_note_ids: [...(linkedByNote.get(note.frontmatter.id) ?? [])].sort(
        compareCodePoints,
      ),
    }))
    .sort((left, right) =>
      compareCodePoints(
        `${left.recorded_on}\u0000${left.id}`,
        `${right.recorded_on}\u0000${right.id}`,
      ),
    );
}

function siteEntities(entities: Entity[], edges: SiteEdge[]): SiteEntity[] {
  const notesByEntity = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.predicate !== "mentions") continue;
    const notes = notesByEntity.get(edge.object) ?? [];
    notes.push(edge.subject);
    notesByEntity.set(edge.object, notes);
  }
  return entities
    .map((entity) => ({
      ...structuredClone(entity),
      note_ids: [...(notesByEntity.get(entity.id) ?? [])].sort(
        compareCodePoints,
      ),
    }))
    .sort((left, right) => compareCodePoints(left.id, right.id));
}

function siteSources(notes: LoadedNote[]): SiteSource[] {
  const sources = new Map<string, SiteSource>();
  for (const note of notes) {
    for (const citation of note.frontmatter.sources) {
      const source = sources.get(citation.url) ?? {
        url: citation.url,
        slug: sourceRouteSlug(citation.url),
        observations: [],
        note_ids: [],
      };
      source.observations.push({
        note_id: note.frontmatter.id,
        ...structuredClone(citation),
      });
      if (!source.note_ids.includes(note.frontmatter.id))
        source.note_ids.push(note.frontmatter.id);
      sources.set(citation.url, source);
    }
  }
  return [...sources.values()]
    .map((source) => ({
      ...source,
      observations: source.observations.sort((left, right) =>
        compareCodePoints(left.note_id, right.note_id),
      ),
      note_ids: source.note_ids.sort(compareCodePoints),
    }))
    .sort((left, right) => compareCodePoints(left.url, right.url));
}

export function filterSiteNotes<T extends LoadedNote | SiteNote>(
  notes: T[],
  query: { perspective?: string; recorded_through?: string },
): T[] {
  return notes.filter((note) => {
    const temporalCoverage =
      "frontmatter" in note
        ? note.frontmatter.temporal_coverage
        : note.temporal_coverage;
    const recordedOn =
      "frontmatter" in note ? note.frontmatter.recorded_on : note.recorded_on;
    return (
      (query.perspective === undefined ||
        temporalCoverageOverlaps(temporalCoverage, query.perspective)) &&
      (query.recorded_through === undefined ||
        recordedOnThrough(recordedOn, query.recorded_through))
    );
  });
}

export async function loadSiteModel(
  request: SiteBuildRequest,
): Promise<SiteModel> {
  const bound = await bindSiteBuildRequest(request);
  const snapshot = await createSnapshot(bound.source_root, "worktree");
  const validation = await validateKnowledge(snapshot);
  if (validation.diagnostics.length > 0 || !validation.graph)
    throw new ValidationFailure(
      validation.diagnostics[0] ?? {
        code: "site-source-invalid",
        path: ".",
        message: "The site source is not a valid Coffee Chat repository.",
      },
    );

  const sourceCommit = await gitSourceCommit(bound.source_root);
  const basePath = siteBasePath(validation.graph.manifest.pages_url);

  if (!isInstanceGraph(validation.graph)) {
    const dependencies = snapshot.dependencies();
    await assertCanonicalSiteDependencies(bound.source_root, dependencies);
    await assertArtifactBoundary(bound, dependencies);
    return {
      role: "engine",
      manifest: validation.graph.manifest,
      documentation: {
        source_commit: sourceCommit,
        base_path: basePath,
        dependencies,
        routes: ["home"],
      },
    };
  }

  const indexDiagnostics = await checkGeneratedIndex(
    snapshot,
    validation.graph,
  );
  if (indexDiagnostics.length > 0)
    throw new ValidationFailure(
      indexDiagnostics[0] as NonNullable<(typeof indexDiagnostics)[0]>,
    );
  const index = buildKnowledgeIndex(validation.graph);
  const edges = siteEdges(index);
  const notes = siteNotes(validation.graph.notes, edges);
  const dependencies = snapshot.dependencies();
  await assertCanonicalSiteDependencies(bound.source_root, dependencies);
  await assertArtifactBoundary(bound, dependencies);
  return {
    role: "instance",
    manifest: validation.graph.manifest,
    graph: {
      source_commit: sourceCommit,
      base_path: basePath,
      knowledge_digest: index.knowledge_digest as string,
      latest_recorded_on:
        notes
          .map((note) => note.recorded_on)
          .sort(compareCodePoints)
          .at(-1) ?? null,
      dependencies,
      notes,
      entities: siteEntities(validation.graph.entities, edges),
      sources: siteSources(validation.graph.notes),
      edges,
    },
  };
}

export type { SiteBuildRequest } from "./build-context.ts";
