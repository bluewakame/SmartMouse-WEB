import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MouseSocketClient } from "../src/lib/MouseSocketClient";

const TOKEN = "b".repeat(32);
const ADDRESS = `ws://192.168.1.2:8000/ws?token=${TOKEN}`;

/** Receiver の代わりに使う最小限の WebSocket。 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  // --- テストから状態を進めるための操作 ---

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  handshake(payload: Record<string, unknown> = { type: "receiver_ready", version: "0.4.1", protocol: "2" }): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverClose(code: number): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  static latest(): MockWebSocket {
    const socket = MockWebSocket.instances.at(-1);
    if (!socket) throw new Error("WebSocket が作られていません");
    return socket;
  }
}

function connectedClient(): { client: MouseSocketClient; socket: MockWebSocket } {
  const client = new MouseSocketClient();
  client.connect(ADDRESS);
  const socket = MockWebSocket.latest();
  socket.open();
  socket.handshake();
  return { client, socket };
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  // 遅延計測は実ネットワークを叩かせない。
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("接続の状態遷移", () => {
  it("合言葉が無いアドレスでは接続を試さず、QR読み取りを促す", () => {
    const client = new MouseSocketClient();
    client.connect("ws://192.168.1.2:8000/ws");

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(client.getSnapshot().state).toBe("failed");
    expect(client.getSnapshot().needsPairing).toBe(true);
  });

  it("receiver_ready を受け取ると接続済みになる", () => {
    const { client } = connectedClient();
    const snapshot = client.getSnapshot();

    expect(snapshot.state).toBe("connected");
    expect(snapshot.receiverVersion).toBe("0.4.1");
    expect(snapshot.receiverProtocol).toBe("2");
    expect(snapshot.protocolCompatible).toBe(true);
    expect(snapshot.needsPairing).toBe(false);
  });

  it("プロトコルが違う Receiver には繋がず、更新を促す", () => {
    const client = new MouseSocketClient();
    client.connect(ADDRESS);
    const socket = MockWebSocket.latest();
    socket.open();
    socket.handshake({ type: "receiver_ready", version: "0.3.0", protocol: "1" });

    const snapshot = client.getSnapshot();
    expect(snapshot.state).toBe("failed");
    expect(snapshot.protocolCompatible).toBe(false);
    expect(snapshot.recoveryHint).toContain("プロトコル 1");
    // 再接続しても同じ結果になるため、待っても繋ぎ直さない。
    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("SmartMouse 以外のサーバーに繋がったら切断する", () => {
    const client = new MouseSocketClient();
    client.connect(ADDRESS);
    const socket = MockWebSocket.latest();
    socket.open();
    socket.handshake({ hello: "world" });

    expect(client.getSnapshot().state).toBe("failed");
    expect(client.getSnapshot().recoveryHint).toContain("SmartMouse Receiver");
  });

  it("合言葉切れ（1008）では再接続せず、QR読み取りを促す", () => {
    const client = new MouseSocketClient();
    client.connect(ADDRESS);
    const socket = MockWebSocket.latest();
    socket.open();
    socket.serverClose(1008);

    expect(client.getSnapshot().needsPairing).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("開けたのにハンドシェイク前に切られた場合も合言葉切れとして扱う", () => {
    const client = new MouseSocketClient();
    client.connect(ADDRESS);
    const socket = MockWebSocket.latest();
    socket.open();
    socket.serverClose(1006);

    expect(client.getSnapshot().needsPairing).toBe(true);
  });

  it("接続後に切れたら指数バックオフで繋ぎ直す", () => {
    const { socket } = connectedClient();
    socket.serverClose(1006);

    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000); // 1回目は1秒後
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.latest().serverClose(1006);
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2); // 2回目は2秒後
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("PCへ届く前に失敗したときは受信機が見つからない案内を出す", () => {
    const client = new MouseSocketClient();
    client.connect(ADDRESS);
    MockWebSocket.latest().serverClose(1006);

    expect(client.getSnapshot().failureTitle).toBe("Windows受信機が見つかりません");
    expect(client.getSnapshot().needsPairing).toBe(false);
  });

  it("切断すると再接続もしない", () => {
    const { client, socket } = connectedClient();
    client.disconnect();
    socket.serverClose(1006);

    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(client.getSnapshot().state).toBe("disconnected");
  });
});

describe("送信メッセージ", () => {
  it("未接続では何も送らない", () => {
    const client = new MouseSocketClient();
    client.connect(ADDRESS);
    const socket = MockWebSocket.latest();
    client.sendClick();

    expect(socket.sent).toHaveLength(0);
  });

  it("移動はまとめて整数値で送り、上限で頭打ちにする", () => {
    const { client, socket } = connectedClient();
    client.sendMove(3.4, -2.2);
    client.sendMove(2.1, -1.1);
    vi.advanceTimersByTime(16);

    expect(JSON.parse(socket.sent[0])).toEqual({ type: "move", dx: 6, dy: -3 });

    client.sendMove(500, -500);
    vi.advanceTimersByTime(16);
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "move", dx: 100, dy: -100 });
  });

  it("1px に満たない動きは捨てずに次へ持ち越す", () => {
    const { client, socket } = connectedClient();
    client.sendMove(0.4, 0);
    vi.advanceTimersByTime(16);
    expect(socket.sent).toHaveLength(0); // 0px は送らない

    client.sendMove(0.4, 0);
    vi.advanceTimersByTime(16);
    expect(socket.sent.map((raw) => JSON.parse(raw).dx)).toEqual([1]);
  });

  it("クリックとショートカットは Receiver の仕様どおりの形で送る", () => {
    const { client, socket } = connectedClient();
    client.sendClick();
    client.sendRightClick();
    client.sendDoubleClick();
    client.sendShortcut("copy");
    client.sendReleaseAll();

    expect(socket.sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: "click", button: "left" },
      { type: "click", button: "right" },
      { type: "double_click" },
      { type: "shortcut", shortcut: "copy" },
      { type: "release_all" },
    ]);
  });

  it("文字入力は貼り付け方式で送り、長すぎる文字列は切り詰める", () => {
    const { client, socket } = connectedClient();
    client.sendText("こんにちは", true);
    client.sendText("x".repeat(6000));

    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "paste_enter_text",
      text: "こんにちは",
    });
    expect(JSON.parse(socket.sent[1]).text).toHaveLength(5000);
  });

  it("スクロール量は Receiver の上限に収める", () => {
    const { client, socket } = connectedClient();
    client.sendScroll(120);
    client.sendScroll(-120);

    expect(socket.sent.map((raw) => JSON.parse(raw).amount)).toEqual([30, -30]);
  });

  it("押しっぱなしの解除前に、溜めていた移動を吐き出す", () => {
    const { client, socket } = connectedClient();
    client.sendMove(10, 10);
    client.sendMouseUp();

    expect(socket.sent.map((raw) => JSON.parse(raw).type)).toEqual(["move", "mouse_up"]);
  });
});
