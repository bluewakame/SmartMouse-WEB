/**
 * Windows Receiver と共有する通信仕様。
 * WindowsReceiver/receiver_protocol.py と iOS版 MouseWebSocketClient.swift の移植で、
 * Receiver 側は一切変更していないため、この値を勝手に変えると接続できなくなる。
 */

export const REQUIRED_PROTOCOL = "2";
export const TOKEN_HEX_LENGTH = 32;
export const DEFAULT_PORT = 8000;
export const DEFAULT_PATH = "/ws";

export const MAX_MOVE_DELTA = 100;
export const MAX_SCROLL_AMOUNT = 30;
export const MAX_TEXT_LENGTH = 5000;

/** Receiver が接続直後に送ってくるハンドシェイク。 */
export interface ReceiverReady {
  type: "receiver_ready";
  version?: string;
  protocol?: string;
}

/**
 * QRコードや手入力の文字列を、Receiver の WebSocket URL へ正規化する。
 *
 * - スキームが無ければ ws:// を補う
 * - Receiver 画面の Web UI 用 URL（http://…）を読み取っても繋がるよう http→ws に変換する
 * - ポート未指定なら 8000、パス未指定なら /ws を補う
 */
export function normalizeWebSocketURL(address: string): URL | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const withScheme = trimmed.includes("://") ? trimmed : `ws://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!url.hostname) return null;

  switch (url.protocol) {
    case "ws:":
    case "wss:":
      break;
    case "http:":
      url.protocol = "ws:";
      break;
    case "https:":
      url.protocol = "wss:";
      break;
    default:
      return null;
  }

  // URL は既定ポート（ws:80 / wss:443）を落とすため、url.port だけでは
  // 「省略された」のか「既定値がそのまま書かれていた」のか区別できない。
  // 元の文字列を見て、本当に省略されているときだけ 8000 を補う。
  if (!hasExplicitPort(withScheme)) url.port = String(DEFAULT_PORT);
  if (!url.pathname || url.pathname === "/") url.pathname = DEFAULT_PATH;
  return url;
}

/** アドレス文字列にポート指定が書かれているか。IPv6 の [::1] は誤検出しない。 */
function hasExplicitPort(address: string): boolean {
  const authority = address.slice(address.indexOf("://") + 3).split(/[/?#]/)[0];
  return /:\d+$/.test(authority);
}

/** 合言葉（32桁の16進数）だけを取り出す。形式が違えば null。 */
export function pairingToken(url: URL): string | null {
  const token = url.searchParams.get("token") ?? "";
  return isValidPairingToken(token) ? token : null;
}

export function isValidPairingToken(token: string): boolean {
  return new RegExp(`^[0-9a-fA-F]{${TOKEN_HEX_LENGTH}}$`).test(token);
}

/** 保存済みアドレスだけで接続を再開できるか。合言葉が無ければ Receiver に拒否される。 */
export function canConnect(address: string): boolean {
  const url = normalizeWebSocketURL(address);
  return url !== null && pairingToken(url) !== null;
}

/**
 * QRコードの読み取り結果を接続先に変換する。
 *
 * Receiver の QR は ws://IP:8000/ws?token=… だが、
 * 合言葉だけを写した文字列や手入力も救えるよう、32桁の16進数なら
 * ページの配信元ホスト（＝多くの場合 Receiver と同じ PC）を補って組み立てる。
 */
export function addressFromScanResult(value: string, fallbackHost?: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isValidPairingToken(trimmed)) {
    if (!fallbackHost) return null;
    return `ws://${fallbackHost}:${DEFAULT_PORT}${DEFAULT_PATH}?token=${trimmed}`;
  }

  const url = normalizeWebSocketURL(trimmed);
  if (!url || pairingToken(url) === null) return null;
  return url.toString();
}

/** 画面表示用のホスト名とポート。合言葉は意図的に含めない。 */
export function displayEndpoint(address: string | null): string {
  if (!address) return "接続先不明";
  const url = normalizeWebSocketURL(address);
  if (!url) return "接続先不明";
  return `${url.hostname}:${url.port || DEFAULT_PORT}`;
}

/** Receiver の /health を叩くための URL。遅延計測に使う。 */
export function healthURL(url: URL): string {
  const scheme = url.protocol === "wss:" ? "https:" : "http:";
  return `${scheme}//${url.host}/health`;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
