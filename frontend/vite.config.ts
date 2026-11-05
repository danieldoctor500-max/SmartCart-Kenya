
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    process.env.VITE_API_PROXY_TARGET ??
    fileEnv.VITE_API_PROXY_TARGET ??
    "http://localhost:3000";

  if (mode === "browser-test" && apiProxyTarget !== "http://localhost:3001") {
    throw new Error(
      "Browser-test mode requires VITE_API_PROXY_TARGET=http://localhost:3001.",
    );
  }

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      globals: true,
    },
  };
});
