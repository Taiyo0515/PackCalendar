import { execFileSync } from "node:child_process";
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-sw.mjs"],
])
  execFileSync(process.execPath, args, { stdio: "inherit" });
