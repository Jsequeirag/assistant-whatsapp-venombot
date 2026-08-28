import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, path.resolve(here, "../be"), ""),
    ...loadEnv(mode, here, ""),
  };
  const token = (env.ARIA_API_TOKEN || "").trim();
  const apiProxy = {
    target: "http://localhost:3000",
    ...(token ? { headers: { "X-Aria-Token": token } } : {}),
  };
  return {
    plugins: [react()],
    server: { proxy: { "/api": apiProxy } },
    preview: { proxy: { "/api": apiProxy } },
  };
});
