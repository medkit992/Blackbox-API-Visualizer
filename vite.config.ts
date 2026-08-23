import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(import.meta.dirname, "src/devtools/devtools.html"),
        panel: resolve(import.meta.dirname, "src/panel/panel.html")
      }
    }
  }
});
