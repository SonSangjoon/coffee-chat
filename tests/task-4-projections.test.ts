import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { createHash } from "node:crypto";
import { compareCodePoints } from "../tools/generate.ts";
import {
  checkGeneratedProjections,
  generatedProjectionBytes,
  roleOwnedProjectionPaths,
} from "../tools/projections.ts";
import { validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const cliPath = resolve(projectRoot, "tools/cc.ts");
const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

async function projectGraph(root = projectRoot) {
  const snapshot = await createSnapshot(root, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  expect(validation.diagnostics).toEqual([]);
  expect(validation.graph).toBeDefined();
  return { snapshot, graph: validation.graph! };
}

async function runCli(root: string, ...args: string[]) {
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", cliPath, ...args],
      { cwd: root, encoding: "utf8" },
    );
    return { exitCode: 0, stdout: result.stdout };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { exitCode: failure.code, stdout: failure.stdout };
  }
}

async function pendingRepository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-task-4-cli-"));
  temporaryRoots.push(root);
  for (const path of [
    "coffee-chat.json",
    "schemas",
    "method",
    "skills",
    "docs/assets/readme",
    "docs/testing.md",
    "LICENSE",
    "CONTENT_LICENSE.md",
  ])
    await cp(resolve(projectRoot, path), resolve(root, path), {
      recursive: true,
    });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Task 4 deterministic delivery projections", () => {
  it("exports the three instance Skills plus one engine provisioning Skill without a runtime surface", async () => {
    const skillNames = (
      await readdir(resolve(projectRoot, "skills"), {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(skillNames).toEqual([
      "apply-perspective",
      "build-kg",
      "coffee-chat",
      "create-coffee-chat",
    ]);

    for (const name of [
      "coffee-chat",
      "apply-perspective",
      "build-kg",
      "create-coffee-chat",
    ]) {
      const skill = await readFile(
        resolve(projectRoot, "skills", name, "SKILL.md"),
        "utf8",
      );
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
      expect(frontmatter).toBeDefined();
      const metadata = parseYaml(frontmatter!) as Record<string, unknown>;
      expect(Object.keys(metadata).sort()).toEqual([
        "compatibility",
        "description",
        "name",
      ]);
      expect(metadata.name).toBe(name);
    }

    const { snapshot, graph } = await projectGraph();
    const generated = await generatedProjectionBytes(snapshot, graph);
    for (const name of skillNames) {
      expect(generated.has(`plugins/coffee-chat/skills/${name}/SKILL.md`)).toBe(
        true,
      );
      expect(
        generated.has(
          `plugins/coffee-chat/skills/${name}/references/method.md`,
        ),
      ).toBe(true);
    }
    expect(
      generated.has(
        "plugins/coffee-chat/skills/create-coffee-chat/references/release.json",
      ),
    ).toBe(true);
    expect(
      generated.has(
        "plugins/coffee-chat/skills/create-coffee-chat/references/template-surface.json",
      ),
    ).toBe(true);
    expect(
      [...generated.keys()].filter((path) =>
        /(?:^|\/)(?:hooks|agents|apps|settings|bin|lspServers|mcpServers)(?:\/|$)/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });

  it("keeps the personal instance package closed to engine provisioning", async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-task-5-instance-"),
    );
    temporaryRoots.push(root);
    for (const path of [
      "coffee-chat.json",
      "schemas",
      "method",
      "skills",
      "docs/assets/readme",
      "docs/testing.md",
      "LICENSE",
      "CONTENT_LICENSE.md",
    ])
      await cp(resolve(projectRoot, path), resolve(root, path), {
        recursive: true,
      });
    await cp(
      resolve(projectRoot, "tests/fixtures/initialized-valid/coffee-chat.json"),
      resolve(root, "coffee-chat.json"),
    );
    await cp(
      resolve(projectRoot, "tests/fixtures/initialized-valid/knowledge"),
      resolve(root, "knowledge"),
      { recursive: true },
    );
    const { snapshot, graph } = await projectGraph(root);
    const generated = await generatedProjectionBytes(snapshot, graph);
    expect(
      [...generated.keys()].filter((path) =>
        path.includes("create-coffee-chat"),
      ),
    ).toEqual([]);
    const packageRoot = `plugins/${graph.manifest.plugin.name}`;
    expect(
      [...generated.keys()]
        .filter((path) => path.startsWith(`${packageRoot}/skills/`))
        .sort(),
    ).toEqual(
      ["apply-perspective", "build-kg", "coffee-chat"]
        .flatMap((name) => [
          `${packageRoot}/skills/${name}/SKILL.md`,
          `${packageRoot}/skills/${name}/references/method.md`,
        ])
        .sort(),
    );
  });

  it("projects the shared method, thin routers, package, marketplace, and README for the generic engine", async () => {
    const { snapshot, graph } = await projectGraph();

    const first = await generatedProjectionBytes(snapshot, graph);
    const second = await generatedProjectionBytes(snapshot, graph);

    expect([...first.keys()]).toEqual([...second.keys()]);
    for (const [path, bytes] of first)
      expect(bytes.equals(second.get(path)!)).toBe(true);

    expect(first.get("CLAUDE.md")?.toString("utf8")).toBe("@AGENTS.md\n");
    expect(first.has("CONTENT_LICENSE.md")).toBe(true);
    expect(first.get("CONTENT_LICENSE.md")?.toString("utf8")).toContain(
      "Downstream authors retain ownership of the Notes",
    );
    expect(first.get("AGENTS.md")?.toString("utf8")).toContain(
      "skills/coffee-chat/SKILL.md",
    );
    expect(first.get("skills/coffee-chat/references/method.md")).toBeDefined();
    expect(
      first.get("plugins/coffee-chat/skills/coffee-chat/SKILL.md"),
    ).toEqual(await snapshot.read("skills/coffee-chat/SKILL.md"));
    expect(
      first.get("plugins/coffee-chat/skills/coffee-chat/references/method.md"),
    ).toEqual(first.get("skills/coffee-chat/references/method.md"));
    expect(first.has("plugins/coffee-chat/knowledge/index.json")).toBe(false);
    expect(first.has("plugins/coffee-chat/knowledge/coffee-chat.json")).toBe(
      false,
    );

    const codexManifest = JSON.parse(
      first
        .get("plugins/coffee-chat/.codex-plugin/plugin.json")!
        .toString("utf8"),
    ) as Record<string, unknown>;
    expect(codexManifest).toMatchObject({
      name: "coffee-chat",
      version: "1.0.0",
      repository: "https://github.com/SonSangjoon/coffee-chat",
      skills: "./skills/",
      license: "MIT",
    });
    for (const forbidden of [
      "hooks",
      "mcpServers",
      "apps",
      "agents",
      "lspServers",
      "settings",
      "bin",
    ])
      expect(codexManifest).not.toHaveProperty(forbidden);

    const codexMarketplace = JSON.parse(
      first.get(".agents/plugins/marketplace.json")!.toString("utf8"),
    ) as { name: string; plugins: Array<Record<string, unknown>> };
    expect(codexMarketplace).toMatchObject({
      name: "coffee-chat-marketplace",
      plugins: [
        {
          name: "coffee-chat",
          source: { source: "local", path: "./plugins/coffee-chat" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Productivity",
        },
      ],
    });

    const readme = first.get("README.md")!.toString("utf8");
    const koreanReadme = first.get("README.ko.md")!.toString("utf8");
    const orderedHeadings = [
      "## AI makes execution abundant. Taste decides what is worth making.",
      "## Why Coffee Chat",
      "## Two needs, one graph",
      "## Have a Coffee Chat without installing",
      "## One record, two directions",
      "## Why this is not another knowledge base",
      "## How it earns trust",
      "## Put Taste to work",
      "## Build your Coffee Chat",
      "## Install, remove, contribute, and license",
    ];
    let offset = -1;
    for (const heading of orderedHeadings) {
      const next = readme.indexOf(heading);
      expect(next).toBeGreaterThan(offset);
      offset = next;
    }
    expect(
      readme.startsWith(
        "![Coffee Chat cover showing a coffee cup, orbit lines, and four colored nodes](./docs/assets/readme/coffee-chat-cover.png)",
      ),
    ).toBe(true);
    expect(
      koreanReadme.startsWith(
        "![커피잔, 궤도선, 네 개의 색상 노드가 있는 Coffee Chat 커버](./docs/assets/readme/coffee-chat-cover.png)",
      ),
    ).toBe(true);
    expect(readme).toContain("./docs/assets/readme/coffee-chat-flow.en.png");
    expect(koreanReadme).toContain(
      "./docs/assets/readme/coffee-chat-flow.en.png",
    );
    expect(readme).toContain(
      "Taste here means trained judgment under uncertainty",
    );
    expect(readme).toContain(
      "This is the neutral engine: it has no person to chat with.",
    );
    expect(readme).not.toMatch(/\bblog\b|social account|social post/i);
    expect(readme).toContain("Open <COFFEE_CHAT_INSTANCE_URL>.");
    expect(readme).toContain("Start a one-time Coffee Chat");
    expect(readme).toContain(
      "Use <YOUR_COFFEE_CHAT_URL> as the perspective source for <TASK>",
    );
    expect(readme).toContain("one public reference + your dated thought");
    expect(readme).toContain(
      `codex plugin remove coffee-chat@coffee-chat-marketplace`,
    );
    expect(readme).toContain(
      "codex plugin marketplace remove coffee-chat-marketplace",
    );
    expect(readme).toContain(
      "claude plugin install coffee-chat@coffee-chat-marketplace --scope local",
    );
    expect(readme).toContain(
      "claude plugin uninstall coffee-chat@coffee-chat-marketplace --scope local",
    );
    expect(readme).toContain(
      "codex plugin marketplace upgrade coffee-chat-marketplace",
    );
    expect(readme).toContain("codex plugin list --json");
    expect(readme).toContain("codex plugin marketplace list --json");
    expect(readme).toContain(
      "claude plugin update coffee-chat@coffee-chat-marketplace --scope local",
    );
    expect(readme).toContain("claude plugin list --json");
    expect(readme).toContain("claude plugin marketplace list --json");
    expect(readme).toContain("npm run cc -- hooks inspect --format json");
    expect(readme).toContain("npm run cc -- hooks install --format json");
    expect(readme).toContain("npm run cc -- hooks uninstall --format json");
    expect(koreanReadme).toContain("## 왜 Coffee Chat인가");
    expect(koreanReadme).not.toContain("## Why Coffee Chat");
  });

  it("regenerates all public identity strings from a fork manifest", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-task-4-fork-"));
    temporaryRoots.push(root);
    for (const path of [
      "coffee-chat.json",
      "schemas",
      "method",
      "skills",
      "docs/assets/readme",
      "docs/testing.md",
      "LICENSE",
      "CONTENT_LICENSE.md",
    ])
      await cp(resolve(projectRoot, path), resolve(root, path), {
        recursive: true,
      });
    await cp(
      resolve(projectRoot, "tests/fixtures/initialized-valid/coffee-chat.json"),
      resolve(root, "coffee-chat.json"),
    );
    await cp(
      resolve(projectRoot, "tests/fixtures/initialized-valid/knowledge"),
      resolve(root, "knowledge"),
      { recursive: true },
    );
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as {
      profile: { display_name: string };
      repository: { url: string };
      pages_url: string;
      plugin: { name: string };
      marketplace_name: string;
    };
    manifest.profile.display_name = "Fork Owner";
    manifest.repository.url = "https://github.com/example/fork-chat";
    manifest.pages_url = "https://example.github.io/fork-chat/";
    manifest.plugin.name = "coffee-chat-fork-owner";
    manifest.marketplace_name = "coffee-chat-fork-owner-marketplace";
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const { snapshot, graph } = await projectGraph(root);
    const generated = await generatedProjectionBytes(snapshot, graph);
    const instanceReadme = generated.get("README.md")!.toString("utf8");
    const instanceKoreanReadme = generated
      .get("README.ko.md")!
      .toString("utf8");
    const combined = [...generated.values()]
      .map((bytes) => bytes.toString("utf8"))
      .join("\n");

    expect(combined).toContain("Fork Owner");
    expect(combined).toContain("https://github.com/example/fork-chat");
    expect(combined).toContain("https://example.github.io/fork-chat/");
    expect(combined).toContain("coffee-chat-fork-owner-marketplace");
    expect(instanceReadme).toContain("# Coffee Chat — Fork Owner");
    expect(instanceKoreanReadme).toContain("# Coffee Chat — Fork Owner");
    expect(
      instanceReadme.indexOf("## Have a Coffee Chat without installing"),
    ).toBeLessThan(instanceReadme.indexOf("## Put Taste to work"));
    expect(instanceReadme.indexOf("## Put Taste to work")).toBeLessThan(
      instanceReadme.indexOf("## Build your Coffee Chat"),
    );
    expect(instanceReadme).toContain(
      "Open https://github.com/example/fork-chat",
    );
    expect(instanceReadme).toContain(
      "This is Fork Owner's approved public record.",
    );
    expect(instanceReadme).toContain(
      "https://example.github.io/fork-chat/timeline/",
    );
    expect(instanceReadme).toContain(
      "https://example.github.io/fork-chat/graph/",
    );
    expect(instanceReadme).toContain(
      "codex plugin marketplace upgrade coffee-chat-fork-owner-marketplace",
    );
    expect(instanceReadme).toContain(
      "claude plugin update coffee-chat-fork-owner@coffee-chat-fork-owner-marketplace --scope local",
    );
    expect(instanceReadme).not.toMatch(
      /\bblog\b|social account|social post|how this author thinks/i,
    );
    expect(instanceReadme).not.toContain("before writing anything");
    expect(instanceReadme).not.toContain(
      "Fork the repository, open the fork in Codex or Claude Code, explicitly choose **Make mine**",
    );
    expect(generated.get("CONTENT_LICENSE.md")?.toString("utf8")).toContain(
      "Downstream authors retain ownership of the Notes",
    );
    expect(combined).not.toContain("Sangjoon Son");
    expect(instanceReadme).toContain(
      "https://github.com/SonSangjoon/coffee-chat",
    );
    expect(combined).not.toContain("coffee-chat-sangjoon");
    expect(roleOwnedProjectionPaths(graph)).toEqual(
      expect.arrayContaining([
        "README.md",
        "README.ko.md",
        "plugins/coffee-chat-fork-owner/knowledge/coffee-chat.json",
        "plugins/coffee-chat-fork-owner/knowledge/index.json",
        "plugins/coffee-chat-fork-owner/knowledge/entities.yml",
        "plugins/coffee-chat-fork-owner/knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      ]),
    );
  });

  it("reports projection drift with stable diagnostics", async () => {
    const root = await pendingRepository();
    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });
    await writeFile(resolve(root, "AGENTS.md"), "drift\n");
    await writeFile(resolve(root, "README.md"), "drift\n");
    const { snapshot, graph } = await projectGraph(root);
    const diagnostics = await checkGeneratedProjections(snapshot, graph);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "stale-generated-projection",
          path: "./AGENTS.md",
        }),
        expect.objectContaining({
          code: "stale-generated-projection",
          path: "./README.md",
        }),
      ]),
    );
  });

  it("closes managed inventories, prunes owned stale packages, and preserves unrelated plugins", async () => {
    const root = await pendingRepository();
    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });

    const fourthSkill = resolve(root, "skills/fourth/SKILL.md");
    await mkdir(resolve(root, "skills/fourth"), { recursive: true });
    await writeFile(fourthSkill, "---\nname: fourth\ndescription: no\n---\n");
    const extraSkillCheck = await runCli(
      root,
      "generate",
      "--check",
      "--format",
      "json",
    );
    expect(extraSkillCheck.exitCode).toBe(1);
    expect(JSON.parse(extraSkillCheck.stdout)).toContainEqual(
      expect.objectContaining({
        code: "unexpected-skill",
        path: "./skills/fourth/SKILL.md",
      }),
    );
    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 1,
      stdout: expect.stringContaining('"code":"unexpected-skill"'),
    });
    expect(await readFile(fourthSkill, "utf8")).toContain("name: fourth");
    await rm(resolve(root, "skills/fourth"), { recursive: true });

    const currentPackage = resolve(root, "plugins/coffee-chat");
    const staleNote = resolve(
      currentPackage,
      "knowledge/notes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md",
    );
    const forbiddenHook = resolve(currentPackage, "hooks/hooks.json");
    await mkdir(resolve(currentPackage, "knowledge/notes"), {
      recursive: true,
    });
    await mkdir(resolve(currentPackage, "hooks"), { recursive: true });
    await writeFile(staleNote, "stale\n");
    await writeFile(forbiddenHook, "{}\n");
    const currentMarker = resolve(
      currentPackage,
      ".coffee-chat-generated.json",
    );
    const currentMarkerValue = JSON.parse(
      await readFile(currentMarker, "utf8"),
    ) as {
      owned_files: Array<{ path: string; digest: string }>;
    };
    currentMarkerValue.owned_files.push(
      {
        path: "./knowledge/notes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md",
        digest: digest("stale\n"),
      },
      { path: "./hooks/hooks.json", digest: digest("{}\n") },
    );
    currentMarkerValue.owned_files.sort((left, right) =>
      compareCodePoints(left.path, right.path),
    );
    const currentMarkerBytes = Buffer.from(
      `${JSON.stringify(currentMarkerValue, null, 2)}\n`,
    );
    await writeFile(currentMarker, currentMarkerBytes);
    const repositoryMarkerPath = resolve(
      root,
      ".coffee-chat/generated-files.json",
    );
    const repositoryMarker = JSON.parse(
      await readFile(repositoryMarkerPath, "utf8"),
    ) as { owned_files: Array<{ path: string; digest: string }> };
    const packageEntry = repositoryMarker.owned_files.find(
      (entry) =>
        entry.path === "./plugins/coffee-chat/.coffee-chat-generated.json",
    );
    expect(packageEntry).toBeDefined();
    packageEntry!.digest = digest(currentMarkerBytes.toString("utf8"));
    await writeFile(
      repositoryMarkerPath,
      `${JSON.stringify(repositoryMarker, null, 2)}\n`,
    );

    const obsoletePackage = resolve(root, "plugins/coffee-chat-obsolete");
    await cp(currentPackage, obsoletePackage, { recursive: true });
    const obsoleteMarker = resolve(
      obsoletePackage,
      ".coffee-chat-generated.json",
    );
    const marker = JSON.parse(await readFile(obsoleteMarker, "utf8")) as {
      owned_files: Array<{ path: string; digest: string }>;
    };
    for (const relativePath of [".codex-plugin/plugin.json"]) {
      const path = resolve(obsoletePackage, relativePath);
      const value = JSON.parse(await readFile(path, "utf8")) as {
        name?: string;
        plugin?: { name: string };
      };
      if (relativePath.startsWith(".codex-plugin"))
        value.name = "coffee-chat-obsolete";
      else value.plugin!.name = "coffee-chat-obsolete";
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
      const entry = marker.owned_files.find(
        (candidate) => candidate.path === `./${relativePath}`,
      );
      expect(entry).toBeDefined();
      entry!.digest = digest(await readFile(path, "utf8"));
    }
    await writeFile(obsoleteMarker, `${JSON.stringify(marker, null, 2)}\n`);
    const unlisted = resolve(obsoletePackage, "user-content/keep.txt");
    await mkdir(resolve(obsoletePackage, "user-content"), { recursive: true });
    await writeFile(unlisted, "do not delete\n");
    const sentinel = resolve(root, "plugins/unrelated/sentinel.txt");
    await mkdir(resolve(root, "plugins/unrelated"), { recursive: true });
    await writeFile(sentinel, "keep me\n");
    const foreignMarker = resolve(
      root,
      "plugins/unrelated/.coffee-chat-generated.json",
    );
    await writeFile(
      foreignMarker,
      `${JSON.stringify({
        generated_by: "foreign-plugin",
        schema_version: "1.0.0",
        package_name: "unrelated",
        owned_paths: ["plugins/unrelated/sentinel.txt"],
      })}\n`,
    );

    const staleCheck = await runCli(root, "check", "--format", "json");
    expect(staleCheck.exitCode).toBe(1);
    const staleDiagnostics = JSON.parse(staleCheck.stdout) as Array<{
      code: string;
      path: string;
    }>;
    for (const path of [
      "./plugins/coffee-chat/knowledge/notes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md",
      "./plugins/coffee-chat/hooks/hooks.json",
      "./plugins/coffee-chat-obsolete/.codex-plugin/plugin.json",
    ])
      expect(staleDiagnostics).toContainEqual(
        expect.objectContaining({
          code: "unexpected-generated-projection",
          path,
        }),
      );

    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });
    await expect(readFile(staleNote)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(forbiddenHook)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(resolve(obsoletePackage, ".codex-plugin/plugin.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(unlisted, "utf8")).toBe("do not delete\n");
    expect(await readFile(sentinel, "utf8")).toBe("keep me\n");
    expect(await readFile(foreignMarker, "utf8")).toContain("foreign-plugin");
    expect(await runCli(root, "check", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });
  });

  it("makes generate write every projection while check and generate --check remain read-only", async () => {
    const root = await pendingRepository();

    const generated = await runCli(root, "generate", "--format", "json");
    expect(generated).toEqual({ exitCode: 0, stdout: "[]\n" });
    expect(await readFile(resolve(root, "CLAUDE.md"), "utf8")).toBe(
      "@AGENTS.md\n",
    );
    expect(
      await readFile(
        resolve(root, "plugins/coffee-chat/.codex-plugin/plugin.json"),
        "utf8",
      ),
    ).toContain('"name": "coffee-chat"');
    expect(await runCli(root, "check", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });

    const reference = resolve(root, "skills/coffee-chat/references/method.md");
    await writeFile(reference, "drift\n");
    const dryRun = await runCli(
      root,
      "generate",
      "--check",
      "--format",
      "json",
    );
    expect(dryRun.exitCode).toBe(1);
    expect(JSON.parse(dryRun.stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "stale-generated-projection",
          path: "./skills/coffee-chat/references/method.md",
        }),
      ]),
    );
    expect(await readFile(reference, "utf8")).toBe("drift\n");

    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 1,
      stdout: expect.stringContaining('"code":"generated-owned-file-conflict"'),
    });
    expect(await readFile(reference, "utf8")).toBe("drift\n");
  });

  it("checks the staged virtual tree without reading worktree projection drift", async () => {
    const root = await pendingRepository();
    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });
    await execFileAsync("git", ["init", "--quiet", "--initial-branch=main"], {
      cwd: root,
    });
    await execFileAsync("git", ["add", "--all"], { cwd: root });

    await writeFile(resolve(root, "README.md"), "worktree-only drift\n");

    expect(
      await runCli(root, "check", "--snapshot", "staged", "--format", "json"),
    ).toEqual({ exitCode: 0, stdout: "[]\n" });
    expect(
      await runCli(root, "check", "--snapshot", "worktree", "--format", "json"),
    ).toEqual({
      exitCode: 1,
      stdout: expect.stringContaining('"path":"./README.md"'),
    });
    expect(await readFile(resolve(root, "README.md"), "utf8")).toBe(
      "worktree-only drift\n",
    );
  });

  it("reports a valid but edited current ownership marker as generated drift", async () => {
    const root = await pendingRepository();
    expect(await runCli(root, "generate", "--format", "json")).toEqual({
      exitCode: 0,
      stdout: "[]\n",
    });
    const markerPath = resolve(
      root,
      "plugins/coffee-chat/.coffee-chat-generated.json",
    );
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
      owned_files: Array<{ path: string; digest: string }>;
    };
    marker.owned_files.reverse();
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

    const checked = await runCli(root, "check", "--format", "json");
    expect(checked.exitCode).toBe(1);
    expect(JSON.parse(checked.stdout)).toContainEqual(
      expect.objectContaining({
        code: "stale-generated-projection",
        path: "./plugins/coffee-chat/.coffee-chat-generated.json",
      }),
    );
  });
});
