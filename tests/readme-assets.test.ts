import {
  cp,
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
  README_ASSET_PATHS,
  readPngDimensions,
  validateReadmeAssets,
  validateReadmeLinks,
} from "../tools/readme-assets.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const assetRoot = resolve(projectRoot, "docs/assets/readme");
const temporaryRoots: string[] = [];

async function assetFixture(): Promise<{
  root: string;
  snapshot: Awaited<ReturnType<typeof createSnapshot>>;
}> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-readme-assets-"));
  temporaryRoots.push(root);
  await cp(assetRoot, resolve(root, "docs/assets/readme"), { recursive: true });
  return { root, snapshot: await createSnapshot(root, "worktree") };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("README visual asset contract", () => {
  it("accepts the cover and two locked product-flow PNGs", async () => {
    const cover = await readFile(resolve(assetRoot, "coffee-chat-cover.png"));
    const taste = await readFile(
      resolve(assetRoot, "coffee-chat-taste.en.png"),
    );
    const agent = await readFile(
      resolve(assetRoot, "coffee-chat-agent.en.png"),
    );

    expect(README_ASSET_PATHS).toEqual([
      "docs/assets/readme/coffee-chat-cover.png",
      "docs/assets/readme/coffee-chat-taste.en.png",
      "docs/assets/readme/coffee-chat-agent.en.png",
    ]);
    expect(readPngDimensions(cover)).toEqual({ width: 1280, height: 640 });
    expect(readPngDimensions(taste)).toEqual({ width: 1200, height: 760 });
    expect(readPngDimensions(agent)).toEqual({ width: 1200, height: 760 });
    expect(cover.byteLength).toBeLessThan(1024 * 1024);
    expect(taste.byteLength).toBeLessThan(1.5 * 1024 * 1024);
    expect(agent.byteLength).toBeLessThan(1.5 * 1024 * 1024);
    const assetNames = (await readdir(assetRoot)).sort();
    expect(assetNames).toEqual([
      "coffee-chat-agent.en.png",
      "coffee-chat-cover.png",
      "coffee-chat-taste.en.png",
    ]);
    expect(assetNames).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.svg$/)]),
    );

    await expect(
      validateReadmeAssets(await createSnapshot(projectRoot, "worktree")),
    ).resolves.toBeUndefined();
  });

  it("reports a stable diagnostic when a canonical asset is missing", async () => {
    const fixture = await assetFixture();
    await rm(resolve(fixture.root, README_ASSET_PATHS[0] as string));

    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "missing-readme-asset",
        path: "./docs/assets/readme/coffee-chat-cover.png",
      },
    });
  });

  it("rejects a changed PNG dimension with a stable diagnostic", async () => {
    const fixture = await assetFixture();
    const path = resolve(
      fixture.root,
      "docs/assets/readme/coffee-chat-taste.en.png",
    );
    const bytes = Buffer.from(await readFile(path));
    bytes.writeUInt32BE(1199, 16);
    await writeFile(path, bytes);

    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "invalid-readme-asset",
        path: "./docs/assets/readme/coffee-chat-taste.en.png",
      },
    });
  });

  it("rejects an appended byte as approved asset drift", async () => {
    const fixture = await assetFixture();
    const path = resolve(
      fixture.root,
      "docs/assets/readme/coffee-chat-taste.en.png",
    );
    await writeFile(
      path,
      Buffer.concat([await readFile(path), Buffer.from([0])]),
    );

    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "readme-asset-drift",
        path: "./docs/assets/readme/coffee-chat-taste.en.png",
      },
    });
  });

  it("rejects content whose digest differs from the approved digest", async () => {
    const fixture = await assetFixture();
    const path = resolve(
      fixture.root,
      "docs/assets/readme/coffee-chat-agent.en.png",
    );
    const bytes = Buffer.from(await readFile(path));
    bytes[bytes.length - 13] = (bytes[bytes.length - 13] as number) ^ 1;
    await writeFile(path, bytes);

    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "readme-asset-drift",
        path: "./docs/assets/readme/coffee-chat-agent.en.png",
      },
    });
  });
});

describe("README local-link validation", () => {
  it("treats the two generated README paths as projected reciprocal targets", async () => {
    const fixture = await assetFixture();
    const readmes = new Map([
      ["README.md", Buffer.from("[한국어](./README.ko.md)\n")],
      ["README.ko.md", Buffer.from("[English](./README.md)\n")],
    ]);

    await expect(
      validateReadmeLinks(fixture.snapshot, readmes),
    ).resolves.toBeUndefined();
  });

  it("rejects a missing inline local target", async () => {
    const fixture = await assetFixture();
    const readmes = new Map([
      ["README.md", Buffer.from("![Missing](./docs/missing.png)\n")],
      ["README.ko.md", Buffer.from("[English](./README.md)\n")],
    ]);

    await expect(
      validateReadmeLinks(fixture.snapshot, readmes),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "missing-readme-link",
        path: "./docs/missing.png",
      },
    });
  });

  it("rejects a missing reference-definition local target", async () => {
    const fixture = await assetFixture();
    const readmes = new Map([
      [
        "README.md",
        Buffer.from(
          "![Missing diagram][diagram]\n\n[diagram]: ./docs/missing-reference.png\n",
        ),
      ],
      ["README.ko.md", Buffer.from("[English](./README.md)\n")],
    ]);

    await expect(
      validateReadmeLinks(fixture.snapshot, readmes),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "missing-readme-link",
        path: "./docs/missing-reference.png",
      },
    });
  });

  it("rejects a missing angle-bracket local target containing spaces", async () => {
    const fixture = await assetFixture();
    const readmes = new Map([
      [
        "README.md",
        Buffer.from("[Missing diagram](<./docs/missing diagram.png>)\n"),
      ],
      ["README.ko.md", Buffer.from("[English](./README.md)\n")],
    ]);

    await expect(
      validateReadmeLinks(fixture.snapshot, readmes),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "missing-readme-link",
        path: "./docs/missing diagram.png",
      },
    });
  });
});
