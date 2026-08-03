import { resolve } from "node:path";
import { canonicalEngineReleaseDigest } from "./engine-release.ts";
import type { EngineReleaseManifest } from "./engine-contracts.ts";
import type { EngineProvenance } from "./engine-provenance.ts";
import {
  assertLockMatchesManifest,
  parseEngineLock,
} from "./engine-provenance.ts";
import type { InstanceManifest } from "./knowledge.ts";
import {
  evaluateMigrationDocument,
  resolveUniqueMigrationPath,
  sha256,
  validateMigrationRegistry,
  type MigrationDocument,
  type MigrationEdge,
  type MigrationRegistry,
} from "./migrations.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

export type VerifiedEngineUpdateStatus =
  | { status: "current"; current: EngineProvenance }
  | {
      status: "update_available";
      current: EngineProvenance;
      target: EngineProvenance;
      migration_path: MigrationEdge[];
      documents: MigrationDocument[];
    }
  | { status: "unknown"; reason_code: string }
  | { status: "incompatible"; reason_code: string };
export type InspectEngineUpdateInput = {
  target_root: string;
  source_root: string;
};
export type EngineUpdateDependencies = {
  read_file: (path: string) => Promise<Buffer>;
  lstat: (path: string) => Promise<{ mode: bigint; isSymbolicLink(): boolean }>;
  run_git_readonly: (cwd: string, args: string[]) => Promise<string>;
};

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function provenance(value: unknown): EngineProvenance | undefined {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.repository !== "string" ||
    typeof candidate.version !== "string" ||
    typeof candidate.source_commit !== "string" ||
    !COMMIT.test(candidate.source_commit) ||
    typeof candidate.release_digest !== "string" ||
    !DIGEST.test(candidate.release_digest)
  )
    return undefined;
  return candidate as EngineProvenance;
}
function releaseIdentity(release: EngineReleaseManifest) {
  return {
    repository: release.repository,
    version: release.version,
    release_digest: release.release_digest,
  };
}
function equalIdentity(
  left: { repository: string; version: string; release_digest: string },
  right: { repository: string; version: string; release_digest: string },
) {
  return (
    left.repository === right.repository &&
    left.version === right.version &&
    left.release_digest === right.release_digest
  );
}
function inside(root: string, path: string): string {
  return resolve(root, path.replace(/^\.\//, ""));
}
async function readFile(
  dependencies: EngineUpdateDependencies,
  root: string,
  path: string,
): Promise<Buffer> {
  const absolute = inside(root, path);
  const entry = await dependencies.lstat(absolute);
  if (entry.isSymbolicLink()) throw new Error("symlink");
  return dependencies.read_file(absolute);
}
function strictJson(bytes: Buffer, path: string): unknown {
  return parseStrictJson(decodeCanonicalText(bytes, path), path);
}
function validRelease(value: unknown): value is EngineReleaseManifest {
  const item = record(value);
  return Boolean(
    item &&
      item.schema_version === "1.0.0" &&
      typeof item.repository === "string" &&
      typeof item.version === "string" &&
      typeof item.source_ref === "string" &&
      item.source_ref === `refs/tags/v${item.version}` &&
      typeof item.target_manifest_schema_version === "string" &&
      record(item.migration_registry)?.path ===
        "./engine/migrations/registry.json" &&
      typeof record(item.migration_registry)?.digest === "string" &&
      DIGEST.test(record(item.migration_registry)?.digest as string) &&
      Array.isArray(item.managed_files) &&
      Array.isArray(item.delivery_files) &&
      typeof item.release_digest === "string" &&
      DIGEST.test(item.release_digest),
  );
}
async function verifyRelease(
  sourceRoot: string,
  dependencies: EngineUpdateDependencies,
): Promise<EngineReleaseManifest | undefined> {
  let release: EngineReleaseManifest;
  try {
    const raw = strictJson(
      await readFile(dependencies, sourceRoot, "engine/release.json"),
      "engine/release.json",
    );
    if (!validRelease(raw)) return undefined;
    release = raw;
  } catch {
    return undefined;
  }
  if (release.release_digest !== canonicalEngineReleaseDigest(release))
    return undefined;
  for (const file of [...release.managed_files, ...release.delivery_files]) {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.digest !== "string" ||
      !DIGEST.test(file.digest)
    )
      return undefined;
    try {
      if (
        sha256(await readFile(dependencies, sourceRoot, file.path)) !==
        file.digest
      )
        return undefined;
    } catch {
      return undefined;
    }
  }
  return release;
}
function asDocument(value: unknown): MigrationDocument | undefined {
  const item = record(value);
  if (
    !item ||
    item.schema_version !== "1.0.0" ||
    typeof item.id !== "string" ||
    !Array.isArray(item.operations)
  )
    return undefined;
  return item as MigrationDocument;
}

/** Purely read-only update inspection. Source and target remain untouched. */
export async function inspectEngineUpdate(
  input: InspectEngineUpdateInput,
  dependencies: EngineUpdateDependencies,
): Promise<VerifiedEngineUpdateStatus> {
  let targetManifest: Record<string, unknown>;
  try {
    const parsed = strictJson(
      await readFile(dependencies, input.target_root, "coffee-chat.json"),
      "coffee-chat.json",
    );
    const item = record(parsed);
    if (!item || item.repository_role !== "instance")
      return { status: "incompatible", reason_code: "target-role-invalid" };
    targetManifest = item;
  } catch {
    return { status: "unknown", reason_code: "target-manifest-unavailable" };
  }
  const current = provenance(record(targetManifest.provenance)?.engine);
  if (!current)
    return { status: "unknown", reason_code: "target-provenance-unknown" };
  try {
    const lock = parseEngineLock(
      await readFile(
        dependencies,
        input.target_root,
        ".coffee-chat/engine-lock.json",
      ),
      ".coffee-chat/engine-lock.json",
    );
    if (
      assertLockMatchesManifest(targetManifest as InstanceManifest, lock).length
    )
      return {
        status: "incompatible",
        reason_code: "target-engine-lock-mismatch",
      };
  } catch {
    return {
      status: "incompatible",
      reason_code: "target-engine-lock-invalid",
    };
  }
  const release = await verifyRelease(input.source_root, dependencies);
  if (!release)
    return { status: "incompatible", reason_code: "source-release-invalid" };
  if (current.repository !== release.repository)
    return { status: "incompatible", reason_code: "repository-mismatch" };
  let registry: MigrationRegistry;
  try {
    const bytes = await readFile(
      dependencies,
      input.source_root,
      "engine/migrations/registry.json",
    );
    if (sha256(bytes) !== release.migration_registry.digest)
      return {
        status: "incompatible",
        reason_code: "migration-registry-digest-mismatch",
      };
    const parsed = strictJson(bytes, "engine/migrations/registry.json");
    const diagnostics = validateMigrationRegistry(parsed, release);
    if (diagnostics.length)
      return { status: "incompatible", reason_code: diagnostics[0]!.code };
    registry = parsed as MigrationRegistry;
  } catch {
    return {
      status: "incompatible",
      reason_code: "migration-registry-unavailable",
    };
  }
  const target = releaseIdentity(release);
  if (equalIdentity(current, target)) return { status: "current", current };
  if (current.version === release.version)
    return { status: "incompatible", reason_code: "version-digest-mismatch" };
  const path = resolveUniqueMigrationPath(
    registry,
    {
      repository: current.repository,
      version: current.version,
      release_digest: current.release_digest,
    },
    target,
  );
  if (!path)
    return { status: "unknown", reason_code: "migration-path-unknown" };
  const documents: MigrationDocument[] = [];
  for (const edge of path) {
    try {
      const bytes = await readFile(
        dependencies,
        input.source_root,
        edge.document,
      );
      if (sha256(bytes) !== edge.document_digest)
        return {
          status: "incompatible",
          reason_code: "migration-document-digest-mismatch",
        };
      const document = asDocument(strictJson(bytes, edge.document));
      if (!document)
        return {
          status: "incompatible",
          reason_code: "migration-document-invalid",
        };
      evaluateMigrationDocument(
        await readFile(dependencies, input.target_root, "coffee-chat.json"),
        edge,
        document,
      );
      documents.push(document);
    } catch {
      return {
        status: "incompatible",
        reason_code: "migration-document-invalid",
      };
    }
  }
  let sourceCommit: string;
  try {
    sourceCommit = (
      await dependencies.run_git_readonly(input.source_root, [
        "rev-parse",
        release.source_ref,
      ])
    ).trim();
  } catch {
    return { status: "incompatible", reason_code: "source-ref-unavailable" };
  }
  if (!COMMIT.test(sourceCommit))
    return { status: "incompatible", reason_code: "source-ref-invalid" };
  return {
    status: "update_available",
    current,
    target: {
      repository: release.repository,
      version: release.version,
      source_commit: sourceCommit,
      release_digest: release.release_digest,
    },
    migration_path: path,
    documents,
  };
}
