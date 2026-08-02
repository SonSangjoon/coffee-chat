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
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { parse as parseYaml } from "yaml";
import {
  checkGeneratedProjections,
  generatedProjectionBytes,
  roleOwnedProjectionPaths,
} from "../tools/projections.ts";
import { validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const cliPath = resolve(projectRoot, "tools/cc.ts");
const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

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
    "LICENSE",
    "CONTENT_LICENSE.md",
    "README.md",
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
  it("exports exactly the three declared Agent Skills and no runtime surface", async () => {
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
    ]);

    for (const name of skillNames) {
      const skill = await readFile(
        resolve(projectRoot, "skills", name, "SKILL.md"),
        "utf8",
      );
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
      expect(frontmatter).toBeDefined();
      const metadata = parseYaml(frontmatter!) as Record<string, unknown>;
      expect(Object.keys(metadata).sort()).toEqual(["description", "name"]);
      expect(metadata.name).toBe(name);
    }

    const buildKg = await readFile(
      resolve(projectRoot, "skills/build-kg/SKILL.md"),
      "utf8",
    );
    const skeleton =
      /<!-- candidate-request-skeleton -->\n\s*```json\n([\s\S]*?)\n```/.exec(
        buildKg,
      )?.[1];
    expect(skeleton).toBeDefined();
    const requestSchema = JSON.parse(
      await readFile(
        resolve(projectRoot, "schemas/candidate-request.schema.json"),
        "utf8",
      ),
    ) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateRequest = ajv.compile(requestSchema);
    const exampleRequest = JSON.parse(skeleton!) as object;
    expect(
      validateRequest(exampleRequest),
      JSON.stringify(validateRequest.errors, null, 2),
    ).toBe(true);

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
      [...generated.keys()].filter((path) =>
        /(?:^|\/)(?:hooks|agents|apps|settings|bin|lspServers|mcpServers)(?:\/|$)/.test(
          path,
        ),
      ),
    ).toEqual([]);
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
    const orderedHeadings = [
      "## Purpose / 목적",
      "## Create yours / 내 것으로 만들기",
      "## Use an instance / 인스턴스 사용",
      "## Install the engine plugin / 엔진 플러그인 설치",
      "## Contribute to engine / 엔진에 기여",
      "### Build the public record / 공개 기록 만들기",
      "### Use the public record / 공개 기록 사용하기",
    ];
    let offset = -1;
    for (const heading of orderedHeadings) {
      const next = readme.indexOf(heading);
      expect(next).toBeGreaterThan(offset);
      offset = next;
    }
    expect(readme).toContain("https://github.com/OWNER/coffee-chat-instance");
    expect(readme).toContain("knowledge-free engine plugin");
    expect(readme).not.toContain("Coffee Chat — Coffee Chat");

    const coffeeChatSkill = await snapshot.read("skills/coffee-chat/SKILL.md");
    const coffeeChatText = coffeeChatSkill.toString("utf8");
    expect(coffeeChatText).toContain(
      "An explicit request to install, remove, update, or “do it now” is not an answer",
    );
    expect(coffeeChatText).toContain("Never infer option 2");
    expect(coffeeChatText).toContain("inspect the current native manager");
    expect(coffeeChatText).toContain("host-managed settings and cache");
    expect(coffeeChatText).toContain("removal receipt");
    expect(coffeeChatText).toContain("`Unknown`");
  });

  it("regenerates all public identity strings from a fork manifest", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-task-4-fork-"));
    temporaryRoots.push(root);
    for (const path of ["coffee-chat.json", "schemas", "method", "skills"])
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
    const combined = [...generated.values()]
      .map((bytes) => bytes.toString("utf8"))
      .join("\n");

    expect(combined).toContain("Fork Owner");
    expect(combined).toContain("https://github.com/example/fork-chat");
    expect(combined).toContain("https://example.github.io/fork-chat/");
    expect(combined).toContain("coffee-chat-fork-owner-marketplace");
    expect(generated.get("CONTENT_LICENSE.md")?.toString("utf8")).toContain(
      "Downstream authors retain ownership of the Notes",
    );
    expect(combined).not.toContain("Sangjoon Son");
    expect(combined).not.toContain("SonSangjoon/coffee-chat");
    expect(combined).not.toContain("coffee-chat-sangjoon");
    expect(roleOwnedProjectionPaths(graph)).toEqual(
      expect.arrayContaining([
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
      owned_paths: string[];
    };
    currentMarkerValue.owned_paths.push(
      "plugins/coffee-chat/knowledge/notes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md",
      "plugins/coffee-chat/hooks/hooks.json",
    );
    await writeFile(
      currentMarker,
      `${JSON.stringify(currentMarkerValue, null, 2)}\n`,
    );

    const obsoletePackage = resolve(root, "plugins/coffee-chat-obsolete");
    await cp(currentPackage, obsoletePackage, { recursive: true });
    const obsoleteMarker = resolve(
      obsoletePackage,
      ".coffee-chat-generated.json",
    );
    const marker = JSON.parse(await readFile(obsoleteMarker, "utf8")) as {
      package_name: string;
      owned_paths: string[];
    };
    marker.package_name = "coffee-chat-obsolete";
    marker.owned_paths = marker.owned_paths.map((path) =>
      path.replace("plugins/coffee-chat/", "plugins/coffee-chat-obsolete/"),
    );
    await writeFile(obsoleteMarker, `${JSON.stringify(marker, null, 2)}\n`);
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
    }
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
      exitCode: 0,
      stdout: "[]\n",
    });
    expect(await readFile(reference, "utf8")).not.toBe("drift\n");
  });
});
