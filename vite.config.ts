import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "huallet-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<!-- CSP -->",
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      globalthis: fileURLToPath(new URL("./src/lib/shims/globalthis.cjs", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
  },
} as Parameters<typeof defineConfig>[0]);
