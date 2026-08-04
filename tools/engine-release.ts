import { createHash } from "node:crypto";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import {
  TEMPLATE_SURFACE_SELF_COPY_PATHS,
  artifactPolicyForPath,
  engineDeliverySourcePaths,
  engineManagedSourcePaths,
  type EngineArtifactPolicy,
} from "./artifact-inventory.ts";
import { canonicalizeJson, compareCodePoints } from "./generate.ts";
import { type EngineManifest, isEngineManifest } from "./knowledge.ts";
import { isCalver } from "./calver.ts";
import type {
  EngineDeliveryFile,
  EngineManagedFile,
  EngineReleaseConfig,
  EngineReleaseManifest,
  EngineTemplateSurfaceManifest,
  RepositoryProjection,
  TemplateSurfaceFile,
} from "./engine-contracts.ts";
import type { Snapshot } from "./snapshot.ts";

const RELEASE_DOMAIN = "coffee-chat-engine-release/v1";
const SURFACE_DOMAIN = "coffee-chat-template-surface/v1";
const RELEASE_SCHEMA_VERSION = "1.0.0" as const;
const REGISTRY_PATH = "engine/migrations/registry.json";

type Digest = `sha256:${string}`;

function digest(bytes: Buffer): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isSafeRepositoryPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    path === path.normalize("NFC") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== ".")
  );
}

function assertConfig(config: EngineReleaseConfig): void {
  if (config.schema_version !== "1.0.0" || !isCalver(config.version))
    throw new ValidationFailure({
      code: "engine-release-config-invalid",
      path: "./engine/release-config.json",
      message: "Engine release configuration has an invalid schema or version.",
    });
  if (config.source_ref !== `refs/tags/v${config.version}`)
    throw new ValidationFailure({
      code: "engine-release-ref-mismatch",
      path: "./engine/release-config.json",
      message: "The release source ref must be refs/tags/v<version>.",
    });
  if (config.target_manifest_schema_version !== "1.1.0")
    throw new ValidationFailure({
      code: "engine-release-manifest-schema-invalid",
      path: "./engine/release-config.json",
      message: "The target manifest schema version is not supported.",
    });
}

function assertPath(path: string, pointer = "./"): string {
  const normalized = path.startsWith("./") ? path.slice(2) : path;
  if (!isSafeRepositoryPath(normalized))
    throw new ValidationFailure({
      code: "engine-release-path-invalid",
      path: pointer,
      message:
        "Release inventory paths must be safe repository-relative paths.",
    });
  return normalized;
}

function sortedFiles<T extends { path: string }>(files: T[]): T[] {
  return [...files].sort((left, right) =>
    compareCodePoints(left.path, right.path),
  );
}

function releaseDigestPayload(
  value: EngineReleaseDigestInput,
): Record<string, unknown> {
  return {
    domain: RELEASE_DOMAIN,
    repository: value.repository,
    version: value.version,
    source_ref: value.source_ref,
    target_manifest_schema_version: value.target_manifest_schema_version,
    managed_files: sortedFiles(value.managed_files),
    delivery_files: sortedFiles(value.delivery_files),
  };
}

export type EngineReleaseDigestInput = Pick<
  EngineReleaseManifest,
  | "repository"
  | "version"
  | "source_ref"
  | "target_manifest_schema_version"
  | "managed_files"
  | "delivery_files"
>;

export function canonicalEngineReleaseDigest(
  value: EngineReleaseDigestInput,
): Digest {
  return digest(
    Buffer.from(canonicalizeJson(releaseDigestPayload(value) as never), "utf8"),
  );
}

function surfaceDigestPayload(
  value: Omit<EngineTemplateSurfaceManifest, "surface_digest">,
): Record<string, unknown> {
  return {
    domain: SURFACE_DOMAIN,
    schema_version: value.schema_version,
    repository: value.repository,
    release: value.release,
    files: sortedFiles(value.files),
  };
}

export function canonicalTemplateSurfaceDigest(
  value: Omit<EngineTemplateSurfaceManifest, "surface_digest">,
): Digest {
  return digest(
    Buffer.from(canonicalizeJson(surfaceDigestPayload(value) as never), "utf8"),
  );
}

function policyFor(path: string): EngineArtifactPolicy {
  const policy = artifactPolicyForPath(path);
  if (!policy)
    throw new ValidationFailure({
      code: "unclassified-engine-path",
      path: repositoryPath(path),
      message: "Every tracked template path must be explicitly classified.",
    });
  return policy;
}

function ensureFilePath(
  path: string,
  fileClass: "managed" | "delivery",
): string {
  const normalized = assertPath(path);
  if (
    normalized === "engine/release.json" ||
    normalized === "engine/template-surface.json" ||
    normalized === REGISTRY_PATH ||
    normalized === "coffee-chat.json" ||
    normalized.startsWith("knowledge/") ||
    normalized.startsWith("plugins/") ||
    normalized.startsWith("README") ||
    normalized === "AGENTS.md" ||
    normalized === "CLAUDE.md"
  )
    throw new ValidationFailure({
      code: "engine-managed-path-invalid",
      path: repositoryPath(normalized),
      message: `${fileClass} release inventory cannot contain generated or instance-owned paths.`,
    });
  return normalized;
}

function checkDuplicatePaths(
  files: Array<{ path: string }>,
  path: string,
): void {
  const paths = files.map((file) => file.path);
  if (new Set(paths).size !== paths.length)
    throw new ValidationFailure({
      code: "engine-release-duplicate-path",
      path: repositoryPath(path),
      message: "Release inventory paths must be unique.",
    });
  for (let index = 1; index < paths.length; index += 1)
    if (compareCodePoints(paths[index - 1]!, paths[index]!) > 0)
      throw new ValidationFailure({
        code: "engine-release-order",
        path: repositoryPath(path),
        message: "Release inventory paths must be sorted by code point.",
      });
}

async function readDigestFile(
  snapshot: Snapshot,
  path: string,
): Promise<Digest> {
  const bytes = await snapshot.read(path);
  return digest(bytes);
}

function repositoryOf(manifest: EngineManifest): string {
  if (!isEngineManifest(manifest))
    throw new ValidationFailure({
      code: "engine-release-role-invalid",
      path: "./coffee-chat.json",
      message: "Engine release generation requires an engine-role manifest.",
    });
  return manifest.repository.url;
}

export async function buildEngineRelease(
  snapshot: Snapshot,
  manifest: EngineManifest,
  config: EngineReleaseConfig,
  overlay?: RepositoryProjection,
  options: { allowUnclassifiedPaths?: boolean } = {},
): Promise<EngineReleaseManifest> {
  assertConfig(config);
  const repository = repositoryOf(manifest);
  const entries = await snapshot.listRepositoryEntries();
  const overlayByPath = new Map(
    (overlay?.outputs ?? []).map((output) => [
      output.path.replace(/^\.\//, ""),
      output,
    ]),
  );
  for (const [path, output] of overlayByPath) {
    const existing = entries.find((entry) => entry.path === path);
    if (existing) existing.mode = output.mode;
    else entries.push({ path, mode: output.mode });
  }
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const managed: EngineManagedFile[] = [];
  const delivery: EngineDeliveryFile[] = [];
  for (const entry of entries) {
    let policy: EngineArtifactPolicy;
    try {
      policy = policyFor(entry.path);
    } catch (error) {
      if (options.allowUnclassifiedPaths && error instanceof ValidationFailure)
        continue;
      throw error;
    }
    if (policy.release_class === "excluded") continue;
    if (entry.mode === "120000")
      throw new ValidationFailure({
        code: "engine-release-symlink",
        path: repositoryPath(entry.path),
        message: "Release inventory cannot bind a symbolic link.",
      });
    const path = ensureFilePath(entry.path, policy.release_class);
    const bytes = overlayByPath.get(path)?.bytes ?? (await snapshot.read(path));
    const commonFile = {
      path: repositoryPath(path) as `./${string}`,
      digest: digest(bytes),
      mode: entry.mode as "100644" | "100755",
    };
    if (policy.release_class === "managed")
      managed.push({ ...commonFile, class: "engine-source" });
    else delivery.push({ ...commonFile, class: "engine-delivery" });
  }
  // The source inventory is closed.  A policy path absent from a fixture is
  // allowed, while a present path cannot silently fall outside the inventory.
  for (const path of [
    ...engineManagedSourcePaths(),
    ...engineDeliverySourcePaths(),
  ]) {
    if (!entryByPath.has(path)) continue;
  }
  const registryDigest = await readDigestFile(snapshot, REGISTRY_PATH);
  const managedFiles = sortedFiles(managed);
  const deliveryFiles = sortedFiles(delivery);
  checkDuplicatePaths(managedFiles, "engine/release.json");
  checkDuplicatePaths(deliveryFiles, "engine/release.json");
  const identity = {
    schema_version: RELEASE_SCHEMA_VERSION,
    repository,
    version: config.version,
    source_ref: config.source_ref,
    target_manifest_schema_version: config.target_manifest_schema_version,
    migration_registry: {
      path: "./engine/migrations/registry.json" as const,
      digest: registryDigest,
    },
    managed_files: managedFiles,
    delivery_files: deliveryFiles,
  } satisfies Omit<EngineReleaseManifest, "release_digest">;
  return {
    ...identity,
    release_digest: canonicalEngineReleaseDigest(identity),
  };
}

function diagnostic(code: string, path: string, message: string): Diagnostic {
  return { code, path: repositoryPath(path), message };
}

export async function verifyEngineRelease(
  snapshot: Snapshot,
  release: EngineReleaseManifest,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  try {
    checkDuplicatePaths(release.managed_files, "engine/release.json");
    checkDuplicatePaths(release.delivery_files, "engine/release.json");
    const expected = await buildEngineRelease(
      snapshot,
      JSON.parse(
        (await snapshot.read("coffee-chat.json")).toString("utf8"),
      ) as EngineManifest,
      {
        schema_version: "1.0.0",
        version: release.version,
        source_ref: release.source_ref,
        target_manifest_schema_version: release.target_manifest_schema_version,
      },
    );
    if (
      canonicalizeJson(expected as never) !== canonicalizeJson(release as never)
    )
      diagnostics.push(
        diagnostic(
          "engine-release-drift",
          "engine/release.json",
          "Engine release bytes are not reproducible from the selected snapshot.",
        ),
      );
  } catch (error) {
    if (error instanceof ValidationFailure) diagnostics.push(error.diagnostic);
    else
      diagnostics.push(
        diagnostic(
          "engine-release-invalid",
          "engine/release.json",
          "Engine release could not be verified.",
        ),
      );
  }
  if (release.release_digest !== canonicalEngineReleaseDigest(release))
    diagnostics.push(
      diagnostic(
        "engine-release-digest-mismatch",
        "engine/release.json",
        "Engine release digest does not match its canonical payload.",
      ),
    );
  return sortDiagnostics(diagnostics);
}

function finalProjectionEntries(
  snapshotEntries: Awaited<ReturnType<Snapshot["listRepositoryEntries"]>>,
  projection: RepositoryProjection,
): Map<string, { mode: "100644" | "100755" | "120000"; generated?: Buffer }> {
  const projectionPaths = projection.outputs.map((output) => output.path);
  if (new Set(projectionPaths).size !== projectionPaths.length)
    throw new ValidationFailure({
      code: "template-surface-duplicate-projection",
      path: "./engine/template-surface.json",
      message: "Template surface projection outputs must be unique.",
    });
  const entries = new Map<
    string,
    { mode: "100644" | "100755" | "120000"; generated?: Buffer }
  >(snapshotEntries.map((entry) => [entry.path, { mode: entry.mode }]));
  for (const path of projection.deletions)
    entries.delete(path.replace(/^\.\//, ""));
  for (const output of projection.outputs)
    entries.set(output.path.replace(/^\.\//, ""), {
      mode: output.mode,
      generated: output.bytes,
    });
  return entries;
}

export async function buildTemplateSurface(
  snapshot: Snapshot,
  release: EngineReleaseManifest,
  policy: EngineArtifactPolicy[],
  projection: RepositoryProjection,
): Promise<EngineTemplateSurfaceManifest> {
  const policyMap = new Map(
    policy.map((entry) => [entry.path.replace(/^\.\//, ""), entry]),
  );
  const entries = finalProjectionEntries(
    await snapshot.listRepositoryEntries(),
    projection,
  );
  for (const path of entries.keys())
    if (!policyMap.has(path)) policyMap.set(path, artifactPolicyForPath(path)!);
  const files: TemplateSurfaceFile[] = [];
  for (const [path, entry] of entries) {
    if (!isSafeRepositoryPath(path))
      throw new ValidationFailure({
        code: "template-surface-path-invalid",
        path: repositoryPath(path),
        message:
          "Template surface paths must be safe repository-relative paths.",
      });
    const currentPolicy = policyMap.get(path);
    if (!currentPolicy)
      throw new ValidationFailure({
        code: "unclassified-engine-path",
        path: repositoryPath(path),
        message: "Template surface contains an unclassified path.",
      });
    const state = currentPolicy.states["engine-repository"];
    if (!state || state.audience === "local")
      throw new ValidationFailure({
        code: "template-surface-local-path",
        path: repositoryPath(path),
        message: "Local-only paths must not enter the template surface.",
      });
    if (
      state.audience === "engine-only" &&
      currentPolicy.template_disposition === "remove-engine-only"
    )
      continue;
    const selfCopy = (
      TEMPLATE_SURFACE_SELF_COPY_PATHS as readonly string[]
    ).includes(repositoryPath(path));
    const bytes = entry.generated ?? (await snapshot.read(path));
    if (entry.mode === "120000")
      throw new ValidationFailure({
        code: "template-surface-symlink",
        path: repositoryPath(path),
        message: "Template surface cannot bind symbolic links.",
      });
    files.push({
      path: repositoryPath(path) as `./${string}`,
      mode: entry.mode as "100644" | "100755",
      engine_audience:
        state.audience === "engine-only" ? "engine-only" : "instance",
      engine_ownership: state.ownership,
      disposition: currentPolicy.template_disposition,
      binding: selfCopy
        ? { kind: "surface-self-copy" }
        : { kind: "content", digest: digest(bytes) },
    });
  }
  files.sort((left, right) => compareCodePoints(left.path, right.path));
  const base = {
    schema_version: "1.0.0" as const,
    repository: release.repository,
    release: {
      version: release.version,
      source_ref: release.source_ref,
      release_digest: release.release_digest,
    },
    files,
  } satisfies Omit<EngineTemplateSurfaceManifest, "surface_digest">;
  return { ...base, surface_digest: canonicalTemplateSurfaceDigest(base) };
}

export async function verifyTemplateSurface(
  snapshot: Snapshot,
  surface: EngineTemplateSurfaceManifest,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const repositoryEntries = await snapshot.listRepositoryEntries();
  const entryByPath = new Map(
    repositoryEntries.map((entry) => [`./${entry.path}`, entry]),
  );
  const paths = surface.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length)
    diagnostics.push(
      diagnostic(
        "template-surface-duplicate",
        "engine/template-surface.json",
        "Template surface paths must be unique.",
      ),
    );
  for (let index = 1; index < paths.length; index += 1)
    if (compareCodePoints(paths[index - 1]!, paths[index]!) > 0)
      diagnostics.push(
        diagnostic(
          "template-surface-order",
          "engine/template-surface.json",
          "Template surface paths must be sorted.",
        ),
      );
  const { surface_digest: _surfaceDigest, ...surfacePayload } = surface;
  if (surface.surface_digest !== canonicalTemplateSurfaceDigest(surfacePayload))
    diagnostics.push(
      diagnostic(
        "template-surface-digest-mismatch",
        "engine/template-surface.json",
        "Template surface digest does not match its canonical payload.",
      ),
    );
  for (const entry of repositoryEntries) {
    const path = `./${entry.path}` as `./${string}`;
    if (!paths.includes(path))
      diagnostics.push(
        diagnostic(
          "template-surface-unlisted-path",
          entry.path,
          "Template surface must classify every repository entry exactly once.",
        ),
      );
    if (entry.mode === "120000")
      diagnostics.push(
        diagnostic(
          "template-surface-symlink",
          entry.path,
          "Template surface cannot bind symbolic links.",
        ),
      );
  }
  const expectedSurfaceBytes = canonicalBytes(surface);
  for (const file of surface.files) {
    const path = file.path.slice(2);
    if (!isSafeRepositoryPath(path))
      diagnostics.push(
        diagnostic(
          "template-surface-path-invalid",
          path,
          "Template surface paths must be safe repository-relative paths.",
        ),
      );
    const entry = entryByPath.get(file.path);
    if (!entry) {
      diagnostics.push(
        diagnostic(
          "template-surface-missing",
          path,
          "Template surface path is missing from the snapshot.",
        ),
      );
      continue;
    }
    if (entry.mode !== file.mode)
      diagnostics.push(
        diagnostic(
          "template-surface-mode-mismatch",
          path,
          "Template surface mode does not match the snapshot.",
        ),
      );
    if (!artifactPolicyForPath(path))
      diagnostics.push(
        diagnostic(
          "unclassified-engine-path",
          path,
          "Template surface contains an unclassified path.",
        ),
      );
    try {
      const bytes = await snapshot.read(path);
      if (
        file.binding.kind === "content" &&
        file.binding.digest !== digest(bytes)
      )
        diagnostics.push(
          diagnostic(
            "template-surface-content-mismatch",
            path,
            "Template surface content digest does not match the snapshot.",
          ),
        );
      if (file.binding.kind === "surface-self-copy") {
        if (
          !(TEMPLATE_SURFACE_SELF_COPY_PATHS as readonly string[]).includes(
            file.path,
          )
        )
          diagnostics.push(
            diagnostic(
              "template-surface-self-copy-path-invalid",
              path,
              "Only approved surface self-copy paths may omit content digests.",
            ),
          );
        if (!bytes.equals(expectedSurfaceBytes))
          diagnostics.push(
            diagnostic(
              "template-surface-self-copy-mismatch",
              path,
              "Surface self-copy bytes must equal the final manifest.",
            ),
          );
      }
      if (
        file.binding.kind !== "content" &&
        file.binding.kind !== "surface-self-copy"
      )
        diagnostics.push(
          diagnostic(
            "template-surface-binding-invalid",
            path,
            "Template surface binding kind is unsupported.",
          ),
        );
    } catch {
      diagnostics.push(
        diagnostic(
          "template-surface-missing",
          path,
          "Template surface path is missing from the snapshot.",
        ),
      );
    }
  }
  return sortDiagnostics(diagnostics);
}

export function engineReleaseBytes(release: EngineReleaseManifest): Buffer {
  return canonicalBytes(release);
}

export function templateSurfaceBytes(
  surface: EngineTemplateSurfaceManifest,
): Buffer {
  return canonicalBytes(surface);
}
