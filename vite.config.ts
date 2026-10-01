import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // 4. phone spike (docs/MOBILE.md): `tailscale serve` reaches this dev server; Ollama is same-origin under /ollama.
    // Origin is dropped because Ollama refuses origins it doesn't know.
    allowedHosts: [".ts.net"],
    proxy: {
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (p: string) => p.replace(/^\/ollama/, ""),
        configure: (proxy: any) => proxy.on("proxyReq", (req: any) => req.removeHeader("origin")),
      },
    },
  },
}));
