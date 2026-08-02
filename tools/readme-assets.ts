import { posix } from "node:path";
import { ValidationFailure, repositoryPath } from "./contracts.ts";
import type { Snapshot } from "./snapshot.ts";

export const README_ASSET_PATHS = [
  "docs/assets/readme/coffee-chat-cover.png",
  "docs/assets/readme/coffee-chat-flow.en.svg",
  "docs/assets/readme/coffee-chat-flow.ko.svg",
  "docs/assets/readme/coffee-chat-trust.en.svg",
  "docs/assets/readme/coffee-chat-trust.ko.svg",
] as const;

const COVER_PATH = README_ASSET_PATHS[0];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_COVER_BYTES = 1024 * 1024;

type SvgPair = {
  english: (typeof README_ASSET_PATHS)[number];
  korean: (typeof README_ASSET_PATHS)[number];
  viewBox: string;
  slots: readonly string[];
};

const SVG_PAIRS: readonly SvgPair[] = [
  {
    english: "docs/assets/readme/coffee-chat-flow.en.svg",
    korean: "docs/assets/readme/coffee-chat-flow.ko.svg",
    viewBox: "0 0 960 720",
    slots: [
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
    ],
  },
  {
    english: "docs/assets/readme/coffee-chat-trust.en.svg",
    korean: "docs/assets/readme/coffee-chat-trust.ko.svg",
    viewBox: "0 0 1200 600",
    slots: ["authored", "sourced", "inferred", "unknown"],
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

function unsafeSvg(svg: string): boolean {
  return [
    /<\s*\/?\s*(?:script|image|foreignobject|animate|set)\b/i,
    /\bon[a-z][\w:.-]*\s*=/i,
    /\b(?:href|xlink:href)\s*=/i,
    /url\s*\(/i,
    /<\s*\/?\s*(?:lineargradient|radialgradient)\b/i,
  ].some((pattern) => pattern.test(svg));
}

function viewBox(svg: string): string | undefined {
  return /\bviewBox\s*=\s*["']([^"']+)["']/.exec(svg)?.[1];
}

function semanticSlots(svg: string): string[] {
  return [...svg.matchAll(/\bdata-slot="([^"]+)"/g)].map(
    (match) => match[1] as string,
  );
}

function structuralFingerprint(svg: string): string {
  return svg
    .replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/gi, "$1$2")
    .replace(/(<desc\b[^>]*>)[\s\S]*?(<\/desc>)/gi, "$1$2")
    .replace(/(<text\b[^>]*>)[\s\S]*?(<\/text>)/gi, "$1$2");
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
  const cover = await readRequired(snapshot, COVER_PATH);
  let dimensions: { width: number; height: number };
  try {
    dimensions = readPngDimensions(cover);
  } catch {
    throw failure(
      "invalid-readme-cover",
      COVER_PATH,
      "README cover must be a valid PNG with an IHDR chunk.",
    );
  }
  if (
    dimensions.width !== 1280 ||
    dimensions.height !== 640 ||
    cover.byteLength >= MAX_COVER_BYTES
  )
    throw failure(
      "invalid-readme-cover",
      COVER_PATH,
      "README cover must be 1280 x 640 and smaller than 1 MiB.",
    );

  for (const pair of SVG_PAIRS) {
    const [englishBytes, koreanBytes] = await Promise.all([
      readRequired(snapshot, pair.english),
      readRequired(snapshot, pair.korean),
    ]);
    const english = englishBytes.toString("utf8");
    const korean = koreanBytes.toString("utf8");
    for (const [path, svg] of [
      [pair.english, english],
      [pair.korean, korean],
    ] as const) {
      if (unsafeSvg(svg))
        throw failure(
          "unsafe-readme-asset",
          path,
          "README SVG contains unsafe or externally resolved markup.",
        );
      if (
        viewBox(svg) !== pair.viewBox ||
        semanticSlots(svg).join("\0") !== pair.slots.join("\0")
      )
        throw failure(
          "readme-asset-locale-drift",
          path,
          "README SVG viewBox or semantic label order differs from its contract.",
        );
    }
    if (structuralFingerprint(english) !== structuralFingerprint(korean))
      throw failure(
        "readme-asset-locale-drift",
        pair.korean,
        "Localized README SVG geometry or color roles have drifted.",
      );
  }
}

function localTargets(markdown: string): string[] {
  const targets: string[] = [];
  for (const match of markdown.matchAll(
    /!?\[[^\]]*\]\((\.\/[^)\s]+)[^)]*\)/g,
  )) {
    const raw = (match[1] as string).replace(/^<|>$/g, "");
    const path = raw.split(/[?#]/, 1)[0] as string;
    if (path.length > 2) targets.push(posix.normalize(path.slice(2)));
  }
  return targets;
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
        "missing-readme-asset",
        target,
        "Generated README links to a missing local repository path.",
      );
    }
  }
}
