import { defineConfig } from "vite";

console.log("[vite.config] loaded, setting port 1420");

export default defineConfig({
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
    },
  },
});
