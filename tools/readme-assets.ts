import { createHash } from "node:crypto";
import { posix } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { ValidationFailure, repositoryPath } from "./contracts.ts";
import type { Snapshot } from "./snapshot.ts";

export const README_ASSET_PATHS = [
  "docs/assets/readme/coffee-chat-cover.png",
  "docs/assets/readme/coffee-chat-flow.en.png",
  "docs/assets/readme/coffee-chat-trust.en.png",
] as const;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

type AssetContract = {
  path: (typeof README_ASSET_PATHS)[number];
  width: number;
  height: number;
  maxBytes: number;
  digest: string;
};

const ASSET_CONTRACTS: readonly AssetContract[] = [
  {
    path: "docs/assets/readme/coffee-chat-cover.png",
    width: 1280,
    height: 640,
    maxBytes: 1024 * 1024,
    digest: "88cf9c695c7793ef1a2ef28a1ad528c5b40ec4c6aed7e53495211d1a36ad48d9",
  },
  {
    path: "docs/assets/readme/coffee-chat-flow.en.png",
    width: 1200,
    height: 900,
    maxBytes: 1.5 * 1024 * 1024,
    digest: "399aeedde8920153d7c2fe9cc2d62d26ecc07a51d01d9f20e97ebb9ac180064c",
  },
  {
    path: "docs/assets/readme/coffee-chat-trust.en.png",
    width: 1200,
    height: 600,
    maxBytes: 1.5 * 1024 * 1024,
    digest: "fe668c6c795baeccd1f07fa586d30b4d1d0fcaa7077bba5c47d35f0874bf8df4",
  },
] as const;

function failure(
  code: string,
  path: string,
  message: string,
): ValidationFailure {
  return new ValidationFailure({ code, path: repositoryPath(path), message });
}

export function readPngDimensions(bytes: Buffer): {
  width: number;
  height: number;
} {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error("PNG signature or IHDR is invalid.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function readRequired(snapshot: Snapshot, path: string): Promise<Buffer> {
  if (!(await snapshot.exists(path)))
    throw failure(
      "missing-readme-asset",
      path,
      "Required README visual asset is missing.",
    );
  return snapshot.read(path);
}

export async function validateReadmeAssets(snapshot: Snapshot): Promise<void> {
  for (const contract of ASSET_CONTRACTS) {
    const bytes = await readRequired(snapshot, contract.path);
    let dimensions: { width: number; height: number };
    try {
      dimensions = readPngDimensions(bytes);
    } catch {
      throw failure(
        "invalid-readme-asset",
        contract.path,
        "README visual asset must be a valid PNG with an IHDR chunk.",
      );
    }
    if (
      dimensions.width !== contract.width ||
      dimensions.height !== contract.height ||
      bytes.byteLength >= contract.maxBytes
    )
      throw failure(
        "invalid-readme-asset",
        contract.path,
        `README visual asset must be ${contract.width} x ${contract.height} and smaller than ${contract.maxBytes} bytes.`,
      );

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== contract.digest)
      throw failure(
        "readme-asset-drift",
        contract.path,
        "README visual asset differs from its approved digest.",
      );
  }
}

type MarkdownNode = {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
};

function localTargets(markdown: string): string[] {
  const tree = fromMarkdown(markdown) as MarkdownNode;
  const definitions = new Map<string, string>();
  const collectDefinitions = (node: MarkdownNode): void => {
    if (
      node.type === "definition" &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, node.url);
    for (const child of node.children ?? []) collectDefinitions(child);
  };
  collectDefinitions(tree);

  const targets = new Set<string>();
  const collectTarget = (url: string | undefined): void => {
    if (!url?.startsWith("./")) return;
    const path = url.split(/[?#]/, 1)[0] as string;
    if (path.length > 2) targets.add(posix.normalize(path.slice(2)));
  };
  const walk = (node: MarkdownNode): void => {
    if (node.type === "link" || node.type === "image") collectTarget(node.url);
    if (
      (node.type === "linkReference" || node.type === "imageReference") &&
      node.identifier
    )
      collectTarget(definitions.get(node.identifier));
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return [...targets];
}

export async function validateReadmeLinks(
  snapshot: Snapshot,
  readmes: ReadonlyMap<string, Buffer>,
): Promise<void> {
  const projected = new Set(["README.md", "README.ko.md"]);
  for (const bytes of readmes.values()) {
    for (const target of localTargets(bytes.toString("utf8"))) {
      if (projected.has(target) || (await snapshot.exists(target))) continue;
      throw failure(
        "missing-readme-link",
        target,
        `Generated README links to a missing local repository path: ${target}.`,
      );
    }
  }
}
