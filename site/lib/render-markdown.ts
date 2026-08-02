import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  url?: string;
  alt?: string;
  identifier?: string;
  children?: MarkdownNode[];
};

export type MarkdownRenderOptions = {
  resolve_internal_link?: (href: string) => string;
};

type MarkdownRenderContext = {
  definitions: ReadonlyMap<string, string>;
  options: MarkdownRenderOptions;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hrefKind(href: string): "external" | "internal" | "unsafe" {
  if (href.length === 0 || /[\u0000-\u001f\\]/.test(href)) return "unsafe";
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:"
      ? "external"
      : "unsafe";
  } catch {
    if (href.startsWith("//")) return "unsafe";
    const path = href.split(/[?#]/, 1)[0] as string;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return "unsafe";
    }
    if (decoded.split("/").includes("..")) return "unsafe";
    return "internal";
  }
}

function renderChildren(
  node: MarkdownNode,
  context: MarkdownRenderContext,
): string {
  return (node.children ?? [])
    .map((child) => renderNode(child, context))
    .join("");
}

function renderLink(
  node: MarkdownNode,
  original: string,
  context: MarkdownRenderContext,
): string {
  const originalKind = hrefKind(original);
  if (originalKind === "unsafe") return renderChildren(node, context);
  const resolved =
    originalKind === "internal" && context.options.resolve_internal_link
      ? context.options.resolve_internal_link(original)
      : original;
  const resolvedKind = hrefKind(resolved);
  if (resolvedKind === "unsafe") return renderChildren(node, context);
  const attributes =
    resolvedKind === "external"
      ? ' target="_blank" rel="noopener noreferrer"'
      : "";
  return `<a href="${escapeHtml(resolved)}"${attributes}>${renderChildren(node, context)}</a>`;
}

function collectDefinitions(
  node: MarkdownNode,
  definitions: Map<string, string>,
): void {
  if (
    node.type === "definition" &&
    typeof node.identifier === "string" &&
    typeof node.url === "string" &&
    !definitions.has(node.identifier)
  ) {
    definitions.set(node.identifier, node.url);
  }
  for (const child of node.children ?? []) {
    collectDefinitions(child, definitions);
  }
}

function renderNode(
  node: MarkdownNode,
  context: MarkdownRenderContext,
): string {
  switch (node.type) {
    case "root":
      return renderChildren(node, context);
    case "text":
      return escapeHtml(node.value ?? "");
    case "paragraph":
      return `<p>${renderChildren(node, context)}</p>`;
    case "heading": {
      const depth = Math.min(6, Math.max(1, node.depth ?? 2));
      return `<h${depth}>${renderChildren(node, context)}</h${depth}>`;
    }
    case "emphasis":
      return `<em>${renderChildren(node, context)}</em>`;
    case "strong":
      return `<strong>${renderChildren(node, context)}</strong>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node, context)}</blockquote>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start =
        node.ordered && typeof node.start === "number" && node.start !== 1
          ? ` start="${node.start}"`
          : "";
      return `<${tag}${start}>${renderChildren(node, context)}</${tag}>`;
    }
    case "listItem":
      return `<li>${renderChildren(node, context)}</li>`;
    case "inlineCode":
      return `<code>${escapeHtml(node.value ?? "")}</code>`;
    case "code":
      return `<pre><code>${escapeHtml(node.value ?? "")}</code></pre>`;
    case "break":
      return "<br />";
    case "thematicBreak":
      return "<hr />";
    case "link":
      return renderLink(node, node.url ?? "", context);
    case "linkReference":
      return renderLink(
        node,
        context.definitions.get(node.identifier ?? "") ?? "",
        context,
      );
    case "html":
    case "image":
    case "imageReference":
    case "definition":
      return "";
    default:
      return renderChildren(node, context);
  }
}

export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): string {
  const root = fromMarkdown(markdown) as MarkdownNode;
  const definitions = new Map<string, string>();
  collectDefinitions(root, definitions);
  return renderNode(root, { definitions, options });
}
