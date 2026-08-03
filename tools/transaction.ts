import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";

export type AtomicFileOperation = {
  path: string;
  before: Buffer | null;
  after: Buffer | null;
  mode?: "100644" | "100755";
};

export type TransactionCheckpoint =
  | "before-journal"
  | "before-each-swap"
  | "after-each-swap"
  | "before-cleanup";

export type AtomicTransactionReceipt = {
  status: "applied" | "rolled_back" | "partial_apply_result";
  changed_paths: string[];
  restored_paths: string[];
  journal_path?: string;
};

type BoundOperation = AtomicFileOperation & {
  target: string;
  beforeMode?: number;
  temporary?: string;
  backup?: string;
  mutated: boolean;
};

function digest(bytes: Buffer): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function safeRelativePath(path: string): string {
  const normalized = path.replace(/^\.\//, "");
  if (
    normalized.length === 0 ||
    path.startsWith("/") ||
    normalized.includes("\\") ||
    normalized
      .split("/")
      .some(
        (segment) =>
          segment.length === 0 || segment === "." || segment === "..",
      )
  )
    throw new Error("atomic-path-invalid");
  return normalized;
}

function modeNumber(mode: AtomicFileOperation["mode"]): number {
  return mode === "100755" ? 0o755 : 0o644;
}

function operationsDigest(operations: AtomicFileOperation[]): string {
  const payload = operations.map((operation) => ({
    path: operation.path,
    before: operation.before ? digest(operation.before) : null,
    after: operation.after ? digest(operation.after) : null,
    mode: operation.mode ?? "100644",
  }));
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
}

async function existingRegularFile(
  path: string,
): Promise<{ bytes: Buffer; mode: number } | null> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isFile())
      throw new Error("atomic-target-unsafe");
    return {
      bytes: Buffer.from(await readFile(path)),
      mode: status.mode & 0o7777,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function assertParentInside(root: string, target: string): Promise<void> {
  const rootReal = await realpath(root);
  let parent = dirname(target);
  while (true) {
    try {
      const parentReal = await realpath(parent);
      const rel = relative(rootReal, parentReal);
      if (rel.startsWith("..") || rel === ".." || rel.startsWith("/"))
        throw new Error("atomic-path-escape");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = dirname(parent);
      if (next === parent) throw new Error("atomic-path-escape");
      parent = next;
    }
  }
}

async function writeDurable(
  path: string,
  bytes: Buffer,
  mode: number,
): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, mode);
}

async function removeArtifacts(
  operations: BoundOperation[],
  journalPath: string | undefined,
): Promise<void> {
  for (const operation of operations) {
    if (operation.temporary) await rm(operation.temporary, { force: true });
    if (operation.backup) await rm(operation.backup, { force: true });
  }
  if (journalPath) await rm(journalPath, { force: true });
}

export async function applyAtomicFileTransaction(input: {
  root: string;
  journal_root: string;
  operations: AtomicFileOperation[];
  checkpoint: (name: TransactionCheckpoint) => Promise<void>;
}): Promise<AtomicTransactionReceipt> {
  if (input.operations.length === 0)
    return { status: "applied", changed_paths: [], restored_paths: [] };

  const root = resolve(input.root);
  const journalRoot = resolve(input.journal_root);
  const seen = new Set<string>();
  const operations: BoundOperation[] = [];
  for (const operation of input.operations) {
    const path = safeRelativePath(operation.path);
    if (seen.has(path)) throw new Error("atomic-duplicate-path");
    seen.add(path);
    if (
      (operation.before !== null && !Buffer.isBuffer(operation.before)) ||
      (operation.after !== null && !Buffer.isBuffer(operation.after))
    )
      throw new Error("atomic-buffer-invalid");
    const target = resolve(root, path);
    const rel = relative(root, target);
    if (rel.startsWith("..") || rel === ".." || rel.startsWith("/"))
      throw new Error("atomic-path-escape");
    await assertParentInside(root, target);
    const current = await existingRegularFile(target);
    if (operation.before === null) {
      if (current) throw new Error("atomic-preimage-drift");
    } else if (!current || !current.bytes.equals(operation.before))
      throw new Error("atomic-preimage-drift");
    operations.push({
      ...operation,
      path: operation.path.startsWith("./") ? "./" + path : path,
      target,
      ...(current ? { beforeMode: current.mode } : {}),
      mutated: false,
    });
  }

  await mkdir(journalRoot, { recursive: true });
  const suffix = operationsDigest(operations);
  const journalPath = resolve(
    journalRoot,
    ".coffee-chat-" + suffix + ".transaction.json",
  );
  const temporaryRoot = resolve(
    journalRoot,
    ".coffee-chat-" + suffix + ".files",
  );
  const journal = {
    schema_version: "1.0.0",
    state: "prepared",
    entries: operations.map((operation) => ({
      path: operation.path,
      target_path: operation.target,
      original: operation.before
        ? { state: "file", digest: digest(operation.before) }
        : { state: "absent" },
      ...(operation.after
        ? { expected_digest: digest(operation.after) }
        : { deletion: true }),
    })),
  };
  let journalCreated = false;
  try {
    await input.checkpoint("before-journal");
    await writeDurable(
      journalPath,
      Buffer.from(JSON.stringify(journal, null, 2) + "\n", "utf8"),
      0o600,
    );
    journalCreated = true;
    await mkdir(temporaryRoot, { recursive: true });

    for (const [index, operation] of operations.entries()) {
      await input.checkpoint("before-each-swap");
      await mkdir(dirname(operation.target), { recursive: true });
      if (operation.after !== null) {
        operation.temporary = resolve(temporaryRoot, String(index) + ".tmp");
        await writeDurable(
          operation.temporary,
          operation.after,
          modeNumber(operation.mode),
        );
      }
      if (operation.before !== null) {
        operation.backup = resolve(temporaryRoot, String(index) + ".bak");
        await writeDurable(
          operation.backup,
          operation.before,
          operation.beforeMode ?? modeNumber(operation.mode),
        );
      }
      if (!(await samePreimage(operation)))
        throw new Error("atomic-preimage-drift");
      if (operation.after !== null)
        await rename(operation.temporary as string, operation.target);
      else await unlink(operation.target);
      operation.mutated = true;
      await input.checkpoint("after-each-swap");
    }
    await input.checkpoint("before-cleanup");
    await removeArtifacts(operations, journalPath);
    await rm(temporaryRoot, { recursive: true, force: true });
    return {
      status: "applied",
      changed_paths: operations.map((operation) => operation.path),
      restored_paths: [],
    };
  } catch {
    const restored: string[] = [];
    let rollbackComplete = true;
    for (const operation of [...operations].reverse()) {
      if (!operation.mutated) continue;
      try {
        if (operation.before !== null) {
          await writeFileReplace(
            operation.target,
            operation.before,
            operation.beforeMode ?? modeNumber(operation.mode),
          );
        } else await rm(operation.target, { force: true });
        restored.push(operation.path);
      } catch {
        rollbackComplete = false;
      }
    }
    try {
      await removeArtifacts(
        operations,
        journalCreated ? journalPath : undefined,
      );
      await rm(temporaryRoot, { recursive: true, force: true });
    } catch {
      rollbackComplete = false;
    }
    if (!rollbackComplete)
      return {
        status: "partial_apply_result",
        changed_paths: operations
          .filter((operation) => operation.mutated)
          .map((operation) => operation.path),
        restored_paths: restored,
        ...(journalCreated ? { journal_path: journalPath } : {}),
      };
    return {
      status: "rolled_back",
      changed_paths: operations
        .filter((operation) => operation.mutated)
        .map((operation) => operation.path),
      restored_paths: restored,
    };
  }
}

async function writeFileReplace(
  path: string,
  bytes: Buffer,
  mode: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await chmod(path, mode);
}

async function samePreimage(operation: BoundOperation): Promise<boolean> {
  const current = await existingRegularFile(operation.target);
  if (operation.before === null) return current === null;
  return Boolean(current && current.bytes.equals(operation.before));
}
