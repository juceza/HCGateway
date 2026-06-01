/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Flask dev server the SPA proxies `/api/*` to. Same-origin in prod (no CORS);
// in dev the proxy keeps requests same-origin so the auth/Bearer flow behaves
// identically. Override with VITE_API_PROXY_TARGET when Flask runs elsewhere.
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET ?? "http://localhost:6644";

export default defineConfig({
  plugins: [
    // The router plugin MUST run before the React plugin.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.test\\.tsx?$",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      // Scope coverage to testable logic. Routes/entrypoints are scaffolding
      // verified by the build + dev smoke, not unit tests; later tasks add
      // their own `lib/` modules under this same gate.
      include: ["src/lib/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
