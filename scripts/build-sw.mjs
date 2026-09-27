import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = (await readdir("dist", { recursive: true, withFileTypes: true }))
  .filter((e) => e.isFile())
  .map((e) =>
    `${e.parentPath}/${e.name}`.replaceAll("\\", "/").replace(/^.*?dist\//, ""),
  )
  .filter((f) => !["sw.js", ".nojekyll"].includes(f))
  .sort();
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(`dist/${file}`));
const source = await readFile("src/platform/service-worker.js", "utf8");
await writeFile(
  "dist/sw.js",
  `const BUILD = '${hash.digest("hex").slice(0, 12)}';\nconst PRECACHE = ${JSON.stringify(["./", ...files.map((f) => `./${f}`)])};\n${source}`,
);
await writeFile("dist/.nojekyll", "");
console.log(`Service Worker: ${files.length} files cached.`);
