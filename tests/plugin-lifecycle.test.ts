import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createIsolatedHostConfig,
  findPluginRoots,
  hostExecutableAvailable,
  isolatedProcessEnvironment,
  relativeInside,
  treeDigests,
  type HostCommandResult,
  type IsolatedHostConfig,
} from "./helpers/isolated-host-config.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const cliPath = resolve(projectRoot, "tools/cc.ts");
const codexAvailable = hostExecutableAvailable("codex");
const claudeAvailable = hostExecutableAvailable("claude");

type Marketplace = {
  root: string;
  marketplaceName: string;
  pluginName: string;
  selector: string;
  pluginRoot: string;
  role: "engine" | "instance" | "sentinel";
};

type CodexMarketplaceList = {
  marketplaces: Array<{ name: string; root: string }>;
};

type CodexPluginList = {
  installed: Array<{ pluginId: string; installed: boolean }>;
  available: Array<{ pluginId: string }>;
};

type CodexInstallReceipt = {
  pluginId: string;
  installedPath: string;
};

const codexTitle = codexAvailable
  ? "runs the Codex native lifecycle with three co-installed Coffee Chat namespaces"
  : "runs the Codex native lifecycle [unsupported host: codex executable absent]";
const claudeTitle = claudeAvailable
  ? "runs the Claude native lifecycle with reload, disable, update, and removal"
  : "runs the Claude native lifecycle [unsupported host: claude executable absent]";

describe.sequential("Task 8 isolated native plugin lifecycle", () => {
  it.skipIf(!codexAvailable)(
    codexTitle,
    async () => {
      const host = await createIsolatedHostConfig();
      try {
        await assertCodexCommandSurface(host);
        const marketplaces = await createAcceptanceMarketplaces(host);
        const sentinel = marketplaces.find(
          (marketplace) => marketplace.role === "sentinel",
        )!;
        const coffeeChat = marketplaces.filter(
          (marketplace) => marketplace.role !== "sentinel",
        );

        for (const marketplace of marketplaces) {
          await host.run("codex", [
            "plugin",
            "marketplace",
            "add",
            marketplace.root,
            "--json",
          ]);
        }
        await expectCodexMarketplaces(host, marketplaces, []);

        const installed = new Map<
          string,
          { path: string; digests: Record<string, string> }
        >();
        for (const marketplace of marketplaces) {
          const receipt = json<CodexInstallReceipt>(
            await host.run("codex", [
              "plugin",
              "add",
              marketplace.selector,
              "--json",
            ]),
          );
          expect(receipt.pluginId).toBe(marketplace.selector);
          const installedPath = await realpath(receipt.installedPath);
          expect(
            relativeInside(await realpath(host.codexHome), installedPath),
          ).toMatch(/^plugins\/cache\//);
          expect(await treeDigests(installedPath)).toEqual(
            await treeDigests(marketplace.pluginRoot),
          );
          if (marketplace.role !== "sentinel") {
            await assertV1SkillOnlySurface(installedPath, marketplace.role);
          }
          installed.set(marketplace.selector, {
            path: installedPath,
            digests: await treeDigests(installedPath),
          });
        }
        await expectCodexInstalled(host, marketplaces, []);
        await expectHostSentinels(host, "codex");

        for (const target of coffeeChat) {
          await host.run("codex", [
            "plugin",
            "remove",
            target.selector,
            "--json",
          ]);
          await expectCodexInstalled(host, marketplaces, [target]);
          await expect(
            lstat(installed.get(target.selector)!.path),
          ).rejects.toMatchObject({ code: "ENOENT" });
          for (const remaining of marketplaces.filter(
            (marketplace) => marketplace !== target,
          )) {
            const snapshot = installed.get(remaining.selector)!;
            expect(await treeDigests(snapshot.path)).toEqual(snapshot.digests);
          }
          await expectHostSentinels(host, "codex");

          const reinstalled = json<CodexInstallReceipt>(
            await host.run("codex", [
              "plugin",
              "add",
              target.selector,
              "--json",
            ]),
          );
          expect(
            await treeDigests(await realpath(reinstalled.installedPath)),
          ).toEqual(installed.get(target.selector)!.digests);
          await expectCodexInstalled(host, marketplaces, []);
        }

        for (const target of coffeeChat) {
          await host.run("codex", [
            "plugin",
            "remove",
            target.selector,
            "--json",
          ]);
          await host.run("codex", [
            "plugin",
            "marketplace",
            "remove",
            target.marketplaceName,
            "--json",
          ]);
        }
        await expectCodexMarketplaces(host, marketplaces, coffeeChat);

        expect(
          await treeDigests(installed.get(sentinel.selector)!.path),
        ).toEqual(installed.get(sentinel.selector)!.digests);
        await host.run("codex", [
          "plugin",
          "remove",
          sentinel.selector,
          "--json",
        ]);
        await host.run("codex", [
          "plugin",
          "marketplace",
          "remove",
          sentinel.marketplaceName,
          "--json",
        ]);
        await expectCodexInstalled(host, [], []);
        await expectCodexMarketplaces(host, marketplaces, marketplaces);
        await expectHostSentinels(host, "codex", true);
      } finally {
        await host.cleanup();
      }
    },
    180_000,
  );

  it.skipIf(!claudeAvailable)(
    claudeTitle,
    async () => {
      const host = await createIsolatedHostConfig();
      try {
        await assertClaudeCommandSurface(host);
        const marketplaces = await createAcceptanceMarketplaces(host);
        const sentinel = marketplaces.find(
          (marketplace) => marketplace.role === "sentinel",
        )!;
        const coffeeChat = marketplaces.filter(
          (marketplace) => marketplace.role !== "sentinel",
        );
        for (const marketplace of marketplaces) {
          await host.run("claude", [
            "plugin",
            "validate",
            marketplace.pluginRoot,
          ]);
          await host.run("claude", [
            "plugin",
            "marketplace",
            "add",
            marketplace.root,
            "--scope",
            "local",
          ]);
          await host.run("claude", [
            "plugin",
            "install",
            marketplace.selector,
            "--scope",
            "local",
          ]);
        }

        const discovered = await host.run("claude", [
          "plugin",
          "list",
          "--json",
        ]);
        for (const marketplace of marketplaces)
          expect(discovered.stdout).toContain(marketplace.selector);

        for (const marketplace of coffeeChat) {
          await host.run("claude", [
            "plugin",
            "disable",
            marketplace.selector,
            "--scope",
            "local",
          ]);
          await host.run("claude", [
            "plugin",
            "enable",
            marketplace.selector,
            "--scope",
            "local",
          ]);
          await host.run("claude", [
            "plugin",
            "update",
            marketplace.selector,
            "--scope",
            "local",
          ]);
        }

        const installed = new Map<
          string,
          { path: string; digests: Record<string, string> }
        >();
        for (const marketplace of marketplaces) {
          const path = await findClaudeInstalledRoot(host, marketplace);
          expect(await treeDigests(path)).toEqual(
            await treeDigests(marketplace.pluginRoot),
          );
          if (marketplace.role !== "sentinel")
            await assertV1SkillOnlySurface(path, marketplace.role);
          installed.set(marketplace.selector, {
            path,
            digests: await treeDigests(path),
          });
        }
        await expectHostSentinels(host, "claude");

        for (const target of coffeeChat) {
          await host.run("claude", [
            "plugin",
            "uninstall",
            target.selector,
            "--scope",
            "local",
          ]);
          const list = await host.run("claude", ["plugin", "list", "--json"]);
          expect(list.stdout).not.toContain(target.selector);
          for (const remaining of marketplaces.filter(
            (marketplace) => marketplace !== target,
          )) {
            expect(list.stdout).toContain(remaining.selector);
            const snapshot = installed.get(remaining.selector)!;
            expect(await treeDigests(snapshot.path)).toEqual(snapshot.digests);
          }
          await expectHostSentinels(host, "claude");

          await host.run("claude", [
            "plugin",
            "install",
            target.selector,
            "--scope",
            "local",
          ]);
          const rediscovered = await host.run("claude", [
            "plugin",
            "list",
            "--json",
          ]);
          for (const marketplace of marketplaces)
            expect(rediscovered.stdout).toContain(marketplace.selector);
        }

        for (const target of coffeeChat) {
          await host.run("claude", [
            "plugin",
            "uninstall",
            target.selector,
            "--scope",
            "local",
          ]);
          await host.run("claude", [
            "plugin",
            "marketplace",
            "remove",
            target.marketplaceName,
          ]);
        }
        expect(
          await treeDigests(installed.get(sentinel.selector)!.path),
        ).toEqual(installed.get(sentinel.selector)!.digests);
        await expectHostSentinels(host, "claude");
        await host.run("claude", [
          "plugin",
          "uninstall",
          sentinel.selector,
          "--scope",
          "local",
        ]);
        await host.run("claude", [
          "plugin",
          "marketplace",
          "remove",
          sentinel.marketplaceName,
        ]);
        await expectHostSentinels(host, "claude");
      } finally {
        await host.cleanup();
      }
    },
    180_000,
  );
});

async function expectCodexMarketplaces(
  host: IsolatedHostConfig,
  marketplaces: Marketplace[],
  removed: Marketplace[],
): Promise<void> {
  const result = json<CodexMarketplaceList>(
    await host.run("codex", ["plugin", "marketplace", "list", "--json"]),
  );
  const names = new Set(
    result.marketplaces.map((marketplace) => marketplace.name),
  );
  for (const marketplace of marketplaces) {
    if (removed.includes(marketplace))
      expect(names.has(marketplace.marketplaceName)).toBe(false);
    else expect(names.has(marketplace.marketplaceName)).toBe(true);
  }
}

async function expectCodexInstalled(
  host: IsolatedHostConfig,
  marketplaces: Marketplace[],
  removed: Marketplace[],
): Promise<void> {
  const result = json<CodexPluginList>(
    await host.run("codex", ["plugin", "list", "--available", "--json"]),
  );
  const installed = new Set(result.installed.map((plugin) => plugin.pluginId));
  expect(result.installed.every((plugin) => plugin.installed)).toBe(true);
  if (marketplaces.length === 0) expect(installed).toEqual(new Set());
  for (const marketplace of marketplaces) {
    if (removed.includes(marketplace))
      expect(installed.has(marketplace.selector)).toBe(false);
    else expect(installed.has(marketplace.selector)).toBe(true);
  }
}

function json<T>(result: HostCommandResult): T {
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as T;
}

async function createAcceptanceMarketplaces(
  host: IsolatedHostConfig,
): Promise<Marketplace[]> {
  const root = resolve(host.root, "marketplaces");
  await mkdir(root, { recursive: true });
  return [
    await createSentinelMarketplace(resolve(root, "sentinel")),
    await createEngineMarketplace(resolve(root, "engine")),
    await createFictionalInstanceMarketplace(resolve(root, "river"), {
      profileId: "1a2b3c4d-5e6f-4789-8abc-1d2e3f4a5b6c",
      displayName: "Fictional River",
      shortName: "River",
      pluginName: "coffee-chat-fictional-river",
    }),
    await createFictionalInstanceMarketplace(resolve(root, "harbor"), {
      profileId: "6b5a4f3e-2d1c-4987-a6b5-c4d3e2f1a0b9",
      displayName: "Fictional Harbor",
      shortName: "Harbor",
      pluginName: "coffee-chat-fictional-harbor",
    }),
  ];
}

async function createEngineMarketplace(root: string): Promise<Marketplace> {
  await Promise.all([
    cp(resolve(projectRoot, ".agents"), resolve(root, ".agents"), {
      recursive: true,
    }),
    cp(
      resolve(projectRoot, ".claude-plugin"),
      resolve(root, ".claude-plugin"),
      {
        recursive: true,
      },
    ),
    cp(
      resolve(projectRoot, "plugins/coffee-chat"),
      resolve(root, "plugins/coffee-chat"),
      { recursive: true },
    ),
  ]);
  return marketplace(root, "coffee-chat", "coffee-chat-marketplace", "engine");
}

async function createFictionalInstanceMarketplace(
  root: string,
  identity: {
    profileId: string;
    displayName: string;
    shortName: string;
    pluginName: string;
  },
): Promise<Marketplace> {
  await mkdir(root, { recursive: true });
  await Promise.all([
    cp(resolve(projectRoot, "tests/fixtures/synthetic-instance"), root, {
      recursive: true,
    }),
    ...["schemas", "method", "skills"].map((path) =>
      cp(resolve(projectRoot, path), resolve(root, path), { recursive: true }),
    ),
    ...["LICENSE", "CONTENT_LICENSE.md"].map((path) =>
      cp(resolve(projectRoot, path), resolve(root, path)),
    ),
  ]);
  const manifestPath = resolve(root, "coffee-chat.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    profile: { id: string; display_name: string; short_name: string };
    repository: { url: string };
    pages_url: string;
    plugin: { name: string; description: string };
    marketplace_name: string;
  };
  const slug = identity.pluginName.replace(/^coffee-chat-/, "");
  manifest.profile = {
    id: identity.profileId,
    display_name: identity.displayName,
    short_name: identity.shortName,
  };
  manifest.repository.url = `https://example.com/${slug}/coffee-chat`;
  manifest.pages_url = `https://example.com/${slug}/coffee-chat/`;
  manifest.plugin.name = identity.pluginName;
  manifest.plugin.description = `A fictional ${identity.shortName} lifecycle fixture.`;
  manifest.marketplace_name = `${identity.pluginName}-marketplace`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const generated = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "generate", "--format", "json"],
    {
      cwd: root,
      encoding: "utf8",
      env: isolatedProcessEnvironment(),
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
      killSignal: "SIGKILL",
    },
  );
  expect(generated.stdout).toBe("[]\n");
  return marketplace(
    root,
    identity.pluginName,
    manifest.marketplace_name,
    "instance",
  );
}

async function createSentinelMarketplace(root: string): Promise<Marketplace> {
  const pluginName = "unrelated-sentinel-plugin";
  const marketplaceName = "unrelated-sentinel-marketplace";
  const pluginRoot = resolve(root, `plugins/${pluginName}`);
  const manifest = {
    name: pluginName,
    version: "1.0.0",
    description: "An unrelated lifecycle sentinel.",
    author: { name: "Lifecycle Test" },
    repository: "https://example.com/unrelated-sentinel",
    license: "MIT",
    keywords: ["sentinel"],
    skills: "./skills/",
  };
  const skill = [
    "---",
    "name: unrelated-sentinel",
    "description: Preserve unrelated host plugin state during lifecycle tests.",
    "---",
    "",
    "# Unrelated sentinel",
    "",
    "Leave this package unchanged.",
    "",
  ].join("\n");
  const codexMarketplace = {
    name: marketplaceName,
    plugins: [
      {
        name: pluginName,
        source: { source: "local", path: `./plugins/${pluginName}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity",
      },
    ],
  };
  const claudeMarketplace = {
    name: marketplaceName,
    owner: { name: "Lifecycle Test" },
    plugins: [
      {
        name: pluginName,
        source: `./plugins/${pluginName}`,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
      },
    ],
  };
  await Promise.all([
    writeJson(resolve(pluginRoot, ".codex-plugin/plugin.json"), manifest),
    writeJson(resolve(pluginRoot, ".claude-plugin/plugin.json"), manifest),
    writeFileEnsured(
      resolve(pluginRoot, "skills/unrelated-sentinel/SKILL.md"),
      skill,
    ),
    writeJson(
      resolve(root, ".agents/plugins/marketplace.json"),
      codexMarketplace,
    ),
    writeJson(
      resolve(root, ".claude-plugin/marketplace.json"),
      claudeMarketplace,
    ),
  ]);
  return marketplace(root, pluginName, marketplaceName, "sentinel");
}

function marketplace(
  root: string,
  pluginName: string,
  marketplaceName: string,
  role: Marketplace["role"],
): Marketplace {
  return {
    root,
    marketplaceName,
    pluginName,
    selector: `${pluginName}@${marketplaceName}`,
    pluginRoot: resolve(root, `plugins/${pluginName}`),
    role,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileEnsured(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileEnsured(
  path: string,
  bytes: string | Buffer,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function assertV1SkillOnlySurface(
  root: string,
  role: "engine" | "instance",
): Promise<void> {
  const paths = Object.keys(await treeDigests(root));
  const common = [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".coffee-chat-generated.json",
    "LICENSE",
    ...["apply-perspective", "build-kg", "coffee-chat"].flatMap((skill) => [
      `skills/${skill}/SKILL.md`,
      `skills/${skill}/references/method.md`,
    ]),
  ];
  const notes = paths.filter((path) =>
    /^knowledge\/notes\/[0-9a-f-]+\.md$/.test(path),
  );
  const expected =
    role === "engine"
      ? common
      : [
          ...common,
          "knowledge/coffee-chat.json",
          "knowledge/entities.yml",
          "knowledge/index.json",
          ...notes,
        ];
  expect(paths).toEqual(expected.sort());
  for (const [manifestPath, expectedKeys] of [
    [
      ".codex-plugin/plugin.json",
      [
        "author",
        "description",
        "homepage",
        "interface",
        "keywords",
        "license",
        "name",
        "repository",
        "skills",
        "version",
      ],
    ],
    [
      ".claude-plugin/plugin.json",
      [
        "author",
        "description",
        "homepage",
        "keywords",
        "license",
        "name",
        "repository",
        "skills",
        "version",
      ],
    ],
  ] as const) {
    const manifest = JSON.parse(
      await readFile(resolve(root, manifestPath), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(manifest).sort()).toEqual([...expectedKeys].sort());
    expect(await findPluginRoots(root, manifest.name as string)).toEqual([
      root,
    ]);
  }
}

async function assertCodexCommandSurface(
  host: IsolatedHostConfig,
): Promise<void> {
  const plugin = await host.run("codex", ["plugin", "--help"]);
  for (const command of ["add", "list", "marketplace", "remove"])
    expect(plugin.stdout).toMatch(new RegExp(`^\\s{2}${command}\\s`, "m"));
  expect(plugin.stdout).not.toMatch(/^\s{2}(?:disable|enable)\s/m);
  for (const command of ["add", "list", "remove"])
    await host.run("codex", ["plugin", command, "--help"]);
  for (const command of ["add", "list", "remove"])
    await host.run("codex", ["plugin", "marketplace", command, "--help"]);
}

async function assertClaudeCommandSurface(
  host: IsolatedHostConfig,
): Promise<void> {
  const plugin = await host.run("claude", ["plugin", "--help"]);
  for (const command of [
    "disable",
    "enable",
    "install",
    "list",
    "marketplace",
    "uninstall",
    "update",
    "validate",
  ])
    expect(plugin.stdout).toMatch(new RegExp(`\\b${command}\\b`));
  for (const command of [
    "disable",
    "enable",
    "install",
    "list",
    "uninstall",
    "update",
    "validate",
  ])
    await host.run("claude", ["plugin", command, "--help"]);
}

async function expectHostSentinels(
  host: IsolatedHostConfig,
  hostName: "codex" | "claude",
  final = false,
): Promise<void> {
  expect(await readFile(host.sentinelPath)).toEqual(host.sentinelBytes);
  if (hostName === "claude") {
    expect(await readFile(host.claudeSettingsPath)).toEqual(
      host.claudeSettingsBytes,
    );
    return;
  }
  const config = await readFile(host.codexConfigPath);
  expect(config.toString("utf8")).toContain(
    host.codexConfigBytes.toString("utf8").trim(),
  );
  if (final) expect(config).toEqual(host.codexConfigBytes);
}

async function findClaudeInstalledRoot(
  host: IsolatedHostConfig,
  marketplace: Marketplace,
): Promise<string> {
  const candidates = (
    await Promise.all([
      findPluginRoots(host.claudePluginCache, marketplace.pluginName),
      findPluginRoots(host.claudeConfig, marketplace.pluginName),
      findPluginRoots(
        resolve(host.workspace, ".claude"),
        marketplace.pluginName,
      ),
    ])
  ).flat();
  const source = await treeDigests(marketplace.pluginRoot);
  const matching: string[] = [];
  for (const candidate of candidates)
    if (JSON.stringify(await treeDigests(candidate)) === JSON.stringify(source))
      matching.push(candidate);
  expect(matching.length).toBeGreaterThan(0);
  return matching.sort()[0]!;
}
