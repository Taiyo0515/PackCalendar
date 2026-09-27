import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
export default defineConfig({
  base: "./",
  plugins: [react()],
  publicDir: "public",
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: "127.0.0.1", port: 4173 },
  build: { target: "es2022", outDir: "dist", sourcemap: false },
});
