import { mkdir, lstat, readFile, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  applyAtomicFileTransaction,
  type AtomicFileOperation,
} from "./transaction.ts";
import {
  assertFreshPreview,
  assertPreviewApproval,
  createOperationPreview,
  fingerprint,
  operationReceipt,
  OperationFailure,
  sha256,
  type OperationPreview,
  type OperationReceipt,
} from "./operation-preview.ts";

const INSTANCE_NAME = /^coffee-chat-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type InitReleaseFile = {
  path: string;
  bytes: Buffer;
  mode?: "100644" | "100755";
};

export type EngineReleaseIdentity = {
  repository: string;
  version: string;
  source_commit: string;
  release_digest: string;
};

export type InitRequest = {
  engine_root: string;
  target_root: string;
  instance_name: string;
  repository_url: string;
  pages_url: string;
  display_name: string;
  short_name: string;
  profile_id: string;
  time_zone: string;
  release_payload: InitReleaseFile[];
  engine_release: EngineReleaseIdentity;
};

type InitInspection = {
  request: InitRequest;
  targetRoot: string;
  operations: AtomicFileOperation[];
  writeSet: string[];
  protectedSet: string[];
  stateFingerprint: string;
  sourceDigest: string;
};

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function normalizedRelativePath(path: string): string {
  const value = path.replace(/^\.\//, "");
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value
      .split("/")
      .some((part) => part.length === 0 || part === "." || part === "..")
  )
    throw new OperationFailure(
      "coffee-init-invalid-release-path",
      "The Init release contains an unsafe relative path.",
    );
  return "./" + value;
}

async function fileDigest(path: string): Promise<string> {
  return sha256(await readFile(path));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

async function inspect(request: InitRequest): Promise<InitInspection> {
  const engineRoot = resolve(request.engine_root);
  const targetRoot = resolve(request.target_root);
  if (!INSTANCE_NAME.test(request.instance_name))
    throw new OperationFailure(
      "coffee-init-invalid-name",
      "The instance name must match coffee-chat-*.",
    );
  if (isInside(engineRoot, targetRoot) || isInside(targetRoot, engineRoot))
    throw new OperationFailure(
      "coffee-init-target-overlap",
      "The Init target must be independent from the engine checkout.",
    );
  const manifestPath = resolve(engineRoot, "coffee-chat.json");
  const releasePath = resolve(engineRoot, "engine-release.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    repository_role?: string;
  };
  if (manifest.repository_role !== "engine")
    throw new OperationFailure(
      "coffee-init-engine-required",
      "Init must start from an engine repository.",
    );
  const releaseBytes = await readFile(releasePath);
  const release = JSON.parse(releaseBytes.toString("utf8")) as {
    repository?: string;
    version?: string;
    source_commit?: string;
    release_digest?: string;
  };
  if (
    release.repository !== request.engine_release.repository ||
    release.version !== request.engine_release.version ||
    release.source_commit !== request.engine_release.source_commit ||
    release.release_digest !== request.engine_release.release_digest
  )
    throw new OperationFailure(
      "coffee-init-release-mismatch",
      "The approved engine release does not match the engine checkout.",
    );
  if (await pathExists(targetRoot))
    throw new OperationFailure(
      "coffee-init-target-exists",
      "The Init destination must be absent before approval.",
    );
  const seen = new Set<string>();
  const payload: Array<InitReleaseFile & { path: string }> = [];
  for (const file of request.release_payload) {
    const path = normalizedRelativePath(file.path);
    if (path === "./coffee-chat.json" || seen.has(path))
      throw new OperationFailure(
        "coffee-init-invalid-release",
        "The Init release must not duplicate or overwrite the instance manifest.",
      );
    seen.add(path);
    payload.push({ ...file, path });
  }
  const manifestBytes = jsonBytes({
    schema_url: "./schemas/coffee-chat.schema.json",
    schema_version: "1.1.0",
    repository_role: "instance",
    time_zone: request.time_zone,
    profile: {
      id: request.profile_id,
      display_name: request.display_name,
      short_name: request.short_name,
    },
    repository: {
      url: request.repository_url,
      default_branch: "main",
    },
    pages_url: request.pages_url,
    plugin: {
      name: request.instance_name,
      version: request.engine_release.version,
      description: "Coffee with " + request.display_name,
    },
    marketplace_name: request.instance_name + "-marketplace",
    paths: {
      knowledge_index: "./knowledge/index.json",
      skills: "./skills",
      method: "./method",
    },
    provenance: {
      engine: request.engine_release,
      created_from: {
        method: "coffee-init",
        engine_repository: request.engine_release.repository,
      },
    },
  });
  const operations: AtomicFileOperation[] = [
    { path: "./coffee-chat.json", before: null, after: manifestBytes },
    ...payload.map((file) => ({
      path: file.path,
      before: null,
      after: file.bytes,
      ...(file.mode ? { mode: file.mode } : {}),
    })),
  ];
  const writeSet = operations.map((operation) => operation.path);
  const protectedSet = [engineRoot, targetRoot];
  const sourceDigest = fingerprint({
    engine_manifest: await fileDigest(manifestPath),
    engine_release: sha256(releaseBytes),
    release_payload: payload.map((file) => ({
      path: file.path,
      digest: sha256(file.bytes),
      mode: file.mode ?? "100644",
    })),
  });
  const stateFingerprint = fingerprint({
    operation: "init",
    instance_name: request.instance_name,
    repository_url: request.repository_url,
    pages_url: request.pages_url,
    target: { path: targetRoot, state: "absent" },
    source_digest: sourceDigest,
  });
  return {
    request,
    targetRoot,
    operations,
    writeSet,
    protectedSet,
    stateFingerprint,
    sourceDigest,
  };
}

export async function prepareInitPreview(
  request: InitRequest,
): Promise<OperationPreview> {
  const inspected = await inspect(request);
  return createOperationPreview({
    operation: "init",
    sources: [
      {
        kind: "engine-release",
        identity: request.engine_release.repository,
        locator: resolve(request.engine_root),
        digest: inspected.sourceDigest,
      },
    ],
    targets: [
      {
        kind: "coffee-chat-instance",
        identity: request.instance_name,
        locator: inspected.targetRoot,
        repository_role: "instance",
      },
    ],
    scope: {
      read_set: [
        "./coffee-chat.json",
        "./engine-release.json",
        ...request.release_payload.map((file) =>
          normalizedRelativePath(file.path),
        ),
      ],
      write_set: inspected.writeSet,
      protected_set: inspected.protectedSet,
    },
    changes: inspected.operations.map((operation) => ({
      path_or_field: operation.path,
      action: "create",
      before_digest: null,
      after_digest: sha256(operation.after as Buffer),
      summary:
        operation.path === "./coffee-chat.json"
          ? "Create the independent instance manifest."
          : "Materialize an approved engine release file.",
    })),
    content: {
      operation_specific_summary:
        "Initialize one new independent coffee-chat-* repository.",
      provenance: [
        request.engine_release.repository,
        request.engine_release.release_digest,
      ],
      risks: [
        "The destination repository is created outside the invoking repository.",
      ],
    },
    required_observations: [
      "engine manifest remains an engine",
      "engine release identity remains unchanged",
      "target path remains absent",
    ],
    state_fingerprint: inspected.stateFingerprint,
  });
}

export async function applyInitPreview(input: {
  request: InitRequest;
  preview: OperationPreview;
  approved_fingerprint: string;
}): Promise<OperationReceipt> {
  assertPreviewApproval(input.preview, "init", input.approved_fingerprint);
  const inspected = await inspect(input.request).catch((error) => {
    if (
      error instanceof OperationFailure &&
      error.code === "coffee-init-target-exists"
    )
      throw new OperationFailure(
        "coffee-init-stale-preview",
        "The Init destination was created after the Operation Preview.",
      );
    throw error;
  });
  assertFreshPreview(
    "coffee-init",
    input.preview.fingerprint,
    inspected.stateFingerprint,
  );
  const parent = dirname(inspected.targetRoot);
  await mkdir(parent, { recursive: true });
  try {
    await mkdir(inspected.targetRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new OperationFailure(
        "coffee-init-stale-preview",
        "The Init destination was created after the Operation Preview.",
      );
    throw error;
  }
  try {
    await applyAtomicFileTransaction({
      root: inspected.targetRoot,
      journal_root: inspected.targetRoot,
      operations: inspected.operations,
      checkpoint: async () => {},
    });
  } catch (error) {
    await rm(inspected.targetRoot, { recursive: true, force: true });
    throw error;
  }
  return operationReceipt({
    preview: input.preview,
    status: "applied",
    changed_paths: inspected.writeSet,
    protected_paths: inspected.protectedSet,
    verified: true,
  });
}
