import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../site/lib/render-markdown.ts";

describe("reference-style Markdown links", () => {
  it("applies the inline-link safety boundary while keeping images blocked", () => {
    const markdown = [
      "[external][source]",
      "",
      "[internal][note]",
      "",
      "[unsafe][script]",
      "",
      "![blocked image][image]",
      "",
      "[source]: https://external.example/path",
      "[note]: ./123e4567-e89b-42d3-a456-426614174000.md",
      "[script]: javascript:alert('x')",
      "[image]: https://remote.example/image.png",
    ].join("\n");

    const html = renderMarkdown(markdown, {
      resolve_internal_link: (href) =>
        href.endsWith(".md") ? "/coffee-chat/notes/example/" : href,
    });

    expect(html).toContain(
      '<a href="https://external.example/path" target="_blank" rel="noopener noreferrer">external</a>',
    );
    expect(html).toContain(
      '<a href="/coffee-chat/notes/example/">internal</a>',
    );
    expect(html).toContain("<p>unsafe</p>");
    expect(html).not.toMatch(/<(?:img|script)\b/i);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("remote.example");
  });
});
