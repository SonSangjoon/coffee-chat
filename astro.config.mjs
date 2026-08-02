import { defineConfig } from "astro/config";

export default defineConfig({
  srcDir: "./site",
  outDir: "./dist/site",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
