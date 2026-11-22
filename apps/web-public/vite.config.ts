import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    sveltekit({
      // Node server in the Docker image (node build), configured by environment variables
      adapter: adapter({ envPrefix: "WISHLIST_" }),
      // Absolute paths: the root Vitest run (pnpm coverage) starts from the repository root
      files: {
        src: fileURLToPath(new URL("src", import.meta.url)),
        assets: fileURLToPath(new URL("static", import.meta.url)),
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
