import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, "src/devtools/devtools.html"),
        panel: resolve(__dirname, "src/panel/panel.html")
      }
    }
  }
});