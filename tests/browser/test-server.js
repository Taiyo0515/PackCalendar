import http from "node:http";
import { readFile } from "node:fs/promises";
// A private origin per test can be stopped without disturbing other tests or the user's server.
export async function startTestServer() {
  const root = new URL("../../", import.meta.url);
  const files = new Set([
    "index.html",
    "src/app.js",
    "src/core.js",
    "src/storage.js",
    "src/ui.js",
    "src/styles.css",
    "sw.js",
    "manifest.webmanifest",
    "assets/icon.svg",
    "assets/icon-192.png",
    "assets/icon-512.png",
  ]);
  const server = http.createServer(async (req, res) => {
    const pathname =
      new URL(req.url, "http://test").pathname.slice(1) || "index.html";
    if (!files.has(pathname)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const data = await readFile(new URL(pathname, root));
      const type = pathname.endsWith(".js")
        ? "text/javascript"
        : pathname.endsWith(".css")
          ? "text/css"
          : pathname.endsWith(".png")
            ? "image/png"
            : pathname.endsWith(".svg")
              ? "image/svg+xml"
              : pathname.endsWith(".webmanifest")
                ? "application/manifest+json"
                : "text/html";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let stopped = false;
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
