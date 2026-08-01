import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, posix, relative, resolve, sep } from "node:path";
import {
  UnableToComplete,
  ValidationFailure,
  repositoryPath,
} from "./contracts.ts";

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

class WorktreeSnapshot implements Snapshot {
  readonly mode = "worktree" as const;
  readonly root: string;
  private realRoot?: string;

  constructor(root: string) {
    this.root = root;
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
    if (!safeLogicalPath(prefix)) throw pathFailure(prefix);
    const absolute = resolve(this.root, ...prefix.split("/"));
    try {
      return (await this.walk(absolute, prefix)).sort();
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
}

class GitSnapshot implements Snapshot {
  readonly root: string;
  readonly mode: "staged" | "base";
  private readonly revision?: string;
  private entries?: Map<string, GitEntry>;

  constructor(root: string, mode: "staged" | "base", revision?: string) {
    this.root = root;
    this.mode = mode;
    this.revision = revision;
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
    if (!safeLogicalPath(path)) throw pathFailure(path);
    return (await this.loadEntries()).has(path);
  }

  async assertSafe(path: string): Promise<void> {
    if (!safeLogicalPath(path)) throw pathFailure(path);
    const entries = await this.loadEntries();
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const prefix = segments.slice(0, index).join("/");
      const entry = entries.get(prefix);
      if (entry?.mode !== "120000") continue;
      const target = (await this.raw(prefix)).toString("utf8");
      const resolved = posix.normalize(posix.join(dirname(prefix), target));
      if (!safeLogicalPath(resolved)) throw pathFailure(path, "symlink-escape");
    }
  }

  async list(prefix: string): Promise<string[]> {
    if (!safeLogicalPath(prefix)) throw pathFailure(prefix);
    const start = `${prefix.replace(/\/$/, "")}/`;
    return [...(await this.loadEntries()).keys()]
      .filter((path) => path.startsWith(start))
      .sort();
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
    if (!safeLogicalPath(path)) throw pathFailure(path);
    const entry = (await this.loadEntries()).get(path);
    if (!entry) {
      throw new UnableToComplete({
        code: "snapshot-read-failed",
        path: repositoryPath(path),
        message: "Required snapshot input could not be read.",
      });
    }
    if (entry.mode !== "120000") return this.raw(path);
    const target = (await this.raw(path)).toString("utf8");
    const resolved = posix.normalize(posix.join(dirname(path), target));
    if (!safeLogicalPath(resolved)) throw pathFailure(path, "symlink-escape");
    return this.read(resolved);
  }
}

export async function createSnapshot(
  root: string,
  mode: "worktree" | "staged",
): Promise<Snapshot> {
  return mode === "worktree"
    ? new WorktreeSnapshot(root)
    : new GitSnapshot(root, "staged");
}

export async function createBaseSnapshot(
  root: string,
  reference: string,
): Promise<Snapshot> {
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
