import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, posix, relative, resolve, sep } from "node:path";
import {
  UnableToComplete,
  ValidationFailure,
  repositoryPath,
} from "./contracts.ts";
import type { RepositorySnapshotEntry } from "./engine-contracts.ts";

type GitEntry = { mode: string; path: string };

function git(
  cwd: string,
  args: string[],
  encoding: BufferEncoding | "buffer" = "buffer",
): Promise<string | Buffer> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: encoding as BufferEncoding,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolvePromise(stdout as string | Buffer);
      },
    );
  });
}

export interface Snapshot {
  readonly root: string;
  readonly mode: "worktree" | "staged" | "base";
  exists(path: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  read(path: string): Promise<Buffer>;
  assertSafe(path: string): Promise<void>;
  listRepositoryEntries(): Promise<RepositorySnapshotEntry[]>;
}

/** A snapshot whose observed repository inputs are retained for artifact provenance. */
export interface DependencyTrackingSnapshot extends Snapshot {
  dependencies(): string[];
}

function safeLogicalPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    posix.normalize(path) === path
  );
}

function pathFailure(
  path: string,
  code = "unsafe-repository-path",
): ValidationFailure {
  return new ValidationFailure({
    code,
    path: repositoryPath(path),
    message:
      "Repository path must resolve safely inside the selected snapshot.",
  });
}

class WorktreeSnapshot implements DependencyTrackingSnapshot {
  readonly mode = "worktree" as const;
  readonly root: string;
  private realRoot?: string;
  private readonly observed = new Set<string>();

  constructor(root: string) {
    this.root = root;
  }

  dependencies(): string[] {
    return [...this.observed].sort();
  }

  private observe(path: string): void {
    this.observed.add(path);
  }

  private async safeAbsolute(path: string): Promise<string> {
    if (!safeLogicalPath(path)) throw pathFailure(path);
    const absolute = resolve(this.root, ...path.split("/"));
    const root = (this.realRoot ??= await realpath(this.root));
    let resolved: string;
    try {
      resolved = await realpath(absolute);
    } catch (error) {
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(path),
        message: "Required snapshot input could not be read.",
      });
    }
    const fromRoot = relative(root, resolved);
    if (
      fromRoot === ".." ||
      fromRoot.startsWith(`..${sep}`) ||
      resolve(root, fromRoot) !== resolved
    ) {
      throw pathFailure(path, "symlink-escape");
    }
    return absolute;
  }

  async exists(path: string): Promise<boolean> {
    this.observe(path);
    if (!safeLogicalPath(path)) throw pathFailure(path);
    try {
      await lstat(resolve(this.root, ...path.split("/")));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(path),
        message: "Selected snapshot could not be inspected.",
      });
    }
  }

  async assertSafe(path: string): Promise<void> {
    this.observe(path);
    if (!safeLogicalPath(path)) throw pathFailure(path);
    const root = (this.realRoot ??= await realpath(this.root));
    let candidate = resolve(this.root, ...path.split("/"));
    while (candidate !== this.root) {
      try {
        await lstat(candidate);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new UnableToComplete({
            code: "snapshot-read-failed",
            path: repositoryPath(path),
            message: "Declared repository path could not be inspected.",
          });
        }
        candidate = dirname(candidate);
      }
    }
    const resolved = await realpath(candidate);
    const fromRoot = relative(root, resolved);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      throw pathFailure(path, "symlink-escape");
    }
  }

  async list(prefix: string): Promise<string[]> {
    this.observe(prefix);
    if (!safeLogicalPath(prefix)) throw pathFailure(prefix);
    const absolute = resolve(this.root, ...prefix.split("/"));
    try {
      const paths = (await this.walk(absolute, prefix)).sort();
      for (const path of paths) this.observe(path);
      return paths;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(prefix),
        message: "Selected snapshot directory could not be listed.",
      });
    }
  }

  private async walk(absolute: string, prefix: string): Promise<string[]> {
    const paths: string[] = [];
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const path = posix.join(prefix, entry.name);
      if (entry.isFile() || entry.isSymbolicLink()) paths.push(path);
      else if (entry.isDirectory()) {
        paths.push(...(await this.walk(resolve(absolute, entry.name), path)));
      }
    }
    return paths;
  }

  async read(path: string): Promise<Buffer> {
    this.observe(path);
    const absolute = await this.safeAbsolute(path);
    try {
      return await readFile(absolute);
    } catch {
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(path),
        message: "Required snapshot input could not be read.",
      });
    }
  }

  async listRepositoryEntries(): Promise<RepositorySnapshotEntry[]> {
    let output: Buffer;
    try {
      output = (await git(this.root, [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
      ])) as Buffer;
    } catch {
      throw new UnableToComplete({
        code: "git-snapshot-unavailable",
        path: ".",
        message: "The worktree repository entries could not be resolved.",
      });
    }
    const paths = output.toString("utf8").split("\0").filter(Boolean).sort();
    let staged: Buffer;
    try {
      staged = (await git(this.root, ["ls-files", "--stage", "-z"])) as Buffer;
    } catch {
      throw new UnableToComplete({
        code: "git-snapshot-unavailable",
        path: ".",
        message: "The worktree file modes could not be resolved.",
      });
    }
    const modes = new Map<string, RepositorySnapshotEntry["mode"]>();
    for (const record of staged.toString("utf8").split("\0")) {
      if (!record) continue;
      const match = /^(\d{6}) [0-9a-f]+(?: \d+)?\t([\s\S]+)$/.exec(record);
      if (!match) continue;
      const mode = match[1];
      if (mode !== "100644" && mode !== "100755" && mode !== "120000") continue;
      modes.set(match[2] as string, mode);
    }
    const entries: RepositorySnapshotEntry[] = [];
    for (const path of paths) {
      const trackedMode = modes.get(path);
      if (trackedMode) {
        entries.push({ path, mode: trackedMode });
        continue;
      }
      try {
        const stat = await lstat(resolve(this.root, ...path.split("/")));
        entries.push({
          path,
          mode: stat.isSymbolicLink()
            ? "120000"
            : stat.mode & 0o111
              ? "100755"
              : "100644",
        });
      } catch {
        throw new UnableToComplete({
          code: "snapshot-read-failed",
          path: repositoryPath(path),
          message: "A worktree repository entry could not be inspected.",
        });
      }
    }
    return entries;
  }
}

class GitSnapshot implements DependencyTrackingSnapshot {
  readonly root: string;
  readonly mode: "staged" | "base";
  private readonly revision?: string;
  private entries?: Map<string, GitEntry>;
  private readonly observed = new Set<string>();

  constructor(root: string, mode: "staged" | "base", revision?: string) {
    this.root = root;
    this.mode = mode;
    this.revision = revision;
  }

  dependencies(): string[] {
    return [...this.observed].sort();
  }

  private observe(path: string): void {
    this.observed.add(path);
  }

  private async loadEntries(): Promise<Map<string, GitEntry>> {
    if (this.entries) return this.entries;
    let output: Buffer;
    try {
      output =
        this.mode === "staged"
          ? ((await git(this.root, ["ls-files", "--stage", "-z"])) as Buffer)
          : ((await git(this.root, [
              "ls-tree",
              "-r",
              "-z",
              this.revision as string,
            ])) as Buffer);
    } catch {
      throw new UnableToComplete({
        code: "git-snapshot-unavailable",
        path: ".",
        message: "Requested Git snapshot could not be resolved.",
      });
    }
    const entries = new Map<string, GitEntry>();
    for (const record of output.toString("utf8").split("\0")) {
      if (!record) continue;
      const match = /^(\d{6}) (?:blob )?[0-9a-f]+(?: \d+)?\t([\s\S]+)$/.exec(
        record,
      );
      if (match)
        entries.set(match[2] as string, {
          mode: match[1] as string,
          path: match[2] as string,
        });
    }
    this.entries = entries;
    return entries;
  }

  async exists(path: string): Promise<boolean> {
    this.observe(path);
    if (!safeLogicalPath(path)) throw pathFailure(path);
    return (await this.loadEntries()).has(path);
  }

  async assertSafe(path: string): Promise<void> {
    this.observe(path);
    await this.resolveSymlinks(path);
  }

  private async resolveSymlinks(
    path: string,
    seen = new Set<string>(),
    depth = 0,
  ): Promise<string> {
    if (!safeLogicalPath(path)) throw pathFailure(path);
    if (depth >= 40) throw pathFailure(path, "symlink-cycle");
    const entries = await this.loadEntries();
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const prefix = segments.slice(0, index).join("/");
      const entry = entries.get(prefix);
      if (entry?.mode !== "120000") continue;
      if (seen.has(prefix)) throw pathFailure(path, "symlink-cycle");
      seen.add(prefix);
      const target = (await this.raw(prefix)).toString("utf8");
      if (target.startsWith("/") || target.includes("\\"))
        throw pathFailure(path, "symlink-escape");
      const resolvedTarget = posix.normalize(
        posix.join(dirname(prefix), target),
      );
      if (!safeLogicalPath(resolvedTarget))
        throw pathFailure(path, "symlink-escape");
      const remainder = segments.slice(index).join("/");
      const resolved = remainder
        ? posix.join(resolvedTarget, remainder)
        : resolvedTarget;
      return this.resolveSymlinks(resolved, seen, depth + 1);
    }
    return path;
  }

  async list(prefix: string): Promise<string[]> {
    this.observe(prefix);
    if (!safeLogicalPath(prefix)) throw pathFailure(prefix);
    const start = `${prefix.replace(/\/$/, "")}/`;
    const paths = [...(await this.loadEntries()).keys()]
      .filter((path) => path.startsWith(start))
      .sort();
    for (const path of paths) this.observe(path);
    return paths;
  }

  private async raw(path: string): Promise<Buffer> {
    try {
      if (this.mode === "staged")
        return (await git(this.root, ["show", `:${path}`])) as Buffer;
      return (await git(this.root, [
        "show",
        `${this.revision as string}:${path}`,
      ])) as Buffer;
    } catch {
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(path),
        message: "Required snapshot input could not be read.",
      });
    }
  }

  async read(path: string): Promise<Buffer> {
    this.observe(path);
    const resolved = await this.resolveSymlinks(path);
    this.observe(resolved);
    const entry = (await this.loadEntries()).get(resolved);
    if (!entry) {
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(path),
        message: "Required snapshot input could not be read.",
      });
    }
    return this.raw(resolved);
  }

  async listRepositoryEntries(): Promise<RepositorySnapshotEntry[]> {
    const entries = await this.loadEntries();
    return [...entries.values()]
      .map((entry) => {
        if (
          entry.mode !== "100644" &&
          entry.mode !== "100755" &&
          entry.mode !== "120000"
        )
          throw pathFailure(entry.path, "unsupported-repository-mode");
        return {
          path: entry.path,
          mode: entry.mode,
        } as RepositorySnapshotEntry;
      })
      .sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      );
  }
}

export async function createSnapshot(
  root: string,
  mode: "worktree" | "staged",
): Promise<DependencyTrackingSnapshot> {
  return mode === "worktree"
    ? new WorktreeSnapshot(root)
    : new GitSnapshot(root, "staged");
}

export async function createBaseSnapshot(
  root: string,
  reference: string,
): Promise<DependencyTrackingSnapshot> {
  let commit: string;
  try {
    commit = (
      (await git(
        root,
        ["rev-parse", "--verify", `${reference}^{commit}`],
        "utf8",
      )) as string
    ).trim();
  } catch {
    throw new UnableToComplete({
      code: "base-ref-unavailable",
      path: ".",
      message: "Requested base reference could not be resolved to a commit.",
    });
  }
  return new GitSnapshot(root, "base", commit);
}
