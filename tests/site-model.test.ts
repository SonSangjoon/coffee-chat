import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedNote } from "../tools/knowledge.ts";
import { siteBasePath, siteHref } from "../site/lib/build-context.ts";
import {
  filterSiteNotes,
  loadSiteModel,
  sourceRouteSlug,
} from "../site/lib/load-site-model.ts";
import {
  commitFixtureMarker,
  createSyntheticSiteFixture,
  gitHead,
  projectRoot,
  type SyntheticSiteFixture,
} from "./helpers/site-fixture.ts";

const fixtures: SyntheticSiteFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function syntheticFixture(): Promise<SyntheticSiteFixture> {
  const fixture = await createSyntheticSiteFixture();
  fixtures.push(fixture);
  return fixture;
}

describe("Task 6 site model", () => {
  it("builds every route beneath the configured GitHub Pages base path", () => {
    const projectBase = siteBasePath("https://example.github.io/coffee-chat/");

    expect(projectBase).toBe("/coffee-chat/");
    expect(siteHref(projectBase)).toBe("/coffee-chat/");
    expect(siteHref(projectBase, "timeline/")).toBe("/coffee-chat/timeline/");
    expect(siteHref(siteBasePath("https://example.github.io/"), "graph/")).toBe(
      "/graph/",
    );
    expect(() => siteHref(projectBase, "../outside/")).toThrow();
    expect(() => siteHref(projectBase, "%2e%2e/outside/")).toThrow();
    expect(() => siteHref(projectBase, "..\\outside/")).toThrow();
    expect(() => siteHref(projectBase, "%5coutside/")).toThrow();
  });

  it("hashes the exact Source URL without normalization", () => {
    const exact =
      "https://example.com/research/Source?query=Coffee%20Chat#evidence";
    const byteDifferent =
      "https://example.com/research/Source?query=Coffee+Chat#evidence";

    expect(sourceRouteSlug(exact)).toBe(
      createHash("sha256").update(exact).digest("hex"),
    );
    expect(sourceRouteSlug(exact)).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceRouteSlug(byteDifferent)).not.toBe(sourceRouteSlug(exact));
  });

  it("loads the current engine as a docs-only release at Git HEAD", async () => {
    const expectedCommit = await gitHead(projectRoot);
    const previousHint = process.env.COFFEE_CHAT_SOURCE_COMMIT;
    process.env.COFFEE_CHAT_SOURCE_COMMIT = "caller-controlled";
    try {
      const model = await loadSiteModel({
        source_root: projectRoot,
        output_root: resolve(projectRoot, "dist/site"),
        artifact_class: "release",
        source_commit: "also-caller-controlled",
      } as never);

      expect(model).toMatchObject({
        role: "engine",
        manifest: { repository_role: "engine" },
        documentation: { source_commit: expectedCommit },
      });
      expect(model).not.toHaveProperty("graph");
      if (model.role !== "engine") return;
      expect(model.documentation.dependencies).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^(?:tests\/fixtures|examples)(?:\/|$)/),
        ]),
      );
    } finally {
      if (previousHint === undefined)
        delete process.env.COFFEE_CHAT_SOURCE_COMMIT;
      else process.env.COFFEE_CHAT_SOURCE_COMMIT = previousHint;
    }
  });

  it("loads a verified external instance with its exact index and Git commit", async () => {
    const fixture = await syntheticFixture();
    const model = await loadSiteModel({
      source_root: fixture.source,
      output_root: fixture.output,
      artifact_class: "ephemeral-test",
    });

    expect(model).toMatchObject({
      role: "instance",
      manifest: { repository_role: "instance" },
      graph: {
        source_commit: fixture.head,
        knowledge_digest: fixture.knowledgeDigest,
      },
    });
    expect(model).not.toHaveProperty("documentation");
    if (model.role !== "instance") return;
    expect(model.graph.notes).toHaveLength(1);
    expect(model.graph.entities).toHaveLength(1);
    expect(model.graph.sources).toHaveLength(1);
    expect(model.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ predicate: "cites" }),
        expect.objectContaining({ predicate: "mentions" }),
      ]),
    );
    expect(model.graph.sources[0]).toMatchObject({
      slug: sourceRouteSlug(model.graph.sources[0]!.url),
      observations: [
        expect.objectContaining({ note_id: model.graph.notes[0]!.id }),
      ],
    });
    expect(model.graph.engine_provenance).toEqual({
      repository: "https://github.com/sonsangjoon/coffee-chat",
      version: "2026.08.04",
      source_commit: "a".repeat(40),
      release_digest: `sha256:${"b".repeat(64)}`,
    });
  });

  it("binds commit provenance despite hostile Git repository environment", async () => {
    const fixture = await syntheticFixture();
    const spoof = await syntheticFixture();
    const spoofHead = await commitFixtureMarker(spoof.source, "spoof commit");
    const previousGitDir = process.env.GIT_DIR;
    const previousGitWorkTree = process.env.GIT_WORK_TREE;
    process.env.GIT_DIR = resolve(spoof.source, ".git");
    process.env.GIT_WORK_TREE = fixture.source;
    try {
      const model = await loadSiteModel({
        source_root: fixture.source,
        output_root: fixture.output,
        artifact_class: "ephemeral-test",
      });
      const data = model.role === "engine" ? model.documentation : model.graph;
      expect(data.source_commit).toBe(fixture.head);
      expect(data.source_commit).not.toBe(spoofHead);
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
      if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = previousGitWorkTree;
    }
  });

  it("filters perspective time and first-recorded cutoff with AND semantics", () => {
    const notes = [
      note("a", "2024-02/2024-03", "2026-01-01"),
      note("b", "2025", "2026-07-01"),
      note("c", "2026-02", "2026-02-15"),
    ];

    expect(
      filterSiteNotes(notes, { perspective: "2024-03-31" }).map(
        (value) => value.frontmatter.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterSiteNotes(notes, { recorded_through: "2026-03-01" }).map(
        (value) => value.frontmatter.id,
      ),
    ).toEqual(["a", "c"]);
    expect(
      filterSiteNotes(notes, {
        perspective: "2025",
        recorded_through: "2026-03-01",
      }),
    ).toEqual([]);
  });
});

function note(
  id: string,
  temporalCoverage: string,
  recordedOn: string,
): LoadedNote {
  return {
    path: `knowledge/notes/${id}.md`,
    bytes: Buffer.from(id),
    frontmatter: {
      id,
      title: id,
      temporal_coverage: temporalCoverage,
      recorded_on: recordedOn,
      sources: [],
    },
    body: `\n${id}\n`,
    noteLinks: [],
  };
}
