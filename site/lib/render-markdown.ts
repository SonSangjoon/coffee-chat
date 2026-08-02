import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  url?: string;
  alt?: string;
  children?: MarkdownNode[];
};

export type MarkdownRenderOptions = {
  resolve_internal_link?: (href: string) => string;
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
  options: MarkdownRenderOptions,
): string {
  return (node.children ?? [])
    .map((child) => renderNode(child, options))
    .join("");
}

function renderNode(
  node: MarkdownNode,
  options: MarkdownRenderOptions,
): string {
  switch (node.type) {
    case "root":
      return renderChildren(node, options);
    case "text":
      return escapeHtml(node.value ?? "");
    case "paragraph":
      return `<p>${renderChildren(node, options)}</p>`;
    case "heading": {
      const depth = Math.min(6, Math.max(1, node.depth ?? 2));
      return `<h${depth}>${renderChildren(node, options)}</h${depth}>`;
    }
    case "emphasis":
      return `<em>${renderChildren(node, options)}</em>`;
    case "strong":
      return `<strong>${renderChildren(node, options)}</strong>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node, options)}</blockquote>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start =
        node.ordered && typeof node.start === "number" && node.start !== 1
          ? ` start="${node.start}"`
          : "";
      return `<${tag}${start}>${renderChildren(node, options)}</${tag}>`;
    }
    case "listItem":
      return `<li>${renderChildren(node, options)}</li>`;
    case "inlineCode":
      return `<code>${escapeHtml(node.value ?? "")}</code>`;
    case "code":
      return `<pre><code>${escapeHtml(node.value ?? "")}</code></pre>`;
    case "break":
      return "<br />";
    case "thematicBreak":
      return "<hr />";
    case "link": {
      const original = node.url ?? "";
      const originalKind = hrefKind(original);
      if (originalKind === "unsafe") return renderChildren(node, options);
      const resolved =
        originalKind === "internal" && options.resolve_internal_link
          ? options.resolve_internal_link(original)
          : original;
      const resolvedKind = hrefKind(resolved);
      if (resolvedKind === "unsafe") return renderChildren(node, options);
      const attributes =
        resolvedKind === "external"
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
      return `<a href="${escapeHtml(resolved)}"${attributes}>${renderChildren(node, options)}</a>`;
    }
    case "html":
    case "image":
    case "imageReference":
    case "definition":
      return "";
    default:
      return renderChildren(node, options);
  }
}

export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): string {
  return renderNode(fromMarkdown(markdown) as MarkdownNode, options);
}
