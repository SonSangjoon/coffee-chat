import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
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

export type SyncRequest = {
  instance_root: string;
  work_root: string;
  instance_url: string;
};

type SyncInspection = {
  request: SyncRequest;
  connectionPath: string;
  connectionBytes: Buffer;
  operation: AtomicFileOperation;
  stateFingerprint: string;
  instanceManifestDigest: string;
  knowledgeIndexDigest: string;
  workFiles: string[];
};

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function regularFileDigest(path: string): Promise<string> {
  const status = await lstat(path);
  if (status.isSymbolicLink() || !status.isFile())
    throw new OperationFailure(
      "coffee-sync-unsafe-path",
      "Sync only reads regular files and refuses symlinks.",
    );
  return sha256(await readFile(path));
}

async function walkFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? prefix + "/" + entry.name : entry.name;
    if (
      relativePath === ".coffee-chat" ||
      relativePath.startsWith(".coffee-chat/")
    )
      continue;
    if (entry.isSymbolicLink())
      throw new OperationFailure(
        "coffee-sync-unsafe-path",
        "Sync refuses symlinked work-repository paths.",
      );
    if (entry.isDirectory())
      result.push(...(await walkFiles(root, relativePath)));
    else if (entry.isFile()) result.push("./" + relativePath);
    else
      throw new OperationFailure(
        "coffee-sync-unsafe-path",
        "Sync only supports regular work-repository files.",
      );
  }
  return result.sort();
}

function sameLocator(
  instanceUrl: string,
  manifest: Record<string, unknown>,
): boolean {
  const repository = manifest.repository;
  const repositoryUrl =
    repository !== null && typeof repository === "object"
      ? (repository as Record<string, unknown>).url
      : undefined;
  return repositoryUrl === instanceUrl || manifest.pages_url === instanceUrl;
}

async function inspect(request: SyncRequest): Promise<SyncInspection> {
  const instanceRoot = resolve(request.instance_root);
  const workRoot = resolve(request.work_root);
  if (instanceRoot === workRoot)
    throw new OperationFailure(
      "coffee-sync-overlap",
      "The Coffee Chat instance and work repository must be different roots.",
    );
  const manifestPath = resolve(instanceRoot, "coffee-chat.json");
  const indexPath = resolve(instanceRoot, "knowledge/index.json");
  const manifestBytes = await readFile(manifestPath);
  const indexBytes = await readFile(indexPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<
    string,
    unknown
  >;
  const index = JSON.parse(indexBytes.toString("utf8")) as Record<
    string,
    unknown
  >;
  if (
    manifest.repository_role !== "instance" ||
    !sameLocator(request.instance_url, manifest)
  )
    throw new OperationFailure(
      "coffee-sync-invalid-instance",
      "The explicit URL must identify an initialized Coffee Chat instance.",
    );
  if (
    index.repository_role !== "instance" ||
    index.repository_url !== request.instance_url ||
    typeof index.knowledge_digest !== "string"
  )
    throw new OperationFailure(
      "coffee-sync-invalid-instance",
      "The instance knowledge index does not match the explicit URL.",
    );
  const workFiles = await walkFiles(workRoot);
  const connectionPath = resolve(workRoot, ".coffee-chat", "connection.json");
  let before: Buffer | null = null;
  try {
    before = await readFile(connectionPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const connectionBytes = jsonBytes({
    schema_version: "1.0.0",
    repository_url: request.instance_url,
    repository_role: "instance",
    knowledge_digest: index.knowledge_digest,
  });
  const operation: AtomicFileOperation = {
    path: "./.coffee-chat/connection.json",
    before,
    after: connectionBytes,
  };
  const workState = await Promise.all(
    workFiles.map(async (path) => [
      path,
      await regularFileDigest(resolve(workRoot, path)),
    ]),
  );
  const stateFingerprint = fingerprint({
    operation: "sync",
    instance_url: request.instance_url,
    instance_manifest: sha256(manifestBytes),
    knowledge_index: sha256(indexBytes),
    work_files: workState,
    connection_before: before ? sha256(before) : null,
  });
  return {
    request,
    connectionPath,
    connectionBytes,
    operation,
    stateFingerprint,
    instanceManifestDigest: sha256(manifestBytes),
    knowledgeIndexDigest: sha256(indexBytes),
    workFiles,
  };
}

export async function prepareSyncPreview(
  request: SyncRequest,
): Promise<OperationPreview> {
  const inspected = await inspect(request);
  return createOperationPreview({
    operation: "sync",
    sources: [
      {
        kind: "coffee-chat-instance",
        identity: request.instance_url,
        locator: resolve(request.instance_root),
        digest: fingerprint({
          manifest: inspected.instanceManifestDigest,
          index: inspected.knowledgeIndexDigest,
        }),
      },
    ],
    targets: [
      {
        kind: "work-repository",
        identity: resolve(request.work_root),
        locator: resolve(request.work_root),
      },
    ],
    scope: {
      read_set: [
        "./coffee-chat.json",
        "./knowledge/index.json",
        ...inspected.workFiles,
      ],
      write_set: ["./.coffee-chat/connection.json"],
      protected_set: [...inspected.workFiles, resolve(request.instance_root)],
    },
    changes: [
      {
        path_or_field: "./.coffee-chat/connection.json",
        action: inspected.operation.before === null ? "create" : "update",
        before_digest: inspected.operation.before
          ? sha256(inspected.operation.before)
          : null,
        after_digest: sha256(inspected.connectionBytes),
        summary: "Write only the project-local Coffee Chat relationship.",
      },
    ],
    content: {
      operation_specific_summary:
        "Synchronize this work repository with one verified Coffee Chat instance.",
      provenance: [request.instance_url, inspected.knowledgeIndexDigest],
      risks: [
        "Personal Origin and Green Bean prose stays in the independent instance.",
      ],
    },
    required_observations: [
      "instance manifest still identifies the requested public URL",
      "knowledge index still matches the requested instance",
      "protected work-repository files remain unchanged",
    ],
    state_fingerprint: inspected.stateFingerprint,
  });
}

export async function applySyncPreview(input: {
  request: SyncRequest;
  preview: OperationPreview;
  approved_fingerprint: string;
}): Promise<OperationReceipt> {
  assertPreviewApproval(input.preview, "sync", input.approved_fingerprint);
  const inspected = await inspect(input.request);
  try {
    assertFreshPreview(
      "coffee-sync",
      input.preview.fingerprint,
      inspected.stateFingerprint,
    );
  } catch (error) {
    if (error instanceof OperationFailure) throw error;
    throw error;
  }
  const transaction = await applyAtomicFileTransaction({
    root: resolve(input.request.work_root),
    journal_root: resolve(
      input.request.work_root,
      ".coffee-chat",
      ".transactions",
    ),
    operations: [inspected.operation],
    checkpoint: async () => {},
  });
  return operationReceipt({
    preview: input.preview,
    status: transaction.status === "applied" ? "applied" : "partial_failure",
    changed_paths: transaction.changed_paths,
    protected_paths: [
      ...inspected.workFiles,
      resolve(input.request.instance_root),
    ],
    verified: transaction.status === "applied",
  });
}
