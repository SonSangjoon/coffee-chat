import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProjectionBundle,
  roleOwnedProjectionPaths,
} from "../tools/projections.ts";
import { isInstanceGraph, validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";
import { parseMarkdownDocument } from "../tools/strict-input.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const sonFixtureRoot = resolve(projectRoot, "tests/fixtures/son-input");
const syntheticFixtureRoot = resolve(
  projectRoot,
  "tests/fixtures/synthetic-instance",
);

type SonRequest = {
  mode: string;
  instance_configuration: {
    profile: {
      temporary_key: string;
      display_name: string;
      short_name: string;
    };
  };
  entity_changes: Array<{
    action: string;
    value: { label: string; kind?: string };
  }>;
  note_changes: Array<{
    value: {
      title: string;
      temporal_coverage: string;
      body: string;
      sources: Array<{
        url: string;
        title: string;
        published_on?: string;
        accessed_on?: string;
        retrieval_status: string;
      }>;
    };
  }>;
};

async function engineGraph() {
  const snapshot = await createSnapshot(projectRoot, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  expect(validation.diagnostics).toEqual([]);
  expect(validation.graph).toBeDefined();
  return { snapshot, graph: validation.graph! };
}

async function readSonRequest(): Promise<SonRequest> {
  return JSON.parse(
    await readFile(resolve(sonFixtureRoot, "first-note-request.json"), "utf8"),
  ) as SonRequest;
}

async function walkFiles(root: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(resolve(root, prefix), {
    withFileTypes: true,
  })) {
    const path = prefix ? posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) paths.push(...(await walkFiles(root, path)));
    else paths.push(path);
  }
  return paths.sort();
}

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...objectKeys(nested),
  ]);
}

async function removeAndProveAbsent(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
  await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
}

describe("Task 5 fixture and output isolation", () => {
  it.each([
    ["direct", resolve(projectRoot, "ephemeral-output")],
    ["deep", resolve(projectRoot, "nested/ephemeral-output")],
  ])("rejects a %s ephemeral output descendant", async (_label, outputRoot) => {
    const { snapshot, graph } = await engineGraph();

    await expect(
      buildProjectionBundle(snapshot, graph, {
        artifact_class: "ephemeral-test",
        output_root: outputRoot,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "ephemeral-output-must-be-external" },
    });
  });

  it("rejects an external-looking symlink alias to an output descendant", async () => {
    const aliasParent = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-output-alias-"),
    );
    try {
      const alias = resolve(aliasParent, "checkout");
      await symlink(projectRoot, alias, "dir");
      const { snapshot, graph } = await engineGraph();

      await expect(
        buildProjectionBundle(snapshot, graph, {
          artifact_class: "ephemeral-test",
          output_root: resolve(alias, "nested/output"),
        }),
      ).rejects.toMatchObject({
        diagnostic: { code: "ephemeral-output-must-be-external" },
      });
    } finally {
      await removeAndProveAbsent(aliasParent);
    }
  });

  it("rejects a dangling external symlink alias to a missing output descendant", async () => {
    const aliasParent = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-dangling-output-alias-"),
    );
    const missingTarget = resolve(
      projectRoot,
      `.missing-output-${basename(aliasParent)}`,
    );
    try {
      const alias = resolve(aliasParent, "checkout");
      await expect(lstat(missingTarget)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await symlink(missingTarget, alias, "dir");
      const { snapshot, graph } = await engineGraph();

      await expect(
        buildProjectionBundle(snapshot, graph, {
          artifact_class: "ephemeral-test",
          output_root: resolve(alias, "out"),
        }),
      ).rejects.toMatchObject({
        diagnostic: { code: "ephemeral-output-must-be-external" },
      });
    } finally {
      await removeAndProveAbsent(aliasParent);
      await expect(lstat(missingTarget)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  it("allows sibling and OS-temporary ephemeral output roots", async () => {
    const temporaryOutput = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-output-external-"),
    );
    try {
      const { snapshot, graph } = await engineGraph();

      for (const outputRoot of [
        resolve(dirname(projectRoot), "coffee-chat-output-sibling"),
        temporaryOutput,
      ]) {
        const bundle = await buildProjectionBundle(snapshot, graph, {
          artifact_class: "ephemeral-test",
          output_root: outputRoot,
        });
        expect(bundle.artifact_class).toBe("ephemeral-test");
      }
    } finally {
      await removeAndProveAbsent(temporaryOutput);
    }
  });

  it("keeps the Son fixture at an input-only boundary", async () => {
    const [paths, readme, request] = await Promise.all([
      walkFiles(sonFixtureRoot),
      readFile(resolve(sonFixtureRoot, "README.md"), "utf8"),
      readSonRequest(),
    ]);

    expect(paths).toEqual(["README.md", "first-note-request.json"]);
    expect(readme).toContain("input-only");
    expect(readme).toContain("non-canonical");
    expect(request.mode).toBe("make-mine");
    expect(request.instance_configuration.profile).toEqual({
      temporary_key: "owner_profile",
      display_name: "Son",
      short_name: "Son",
    });
    expect(
      request.entity_changes.map((change) => ({
        action: change.action,
        label: change.value.label,
        kind: change.value.kind,
      })),
    ).toEqual([
      { action: "create", label: "Taste", kind: "concept" },
      { action: "create", label: "Iteration", kind: "process" },
      { action: "create", label: "AI agent", kind: "technology" },
    ]);
    expect(request.note_changes).toHaveLength(1);
    const note = request.note_changes[0]!.value;
    const paragraphs = note.body.split("\n\n");
    expect(paragraphs).toHaveLength(6);
    expect(paragraphs.every((paragraph) => paragraph.trim().length > 0)).toBe(
      true,
    );
    expect(note.sources).toHaveLength(5);
    expect(
      note.sources.every(
        (source) =>
          source.retrieval_status === "succeeded" &&
          source.published_on !== undefined &&
          source.accessed_on !== undefined,
      ),
    ).toBe(true);
    expect(objectKeys(request)).not.toEqual(
      expect.arrayContaining([
        "id",
        "recorded_on",
        "candidate_digest",
        "knowledge_digest",
        "output_hashes",
        "outputs",
        "affected_paths",
      ]),
    );
    expect(JSON.stringify(request)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/,
    );
  });

  it("keeps fixture bytes outside every engine release projection", async () => {
    const request = await readSonRequest();
    const note = request.note_changes[0]!.value;
    const syntheticPaths = await walkFiles(syntheticFixtureRoot);
    const syntheticNotePath = syntheticPaths.find((path) =>
      /^knowledge\/notes\/[^/]+\.md$/.test(path),
    );
    expect(syntheticNotePath).toBeDefined();
    const syntheticManifest = JSON.parse(
      await readFile(resolve(syntheticFixtureRoot, "coffee-chat.json"), "utf8"),
    ) as {
      profile: { display_name: string };
      repository: { url: string };
      pages_url: string;
      plugin: { name: string };
    };
    const syntheticNote = parseMarkdownDocument(
      await readFile(
        resolve(
          syntheticFixtureRoot,
          ...(syntheticNotePath as string).split("/"),
        ),
        "utf8",
      ),
      syntheticNotePath as string,
    ) as {
      frontmatter: {
        sources: Array<{ url: string; title: string }>;
      };
      body: string;
    };
    const { snapshot, graph } = await engineGraph();
    const bundle = await buildProjectionBundle(snapshot, graph, {
      artifact_class: "release",
      output_root: projectRoot,
    });
    const projectionText = [...bundle.files.values()]
      .map((bytes) => bytes.toString("utf8"))
      .join("\n");
    const fixtureValues = [
      note.body,
      ...note.sources.flatMap((source) => [
        source.url,
        source.title,
        source.published_on,
        source.accessed_on,
      ]),
      syntheticManifest.profile.display_name,
      syntheticManifest.repository.url,
      syntheticManifest.pages_url,
      syntheticManifest.plugin.name,
      syntheticNote.body,
      ...syntheticNote.frontmatter.sources.flatMap((source) => [
        source.url,
        source.title,
      ]),
    ].filter((value): value is string => value !== undefined);

    expect(bundle.dependencies).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(?:tests\/fixtures|examples)(?:\/|$)/),
      ]),
    );
    expect(roleOwnedProjectionPaths(graph)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(?:tests\/fixtures|examples)(?:\/|$)/),
      ]),
    );
    for (const value of fixtureValues)
      expect(projectionText).not.toContain(value);
    expect(bundle.files.get("CONTENT_LICENSE.md")).toEqual(
      await readFile(resolve(projectRoot, "CONTENT_LICENSE.md")),
    );
  });

  it("keeps the fictional instance fixture canonical-only", async () => {
    const temporaryRoot = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-synthetic-instance-"),
    );
    try {
      const fixturePaths = await walkFiles(syntheticFixtureRoot);
      const notePaths = fixturePaths.filter((path) =>
        path.startsWith("knowledge/notes/"),
      );
      expect(notePaths).toHaveLength(1);
      expect(notePaths[0]).toMatch(
        /^knowledge\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/,
      );
      expect(fixturePaths).toEqual(
        ["coffee-chat.json", "knowledge/entities.yml", notePaths[0]!].sort(),
      );

      await Promise.all(
        ["schemas", "method", "skills"].map((path) =>
          cp(resolve(projectRoot, path), resolve(temporaryRoot, path), {
            recursive: true,
          }),
        ),
      );
      await Promise.all(
        ["coffee-chat.json", "knowledge"].map((path) =>
          cp(
            resolve(syntheticFixtureRoot, path),
            resolve(temporaryRoot, path),
            {
              recursive: true,
            },
          ),
        ),
      );
      const snapshot = await createSnapshot(temporaryRoot, "worktree");
      const validation = await validateKnowledge(snapshot, {
        validateIndex: false,
      });
      expect(validation.diagnostics).toEqual([]);
      expect(validation.graph && isInstanceGraph(validation.graph)).toBe(true);
      if (!validation.graph || !isInstanceGraph(validation.graph)) return;
      expect(validation.graph.manifest.profile).toMatchObject({
        display_name: "Projection Author",
        short_name: "Projection",
      });

      const urls = [
        validation.graph.manifest.repository.url,
        validation.graph.manifest.pages_url,
        ...validation.graph.entities.flatMap((entity) => entity.same_as ?? []),
        ...validation.graph.notes.flatMap((note) =>
          note.frontmatter.sources.map((source) => source.url),
        ),
      ];
      for (const url of urls) {
        const hostname = new URL(url).hostname;
        expect(
          hostname === "example.com" || hostname.endsWith(".example"),
        ).toBe(true);
      }

      const sonRequest = await readSonRequest();
      const syntheticBytes = await Promise.all(
        fixturePaths.map((path) =>
          readFile(resolve(syntheticFixtureRoot, ...path.split("/")), "utf8"),
        ),
      );
      expect(syntheticBytes.join("\n")).not.toContain(
        sonRequest.note_changes[0]!.value.body,
      );
      expect(syntheticBytes.join("\n")).not.toMatch(/sha256:[0-9a-f]{64}/);
    } finally {
      await removeAndProveAbsent(temporaryRoot);
    }
  });
});
