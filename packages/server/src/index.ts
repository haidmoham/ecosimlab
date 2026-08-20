import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { parseClientMessage } from "./validation.js";
import { WorldServer } from "./world-server.js";

const port = Number(process.env.PORT ?? 3001);
const databasePath = process.env.ECOSYSTEM_DB ?? "./data/ecosystem.sqlite";
mkdirSync(dirname(databasePath), { recursive: true });
const app = Fastify({ logger: true });
const simulation = new WorldServer({ snapshotPath: databasePath, snapshotIntervalMs: 30_000 });
await app.register(websocket);

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../../web/dist");
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
}

app.get("/health", async () => ({ ok: true, tick: simulation.world.tick }));
app.get("/ws", { websocket: true }, (socket) => {
  simulation.connect(socket);
  socket.on("message", (buffer: Buffer) => {
    try {
      const message = parseClientMessage(JSON.parse(buffer.toString()));
      if (!message) socket.send(JSON.stringify({ type: "error", code: "invalid_message", message: "Message does not match the protocol." }));
      else simulation.command(socket, message);
    } catch { socket.send(JSON.stringify({ type: "error", code: "invalid_json", message: "Messages must be JSON." })); }
  });
  socket.on("close", () => simulation.disconnect(socket));
});
simulation.start();
const shutdown = async () => { simulation.stop(); await app.close(); };
process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
await app.listen({ port, host: "0.0.0.0" });
