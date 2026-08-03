import {
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAtomicFileTransaction,
  type TransactionCheckpoint,
} from "../tools/transaction.ts";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-transaction-"));
  const journalRoot = await mkdtemp(resolve(tmpdir(), "coffee-chat-journal-"));
  return { root, journalRoot };
}

function noop(): (name: TransactionCheckpoint) => Promise<void> {
  return async () => undefined;
}

describe("atomic file transaction", () => {
  it("replaces and deletes files, then removes the journal", async () => {
    const { root, journalRoot } = await fixture();
    await writeFile(resolve(root, "replace.txt"), "before");
    await writeFile(resolve(root, "delete.txt"), "gone");

    const receipt = await applyAtomicFileTransaction({
      root,
      journal_root: journalRoot,
      operations: [
        {
          path: "./replace.txt",
          before: Buffer.from("before"),
          after: Buffer.from("after"),
        },
        {
          path: "./delete.txt",
          before: Buffer.from("gone"),
          after: null,
        },
      ],
      checkpoint: noop(),
    });

    expect(receipt).toEqual({
      status: "applied",
      changed_paths: ["./replace.txt", "./delete.txt"],
      restored_paths: [],
    });
    await expect(readFile(resolve(root, "replace.txt"), "utf8")).resolves.toBe(
      "after",
    );
    await expect(readFile(resolve(root, "delete.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readdir(journalRoot)).resolves.toEqual([]);
  });

  it("rejects preimage drift before creating a journal", async () => {
    const { root, journalRoot } = await fixture();
    await writeFile(resolve(root, "drift.txt"), "actual");

    await expect(
      applyAtomicFileTransaction({
        root,
        journal_root: journalRoot,
        operations: [
          {
            path: "drift.txt",
            before: Buffer.from("expected"),
            after: Buffer.from("next"),
          },
        ],
        checkpoint: noop(),
      }),
    ).rejects.toThrow("atomic-preimage-drift");
    await expect(readdir(journalRoot)).resolves.toEqual([]);
  });

  it("rolls back every completed swap after a checkpoint failure", async () => {
    const { root, journalRoot } = await fixture();
    await writeFile(resolve(root, "one.txt"), "one");
    await writeFile(resolve(root, "two.txt"), "two");
    let swaps = 0;
    const receipt = await applyAtomicFileTransaction({
      root,
      journal_root: journalRoot,
      operations: [
        {
          path: "one.txt",
          before: Buffer.from("one"),
          after: Buffer.from("ONE"),
        },
        {
          path: "two.txt",
          before: Buffer.from("two"),
          after: Buffer.from("TWO"),
        },
      ],
      checkpoint: async (name) => {
        if (name === "after-each-swap") {
          swaps += 1;
          if (swaps === 2) throw new Error("injected");
        }
      },
    });

    expect(receipt).toMatchObject({
      status: "rolled_back",
      changed_paths: ["one.txt", "two.txt"],
      restored_paths: ["two.txt", "one.txt"],
    });
    await expect(readFile(resolve(root, "one.txt"), "utf8")).resolves.toBe(
      "one",
    );
    await expect(readFile(resolve(root, "two.txt"), "utf8")).resolves.toBe(
      "two",
    );
    await expect(readdir(journalRoot)).resolves.toEqual([]);
  });

  it("rejects traversal and symlink targets", async () => {
    const { root, journalRoot } = await fixture();
    await writeFile(resolve(root, "real.txt"), "real");
    await symlink(resolve(root, "real.txt"), resolve(root, "link.txt"));

    await expect(
      applyAtomicFileTransaction({
        root,
        journal_root: journalRoot,
        operations: [
          { path: "../escape.txt", before: null, after: Buffer.from("no") },
        ],
        checkpoint: noop(),
      }),
    ).rejects.toThrow("atomic-path-invalid");
    await expect(
      applyAtomicFileTransaction({
        root,
        journal_root: journalRoot,
        operations: [
          {
            path: "link.txt",
            before: Buffer.from("real"),
            after: Buffer.from("changed"),
          },
        ],
        checkpoint: noop(),
      }),
    ).rejects.toThrow("atomic-target-unsafe");
  });
});
