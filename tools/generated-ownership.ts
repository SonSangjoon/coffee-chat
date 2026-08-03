import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import type { Diagnostic } from "./contracts.ts";
import { ValidationFailure, repositoryPath } from "./contracts.ts";
import { TEMPLATE_SURFACE_SELF_COPY_PATHS } from "./artifact-inventory.ts";
import { normalizeGitHubRepositoryUrl } from "./engine-provenance.ts";
import { compareCodePoints } from "./generate.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

export const GENERATED_OWNERSHIP_SCHEMA_VERSION = "1.1.0" as const;
export const REPOSITORY_GENERATED_OWNERSHIP_MARKER =
  ".coffee-chat/generated-files.json" as const;
export const PACKAGE_GENERATED_OWNERSHIP_MARKER =
  ".coffee-chat-generated.json" as const;

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SAFE_PATH =
  /^\.\/(?!\.{1,2}(?:\/|$))(?!.*(?:\/)\.{1,2}(?:\/|$))(?!.*\\)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

export type GeneratedOwnershipScope = "repository" | "plugin-package";

export type GeneratedOwnershipFile = {
  path: `./${string}`;
  digest: `sha256:${string}`;
};

export type AdoptedEngineIdentity = {
  repository: string;
  version: string;
  release_digest: `sha256:${string}`;
};

export type GeneratedOwnershipMarker = {
  schema_version: typeof GENERATED_OWNERSHIP_SCHEMA_VERSION;
  owner: "coffee-chat";
  scope: GeneratedOwnershipScope;
  owned_files: GeneratedOwnershipFile[];
  adopted_engine?: AdoptedEngineIdentity;
};

export type LegacyGeneratedOwnershipMarker = {
  generated_by?: "coffee-chat";
  schema_version?: "1.0.0";
  repository_role?: "engine" | "instance";
  package_name?: string;
  owned_paths: string[];
};

type MarkerScopeOptions = {
  scope: GeneratedOwnershipScope;
  /** Repository-relative package prefix when a package marker uses root paths. */
  package_prefix?: string;
};

function failure(
  code: string,
  path: string,
  message: string,
): ValidationFailure {
  const error = new ValidationFailure({
    code,
    path: repositoryPath(path),
    message,
  });
  // A few callers use errors as a small result object. Keep the diagnostic as
  // the canonical shape while exposing the code for ergonomic matching.
  Object.defineProperty(error, "code", {
    configurable: false,
    enumerable: true,
    value: code,
    writable: false,
  });
  return error;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function digest(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizedPath(path: string): string {
  const value = path.startsWith("./") ? path : `./${path}`;
  if (!SAFE_PATH.test(value))
    throw failure(
      "generated-ownership-invalid",
      path,
      "Generated ownership paths must be canonical, relative, and safe.",
    );
  return value.slice(2);
}

function markerRelativePath(scope: GeneratedOwnershipScope): string {
  return scope === "repository"
    ? REPOSITORY_GENERATED_OWNERSHIP_MARKER
    : PACKAGE_GENERATED_OWNERSHIP_MARKER;
}

function selfCopyPath(path: string): boolean {
  const normalized = path.startsWith("./") ? path : `./${path}`;
  return (TEMPLATE_SURFACE_SELF_COPY_PATHS as readonly string[]).includes(
    normalized,
  );
}

function assertMarkerEntryAllowed(
  path: string,
  options: MarkerScopeOptions,
): string {
  const normalized = normalizedPath(path);
  const marker = markerRelativePath(options.scope);
  if (normalized === marker)
    throw failure(
      "generated-ownership-invalid",
      path,
      "An ownership marker may not own itself.",
    );
  if (selfCopyPath(normalized))
    throw failure(
      "generated-ownership-invalid",
      path,
      "Template-surface self-copy paths are owned by the surface verifier.",
    );
  if (normalized === "CONTENT_LICENSE.md")
    throw failure(
      "generated-ownership-invalid",
      path,
      "CONTENT_LICENSE.md is canonical authored input and is never generated-owned.",
    );
  if (options.scope === "plugin-package" && options.package_prefix) {
    const prefix = normalizedPath(options.package_prefix).replace(/\/$/, "");
    if (!normalized.startsWith(`${prefix}/`))
      throw failure(
        "generated-ownership-invalid",
        path,
        "A package marker may claim only paths inside its exact package root.",
      );
  }
  return normalized;
}

function normalizeOwnedFile(
  entry: unknown,
  index: number,
  options: MarkerScopeOptions,
): GeneratedOwnershipFile {
  const value = record(entry);
  if (
    !value ||
    Object.keys(value).some((key) => !["path", "digest"].includes(key))
  )
    throw failure(
      "generated-ownership-invalid",
      markerRelativePath(options.scope),
      `owned_files[${index}] must contain only path and digest.`,
    );
  if (typeof value.path !== "string" || typeof value.digest !== "string")
    throw failure(
      "generated-ownership-invalid",
      markerRelativePath(options.scope),
      `owned_files[${index}] requires a path and digest.`,
    );
  const path = assertMarkerEntryAllowed(value.path, options);
  if (!DIGEST.test(value.digest))
    throw failure(
      "generated-ownership-invalid",
      markerRelativePath(options.scope),
      `owned_files[${index}].digest must be a lowercase sha256 digest.`,
    );
  return { path: `./${path}`, digest: value.digest as `sha256:${string}` };
}

function normalizeAdoptedEngine(value: unknown): AdoptedEngineIdentity {
  const item = record(value);
  if (
    !item ||
    Object.keys(item).some(
      (key) => !["repository", "version", "release_digest"].includes(key),
    )
  )
    throw failure(
      "generated-ownership-invalid",
      REPOSITORY_GENERATED_OWNERSHIP_MARKER,
      "adopted_engine must contain repository, version, and release_digest.",
    );
  let canonicalRepository = false;
  try {
    canonicalRepository =
      typeof item.repository === "string" &&
      normalizeGitHubRepositoryUrl(item.repository) === item.repository;
  } catch {
    canonicalRepository = false;
  }
  if (!canonicalRepository)
    throw failure(
      "generated-ownership-invalid",
      REPOSITORY_GENERATED_OWNERSHIP_MARKER,
      "adopted_engine.repository must be a canonical GitHub URL.",
    );
  if (typeof item.version !== "string" || !SEMVER.test(item.version))
    throw failure(
      "generated-ownership-invalid",
      REPOSITORY_GENERATED_OWNERSHIP_MARKER,
      "adopted_engine.version must be strict SemVer.",
    );
  if (
    typeof item.release_digest !== "string" ||
    !DIGEST.test(item.release_digest)
  )
    throw failure(
      "generated-ownership-invalid",
      REPOSITORY_GENERATED_OWNERSHIP_MARKER,
      "adopted_engine.release_digest must be a lowercase sha256 digest.",
    );
  return {
    repository: item.repository as string,
    version: item.version as string,
    release_digest: item.release_digest as `sha256:${string}`,
  };
}

function normalizeMarkerObject(
  value: unknown,
  path: string,
  packagePrefix?: string,
): GeneratedOwnershipMarker {
  const item = record(value);
  if (!item)
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker must be an object.",
    );
  const allowed = [
    "schema_version",
    "owner",
    "scope",
    "owned_files",
    "adopted_engine",
  ];
  if (Object.keys(item).some((key) => !allowed.includes(key)))
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker contains an unknown property.",
    );
  if (item.schema_version !== GENERATED_OWNERSHIP_SCHEMA_VERSION)
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker schema_version must be 1.1.0.",
    );
  if (item.owner !== "coffee-chat")
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker owner must be coffee-chat.",
    );
  if (item.scope !== "repository" && item.scope !== "plugin-package")
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker scope is invalid.",
    );
  if (!Array.isArray(item.owned_files))
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker owned_files must be an array.",
    );
  const options: MarkerScopeOptions = {
    scope: item.scope,
    ...(packagePrefix ? { package_prefix: packagePrefix } : {}),
  };
  const files = item.owned_files.map((entry, index) =>
    normalizeOwnedFile(entry, index, options),
  );
  const sorted = [...files].sort((left, right) =>
    compareCodePoints(left.path, right.path),
  );
  for (let index = 0; index < files.length; index += 1) {
    if (files[index]!.path !== sorted[index]!.path)
      throw failure(
        "generated-ownership-invalid",
        path,
        "owned_files must be sorted by path.",
      );
    if (index > 0 && files[index]!.path === files[index - 1]!.path)
      throw failure(
        "generated-ownership-invalid",
        path,
        "owned_files may not contain duplicate paths.",
      );
  }
  return {
    schema_version: GENERATED_OWNERSHIP_SCHEMA_VERSION,
    owner: "coffee-chat",
    scope: item.scope,
    owned_files: files,
    ...(item.adopted_engine !== undefined
      ? { adopted_engine: normalizeAdoptedEngine(item.adopted_engine) }
      : {}),
  };
}

export function parseGeneratedOwnershipMarker(
  value: Buffer | string | unknown,
  path: string = REPOSITORY_GENERATED_OWNERSHIP_MARKER,
  options: { package_prefix?: string } = {},
): GeneratedOwnershipMarker {
  let parsed: unknown = value;
  if (Buffer.isBuffer(value) || typeof value === "string") {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const text = decodeCanonicalText(bytes, path);
    parsed = parseStrictJson(text, path);
  }
  const marker = normalizeMarkerObject(parsed, path, options.package_prefix);
  const expected = generatedOwnershipMarkerBytes(marker);
  if (Buffer.isBuffer(value) && !expected.equals(value))
    throw failure(
      "generated-ownership-invalid",
      path,
      "Ownership marker bytes must use the canonical serialization.",
    );
  return marker;
}

export function generatedOwnershipMarkerBytes(
  marker: GeneratedOwnershipMarker,
): Buffer {
  const normalized = normalizeMarkerObject(
    marker,
    marker.scope === "repository"
      ? REPOSITORY_GENERATED_OWNERSHIP_MARKER
      : PACKAGE_GENERATED_OWNERSHIP_MARKER,
  );
  const value: Record<string, unknown> = {
    schema_version: normalized.schema_version,
    owner: normalized.owner,
    scope: normalized.scope,
    owned_files: normalized.owned_files.map(({ path, digest: fileDigest }) => ({
      path,
      digest: fileDigest,
    })),
  };
  if (normalized.adopted_engine !== undefined)
    value.adopted_engine = normalized.adopted_engine;
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function markerPathForScope(scope: GeneratedOwnershipScope): string {
  return markerRelativePath(scope);
}

export function normalizeLegacyOwnedPath(
  path: string,
  scope: GeneratedOwnershipScope,
  packagePrefix?: string,
): string {
  const normalized = normalizedPath(path);
  if (scope !== "plugin-package" || !packagePrefix) return normalized;
  const prefix = normalizedPath(packagePrefix).replace(/\/$/, "");
  if (normalized.startsWith(`${prefix}/`))
    return normalized.slice(prefix.length + 1);
  // A package-local legacy marker from an isolated package root already uses
  // package-relative paths.
  if (!normalized.startsWith("plugins/")) return normalized;
  throw failure(
    "generated-ownership-upgrade-required",
    path,
    "Legacy package ownership escaped its exact package root.",
  );
}

function normalizedExpectedFiles(
  files: Map<string, Buffer>,
  scope: GeneratedOwnershipScope,
  packagePrefix?: string,
): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const [rawPath, bytes] of files) {
    const normalized = normalizeLegacyOwnedPath(rawPath, scope, packagePrefix);
    if (
      normalized === markerRelativePath(scope) ||
      normalized === "CONTENT_LICENSE.md" ||
      selfCopyPath(normalized)
    )
      continue;
    if (result.has(normalized))
      throw failure(
        "generated-ownership-invalid",
        normalized,
        "Expected generated files contain a duplicate path.",
      );
    result.set(normalized, bytes);
  }
  return result;
}

export function buildGeneratedOwnershipMarker(input: {
  scope: GeneratedOwnershipScope;
  files: Map<string, Buffer>;
  package_prefix?: string;
  adopted_engine?: AdoptedEngineIdentity;
}): GeneratedOwnershipMarker {
  const expected = normalizedExpectedFiles(
    input.files,
    input.scope,
    input.package_prefix,
  );
  const marker: GeneratedOwnershipMarker = {
    schema_version: GENERATED_OWNERSHIP_SCHEMA_VERSION,
    owner: "coffee-chat",
    scope: input.scope,
    owned_files: [...expected.entries()]
      .map(([path, bytes]) => ({
        path: `./${path}` as `./${string}`,
        digest: digest(bytes),
      }))
      .sort((left, right) => compareCodePoints(left.path, right.path)),
    ...(input.adopted_engine ? { adopted_engine: input.adopted_engine } : {}),
  };
  // Validate scope/path invariants once more before callers persist bytes.
  normalizeMarkerObject(marker, markerPathForScope(input.scope));
  return marker;
}

async function readRegularFile(root: string, path: string): Promise<Buffer> {
  const absolute = resolve(root, ...path.split("/"));
  let status;
  try {
    status = await lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw failure(
        "generated-ownership-upgrade-required",
        path,
        "A legacy generated file is missing.",
      );
    throw error;
  }
  if (!status.isFile() || status.isSymbolicLink())
    throw failure(
      "generated-ownership-upgrade-required",
      path,
      "Legacy generated files must be regular files.",
    );
  return readFile(absolute);
}

function markerOwnedSet(
  legacy: LegacyGeneratedOwnershipMarker | undefined,
  scope: GeneratedOwnershipScope,
  packagePrefix?: string,
): Set<string> | undefined {
  if (!legacy) return undefined;
  if (!Array.isArray(legacy.owned_paths))
    throw failure(
      "generated-ownership-upgrade-required",
      markerRelativePath(scope),
      "Legacy marker owned_paths must be an array.",
    );
  const paths = legacy.owned_paths.map((path) =>
    normalizeLegacyOwnedPath(path, scope, packagePrefix),
  );
  if (new Set(paths).size !== paths.length)
    throw failure(
      "generated-ownership-upgrade-required",
      markerRelativePath(scope),
      "Legacy marker contains duplicate owned paths.",
    );
  return new Set(paths);
}

function inferPackagePrefix(
  legacy: LegacyGeneratedOwnershipMarker | undefined,
): string | undefined {
  if (!legacy) return undefined;
  for (const rawPath of legacy.owned_paths) {
    const value = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath;
    const match = /^(plugins\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(value);
    if (match) return match[1];
  }
  return undefined;
}

export async function adoptLegacyGeneratedOwnership(input: {
  root: string;
  scope: GeneratedOwnershipScope;
  expected_files: Map<string, Buffer>;
  legacy_marker?: LegacyGeneratedOwnershipMarker;
  adopted_engine?: AdoptedEngineIdentity;
}): Promise<GeneratedOwnershipMarker> {
  const markerPath = markerRelativePath(input.scope);
  const packagePrefix =
    input.scope === "plugin-package"
      ? inferPackagePrefix(input.legacy_marker)
      : undefined;
  const expected = normalizedExpectedFiles(
    input.expected_files,
    input.scope,
    packagePrefix,
  );
  const legacySet = markerOwnedSet(
    input.legacy_marker,
    input.scope,
    packagePrefix,
  );
  if (legacySet) {
    const expectedSet = new Set(expected.keys());
    if (
      legacySet.size !== expectedSet.size ||
      [...legacySet].some((path) => !expectedSet.has(path))
    )
      throw failure(
        "generated-ownership-upgrade-required",
        markerPath,
        "Legacy ownership does not equal the closed expected generated set.",
      );
  }
  for (const [path, expectedBytes] of expected) {
    const current = await readRegularFile(input.root, path);
    if (!current.equals(expectedBytes))
      throw failure(
        "generated-ownership-upgrade-required",
        path,
        "Legacy generated bytes do not match the immutable pre-change projection bundle.",
      );
  }
  const marker = buildGeneratedOwnershipMarker({
    scope: input.scope,
    files: expected,
    ...(input.adopted_engine ? { adopted_engine: input.adopted_engine } : {}),
  });
  const absoluteMarker = resolve(input.root, ...markerPath.split("/"));
  await mkdir(resolve(input.root, ...markerPath.split("/").slice(0, -1)), {
    recursive: true,
  });
  await writeFile(absoluteMarker, generatedOwnershipMarkerBytes(marker));
  return marker;
}

export async function assertOwnedFilePreimage(input: {
  root: string;
  path: string;
  expected_digest: string;
}): Promise<void> {
  const path = normalizedPath(input.path);
  const absolute = resolve(input.root, ...path.split("/"));
  let status;
  try {
    status = await lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!status.isFile() || status.isSymbolicLink())
    throw failure(
      "generated-owned-file-conflict",
      path,
      "A generated file was replaced by a non-regular file.",
    );
  const actual = digest(await readFile(absolute));
  if (actual !== input.expected_digest)
    throw failure(
      "generated-owned-file-conflict",
      path,
      "A generated file changed after its ownership preimage was recorded.",
    );
}

export function markerOwnedFilesAsRepositoryPaths(
  marker: GeneratedOwnershipMarker,
  packagePrefix?: string,
): string[] {
  if (marker.scope === "repository")
    return marker.owned_files.map(({ path }) => path.slice(2));
  if (!packagePrefix)
    throw failure(
      "generated-ownership-invalid",
      PACKAGE_GENERATED_OWNERSHIP_MARKER,
      "Package marker requires its repository package prefix.",
    );
  const prefix = normalizedPath(packagePrefix).replace(/\/$/, "");
  return marker.owned_files.map(({ path }) => `${prefix}/${path.slice(2)}`);
}

export function ownershipDigest(bytes: Buffer): `sha256:${string}` {
  return digest(bytes);
}

export function generatedOwnershipDiagnostic(
  error: unknown,
): Diagnostic | undefined {
  return error instanceof ValidationFailure ? error.diagnostic : undefined;
}
