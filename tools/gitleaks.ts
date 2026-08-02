import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { sha256 } from "./knowledge.ts";

const execFileAsync = promisify(execFile);

// Gitleaks v8.30.1 — immutable source and official release checksums verified
// against https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1.
export const GITLEAKS_RELEASE = "v8.30.1";
export const GITLEAKS_COMMIT = "83d9cd684c87d95d656c1458ef04895a7f1cbd8e";
export const GITLEAKS_RELEASE_MANIFEST_SHA256 =
  "061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae";

export type GitleaksAsset = { name: string; sha256: string };

export const GITLEAKS_ASSETS = {
  "linux-x64": {
    name: "gitleaks_8.30.1_linux_x64.tar.gz",
    sha256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  },
  "darwin-arm64": {
    name: "gitleaks_8.30.1_darwin_arm64.tar.gz",
    sha256: "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  },
} as const satisfies Record<string, GitleaksAsset>;

const RELEASE_BASE = `https://github.com/gitleaks/gitleaks/releases/download/${GITLEAKS_RELEASE}`;
const MANIFEST_NAME = "gitleaks_8.30.1_checksums.txt";
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

export type SafeGitleaksFinding = {
  rule_id: string;
  path: string;
  start_line: number;
};

export type GitleaksScanResult = {
  status: "passed" | "blocked";
  tool: "gitleaks";
  version: "v8.30.1";
  mode: "repository" | "staged";
  config: ".gitleaks.toml";
  findings: SafeGitleaksFinding[];
};

function supportedAsset(): GitleaksAsset {
  const key = `${process.platform}-${process.arch}`;
  if (key === "linux-x64") return GITLEAKS_ASSETS["linux-x64"];
  if (key === "darwin-arm64") return GITLEAKS_ASSETS["darwin-arm64"];
  throw new Error("Gitleaks v8.30.1 is not pinned for this platform.");
}

export function verifyGitleaksReleaseBytes(input: {
  manifest: Buffer;
  manifestSha256: string;
  archive: Buffer;
  asset: GitleaksAsset;
}): void {
  if (sha256(input.manifest) !== input.manifestSha256)
    throw new Error("Gitleaks checksum manifest verification failed.");
  const expectedLine = `${input.asset.sha256}  ${input.asset.name}`;
  const lines = input.manifest.toString("utf8").split(/\r?\n/);
  if (!lines.includes(expectedLine))
    throw new Error("Gitleaks asset is absent from the verified manifest.");
  if (sha256(input.archive) !== `sha256:${input.asset.sha256}`)
    throw new Error("Gitleaks archive verification failed.");
}

async function fetchBounded(url: string, maximum: number): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body)
    throw new Error("Pinned Gitleaks release asset could not be downloaded.");
  const advertised = Number(response.headers.get("content-length") ?? "0");
  if (advertised > maximum)
    throw new Error("Pinned Gitleaks release asset exceeds its size boundary.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error(
        "Pinned Gitleaks release asset exceeds its size boundary.",
      );
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

async function prepareVerifiedBinary(): Promise<{
  binary: string;
  cleanup(): Promise<void>;
}> {
  const asset = supportedAsset();
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-gitleaks-"));
  try {
    const [manifest, archive] = await Promise.all([
      fetchBounded(`${RELEASE_BASE}/${MANIFEST_NAME}`, MAX_MANIFEST_BYTES),
      fetchBounded(`${RELEASE_BASE}/${asset.name}`, MAX_ARCHIVE_BYTES),
    ]);
    verifyGitleaksReleaseBytes({
      manifest,
      manifestSha256: `sha256:${GITLEAKS_RELEASE_MANIFEST_SHA256}`,
      archive,
      asset,
    });

    const archivePath = resolve(root, asset.name);
    const binaryDirectory = resolve(root, "verified");
    await mkdir(binaryDirectory, { mode: 0o700 });
    await writeFile(archivePath, archive, { mode: 0o600, flag: "wx" });
    await execFileAsync(
      "tar",
      ["-xzf", archivePath, "-C", binaryDirectory, "gitleaks"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
    const binary = resolve(binaryDirectory, "gitleaks");
    const status = await lstat(binary);
    if (status.isSymbolicLink() || !status.isFile())
      throw new Error(
        "Verified Gitleaks archive did not yield a regular binary.",
      );
    const [resolvedBinary, resolvedBinaryDirectory] = await Promise.all([
      realpath(binary),
      realpath(binaryDirectory),
    ]);
    if (relative(resolvedBinaryDirectory, resolvedBinary) !== "gitleaks")
      throw new Error(
        "Verified Gitleaks binary resolved outside its directory.",
      );
    await chmod(binary, 0o700);
    const version = await execFileAsync(binary, ["version"], {
      cwd: root,
      encoding: "utf8",
      env: sanitizedEnvironment(),
      maxBuffer: 1024 * 1024,
    });
    if (!version.stdout.includes("8.30.1"))
      throw new Error(
        "Verified Gitleaks binary reported an unexpected version.",
      );
    return {
      binary: resolvedBinary,
      cleanup: () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function sanitizedEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith("GITLEAKS_"),
    ),
  );
}

function sanitizedGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith("GIT_"),
    ),
  );
}

function safeTrackedPath(path: string): boolean {
  return (
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    path.split("/").every((segment) => segment !== "")
  );
}

async function materializeTrackedSnapshot(root: string): Promise<{
  root: string;
  cleanup(): Promise<void>;
}> {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "coffee-chat-gitleaks-snapshot-"),
  );
  try {
    const listed = await execFileAsync("git", ["ls-files", "-z", "--cached"], {
      cwd: root,
      encoding: "utf8",
      env: sanitizedGitEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
    });
    const paths = listed.stdout.split("\0").filter(Boolean);
    if (!paths.includes(".gitleaks.toml")) paths.push(".gitleaks.toml");
    for (const path of paths.sort()) {
      if (!safeTrackedPath(path))
        throw new Error(
          "Git contains a path outside the secret-scan boundary.",
        );
      const source = resolve(root, ...path.split("/"));
      const target = resolve(temporary, ...path.split("/"));
      const sourceStatus = await lstat(source);
      let bytes: Buffer;
      if (sourceStatus.isSymbolicLink()) {
        bytes = Buffer.from(await readlink(source));
      } else {
        if (!sourceStatus.isFile())
          throw new Error("Tracked secret-scan input is not a regular file.");
        const resolvedSource = await realpath(source);
        const fromRoot = relative(root, resolvedSource);
        if (
          fromRoot === ".." ||
          fromRoot.startsWith(`..${sep}`) ||
          resolve(root, fromRoot) !== resolvedSource
        )
          throw new Error("Tracked secret-scan input escapes the repository.");
        bytes = await readFile(source);
      }
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
    }
    return {
      root: temporary,
      cleanup: () => rm(temporary, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function safePath(root: string, candidate: unknown): string {
  if (typeof candidate !== "string" || candidate.length === 0) return ".";
  const absolute = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(root, candidate);
  const fromRoot = relative(root, absolute);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    resolve(root, fromRoot) !== absolute
  )
    return ".";
  return fromRoot.split(sep).join("/");
}

function safeReport(root: string, bytes: Buffer): SafeGitleaksFinding[] {
  let report: unknown;
  try {
    report = JSON.parse(bytes.toString("utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(report)) return [];
  return report
    .map((finding): SafeGitleaksFinding | undefined => {
      if (!finding || typeof finding !== "object") return undefined;
      const value = finding as Record<string, unknown>;
      const rule = value.RuleID;
      const line = value.StartLine;
      if (typeof rule !== "string" || !Number.isSafeInteger(line))
        return undefined;
      return {
        rule_id: rule,
        path: safePath(root, value.File),
        start_line: line as number,
      };
    })
    .filter((finding): finding is SafeGitleaksFinding => finding !== undefined)
    .sort((left, right) => {
      const leftKey = `${left.path}\u0000${left.start_line}\u0000${left.rule_id}`;
      const rightKey = `${right.path}\u0000${right.start_line}\u0000${right.rule_id}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

export async function scanRepositoryForSecrets(
  requestedRoot: string,
  mode: "repository" | "staged",
): Promise<GitleaksScanResult> {
  const requestedStatus = await lstat(requestedRoot);
  if (requestedStatus.isSymbolicLink() || !requestedStatus.isDirectory())
    throw new Error("Gitleaks scan root is unsafe.");
  const root = await realpath(requestedRoot);
  let trackedSnapshot:
    | Awaited<ReturnType<typeof materializeTrackedSnapshot>>
    | undefined;
  let prepared: Awaited<ReturnType<typeof prepareVerifiedBinary>> | undefined;
  let reportDirectory: string | undefined;
  try {
    trackedSnapshot =
      mode === "repository"
        ? await materializeTrackedSnapshot(root)
        : undefined;
    const scanRoot = trackedSnapshot?.root ?? root;
    const configPath = resolve(scanRoot, ".gitleaks.toml");
    const configStatus = await lstat(configPath);
    if (configStatus.isSymbolicLink() || !configStatus.isFile())
      throw new Error("Gitleaks scan configuration is unsafe.");

    prepared = await prepareVerifiedBinary();
    reportDirectory = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-gitleaks-report-"),
    );
    const reportPath = resolve(reportDirectory, "report.json");
    const arguments_ = [
      mode === "staged" ? "git" : "dir",
      ...(mode === "staged" ? ["--pre-commit", "--staged"] : []),
      `--config=${configPath}`,
      "--redact=100",
      "--no-banner",
      "--no-color",
      "--report-format=json",
      `--report-path=${reportPath}`,
      ".",
    ];
    let exitCode = 0;
    try {
      await execFileAsync(prepared.binary, arguments_, {
        cwd: scanRoot,
        encoding: "utf8",
        env: sanitizedEnvironment(),
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      exitCode =
        typeof (error as { code?: unknown }).code === "number"
          ? ((error as { code: number }).code ?? 2)
          : 2;
    }
    let findings: SafeGitleaksFinding[] = [];
    try {
      findings = safeReport(scanRoot, await readFile(reportPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (exitCode !== 0 && exitCode !== 1)
      throw new Error("Verified Gitleaks scan could not complete.");
    if (exitCode === 1 && findings.length === 0)
      findings = [{ rule_id: "redacted-finding", path: ".", start_line: 0 }];
    return {
      status: exitCode === 0 ? "passed" : "blocked",
      tool: "gitleaks",
      version: GITLEAKS_RELEASE,
      mode,
      config: ".gitleaks.toml",
      findings,
    };
  } finally {
    await Promise.all([
      prepared?.cleanup() ?? Promise.resolve(),
      reportDirectory
        ? rm(reportDirectory, { recursive: true, force: true })
        : Promise.resolve(),
      trackedSnapshot?.cleanup() ?? Promise.resolve(),
    ]);
  }
}

export function renderGitleaksResult(result: GitleaksScanResult): string {
  return `${JSON.stringify(result)}\n`;
}

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    if (args.shift() !== "scan") throw new Error("Expected gitleaks scan.");
    let mode: "repository" | "staged" = "repository";
    let root = process.cwd();
    while (args.length > 0) {
      const option = args.shift();
      if (option === "--redact=100") continue;
      const value = args.shift();
      if (option === "--mode" && (value === "repository" || value === "staged"))
        mode = value;
      else if (option === "--root" && value) root = value;
      else throw new Error("Unsupported Gitleaks arguments.");
    }
    const result = await scanRepositoryForSecrets(root, mode);
    process.stdout.write(renderGitleaksResult(result));
    process.exitCode = result.status === "passed" ? 0 : 1;
  } catch {
    process.stderr.write(
      '{"status":"error","tool":"gitleaks","message":"Verified scan could not complete; details redacted."}\n',
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
