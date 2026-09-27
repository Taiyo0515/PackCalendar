import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const port = Number(process.env.PORT || 4176),
  root = path.resolve("dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(
      new URL(req.url, `http://127.0.0.1:${port}`).pathname,
    ).replace(/^\/PackCalendar(?=\/)/, "");
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`PackCalendar build: http://127.0.0.1:${port}/PackCalendar/`),
);
