import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    sveltekit({
      // Node server in the Docker image (node build): PORT, ORIGIN and the app variables come from the environment
      adapter: adapter(),
      // Absolute paths: the root Vitest run (pnpm coverage) starts from the repository root
      files: {
        src: fileURLToPath(new URL("src", import.meta.url)),
        assets: fileURLToPath(new URL("static", import.meta.url)),
        serviceWorker: fileURLToPath(new URL("src/service-worker", import.meta.url)),
      },
      // Strict Content Security Policy: hashes or nonces for SvelteKit's own scripts, nothing else
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self"],
          "img-src": ["self", "data:"],
          "connect-src": ["self"],
          // The service worker (src/service-worker.ts) and the manifest, from this app only
          "worker-src": ["self"],
          "manifest-src": ["self"],
          "object-src": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
          "frame-ancestors": ["none"],
        },
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
