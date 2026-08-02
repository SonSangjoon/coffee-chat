import { posix } from "node:path";
import type {
  InstanceSiteModel,
  SiteModel,
  SiteNote,
} from "./load-site-model.ts";
import { siteHref } from "./build-context.ts";

export function instanceGraph(model: SiteModel): InstanceSiteModel {
  if (model.role !== "instance")
    throw new Error("This route is available only in a Coffee Chat instance.");
  return model.graph;
}

export function noteHref(basePath: string, id: string): string {
  return siteHref(basePath, `notes/${id}/`);
}

export function entityHref(basePath: string, id: string): string {
  return siteHref(basePath, `entities/${id}/`);
}

export function sourceHref(basePath: string, slug: string): string {
  return siteHref(basePath, `sources/${slug}/`);
}

export function resolveNoteMarkdownLink(
  href: string,
  graph: InstanceSiteModel,
): string {
  const [pathAndQuery, fragment] = href.split("#", 2);
  const path = (pathAndQuery ?? "").split("?", 1)[0] ?? "";
  if (path === "") return fragment ? `#${fragment}` : "#";
  const filename = posix.basename(path, ".md");
  const note = graph.notes.find((value) => value.id === filename);
  if (!note) return href;
  const target = noteHref(graph.base_path, note.id);
  return fragment ? `${target}#${encodeURIComponent(fragment)}` : target;
}

export function noteById(notes: SiteNote[], id: string): SiteNote | undefined {
  return notes.find((note) => note.id === id);
}

export function displayDate(value: string | undefined): string {
  return value ?? "Unknown / 알 수 없음";
}
