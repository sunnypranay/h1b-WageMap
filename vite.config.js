import { defineConfig } from "vite";

export default defineConfig({
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
