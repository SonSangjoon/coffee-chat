import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import {
  applyCandidate,
  prepareCandidate,
  type CandidateDependencies,
  type CandidateManifest,
} from "../tools/candidate.ts";
import { checkGeneratedIndex } from "../tools/generate.ts";
import { isInstanceGraph, validateKnowledge } from "../tools/knowledge.ts";
import { checkGeneratedProjections } from "../tools/projections.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const projectRoot = resolve(import.meta.dirname, "..");
const cliPath = resolve(projectRoot, "tools/cc.ts");
const temporaryRoots: string[] = [];

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];

async function git(root: string, ...args: string[]): Promise<string> {
  return (
    await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  ).stdout.trim();
}

function fixedDependencies(includeIds: boolean): CandidateDependencies {
  const ids = [...IDS];
  return {
    clock: { now: () => new Date("2026-08-01T03:00:00.000Z") },
    ...(includeIds ? { uuid: { next: () => ids.shift()! } } : {}),
  };
}

async function repositoryFixture(
  options: { upstreamIdentity?: boolean; ownedStale?: boolean } = {},
) {
  const base = await mkdtemp(
    resolve(tmpdir(), "coffee-chat-task-4-candidate-"),
  );
  temporaryRoots.push(base);
  const root = resolve(base, "repository");
  await mkdir(root);
  for (const path of [
    "coffee-chat.json",
    "schemas",
    "tools",
    "method",
    "skills",
    "LICENSE",
    "CONTENT_LICENSE.md",
    "README.md",
  ])
    await cp(resolve(projectRoot, path), resolve(root, path), {
      recursive: true,
    });
  if (options.upstreamIdentity) {
    await cp(
      resolve(projectRoot, "tests/fixtures/initialized-valid/coffee-chat.json"),
      resolve(root, "coffee-chat.json"),
    );
    await cp(
      resolve(projectRoot, "tests/fixtures/initialized-valid/knowledge"),
      resolve(root, "knowledge"),
      { recursive: true },
    );
    const manifestPath = resolve(root, "coffee-chat.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      profile: { display_name: string };
      repository: { url: string };
      pages_url: string;
      plugin: { name: string };
      marketplace_name: string;
    };
    manifest.profile.display_name = "Upstream Owner";
    manifest.repository.url = "https://github.com/example/coffee-chat-upstream";
    manifest.pages_url = "https://example.github.io/coffee-chat-upstream/";
    manifest.plugin.name = "coffee-chat-upstream";
    manifest.marketplace_name = "coffee-chat-upstream-marketplace";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(resolve(root, "unrelated-sentinel.txt"), "keep me\n");
  }
  await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "generate", "--format", "json"],
    { cwd: root, encoding: "utf8" },
  );
  if (options.ownedStale) {
    const packageName = options.upstreamIdentity
      ? "coffee-chat-upstream"
      : "coffee-chat-sangjoon";
    await mkdir(resolve(root, `plugins/${packageName}/hooks`), {
      recursive: true,
    });
    await mkdir(resolve(root, `plugins/${packageName}/knowledge/notes`), {
      recursive: true,
    });
    await writeFile(
      resolve(root, `plugins/${packageName}/hooks/hooks.json`),
      "{}\n",
    );
    await writeFile(
      resolve(
        root,
        `plugins/${packageName}/knowledge/notes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md`,
      ),
      "stale\n",
    );
    await mkdir(resolve(root, "plugins/unrelated"), { recursive: true });
    await writeFile(
      resolve(root, "plugins/unrelated/sentinel.txt"),
      "keep this plugin\n",
    );
  }
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "task4@example.com");
  await git(root, "config", "user.name", "Task 4");
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "fixture");
  return {
    root,
    request: resolve(base, "request.json"),
    candidate: resolve(base, "candidate"),
  };
}

function request() {
  return {
    schema_version: "1.0.0",
    mode: "make-mine",
    profile: {
      temporary_key: "profile",
      value: {
        display_name: "Sangjoon Son",
        repository: {
          url: "https://github.com/SonSangjoon/coffee-chat",
          default_branch: "main",
        },
        pages_url: "https://sonsangjoon.github.io/coffee-chat/",
        plugin: {
          name: "coffee-chat-sangjoon",
          version: "1.0.0",
          description:
            "Converse with and apply a public, dated perspective graph.",
        },
      },
    },
    entity_changes: [
      {
        action: "create",
        temporary_key: "taste",
        value: { label: "Taste", kind: "concept" },
      },
      {
        action: "create",
        temporary_key: "iteration",
        value: { label: "Iteration", kind: "process" },
      },
      {
        action: "create",
        temporary_key: "agent",
        value: { label: "AI agent", kind: "technology" },
      },
    ],
    note_changes: [
      {
        action: "create",
        temporary_key: "note",
        value: {
          title: "Candidate projection integration",
          temporal_coverage: "2026-02/2026-07",
          sources: [
            {
              url: "https://example.com/public",
              title: "Public source",
              accessed_on: "2026-07-31",
              retrieval_status: "succeeded",
            },
          ],
          entity_refs: ["taste", "iteration", "agent"],
          body: "An authored thought grounded in a public topic.",
        },
      },
    ],
    setup_effects: [],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Task 4 Candidate projection transaction", () => {
  it("ignores unrelated repository symlinks outside every bound inventory", async () => {
    const fixture = await repositoryFixture();
    await mkdir(resolve(fixture.root, "node_modules/.bin"), {
      recursive: true,
    });
    await writeFile(resolve(fixture.root, "node_modules/tool.js"), "tool\n");
    await symlink(
      "../tool.js",
      resolve(fixture.root, "node_modules/.bin/tool"),
    );
    await writeFile(fixture.request, `${JSON.stringify(request(), null, 2)}\n`);

    const prepared = await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.request,
        out: fixture.candidate,
      },
      fixedDependencies(true),
    );

    expect(prepared.candidateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const manifest = JSON.parse(
      await readFile(
        resolve(fixture.candidate, "candidate-manifest.json"),
        "utf8",
      ),
    ) as CandidateManifest;
    expect(
      manifest.canonical_inputs.some((entry) =>
        entry.path.includes("node_modules"),
      ),
    ).toBe(false);
  });

  it("rejects a symlink inside a bound canonical method path", async () => {
    const fixture = await repositoryFixture();
    const method = resolve(fixture.root, "method/shared-method.md");
    const target = resolve(fixture.root, "method-source.md");
    await writeFile(target, await readFile(method));
    await rm(method);
    await symlink("../method-source.md", method);
    await writeFile(fixture.request, `${JSON.stringify(request(), null, 2)}\n`);

    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.request,
          out: fixture.candidate,
        },
        fixedDependencies(true),
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "candidate-symlink-unsafe",
        path: "./method/shared-method.md",
      },
    });
  });

  it("rejects a symlink used as a bound canonical subtree root", async () => {
    const fixture = await repositoryFixture();
    await rename(
      resolve(fixture.root, "method"),
      resolve(fixture.root, "method-source"),
    );
    await symlink("method-source", resolve(fixture.root, "method"));
    await writeFile(fixture.request, `${JSON.stringify(request(), null, 2)}\n`);

    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.request,
          out: fixture.candidate,
        },
        fixedDependencies(true),
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "candidate-symlink-unsafe",
        path: "./method",
      },
    });
  });

  it("binds, previews, applies, and verifies canonical knowledge plus the complete delivery projection set", async () => {
    const fixture = await repositoryFixture();
    await writeFile(fixture.request, `${JSON.stringify(request(), null, 2)}\n`);

    const prepared = await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.request,
        out: fixture.candidate,
      },
      fixedDependencies(true),
    );
    const manifest = JSON.parse(
      await readFile(
        resolve(fixture.candidate, "candidate-manifest.json"),
        "utf8",
      ),
    ) as CandidateManifest;
    const manifestSchema = JSON.parse(
      await readFile(
        resolve(projectRoot, "schemas/candidate-manifest.schema.json"),
        "utf8",
      ),
    ) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateManifest = ajv.compile(manifestSchema);
    expect(
      validateManifest(manifest),
      JSON.stringify(validateManifest.errors, null, 2),
    ).toBe(true);
    const outputPaths = manifest.outputs.map((entry) => entry.path);

    expect(outputPaths).toEqual(
      expect.arrayContaining([
        "./coffee-chat.json",
        "./knowledge/index.json",
        "./README.md",
        "./AGENTS.md",
        "./CLAUDE.md",
        "./.codex-plugin/plugin.json",
        "./.claude-plugin/plugin.json",
        "./.agents/plugins/marketplace.json",
        "./.claude-plugin/marketplace.json",
        "./skills/coffee-chat/references/method.md",
        "./plugins/coffee-chat-sangjoon/knowledge/index.json",
        "./plugins/coffee-chat-sangjoon/knowledge/entities.yml",
        `./plugins/coffee-chat-sangjoon/knowledge/notes/${IDS[4]}.md`,
      ]),
    );
    expect(manifest.preview.affected_paths).toEqual(manifest.changed_paths);
    expect(manifest.setup_effects).toEqual([]);
    expect(await readFile(prepared.previewMarkdown, "utf8")).toContain(
      "## Repository changes",
    );

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.candidate,
        approvedDigest: prepared.candidateDigest,
      },
      fixedDependencies(false),
    );
    expect(receipt).toEqual(expect.objectContaining({ status: "applied" }));

    const snapshot = await createSnapshot(fixture.root, "worktree");
    const validation = await validateKnowledge(snapshot);
    expect(validation.diagnostics).toEqual([]);
    expect(validation.graph).toBeDefined();
    expect(validation.graph && isInstanceGraph(validation.graph)).toBe(true);
    expect(
      await checkGeneratedIndex(
        snapshot,
        validation.graph as Parameters<typeof checkGeneratedIndex>[1],
      ),
    ).toEqual([]);
    expect(
      await checkGeneratedProjections(snapshot, validation.graph!),
    ).toEqual([]);
    expect(await readFile(resolve(fixture.root, "CLAUDE.md"), "utf8")).toBe(
      "@AGENTS.md\n",
    );
  });

  it("removes only the previous generated namespace when Make mine changes identity", async () => {
    const fixture = await repositoryFixture({
      upstreamIdentity: true,
      ownedStale: true,
    });
    await writeFile(fixture.request, `${JSON.stringify(request(), null, 2)}\n`);

    const prepared = await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.request,
        out: fixture.candidate,
      },
      fixedDependencies(true),
    );
    const manifest = JSON.parse(
      await readFile(
        resolve(fixture.candidate, "candidate-manifest.json"),
        "utf8",
      ),
    ) as CandidateManifest;

    expect(manifest.deletions).toContain(
      "./plugins/coffee-chat-upstream/.codex-plugin/plugin.json",
    );
    expect(manifest.deletions).toContain(
      "./plugins/coffee-chat-upstream/hooks/hooks.json",
    );
    expect(manifest.deletions).toContain(
      "./plugins/coffee-chat-upstream/knowledge/notes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md",
    );
    expect(manifest.changed_paths).toContain("./CONTENT_LICENSE.md");
    expect(
      manifest.deletions.some((path) => path.includes("unrelated-sentinel")),
    ).toBe(false);
    expect(
      manifest.outputs.some((entry) =>
        entry.path.startsWith("./plugins/coffee-chat-sangjoon/"),
      ),
    ).toBe(true);

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.candidate,
        approvedDigest: prepared.candidateDigest,
      },
      fixedDependencies(false),
    );
    expect(receipt.status).toBe("applied");
    await expect(
      readFile(
        resolve(
          fixture.root,
          "plugins/coffee-chat-upstream/.codex-plugin/plugin.json",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await readFile(
        resolve(
          fixture.root,
          "plugins/coffee-chat-sangjoon/.codex-plugin/plugin.json",
        ),
        "utf8",
      ),
    ).toContain('"name": "coffee-chat-sangjoon"');
    expect(
      await readFile(resolve(fixture.root, "CONTENT_LICENSE.md"), "utf8"),
    ).toContain("© 2026 Sangjoon Son, All rights reserved");
    expect(
      await readFile(resolve(fixture.root, "unrelated-sentinel.txt"), "utf8"),
    ).toBe("keep me\n");
    expect(
      await readFile(
        resolve(fixture.root, "plugins/unrelated/sentinel.txt"),
        "utf8",
      ),
    ).toBe("keep this plugin\n");
  });
});
