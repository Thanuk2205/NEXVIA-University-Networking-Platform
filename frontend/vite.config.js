import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { canonicalLocalOrigin } from "./dev-origin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(
    mode,
    fileURLToPath(new URL("..", import.meta.url)),
    "CLIENT_ORIGIN",
  );
  const origin =
    process.env.CLIENT_ORIGIN || env.CLIENT_ORIGIN || "http://localhost:5173";
  return {
    plugins: [canonicalLocalOrigin(origin), react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": "http://localhost:5000",
      },
    },
  };
});
