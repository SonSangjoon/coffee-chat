import { isDeepStrictEqual } from "node:util";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  containsUnpairedUnicodeSurrogate,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import type { InstanceManifest } from "./knowledge.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MANAGED_PATH =
  /^\.\/(?!.*(?:^|\/)\.\.(?:\/|$))(?:[A-Za-z0-9._\-\[\]]+\/)*[A-Za-z0-9._\-\[\]]+$/;
const INSTANCE_OWNED_PATHS = [
  "./coffee-chat.json",
  "./.coffee-chat/",
  "./knowledge/",
  "./CONTENT_LICENSE.md",
  "./AGENTS.md",
  "./CLAUDE.md",
  "./plugins/",
  "./.codex-plugin/",
  "./.claude-plugin/",
  "./.agents/",
  "./dist/",
  "./public/",
  "./site/dist/",
  "./engine/release.json",
  "./engine/template-surface.json",
  "./engine/migrations/",
] as const;

export type EngineProvenance = {
  repository: string;
  version: string;
  source_commit: string;
  release_digest: `sha256:${string}`;
};

export type InstanceProvenance = {
  engine: EngineProvenance;
  created_from: {
    method: "github-template";
    template_repository: string;
  };
};

export type EngineManagedFile = {
  path: `./${string}`;
  class: "engine-source";
  digest: `sha256:${string}`;
  mode: "100644" | "100755";
};

export type EngineDeliveryFile = {
  path: `./${string}`;
  class: "engine-delivery";
  digest: `sha256:${string}`;
  mode: "100644" | "100755";
};

export type EngineLock = {
  schema_version: "1.0.0";
  engine: EngineProvenance;
  managed_files: EngineManagedFile[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function diagnostic(
  code: string,
  path: string,
  pointer: string,
  message: string,
): Diagnostic {
  return { code, path: repositoryPath(path), pointer, message };
}

export function normalizeGitHubRepositoryUrl(value: string): string {
  if (value.length === 0 || value !== value.trim())
    throw new Error("GitHub repository URL must be canonical.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("GitHub repository URL must be canonical.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname.includes("%")
  ) {
    throw new Error("GitHub repository URL must be canonical.");
  }
  const match = /^\/([A-Za-z0-9.-]+)\/([A-Za-z0-9._-]+)$/.exec(parsed.pathname);
  if (
    !match ||
    match[1] === "." ||
    match[1] === ".." ||
    match[2] === "." ||
    match[2] === ".." ||
    /\.git$/i.test(match[2])
  )
    throw new Error("GitHub repository URL must be canonical.");
  return `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
}

function canonicalRepositoryDiagnostic(
  value: unknown,
  path: string,
  pointer: string,
): Diagnostic | undefined {
  if (typeof value !== "string")
    return diagnostic(
      "schema-type",
      path,
      pointer,
      "Repository URL must be a string.",
    );
  try {
    if (normalizeGitHubRepositoryUrl(value) !== value)
      throw new Error("non-canonical");
  } catch {
    return diagnostic(
      "repository-url-invalid",
      path,
      pointer,
      "Repository URL must be a canonical credential-free GitHub HTTPS repository URL.",
    );
  }
  return undefined;
}

export function validateEngineProvenance(
  value: unknown,
  path: string,
  pointer = "/provenance/engine",
): Diagnostic[] {
  const item = record(value);
  if (!item)
    return [
      diagnostic(
        "schema-type",
        path,
        pointer,
        "Engine provenance must be an object.",
      ),
    ];
  const diagnostics: Diagnostic[] = [];
  const fields = [
    "repository",
    "version",
    "source_commit",
    "release_digest",
  ] as const;
  for (const field of fields) {
    if (!(field in item))
      diagnostics.push(
        diagnostic(
          "schema-required",
          path,
          `${pointer}/${field}`,
          "Engine provenance field is required.",
        ),
      );
  }
  for (const key of Object.keys(item)) {
    if (!fields.includes(key as (typeof fields)[number]))
      diagnostics.push(
        diagnostic(
          "schema-additional-property",
          path,
          `${pointer}/${key}`,
          "Engine provenance does not allow additional properties.",
        ),
      );
  }
  const repositoryFailure = canonicalRepositoryDiagnostic(
    item.repository,
    path,
    `${pointer}/repository`,
  );
  if (repositoryFailure) diagnostics.push(repositoryFailure);
  if (typeof item.version !== "string" || !SEMVER.test(item.version))
    diagnostics.push(
      diagnostic(
        "schema-pattern",
        path,
        `${pointer}/version`,
        "Engine version must be strict SemVer.",
      ),
    );
  if (
    typeof item.source_commit !== "string" ||
    !COMMIT.test(item.source_commit)
  )
    diagnostics.push(
      diagnostic(
        "schema-pattern",
        path,
        `${pointer}/source_commit`,
        "Engine source commit must be 40 or 64 lowercase hexadecimal characters.",
      ),
    );
  if (
    typeof item.release_digest !== "string" ||
    !DIGEST.test(item.release_digest)
  )
    diagnostics.push(
      diagnostic(
        "schema-pattern",
        path,
        `${pointer}/release_digest`,
        "Engine release digest must be a lowercase SHA-256 digest.",
      ),
    );
  return sortDiagnostics(diagnostics);
}

export function validateInstanceProvenance(
  value: unknown,
  path: string,
): Diagnostic[] {
  const provenance = record(value);
  if (!provenance)
    return [
      diagnostic(
        "schema-required",
        path,
        "/provenance",
        "Schema-1.1 instances require provenance.",
      ),
    ];
  const diagnostics = validateEngineProvenance(
    provenance.engine,
    path,
    "/provenance/engine",
  );
  const fields = ["engine", "created_from"] as const;
  for (const field of fields) {
    if (!(field in provenance))
      diagnostics.push(
        diagnostic(
          "schema-required",
          path,
          `/provenance/${field}`,
          "Instance provenance field is required.",
        ),
      );
  }
  for (const key of Object.keys(provenance)) {
    if (!fields.includes(key as (typeof fields)[number]))
      diagnostics.push(
        diagnostic(
          "schema-additional-property",
          path,
          `/provenance/${key}`,
          "Instance provenance does not allow additional properties.",
        ),
      );
  }
  const created = record(provenance.created_from);
  if (!created) {
    diagnostics.push(
      diagnostic(
        "schema-type",
        path,
        "/provenance/created_from",
        "Creation provenance must be an object.",
      ),
    );
  } else {
    if (created.method !== "github-template")
      diagnostics.push(
        diagnostic(
          "schema-const",
          path,
          "/provenance/created_from/method",
          "Creation method must be github-template.",
        ),
      );
    const templateFailure = canonicalRepositoryDiagnostic(
      created.template_repository,
      path,
      "/provenance/created_from/template_repository",
    );
    if (templateFailure) diagnostics.push(templateFailure);
    const engine = record(provenance.engine);
    if (
      typeof engine?.repository === "string" &&
      typeof created.template_repository === "string"
    ) {
      try {
        if (
          normalizeGitHubRepositoryUrl(engine.repository) !==
          normalizeGitHubRepositoryUrl(created.template_repository)
        )
          diagnostics.push(
            diagnostic(
              "template-repository-mismatch",
              path,
              "/provenance/created_from/template_repository",
              "Template repository must equal the adopted engine repository.",
            ),
          );
      } catch {
        // The individual repository diagnostics already describe invalid values.
      }
    }
  }
  return sortDiagnostics(diagnostics);
}

export function classifyInstanceProvenance(
  manifest: InstanceManifest,
):
  | { status: "legacy" }
  | { status: "bound"; provenance: InstanceProvenance }
  | { status: "invalid" } {
  if (manifest.schema_version === "1.0.0") return { status: "legacy" };
  if (
    manifest.schema_version !== "1.1.0" ||
    validateInstanceProvenance(manifest.provenance, "coffee-chat.json").length >
      0
  ) {
    return { status: "invalid" };
  }
  return {
    status: "bound",
    provenance: manifest.provenance as InstanceProvenance,
  };
}

function forbiddenManagedPath(path: string): boolean {
  return (
    path === "./README.md" ||
    /^\.\/README\.[^/]+\.md$/.test(path) ||
    path === "./marketplace.json" ||
    INSTANCE_OWNED_PATHS.some((forbidden) =>
      forbidden.endsWith("/")
        ? path === forbidden.slice(0, -1) || path.startsWith(forbidden)
        : path === forbidden,
    )
  );
}

function validateManagedFiles(value: unknown, path: string): Diagnostic[] {
  if (!Array.isArray(value))
    return [
      diagnostic(
        "schema-type",
        path,
        "/managed_files",
        "Managed files must be an array.",
      ),
    ];
  const diagnostics: Diagnostic[] = [];
  let previous: string | undefined;
  for (const [index, entry] of value.entries()) {
    const file = record(entry);
    const pointer = `/managed_files/${index}`;
    if (!file) {
      diagnostics.push(
        diagnostic(
          "schema-type",
          path,
          pointer,
          "Managed file must be an object.",
        ),
      );
      continue;
    }
    const fields = ["path", "class", "digest", "mode"] as const;
    for (const field of fields) {
      if (!(field in file))
        diagnostics.push(
          diagnostic(
            "schema-required",
            path,
            `${pointer}/${field}`,
            "Managed file field is required.",
          ),
        );
    }
    for (const key of Object.keys(file)) {
      if (!fields.includes(key as (typeof fields)[number]))
        diagnostics.push(
          diagnostic(
            "schema-additional-property",
            path,
            `${pointer}/${key}`,
            "Managed file does not allow additional properties.",
          ),
        );
    }
    const managedPath = file.path;
    if (
      typeof managedPath !== "string" ||
      !MANAGED_PATH.test(managedPath) ||
      forbiddenManagedPath(managedPath)
    )
      diagnostics.push(
        diagnostic(
          "engine-lock-path-invalid",
          path,
          `${pointer}/path`,
          "Managed file path must be safe and engine-owned.",
        ),
      );
    if ("class" in file && file.class !== "engine-source")
      diagnostics.push(
        diagnostic(
          "schema-const",
          path,
          `${pointer}/class`,
          "Managed lock files must be engine-source files.",
        ),
      );
    if (
      "digest" in file &&
      (typeof file.digest !== "string" || !DIGEST.test(file.digest))
    )
      diagnostics.push(
        diagnostic(
          "schema-pattern",
          path,
          `${pointer}/digest`,
          "Managed file digest must be a lowercase SHA-256 digest.",
        ),
      );
    if ("mode" in file && file.mode !== "100644" && file.mode !== "100755")
      diagnostics.push(
        diagnostic(
          "schema-enum",
          path,
          `${pointer}/mode`,
          "Managed file mode must be 100644 or 100755.",
        ),
      );
    if (typeof file.path === "string") {
      if (previous !== undefined && previous >= file.path)
        diagnostics.push(
          diagnostic(
            "engine-lock-path-order",
            path,
            `${pointer}/path`,
            "Managed file paths must be strictly sorted and unique.",
          ),
        );
      previous = file.path;
    }
  }
  return diagnostics;
}

export function parseEngineLock(bytes: Buffer, path: string): EngineLock {
  let value: unknown;
  try {
    value = parseStrictJson(decodeCanonicalText(bytes, path), path);
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    throw error;
  }
  const lock = record(value);
  const diagnostics: Diagnostic[] = [];
  if (!lock)
    diagnostics.push(
      diagnostic("schema-type", path, "", "Engine lock must be an object."),
    );
  else {
    const fields = ["schema_version", "engine", "managed_files"] as const;
    for (const field of fields)
      if (!(field in lock))
        diagnostics.push(
          diagnostic(
            "schema-required",
            path,
            `/${field}`,
            "Engine lock field is required.",
          ),
        );
    for (const key of Object.keys(lock))
      if (!fields.includes(key as (typeof fields)[number]))
        diagnostics.push(
          diagnostic(
            "schema-additional-property",
            path,
            `/${key}`,
            "Engine lock does not allow additional properties.",
          ),
        );
    if (lock.schema_version !== "1.0.0")
      diagnostics.push(
        diagnostic(
          "schema-const",
          path,
          "/schema_version",
          "Engine lock schema version must be 1.0.0.",
        ),
      );
    diagnostics.push(...validateEngineProvenance(lock.engine, path, "/engine"));
    diagnostics.push(...validateManagedFiles(lock.managed_files, path));
  }
  if (containsUnpairedUnicodeSurrogate(value))
    diagnostics.push(
      diagnostic(
        "invalid-unicode-scalar",
        path,
        "",
        "Engine lock strings must be Unicode scalar values.",
      ),
    );
  const failures = sortDiagnostics(diagnostics);
  if (failures.length > 0)
    throw new ValidationFailure(failures[0] as Diagnostic);
  return value as EngineLock;
}

export function assertLockMatchesManifest(
  manifest: InstanceManifest,
  lock: EngineLock,
): Diagnostic[] {
  const provenance = classifyInstanceProvenance(manifest);
  if (provenance.status === "legacy")
    return [
      diagnostic(
        "engine-lock-unexpected",
        "coffee-chat.json",
        "/provenance",
        "Legacy instances do not have bound engine provenance.",
      ),
    ];
  if (provenance.status === "invalid")
    return [
      diagnostic(
        "engine-lock-manifest-invalid",
        "coffee-chat.json",
        "/provenance",
        "Engine lock cannot bind an invalid instance provenance record.",
      ),
    ];
  return isDeepStrictEqual(provenance.provenance.engine, lock.engine)
    ? []
    : [
        diagnostic(
          "engine-lock-mismatch",
          "coffee-chat.json",
          "/provenance/engine",
          "Engine lock must exactly match manifest engine provenance.",
        ),
      ];
}
