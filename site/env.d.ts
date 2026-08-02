/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly COFFEE_CHAT_SITE_MODEL_JSON: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
