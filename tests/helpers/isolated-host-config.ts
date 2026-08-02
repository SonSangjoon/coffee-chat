import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HostName = "codex" | "claude";

export type HostCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type IsolatedHostConfig = {
  root: string;
  codexHome: string;
  codexConfigPath: string;
  codexConfigBytes: Buffer;
  claudeConfig: string;
  claudePluginCache: string;
  claudeSettingsPath: string;
  claudeSettingsBytes: Buffer;
  workspace: string;
  sentinelPath: string;
  sentinelBytes: Buffer;
  environment(host: HostName): NodeJS.ProcessEnv;
  run(
    host: HostName,
    args: string[],
    options?: { cwd?: string; allowFailure?: boolean },
  ): Promise<HostCommandResult>;
  cleanup(): Promise<void>;
};

export function hostExecutableAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
    env: isolatedProcessEnvironment(),
    timeout: 10_000,
  });
  return (result.error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT";
}

const inheritedEnvironmentKeys = new Set([
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "PATHEXT",
  "SHELL",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "WINDIR",
  "__CF_USER_TEXT_ENCODING",
]);

export function isolatedProcessEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      inheritedEnvironmentKeys.has(key.toUpperCase()),
    ),
  );
}

export async function createIsolatedHostConfig(): Promise<IsolatedHostConfig> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-host-"));
  const codexHome = resolve(root, "codex");
  const codexConfigPath = resolve(codexHome, "config.toml");
  const codexConfigBytes = Buffer.from(
    'model = "coffee-chat-lifecycle-sentinel"\n',
  );
  const claudeConfig = resolve(root, "claude");
  const claudePluginCache = resolve(root, "claude-plugin-cache");
  const claudeSettingsPath = resolve(claudeConfig, "settings.json");
  const claudeSettingsBytes = Buffer.from(
    '{\n  "permissions": {\n    "allow": []\n  }\n}\n',
  );
  const workspace = resolve(root, "workspace");
  const sentinelPath = resolve(root, "unrelated-sentinel.txt");
  const sentinelBytes = Buffer.from("unrelated host state must survive\n");
  await Promise.all([
    mkdir(codexHome, { recursive: true }),
    mkdir(claudeConfig, { recursive: true }),
    mkdir(claudePluginCache, { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(codexConfigPath, codexConfigBytes),
    writeFile(claudeSettingsPath, claudeSettingsBytes),
    writeFile(sentinelPath, sentinelBytes),
  ]);
  await execFileAsync("git", ["init", "--quiet", "--initial-branch=main"], {
    cwd: workspace,
    encoding: "utf8",
    env: isolatedProcessEnvironment(),
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });

  const environment = (host: HostName): NodeJS.ProcessEnv => ({
    ...isolatedProcessEnvironment(),
    ...(host === "codex"
      ? { CODEX_HOME: codexHome }
      : {
          CLAUDE_CONFIG_DIR: claudeConfig,
          CLAUDE_CODE_PLUGIN_CACHE_DIR: claudePluginCache,
          DISABLE_AUTOUPDATER: "1",
        }),
    CI: "1",
    NO_COLOR: "1",
  });

  return {
    root,
    codexHome,
    codexConfigPath,
    codexConfigBytes,
    claudeConfig,
    claudePluginCache,
    claudeSettingsPath,
    claudeSettingsBytes,
    workspace,
    sentinelPath,
    sentinelBytes,
    environment,
    async run(host, args, options = {}) {
      try {
        const result = await execFileAsync(host, args, {
          cwd: options.cwd ?? workspace,
          encoding: "utf8",
          env: environment(host),
          maxBuffer: 32 * 1024 * 1024,
          timeout: 60_000,
          killSignal: "SIGKILL",
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const failure = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        const result = {
          exitCode: typeof failure.code === "number" ? failure.code : 2,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? "",
        };
        if (!options.allowFailure)
          throw new Error(
            `${host} ${args.join(" ")} failed (${result.exitCode}): ${result.stderr || result.stdout}`,
          );
        return result;
      }
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
      try {
        await lstat(root);
        throw new Error(`Isolated host state survived cleanup: ${root}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

export async function treeDigests(
  root: string,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const path of await walkFiles(root)) {
    values[path] = createHash("sha256")
      .update(await readFile(resolve(root, ...path.split("/"))))
      .digest("hex");
  }
  return values;
}

export async function findPluginRoots(
  root: string,
  pluginName: string,
): Promise<string[]> {
  const roots: string[] = [];
  for (const path of await walkFiles(root)) {
    if (
      path !== ".codex-plugin/plugin.json" &&
      !path.endsWith("/.codex-plugin/plugin.json")
    )
      continue;
    const value = JSON.parse(
      await readFile(resolve(root, ...path.split("/")), "utf8"),
    ) as { name?: unknown };
    if (value.name !== pluginName) continue;
    roots.push(resolve(root, ...path.split("/").slice(0, -2)));
  }
  return roots.sort();
}

async function walkFiles(root: string, prefix = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(
      resolve(root, ...prefix.split("/").filter(Boolean)),
      {
        withFileTypes: true,
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const paths: string[] = [];
  for (const entry of entries) {
    const path = prefix ? posix.join(prefix, entry.name) : entry.name;
    if (entry.isSymbolicLink())
      throw new Error(`Isolated host state contains a symbolic link: ${path}`);
    if (entry.isDirectory()) paths.push(...(await walkFiles(root, path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

export function relativeInside(root: string, path: string): string {
  const result = relative(root, path);
  if (
    result === "" ||
    result === ".." ||
    result.startsWith(`..${sep}`) ||
    resolve(root, result) !== resolve(path)
  )
    throw new Error("Path is outside the isolated host root.");
  return result.split(sep).join("/");
}
