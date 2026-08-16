import { describe, expect, it } from "vitest";
import {
  addressFromScanResult,
  canConnect,
  displayEndpoint,
  healthURL,
  isValidPairingToken,
  normalizeWebSocketURL,
  pairingToken,
} from "../src/lib/protocol";

const TOKEN = "a".repeat(32);

describe("normalizeWebSocketURL", () => {
  it("スキームが無ければ ws:// を補い、ポートとパスも既定値で埋める", () => {
    expect(normalizeWebSocketURL("192.168.1.2")?.toString()).toBe("ws://192.168.1.2:8000/ws");
  });

  it("Receiver の QR（ws://…/ws?token=…）をそのまま受け取れる", () => {
    const url = normalizeWebSocketURL(`ws://192.168.1.2:8000/ws?token=${TOKEN}`);
    expect(url?.toString()).toBe(`ws://192.168.1.2:8000/ws?token=${TOKEN}`);
    expect(pairingToken(url!)).toBe(TOKEN);
  });

  it("http/https は ws/wss に読み替える", () => {
    expect(normalizeWebSocketURL("http://192.168.1.2:8000/ws")?.protocol).toBe("ws:");
    expect(normalizeWebSocketURL("https://example.test/ws")?.protocol).toBe("wss:");
  });

  it("空文字や対応外のスキームは受け付けない", () => {
    expect(normalizeWebSocketURL("")).toBeNull();
    expect(normalizeWebSocketURL("   ")).toBeNull();
    expect(normalizeWebSocketURL("ftp://192.168.1.2")).toBeNull();
  });
});

describe("pairingToken", () => {
  it("32桁の16進数だけを合言葉として認める", () => {
    expect(isValidPairingToken(TOKEN)).toBe(true);
    expect(isValidPairingToken("a".repeat(31))).toBe(false);
    expect(isValidPairingToken("z".repeat(32))).toBe(false);
    expect(isValidPairingToken("")).toBe(false);
  });

  it("合言葉が無いアドレスでは接続を試さない", () => {
    expect(canConnect("ws://192.168.1.2:8000/ws")).toBe(false);
    expect(canConnect(`ws://192.168.1.2:8000/ws?token=${TOKEN}`)).toBe(true);
    expect(canConnect(`ws://192.168.1.2:8000/ws?token=short`)).toBe(false);
  });
});

describe("addressFromScanResult", () => {
  it("SmartMouse 以外の QR は弾く", () => {
    expect(addressFromScanResult("https://example.com", "192.168.1.9")).toBeNull();
    expect(addressFromScanResult("", "192.168.1.9")).toBeNull();
  });

  it("合言葉だけの文字列は配信元ホストを補って組み立てる", () => {
    expect(addressFromScanResult(TOKEN, "192.168.1.9")).toBe(
      `ws://192.168.1.9:8000/ws?token=${TOKEN}`,
    );
  });

  it("補うホストが分からなければ合言葉だけでは接続先を作らない", () => {
    expect(addressFromScanResult(TOKEN, "")).toBeNull();
  });

  it("Receiver 自身が配信しているページでは、そのポートをそのまま使う", () => {
    expect(addressFromScanResult(TOKEN, "192.168.1.9:8000")).toBe(
      `ws://192.168.1.9:8000/ws?token=${TOKEN}`,
    );
    expect(addressFromScanResult(TOKEN, "192.168.1.9:9000")).toBe(
      `ws://192.168.1.9:9000/ws?token=${TOKEN}`,
    );
  });
});

describe("表示用の整形", () => {
  it("接続先の表示に合言葉を含めない", () => {
    const shown = displayEndpoint(`ws://192.168.1.2:8000/ws?token=${TOKEN}`);
    expect(shown).toBe("192.168.1.2:8000");
    expect(shown).not.toContain(TOKEN);
  });

  it("遅延計測用の /health は ws→http に読み替える", () => {
    const url = normalizeWebSocketURL(`ws://192.168.1.2:8000/ws?token=${TOKEN}`)!;
    expect(healthURL(url)).toBe("http://192.168.1.2:8000/health");
    // 443 は https の既定ポートなので省略された形になる。
    expect(healthURL(normalizeWebSocketURL("wss://example.test:443/ws")!)).toBe(
      "https://example.test/health",
    );
  });
});
