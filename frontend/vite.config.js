import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single-origin dev setup: the Vite dev server proxies /api to the FastAPI
// backend, so auth cookies stay same-origin (no CORS needed).
const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
