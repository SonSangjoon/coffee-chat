import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyInitPreview,
  prepareInitPreview,
  type InitRequest,
} from "../tools/coffee-init.ts";

const temporaryRoots: string[] = [];
const releaseDigest =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sourceCommit = "1111111111111111111111111111111111111111";

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function fixture(): Promise<{
  engineRoot: string;
  targetRoot: string;
  request: InitRequest;
}> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-init-"));
  temporaryRoots.push(root);
  const engineRoot = resolve(root, "engine");
  const targetRoot = resolve(root, "instances", "coffee-chat-alice");
  await mkdir(engineRoot, { recursive: true });
  await writeFile(
    resolve(engineRoot, "coffee-chat.json"),
    JSON.stringify({
      repository_role: "engine",
      repository: {
        url: "https://github.com/SonSangjoon/coffee-chat",
        default_branch: "main",
      },
    }),
  );
  await writeFile(
    resolve(engineRoot, "engine-release.json"),
    JSON.stringify({
      repository: "https://github.com/SonSangjoon/coffee-chat",
      version: "2026.08.04",
      source_commit: sourceCommit,
      release_digest: releaseDigest,
    }),
  );
  return {
    engineRoot,
    targetRoot,
    request: {
      engine_root: engineRoot,
      target_root: targetRoot,
      instance_name: "coffee-chat-alice",
      repository_url: "https://github.com/SonSangjoon/coffee-chat-alice",
      pages_url: "https://sonsangjoon.github.io/coffee-chat-alice/",
      display_name: "Alice",
      short_name: "Alice",
      profile_id: "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
      time_zone: "Asia/Seoul",
      release_payload: [
        {
          path: "README.md",
          bytes: Buffer.from("# Alice Coffee Chat\n", "utf8"),
        },
        {
          path: "AGENTS.md",
          bytes: Buffer.from("Read coffee-chat.json before a Skill.\n", "utf8"),
        },
      ],
      engine_release: {
        repository: "https://github.com/SonSangjoon/coffee-chat",
        version: "2026.08.04",
        source_commit: sourceCommit,
        release_digest: releaseDigest,
      },
    },
  };
}

describe("coffee-init", () => {
  it("rejects an instance name outside the coffee-chat-* contract", async () => {
    const { request } = await fixture();
    await expect(
      prepareInitPreview({ ...request, instance_name: "alice" }),
    ).rejects.toMatchObject({ code: "coffee-init-invalid-name" });
  });

  it("previews an independent target without writing before approval", async () => {
    const { request, targetRoot } = await fixture();
    const preview = await prepareInitPreview(request);

    expect(preview.operation).toBe("init");
    expect(preview.status).toBe("pending_approval");
    expect(preview.targets[0]?.locator).toBe(targetRoot);
    expect(preview.scope.write_set).toEqual(
      expect.arrayContaining(["./coffee-chat.json", "./README.md"]),
    );
    expect(preview.scope.protected_set).toEqual(
      expect.arrayContaining([request.engine_root, request.target_root]),
    );
    await expect(readdir(targetRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("materializes only the approved release payload into a new instance", async () => {
    const { request, targetRoot, engineRoot } = await fixture();
    const preview = await prepareInitPreview(request);
    const receipt = await applyInitPreview({
      request,
      preview,
      approved_fingerprint: preview.fingerprint,
    });

    expect(receipt.status).toBe("applied");
    expect(receipt.changed_paths).toEqual(
      expect.arrayContaining(["./coffee-chat.json", "./README.md"]),
    );
    const manifest = JSON.parse(
      await readFile(resolve(targetRoot, "coffee-chat.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.repository_role).toBe("instance");
    expect(manifest.repository).toEqual({
      url: request.repository_url,
      default_branch: "main",
    });
    expect(await readFile(resolve(targetRoot, "README.md"), "utf8")).toContain(
      "Alice Coffee Chat",
    );
    await expect(
      readFile(resolve(engineRoot, "coffee-chat.json"), "utf8"),
    ).resolves.toContain('"repository_role":"engine"');
  });

  it("rejects a target that changed after preview", async () => {
    const { request, targetRoot } = await fixture();
    const preview = await prepareInitPreview(request);
    await mkdir(targetRoot, { recursive: true });

    await expect(
      applyInitPreview({
        request,
        preview,
        approved_fingerprint: preview.fingerprint,
      }),
    ).rejects.toMatchObject({ code: "coffee-init-stale-preview" });
    await expect(
      readFile(resolve(targetRoot, "coffee-chat.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
