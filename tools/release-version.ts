import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildEngineRelease } from "./engine-release.ts";
import { validateKnowledge, type EngineManifest } from "./knowledge.ts";
import { parseStrictJson, decodeCanonicalText } from "./strict-input.ts";
import { createSnapshot } from "./snapshot.ts";
import { renderRoleWorkflows } from "./workflow-projections.ts";
import type { EngineReleaseConfig } from "./engine-contracts.ts";
import type { MigrationDocument, MigrationRegistry } from "./migrations.ts";
import { calverForUtc, compareCalver, isCalver } from "./calver.ts";

export { calverForUtc, isCalver } from "./calver.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, path: string): JsonRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`${path}-object-required`);
  return value as JsonRecord;
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function digest(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function versionSlug(value: string): string {
  return value
    .replace(/[^0-9A-Za-z]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function migrationDocumentFor(
  fromVersion: string,
  toVersion: string,
  schemaVersion: string,
): MigrationDocument {
  const id = `coffee-chat-${versionSlug(fromVersion)}-to-${versionSlug(toVersion)}`;
  return {
    schema_version: "1.0.0",
    id,
    operations: [
      {
        kind: "manifest-json-patch",
        path: "./coffee-chat.json",
        patch: [
          {
            op: "test",
            path: "/provenance/engine/version",
            value: fromVersion,
          },
          { op: "replace", path: "/schema_version", value: schemaVersion },
        ],
      },
    ],
  };
}

async function readJson(root: string, path: string): Promise<unknown> {
  const bytes = await readFile(resolve(root, path));
  return parseStrictJson(decodeCanonicalText(bytes, path), path) as unknown;
}

async function writeJson(root: string, path: string, value: unknown) {
  await writeFile(resolve(root, path), jsonBytes(value));
}

async function gitTagExists(root: string, version: string): Promise<boolean> {
  return await new Promise((resolveResult, reject) => {
    execFile(
      "git",
      ["rev-parse", "--verify", `refs/tags/v${version}`],
      { cwd: root, encoding: "utf8" },
      (error) => {
        if (!error) resolveResult(true);
        else if (typeof error.code === "number") resolveResult(false);
        else reject(error);
      },
    );
  });
}

async function assertCleanWorktree(root: string): Promise<void> {
  await new Promise<void>((resolveResult, reject) => {
    execFile(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      { cwd: root, encoding: "utf8" },
      (error, stdout) => {
        if (error) return reject(error);
        if (String(stdout).trim().length > 0)
          return reject(new Error("release-worktree-dirty"));
        resolveResult();
      },
    );
  });
}

export async function prepareRelease(
  root: string,
  version: string,
): Promise<{ from: string; to: string; migration_id: string }> {
  if (!isCalver(version)) throw new Error("calver-invalid");
  await assertCleanWorktree(root);
  if (await gitTagExists(root, version)) throw new Error("release-tag-exists");

  const config = record(
    await readJson(root, "engine/release-config.json"),
    "release-config",
  ) as unknown as EngineReleaseConfig;
  const manifest = record(await readJson(root, "coffee-chat.json"), "manifest");
  const plugin = record(manifest.plugin, "manifest-plugin");
  const release = record(
    await readJson(root, "engine/release.json"),
    "release",
  );
  const registry = record(
    await readJson(root, "engine/migrations/registry.json"),
    "migration-registry",
  ) as unknown as MigrationRegistry;

  const currentVersion = String(config.version);
  if (release.version !== currentVersion)
    throw new Error("release-config-version-drift");
  if (release.source_ref !== `refs/tags/v${currentVersion}`)
    throw new Error("release-config-ref-drift");
  const unpublishedBaseline =
    currentVersion === version && registry.edges.length === 0;
  if (!unpublishedBaseline && compareCalver(currentVersion, version) >= 0)
    throw new Error("release-version-not-forward");
  if (unpublishedBaseline)
    return { from: currentVersion, to: version, migration_id: "baseline" };
  if (
    registry.edges.some(
      (edge) =>
        edge.to.version === version ||
        edge.id ===
          migrationDocumentFor(
            currentVersion,
            version,
            String(manifest.schema_version),
          ).id,
    )
  )
    throw new Error("migration-edge-exists");

  const schemaVersion = String(manifest.schema_version);
  const document = migrationDocumentFor(currentVersion, version, schemaVersion);
  const documentPath = `engine/migrations/${document.id}.json`;
  try {
    await readFile(resolve(root, documentPath));
    throw new Error("migration-document-exists");
  } catch (error) {
    if (error instanceof Error && error.message === "migration-document-exists")
      throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const nextManifest = {
    ...manifest,
    plugin: { ...plugin, version },
  };
  const nextConfig = {
    ...config,
    version,
    source_ref: `refs/tags/v${version}`,
  } satisfies EngineReleaseConfig;
  const packageJson = record(await readJson(root, "package.json"), "package");
  const lockfile = record(
    await readJson(root, "package-lock.json"),
    "package-lock",
  );
  const lockPackages = record(lockfile.packages, "package-lock-packages");
  const rootPackage = record(lockPackages[""], "package-lock-root");

  await writeJson(root, "coffee-chat.json", nextManifest);
  await writeJson(root, "engine/release-config.json", nextConfig);
  await writeJson(root, "package.json", { ...packageJson, version });
  await writeJson(root, "package-lock.json", {
    ...lockfile,
    version,
    packages: { ...lockPackages, "": { ...rootPackage, version } },
  });
  await writeJson(root, documentPath, document);

  const snapshot = await createSnapshot(root, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  if (!validation.graph || validation.diagnostics.length)
    throw new Error("manifest-invalid-after-release-version");
  const nextRelease = await buildEngineRelease(
    snapshot,
    validation.graph.manifest as EngineManifest,
    nextConfig,
    renderRoleWorkflows("engine"),
  );
  const edge = {
    id: document.id,
    from: {
      repository: String(release.repository),
      version: currentVersion,
      release_digest: String(release.release_digest),
    },
    to: {
      repository: nextRelease.repository,
      version: nextRelease.version,
      release_digest: nextRelease.release_digest,
    },
    document: `./${documentPath}`,
    document_digest: digest(jsonBytes(document)),
    write_scopes: ["manifest"] as ["manifest"],
  };
  const edges = [...registry.edges, edge].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  await writeJson(root, "engine/migrations/registry.json", {
    ...registry,
    edges,
  });
  return { from: currentVersion, to: version, migration_id: document.id };
}

function parseOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (command === "calver") {
    const value = parseOption(args, "--date");
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("release-date-invalid");
    if (value && !isCalver(value.replaceAll("-", ".")))
      throw new Error("release-date-invalid");
    const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
    const version = calverForUtc(date);
    if (!isCalver(version)) throw new Error("release-date-invalid");
    process.stdout.write(`${version}\n`);
    return;
  }
  if (command === "prepare") {
    const version = parseOption(args, "--version");
    if (!version || args.filter((item) => item === "--version").length !== 1)
      throw new Error("release-version-usage");
    const result = await prepareRelease(root, version);
    process.stdout.write(
      `Prepared Coffee Chat release v${result.to} from v${result.from} via ${result.migration_id}.\n`,
    );
    return;
  }
  throw new Error("release-version-usage");
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain)
  await main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "release-version-failed"}\n`,
    );
    process.exitCode = 1;
  });
