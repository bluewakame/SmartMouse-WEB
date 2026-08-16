/**
 * 開発用のにせ Receiver。Windows PC が手元に無くても画面と通信を確認できる。
 *
 *     node scripts/mock-receiver.mjs
 *
 * WindowsReceiver/main.py と同じ振る舞いだけを真似ている。
 * - /ws に 32桁の合言葉が無ければ 1008 で切断
 * - 接続直後に receiver_ready を送る
 * - 受け取ったメッセージを標準出力に流す（実際のマウスは動かさない）
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8000);
const PROTOCOL_VERSION = "2";
const APP_VERSION = "0.4.1-mock";
const TOKEN = process.env.TOKEN ?? "0123456789abcdef0123456789abcdef";

const server = createServer((request, response) => {
  if (request.url?.startsWith("/health")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ status: "ready", version: APP_VERSION, protocol: PROTOCOL_VERSION }),
    );
    return;
  }
  response.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket, request) => {
  const token = new URL(request.url ?? "/", "http://localhost").searchParams.get("token") ?? "";
  if (token !== TOKEN) {
    console.log(`[mock] 合言葉が違うので切断: ${token || "(なし)"}`);
    socket.close(1008, "Pairing token required");
    return;
  }

  console.log("[mock] 接続されました");
  socket.send(JSON.stringify({ type: "receiver_ready", version: APP_VERSION, protocol: PROTOCOL_VERSION }));
  socket.on("message", (data) => console.log(`[mock] ${data}`));
  socket.on("close", () => console.log("[mock] 切断されました"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock] ws://localhost:${PORT}/ws?token=${TOKEN}`);
});
