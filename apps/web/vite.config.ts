import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// The repo root holds the single .env file shared with the server.
const envDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // Only VITE_* variables are exposed to the browser bundle.
  const env = loadEnv(mode, envDir, "VITE_");
  const target = env.VITE_DEV_SERVER_URL || "http://localhost:3001";
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      // Listen on the LAN so phones on the same Wi-Fi can join during development.
      host: true,
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: false },
        "/ws": { target: target.replace(/^http/, "ws"), ws: true },
      },
    },
    build: { target: "es2022", sourcemap: true },
  };
});
