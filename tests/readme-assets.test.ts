import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function semanticSlots(svg: string): string[] {
  return [...svg.matchAll(/\bdata-slot="([^"]+)"/g)].map(
    (match) => match[1] as string,
  );
}

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
  it("accepts the five canonical safe assets with exact dimensions and semantic order", async () => {
    const cover = await readFile(resolve(assetRoot, "coffee-chat-cover.png"));
    const flowEnglish = await readFile(
      resolve(assetRoot, "coffee-chat-flow.en.svg"),
      "utf8",
    );
    const trustEnglish = await readFile(
      resolve(assetRoot, "coffee-chat-trust.en.svg"),
      "utf8",
    );
    const snapshot = await createSnapshot(projectRoot, "worktree");

    expect(README_ASSET_PATHS).toEqual([
      "docs/assets/readme/coffee-chat-cover.png",
      "docs/assets/readme/coffee-chat-flow.en.svg",
      "docs/assets/readme/coffee-chat-flow.ko.svg",
      "docs/assets/readme/coffee-chat-trust.en.svg",
      "docs/assets/readme/coffee-chat-trust.ko.svg",
    ]);
    expect(readPngDimensions(cover)).toEqual({ width: 1280, height: 640 });
    expect(cover.byteLength).toBeLessThan(1024 * 1024);
    expect(semanticSlots(flowEnglish)).toEqual([
      "public-source",
      "dated-judgment",
      "approved-note",
      "temporal-graph",
      "owner-agent",
      "other-agents",
      "task-lens",
      "grounded-chat",
      "owner-outcome",
      "other-outcome",
    ]);
    expect(semanticSlots(trustEnglish)).toEqual([
      "authored",
      "sourced",
      "inferred",
      "unknown",
    ]);
    await expect(validateReadmeAssets(snapshot)).resolves.toBeUndefined();
  });

  it("reports a stable diagnostic when a canonical asset is missing", async () => {
    const fixture = await assetFixture();
    await rm(resolve(fixture.root, README_ASSET_PATHS[0] as string));
    const snapshot = await createSnapshot(fixture.root, "worktree");

    await expect(validateReadmeAssets(snapshot)).rejects.toMatchObject({
      diagnostic: {
        code: "missing-readme-asset",
        path: "./docs/assets/readme/coffee-chat-cover.png",
      },
    });
  });

  it("rejects a malformed or oversized cover before projection", async () => {
    const fixture = await assetFixture();
    const coverPath = resolve(
      fixture.root,
      "docs/assets/readme/coffee-chat-cover.png",
    );
    const wrongDimensions = Buffer.from(await readFile(coverPath));
    wrongDimensions.writeUInt32BE(1279, 16);
    await writeFile(coverPath, wrongDimensions);
    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ code: "invalid-readme-cover" }),
    });

    const original = await readFile(
      resolve(assetRoot, "coffee-chat-cover.png"),
    );
    await writeFile(
      coverPath,
      Buffer.concat([original, Buffer.alloc(1024 * 1024 - original.length)]),
    );
    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ code: "invalid-readme-cover" }),
    });
  });

  it.each([
    "<script>alert(1)</script>",
    '<image href="data:image/png;base64,AA=="/>',
    "<foreignObject><div/></foreignObject>",
    '<animate attributeName="x"/>',
    '<set attributeName="fill"/>',
    '<rect onclick="alert(1)"/>',
    '<use href="#node"/>',
    '<use xlink:href="#node"/>',
    '<rect fill="url(#paint)"/>',
    "<linearGradient/>",
    "<radialGradient/>",
  ])("rejects unsafe SVG markup: %s", async (unsafeMarkup) => {
    const fixture = await assetFixture();
    const flowEnglish = resolve(
      fixture.root,
      "docs/assets/readme/coffee-chat-flow.en.svg",
    );
    await writeFile(
      flowEnglish,
      `<svg viewBox="0 0 960 720">${unsafeMarkup}</svg>`,
    );

    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ code: "unsafe-readme-asset" }),
    });
  });

  it("rejects locale geometry drift while allowing localized text", async () => {
    const fixture = await assetFixture();
    const koreanPath = resolve(
      fixture.root,
      "docs/assets/readme/coffee-chat-flow.ko.svg",
    );
    const korean = await readFile(koreanPath, "utf8");
    expect(korean).toContain('cx="170"');
    await writeFile(koreanPath, korean.replace('cx="170"', 'cx="171"'));

    await expect(
      validateReadmeAssets(await createSnapshot(fixture.root, "worktree")),
    ).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        code: "readme-asset-locale-drift",
        path: "./docs/assets/readme/coffee-chat-flow.ko.svg",
      }),
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

  it("rejects any other missing local Markdown image or link target", async () => {
    const fixture = await assetFixture();
    const readmes = new Map([
      ["README.md", Buffer.from("![Missing](./docs/missing.svg)\n")],
      ["README.ko.md", Buffer.from("[English](./README.md)\n")],
    ]);

    await expect(
      validateReadmeLinks(fixture.snapshot, readmes),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "missing-readme-asset",
        path: "./docs/missing.svg",
      },
    });
  });
});
