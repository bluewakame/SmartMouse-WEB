import {
  MAX_MOVE_DELTA,
  MAX_SCROLL_AMOUNT,
  MAX_TEXT_LENGTH,
  REQUIRED_PROTOCOL,
  clamp,
  displayEndpoint,
  healthURL,
  normalizeWebSocketURL,
  pairingToken,
} from "./protocol";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "failed";

export interface ClientSnapshot {
  state: ConnectionState;
  /** state === "failed" のときの見出し。iOS版の ConnectionState.failed(message) 相当。 */
  failureTitle: string;
  recoveryHint: string;
  reconnectAttempt: number;
  latencyMilliseconds: number | null;
  receiverVersion: string;
  receiverProtocol: string;
  protocolCompatible: boolean;
  /** QRコードの読み取りが必要な状態。Receiver 再起動で合言葉が変わった場合も立つ。 */
  needsPairing: boolean;
}

const INITIAL: ClientSnapshot = {
  state: "disconnected",
  failureTitle: "",
  recoveryHint: "",
  reconnectAttempt: 0,
  latencyMilliseconds: null,
  receiverVersion: "",
  receiverProtocol: "",
  protocolCompatible: true,
  needsPairing: false,
};

export const stateLabel = (snapshot: ClientSnapshot): string => {
  switch (snapshot.state) {
    case "disconnected":
      return "未接続";
    case "connecting":
      return "接続中…";
    case "connected":
      return "接続済み";
    case "failed":
      return snapshot.failureTitle || "接続エラー";
  }
};

const MOVE_FLUSH_MS = 16;
const HEARTBEAT_MS = 10_000;

/**
 * Receiver との WebSocket 接続を管理する。iOS版 MouseWebSocketClient の移植。
 *
 * ブラウザの WebSocket には ping API が無いため、遅延計測だけ /health への
 * fetch に置き換えている。それ以外の状態遷移は iOS版と同じ考え方で揃えてある。
 */
export class MouseSocketClient {
  private snapshot: ClientSnapshot = INITIAL;
  private listeners = new Set<() => void>();

  private socket: WebSocket | null = null;
  private handshakeCompleted = false;
  private socketOpened = false;
  private pendingMoveX = 0;
  private pendingMoveY = 0;
  private moveFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastAddress: string | null = null;
  private shouldReconnect = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ClientSnapshot => this.snapshot;

  private update(patch: Partial<ClientSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  connect(address: string): void {
    this.clearReconnectTimer();
    this.shouldReconnect = true;
    this.lastAddress = address;
    this.update({ needsPairing: false, reconnectAttempt: 0 });
    this.beginConnection(address);
  }

  retryNow(): void {
    if (!this.lastAddress) return;
    this.clearReconnectTimer();
    this.beginConnection(this.lastAddress);
  }

  private beginConnection(address: string): void {
    this.cancelTransport();
    this.handshakeCompleted = false;
    this.socketOpened = false;

    const url = normalizeWebSocketURL(address);
    if (!url) {
      this.update({
        state: "failed",
        failureTitle: "接続先の形式が正しくありません",
        recoveryHint: "QRコードをもう一度読み取るか、設定のアドレスを確認してください。",
        needsPairing: true,
      });
      return;
    }

    // Receiver は起動ごとに変わる合言葉付きの URL しか受け付けない。
    // 合言葉が無いまま接続してもすぐ切断されるので、先に QR コードへ誘導する。
    if (pairingToken(url) === null) {
      this.update({
        state: "failed",
        failureTitle: "QRコードの読み取りが必要です",
        recoveryHint:
          "Windowsの画面に出ているQRコードを読み取ると、接続先と合言葉がまとめて設定されます。",
        needsPairing: true,
      });
      return;
    }

    // https で配信されたページからは ws:// を開けない（ブラウザの混在コンテンツ制限）。
    // 原因が分からないまま失敗し続けるので、接続を試す前に理由を出す。
    if (typeof location !== "undefined" && location.protocol === "https:" && url.protocol === "ws:") {
      this.update({
        state: "failed",
        failureTitle: "HTTPSページからは接続できません",
        recoveryHint:
          "このページを http:// で開き直してください。ブラウザはHTTPSのページから ws:// への接続を遮断します。",
        needsPairing: false,
      });
      return;
    }

    this.update({
      state: "connecting",
      failureTitle: "",
      recoveryHint:
        this.snapshot.reconnectAttempt > 0
          ? `自動で再接続しています（${this.snapshot.reconnectAttempt}回目）`
          : "",
    });

    let socket: WebSocket;
    try {
      socket = new WebSocket(url.toString());
    } catch {
      this.update({
        state: "failed",
        failureTitle: "接続を開始できませんでした",
        recoveryHint: "接続先のアドレスを確認して、QRコードを読み直してください。",
      });
      return;
    }

    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.socketOpened = true;
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (this.handshakeCompleted) return; // Receiver は現状ハンドシェイク以外を送ってこない。
      this.handleHandshake(socket, event.data);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.handleConnectionFailure(event.code);
    };
    socket.onerror = () => {
      // onerror の直後には必ず onclose が来るため、ここでは状態を触らない。
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.lastAddress = null;
    this.clearReconnectTimer();
    this.cancelTransport();
    this.snapshot = { ...INITIAL };
    this.listeners.forEach((listener) => listener());
  }

  private cancelTransport(): void {
    if (this.moveFlushTimer !== null) {
      clearTimeout(this.moveFlushTimer);
      this.moveFlushTimer = null;
    }
    this.stopHeartbeat();
    this.pendingMoveX = 0;
    this.pendingMoveY = 0;

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000);
      }
    }
  }

  private handleHandshake(socket: WebSocket, raw: unknown): void {
    let payload: Record<string, unknown> | null = null;
    if (typeof raw === "string") {
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    if (!payload || payload.type !== "receiver_ready") {
      this.closeWithoutReconnect(socket, {
        failureTitle: "Receiverを確認できません",
        recoveryHint: `${displayEndpoint(
          this.lastAddress,
        )}はSmartMouse Receiverとして応答しませんでした。最新版のReceiverが起動しているか確認してください。`,
      });
      return;
    }

    const version = typeof payload.version === "string" ? payload.version : "";
    const receiverProtocol = typeof payload.protocol === "string" ? payload.protocol : "不明";
    const compatible = receiverProtocol === REQUIRED_PROTOCOL;
    this.update({
      receiverVersion: version,
      receiverProtocol,
      protocolCompatible: compatible,
    });

    if (!compatible) {
      // 配布パッケージ名とコード側のバージョンは独立しているため、
      // 実際に受け取った値と接続先を出さないと切り分けができない。
      this.closeWithoutReconnect(socket, {
        failureTitle: "Receiverの更新が必要です",
        recoveryHint:
          `接続先 ${displayEndpoint(this.lastAddress)} のReceiver ` +
          `v${version || "不明"} は プロトコル ${receiverProtocol} を返しました。` +
          `このアプリはプロトコル ${REQUIRED_PROTOCOL} が必要です。`,
      });
      return;
    }

    this.handshakeCompleted = true;
    this.update({
      state: "connected",
      failureTitle: "",
      recoveryHint: "",
      reconnectAttempt: 0,
      needsPairing: false,
    });
    this.startHeartbeat();
  }

  private closeWithoutReconnect(
    socket: WebSocket,
    patch: { failureTitle: string; recoveryHint: string },
  ): void {
    socket.onclose = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.close(1000);
    this.socket = null;
    this.update({ state: "failed", ...patch });
  }

  private handleConnectionFailure(closeCode: number): void {
    const openedBeforeClose = this.socketOpened;
    const failedBeforeHandshake = !this.handshakeCompleted;
    this.socket = null;
    this.stopHeartbeat();
    this.update({ latencyMilliseconds: null });

    // Receiver は合言葉が違うと WebSocket を開いた直後に 1008 で閉じる。
    // ブラウザによっては 1006 に丸められるため「開けたのにハンドシェイク前に閉じた」も同じ扱いにする。
    // 同じ合言葉で再試行しても通らないので、再接続せず QR コードへ誘導する。
    if (closeCode === 1008 || (failedBeforeHandshake && openedBeforeClose)) {
      this.update({
        state: "failed",
        failureTitle: "接続の許可が切れています",
        recoveryHint:
          "Receiverを起動し直すとQRコードが変わります。Windows画面の新しいQRコードを読み取ってください。",
        needsPairing: true,
      });
      return;
    }

    const details = failedBeforeHandshake
      ? {
          title: "Windows受信機が見つかりません",
          hint: "PCでSmartMouseReceiver.exeが起動中か、QRコードが最新か、同じWi‑Fiにいるか確認してください。",
        }
      : {
          title: "PCとの接続が切れました",
          hint: "同じWi‑Fi内なら自動的に再接続します。",
        };
    this.update({ state: "failed", failureTitle: details.title, recoveryHint: details.hint });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.lastAddress || this.reconnectTimer !== null) return;
    const attempt = this.snapshot.reconnectAttempt + 1;
    this.update({ reconnectAttempt: attempt });
    const delay = Math.min(15, 2 ** Math.min(attempt - 1, 4)) * 1000;
    const address = this.lastAddress;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.beginConnection(address);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * ブラウザの WebSocket は ping を送れないため、/health の応答時間を遅延として表示する。
   * CORS ヘッダーの無い Receiver でも計測できるよう no-cors で投げ、結果の中身は見ない。
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (typeof fetch !== "function" || !this.lastAddress) return;
    const url = normalizeWebSocketURL(this.lastAddress);
    if (!url) return;
    const endpoint = healthURL(url);

    const measure = async () => {
      const startedAt = performance.now();
      try {
        await fetch(endpoint, { mode: "no-cors", cache: "no-store" });
        if (this.snapshot.state !== "connected") return;
        this.update({
          latencyMilliseconds: Math.max(1, Math.round(performance.now() - startedAt)),
        });
      } catch {
        // 遅延が測れないだけでは接続断とみなさない。切断は onclose で検知する。
        this.update({ latencyMilliseconds: null });
      }
    };

    void measure();
    this.heartbeatTimer = setInterval(() => void measure(), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // MARK: - 送信

  sendMove(dx: number, dy: number): void {
    this.pendingMoveX += dx;
    this.pendingMoveY += dy;
    if (this.moveFlushTimer !== null) return;
    this.moveFlushTimer = setTimeout(() => {
      this.moveFlushTimer = null;
      this.flushPendingMove();
    }, MOVE_FLUSH_MS);
  }

  private flushPendingMove(): void {
    if (this.moveFlushTimer !== null) {
      clearTimeout(this.moveFlushTimer);
      this.moveFlushTimer = null;
    }
    const dx = Math.round(this.pendingMoveX);
    const dy = Math.round(this.pendingMoveY);
    this.pendingMoveX -= dx;
    this.pendingMoveY -= dy;
    if (dx === 0 && dy === 0) return;
    this.send({
      type: "move",
      dx: clamp(dx, -MAX_MOVE_DELTA, MAX_MOVE_DELTA),
      dy: clamp(dy, -MAX_MOVE_DELTA, MAX_MOVE_DELTA),
    });
  }

  sendClick(): void {
    this.send({ type: "click", button: "left" });
  }

  sendRightClick(): void {
    this.send({ type: "click", button: "right" });
  }

  sendDoubleClick(): void {
    this.send({ type: "double_click" });
  }

  sendMouseDown(): void {
    this.flushPendingMove();
    this.send({ type: "mouse_down", button: "left" });
  }

  sendMouseUp(): void {
    this.flushPendingMove();
    this.send({ type: "mouse_up", button: "left" });
  }

  sendShortcut(shortcut: "copy" | "paste"): void {
    this.send({ type: "shortcut", shortcut });
  }

  sendText(text: string, pressEnter = false): void {
    if (!text) return;
    this.send({
      type: pressEnter ? "paste_enter_text" : "paste_text",
      text: text.slice(0, MAX_TEXT_LENGTH),
    });
  }

  sendBackspace(): void {
    this.send({ type: "key", key: "backspace" });
  }

  sendEnter(): void {
    this.send({ type: "key", key: "enter" });
  }

  sendReleaseAll(): void {
    this.flushPendingMove();
    this.send({ type: "release_all" });
  }

  sendScroll(amount: number): void {
    this.send({ type: "scroll", amount: clamp(amount, -MAX_SCROLL_AMOUNT, MAX_SCROLL_AMOUNT) });
  }

  private send(payload: Record<string, unknown>): void {
    const socket = this.socket;
    if (this.snapshot.state !== "connected" || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // 送信中に切れた場合は onclose 側で状態を作り直す。
    }
  }
}
