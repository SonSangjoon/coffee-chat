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
    expect(first.has("CONTENT_LICENSE.md")).toBe(false);
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
      "## AI synthesis / AI 해석",
      "## One-time Coffee Chat / 일회성 커피챗",
      "## Install plugin / 플러그인 설치",
      "## Make mine / 내 것으로 만들기",
      "## Browse KG / KG 둘러보기",
    ];
    let offset = -1;
    for (const heading of orderedHeadings) {
      const next = readme.indexOf(heading);
      expect(next).toBeGreaterThan(offset);
      offset = next;
    }
    expect(readme).toContain("Read `coffee-chat.json`, then `AGENTS.md`");
    expect(readme).toContain("one-time mode installs nothing");
    expect(readme).toContain("일회성 모드는 아무것도 설치하지 않습니다");
    const lifecycleDetails = readme.indexOf("<details>");
    expect(lifecycleDetails).toBeGreaterThan(
      readme.indexOf("## Install plugin / 플러그인 설치"),
    );
    for (const quickCommand of [
      "codex plugin marketplace add",
      "codex plugin add",
      "codex plugin remove",
      "claude plugin marketplace add",
      "claude plugin install",
      "claude plugin uninstall",
    ]) {
      const position = readme.indexOf(quickCommand);
      expect(position).toBeGreaterThan(-1);
      expect(position).toBeLessThan(lifecycleDetails);
    }
    expect(readme.indexOf("</details>")).toBeLessThan(
      readme.indexOf("## Make mine / 내 것으로 만들기"),
    );
    expect(readme).toContain(
      "codex plugin remove coffee-chat@coffee-chat-marketplace",
    );
    expect(readme).toContain(
      "codex plugin marketplace upgrade coffee-chat-marketplace",
    );
    expect(readme).toContain("Codex exposes no plugin scope selector");
    expect(readme).toContain("host-managed configuration and cache");
    expect(readme).toContain("label it `Unknown`");
    expect(readme).toContain("codex plugin list --json");
    expect(readme).toContain("codex plugin marketplace list --json");
    expect(readme).toContain(
      "claude plugin install coffee-chat@coffee-chat-marketplace --scope local",
    );
    expect(readme).toContain(
      "claude plugin update coffee-chat@coffee-chat-marketplace --scope local",
    );
    expect(readme).toContain(
      "claude plugin uninstall coffee-chat@coffee-chat-marketplace --scope local",
    );
    expect(readme.toLowerCase()).toContain("host conversation history");
    expect(readme).not.toContain("codex plugin update");
    expect(readme).not.toContain("codex plugin enable");
    expect(readme).not.toContain("codex plugin disable");

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
      "© 2026 Fork Owner, All rights reserved",
    );
    expect(combined).not.toContain("Sangjoon Son");
    expect(combined).not.toContain("SonSangjoon/coffee-chat");
    expect(combined).not.toContain("coffee-chat-sangjoon");
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

    const obsoletePackage = resolve(root, "plugins/coffee-chat-obsolete");
    await cp(currentPackage, obsoletePackage, { recursive: true });
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
    const sentinel = resolve(root, "plugins/unrelated/sentinel.txt");
    await mkdir(resolve(root, "plugins/unrelated"), { recursive: true });
    await writeFile(sentinel, "keep me\n");

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
    await expect(readdir(obsoletePackage)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(sentinel, "utf8")).toBe("keep me\n");
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
