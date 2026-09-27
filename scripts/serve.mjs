import { createServer } from "vite";
const server = await createServer({
  server: { host: "127.0.0.1", port: 4173 },
});
await server.listen();
server.printUrls();
