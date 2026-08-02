import type { SiteModel } from "./load-site-model.ts";

function loadInjectedModel(): SiteModel {
  const serialized = import.meta.env.COFFEE_CHAT_SITE_MODEL_JSON;
  if (!serialized)
    throw new Error(
      "Coffee Chat Pages must be built through the bound site-build entry point.",
    );
  return JSON.parse(serialized) as SiteModel;
}

export const siteModel = loadInjectedModel();

export function siteData() {
  return siteModel.role === "engine"
    ? siteModel.documentation
    : siteModel.graph;
}
