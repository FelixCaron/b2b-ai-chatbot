import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        widget: resolve(__dirname, "src/main.js")
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === "widget" ? "widget.iife.js" : "assets/[name]-[hash].js";
        }
      }
    }
  }
});
