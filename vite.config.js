import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

console.log("[vite.config] loaded, setting port 1420, with Svelte 5");

export default defineConfig({
  plugins: [svelte()],
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
