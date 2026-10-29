const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code === "ENOENT" ? "Not found" : "Unable to read file");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  });
});

const websocketServer = new WebSocketServer({ server, maxPayload: 2048, perMessageDeflate: false });
const rooms = new Map();
const colors = ["#75c9ff", "#ffbd59", "#cb89ff", "#ff735d", "#f5f5ed", "#8bf0d4"];

function broadcastRoom(room) {
  const players = [...(rooms.get(room) || [])]
    .filter((client) => client.readyState === WebSocket.OPEN)
    .map((client) => client.player);
  const payload = JSON.stringify({ type: "players", players });
  for (const client of rooms.get(room) || []) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

websocketServer.on("connection", (socket) => {
  socket.lastMessageAt = 0;
  socket.on("message", (raw) => {
    const now = Date.now();
    if (now - socket.lastMessageAt < 25) return;
    socket.lastMessageAt = now;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.type === "join") {
      if (socket.room) return;
      const room = typeof message.room === "string" ? message.room.replace(/[^A-Z0-9-]/g, "").slice(0, 12) : "";
      const id = typeof message.id === "string" ? message.id.slice(0, 64) : "";
      if (!room || !id) return;
      socket.room = room;
      socket.player = {
        id,
        name: typeof message.name === "string" ? message.name.replace(/[<>]/g, "").slice(0, 16) : "RACER",
        color: colors[Math.floor(Math.random() * colors.length)],
        x: 0,
        z: 0,
        yaw: 0,
        progress: 0,
        lap: 1,
      };
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(socket);
      broadcastRoom(room);
      return;
    }
    if (message.type !== "state" || !socket.room || !socket.player) return;
    const { x, z, yaw, progress, lap } = message;
    if (![x, z, yaw, progress, lap].every(Number.isFinite)) return;
    socket.player.x = Math.max(-180, Math.min(180, x));
    socket.player.z = Math.max(-140, Math.min(140, z));
    socket.player.yaw = Math.max(-Math.PI * 4, Math.min(Math.PI * 4, yaw));
    socket.player.progress = Math.max(0, Math.min(1, progress));
    socket.player.lap = Math.max(1, Math.min(4, Math.floor(lap)));
    if (typeof message.name === "string") socket.player.name = message.name.replace(/[<>]/g, "").slice(0, 16);
    broadcastRoom(socket.room);
  });
  socket.on("close", () => {
    if (!socket.room) return;
    const room = rooms.get(socket.room);
    if (!room) return;
    room.delete(socket);
    if (room.size === 0) rooms.delete(socket.room);
    else broadcastRoom(socket.room);
  });
});

server.listen(port, () => {
  console.log(`Neon Circuit is ready at http://localhost:${port}`);
});
