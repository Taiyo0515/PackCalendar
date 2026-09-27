import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
const release = path.resolve("release");
const expected = [
  ".nojekyll",
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "src/app.js",
  "src/core.js",
  "src/storage.js",
  "src/ui.js",
  "src/styles.css",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "README.md",
];
const files = await readdir(release, { recursive: true, withFileTypes: true });
const actual = files
  .filter((f) => f.isFile())
  .map((f) =>
    path
      .relative(release, path.join(f.parentPath, f.name))
      .replaceAll("\\", "/"),
  )
  .filter((file) => file !== ".git" && !file.startsWith(".git/"))
  .sort();
assert.deepEqual(actual, [...expected].sort());
for (const file of expected) {
  const original = await readFile(
      file === "README.md" ? "PAGES-README.md" : file,
    ),
    copy = await readFile(path.join(release, file));
  assert.equal(
    createHash("sha256").update(original).digest("hex"),
    createHash("sha256").update(copy).digest("hex"),
    file,
  );
}
const manifest = JSON.parse(
  await readFile(path.join(release, "manifest.webmanifest"), "utf8"),
);
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
for (const i of manifest.icons)
  assert(expected.includes(i.src.replace(/^\.\//, "")));
for (const file of ["index.html", "src/app.js", "src/styles.css"])
  assert(
    !/https?:\/\//.test(await readFile(path.join(release, file), "utf8")),
    `Unexpected external URL in ${file}`,
  );
console.log(
  `PASS: ${expected.length} release files match source; no development files, external runtime URLs, or missing manifest icons.`,
);
