import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySyncPreview,
  prepareSyncPreview,
  type SyncRequest,
} from "../tools/coffee-sync.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function fixture(): Promise<{
  instanceRoot: string;
  workRoot: string;
  request: SyncRequest;
}> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-sync-"));
  temporaryRoots.push(root);
  const instanceRoot = resolve(root, "coffee-chat-alice");
  const workRoot = resolve(root, "work");
  await mkdir(instanceRoot, { recursive: true });
  await mkdir(resolve(instanceRoot, "knowledge"), { recursive: true });
  await mkdir(workRoot, { recursive: true });
  await writeFile(resolve(workRoot, "README.md"), "work repository\n");
  await writeFile(
    resolve(instanceRoot, "coffee-chat.json"),
    JSON.stringify({
      repository_role: "instance",
      repository: {
        url: "https://github.com/SonSangjoon/coffee-chat-alice",
        default_branch: "main",
      },
      pages_url: "https://sonsangjoon.github.io/coffee-chat-alice/",
    }),
  );
  await writeFile(
    resolve(instanceRoot, "knowledge/index.json"),
    JSON.stringify({
      repository_url: "https://github.com/SonSangjoon/coffee-chat-alice",
      repository_role: "instance",
      knowledge_digest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
  );
  return {
    instanceRoot,
    workRoot,
    request: {
      instance_root: instanceRoot,
      work_root: workRoot,
      instance_url: "https://github.com/SonSangjoon/coffee-chat-alice",
    },
  };
}

describe("coffee-sync", () => {
  it("requires an explicit verified instance URL and index", async () => {
    const { request, instanceRoot } = await fixture();
    await writeFile(
      resolve(instanceRoot, "coffee-chat.json"),
      JSON.stringify({
        repository_role: "engine",
        repository: { url: request.instance_url, default_branch: "main" },
      }),
    );

    await expect(prepareSyncPreview(request)).rejects.toMatchObject({
      code: "coffee-sync-invalid-instance",
    });
  });

  it("previews an exact connection write without copying personal records", async () => {
    const { request, workRoot } = await fixture();
    const preview = await prepareSyncPreview(request);

    expect(preview.operation).toBe("sync");
    expect(preview.scope.write_set).toEqual(["./.coffee-chat/connection.json"]);
    expect(preview.scope.protected_set).toEqual(
      expect.arrayContaining(["./README.md", request.instance_root]),
    );
    await expect(
      readFile(resolve(workRoot, ".coffee-chat/connection.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes only connection metadata after exact approval", async () => {
    const { request, workRoot } = await fixture();
    const preview = await prepareSyncPreview(request);
    const receipt = await applySyncPreview({
      request,
      preview,
      approved_fingerprint: preview.fingerprint,
    });

    expect(receipt.status).toBe("applied");
    const connection = JSON.parse(
      await readFile(resolve(workRoot, ".coffee-chat/connection.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(connection).toMatchObject({
      repository_url: request.instance_url,
      repository_role: "instance",
    });
    expect(await readdir(workRoot)).toEqual(
      expect.arrayContaining(["README.md", ".coffee-chat"]),
    );
    expect(await readFile(resolve(workRoot, "README.md"), "utf8")).toBe(
      "work repository\n",
    );
  });

  it("rejects a work repository that changed after preview", async () => {
    const { request, workRoot } = await fixture();
    const preview = await prepareSyncPreview(request);
    await writeFile(resolve(workRoot, "README.md"), "changed\n");

    await expect(
      applySyncPreview({
        request,
        preview,
        approved_fingerprint: preview.fingerprint,
      }),
    ).rejects.toMatchObject({ code: "coffee-sync-stale-preview" });
    await expect(
      readFile(resolve(workRoot, ".coffee-chat/connection.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
