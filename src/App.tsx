import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MouseSocketClient, stateLabel } from "./lib/MouseSocketClient";
import { addressFromScanResult, canConnect } from "./lib/protocol";
import { useStoredState } from "./lib/useStoredState";
import { Trackpad } from "./components/Trackpad";
import { ScrollRail } from "./components/ScrollRail";
import { QRScanner } from "./components/QRScanner";
import { SettingsSheet, type Preferences } from "./components/SettingsSheet";
import {
  BackspaceIcon,
  CopyIcon,
  GearIcon,
  HandIcon,
  HandSlashIcon,
  PasteIcon,
  ReleaseAllIcon,
  ReturnIcon,
  SendIcon,
  TouchIcon,
} from "./components/Icons";

/** 起動直後に繋がらなければ、この時間だけ待ってから読み取り画面を出す。 */
const AUTO_SCAN_DELAY_MS = 2000;

const DEFAULT_PREFERENCES: Preferences = {
  sensitivity: 1.5,
  pointerAcceleration: true,
  scrollSensitivity: 1,
  leftHandedControls: false,
};

export default function App() {
  const client = useMemo(() => new MouseSocketClient(), []);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);

  const [receiverAddress, setReceiverAddress] = useStoredState("receiverAddress", "");
  const [storedPreferences, setPreferences] = useStoredState("preferences", DEFAULT_PREFERENCES);
  // 設定項目が増えたあとでも、古い保存内容で undefined にならないようにする。
  const preferences = useMemo(
    () => ({ ...DEFAULT_PREFERENCES, ...storedPreferences }),
    [storedPreferences],
  );
  const [inputText, setInputText] = useState("");
  const [dragLocked, setDragLocked] = useState(false);
  const [showingSettings, setShowingSettings] = useState(false);
  const [showingScanner, setShowingScanner] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  const connected = snapshot.state === "connected";
  const dismissKeyboard = useCallback(() => inputRef.current?.blur(), []);

  const connectTo = useCallback(
    (address: string) => {
      setReceiverAddress(address);
      client.connect(address);
    },
    [client, setReceiverAddress],
  );

  // 起動時：保存済みの合言葉が生きていれば復帰し、駄目なら読み取り画面へ誘導する。
  // URL に ws:// のアドレスや合言葉が付いていれば、それを最優先で使う。
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const fromURL = addressFromLocation();
    if (fromURL) {
      history.replaceState(null, "", location.pathname);
      connectTo(fromURL);
      return;
    }

    if (canConnect(receiverAddress)) {
      client.connect(receiverAddress);
    }

    const timer = setTimeout(() => {
      const current = client.getSnapshot().state;
      if (current !== "connected" && current !== "connecting") setShowingScanner(true);
    }, AUTO_SCAN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client, connectTo, receiverAddress]);

  // 開いたままのページに新しい接続先リンクを踏んだ場合も繋ぎ直せるようにする。
  useEffect(() => {
    const handleHashChange = () => {
      const address = addressFromLocation();
      if (!address) return;
      history.replaceState(null, "", location.pathname);
      setShowingScanner(false);
      connectTo(address);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [connectTo]);

  // 合言葉切れを検知したら読み取り画面を出す。iOS版の onChange(of: client.needsPairing) 相当。
  useEffect(() => {
    if (snapshot.needsPairing) setShowingScanner(true);
  }, [snapshot.needsPairing]);

  // 接続が切れたらドラッグ固定も解除して、Windows側にボタン押下を残さない。
  useEffect(() => {
    if (!connected && dragLocked) setDragLocked(false);
  }, [connected, dragLocked]);

  // 操作中に画面が消えると接続も切れてしまうため、可能な環境ではスリープを抑止する。
  useEffect(() => {
    if (!connected) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let released = false;
    void navigator.wakeLock
      ?.request("screen")
      .then((lock) => {
        if (released) void lock.release();
        else sentinel = lock;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void sentinel?.release().catch(() => undefined);
    };
  }, [connected]);

  // タブを閉じる直前に押しっぱなしを解除して、Windows側にボタン押下を残さない。
  // 接続はページと同じ寿命なので、ここでは切断しない
  // （StrictModeの二重マウントで、繋いだ直後に切れてしまうため）。
  useEffect(() => {
    const release = () => client.sendReleaseAll();
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, [client]);

  const accelerated = useCallback(
    (dx: number, dy: number): [number, number] => {
      const distance = Math.hypot(dx, dy);
      let acceleration = 1;
      if (preferences.pointerAcceleration) {
        if (distance > 18) acceleration = 1.8;
        else if (distance > 8) acceleration = 1.35;
        else acceleration = 0.82;
      }
      return [
        dx * preferences.sensitivity * acceleration,
        dy * preferences.sensitivity * acceleration,
      ];
    },
    [preferences.pointerAcceleration, preferences.sensitivity],
  );

  const toggleDragLock = () => {
    haptic();
    const next = !dragLocked;
    setDragLocked(next);
    if (next) client.sendMouseDown();
    else client.sendMouseUp();
  };

  const sendInput = (pressEnter: boolean) => {
    haptic();
    if (!inputText) {
      if (pressEnter) {
        client.sendEnter();
        dismissKeyboard();
      }
      return;
    }
    client.sendText(inputText, pressEnter);
    setInputText("");
    dismissKeyboard();
  };

  return (
    <div className="app" data-drag-locked={dragLocked}>
      <Trackpad
        enabled={connected}
        dragLocked={dragLocked}
        onMove={(dx, dy) => {
          dismissKeyboard();
          const [ax, ay] = accelerated(dx, dy);
          client.sendMove(ax, ay);
        }}
        onScroll={(dy) => {
          dismissKeyboard();
          client.sendScroll((-dy / 8) * preferences.scrollSensitivity);
        }}
        onTap={() => {
          dismissKeyboard();
          client.sendClick();
        }}
        onDoubleTap={() => {
          dismissKeyboard();
          client.sendDoubleClick();
        }}
        onRightTap={() => {
          dismissKeyboard();
          client.sendRightClick();
        }}
        onDragBegin={() => {
          dismissKeyboard();
          client.sendMouseDown();
        }}
        onDragEnd={() => client.sendMouseUp()}
      />

      <div className="overlay">
        <header className="header">
          <div className="header__title">
            <h1>SmartMouse</h1>
            <p>緊急用マウス・キーボード</p>
          </div>
          <button
            type="button"
            className="status-chip"
            onClick={() => setShowingSettings(true)}
            aria-label="接続設定"
          >
            <span className="status-chip__dot" data-connected={connected} />
            <span className="status-chip__label">
              {connected && snapshot.latencyMilliseconds !== null
                ? `接続済み · ${snapshot.latencyMilliseconds}ms`
                : stateLabel(snapshot)}
            </span>
            <GearIcon />
          </button>
        </header>

        {!connected && (
          <div className="banner">
            <div className="banner__title">
              <span aria-hidden="true">{snapshot.state === "connecting" ? "⏳" : "⚠️"}</span>
              <strong>{stateLabel(snapshot)}</strong>
            </div>
            {snapshot.recoveryHint && <p className="banner__hint">{snapshot.recoveryHint}</p>}
            <div className="banner__actions">
              <button
                type="button"
                className="button button--small"
                disabled={snapshot.state === "connecting" || !canConnect(receiverAddress)}
                onClick={() => client.connect(receiverAddress)}
              >
                再接続
              </button>
              <button
                type="button"
                className="button button--small"
                onClick={() => setShowingScanner(true)}
              >
                QRを読む
              </button>
            </div>
          </div>
        )}

        <div className="keyboard-panel">
          <input
            ref={inputRef}
            type="text"
            className="keyboard-panel__field"
            placeholder="スマホのキーボードで入力"
            aria-label="Windowsへ送る文字"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                sendInput(true);
              }
            }}
          />
          <div className="keyboard-panel__buttons">
            <button
              type="button"
              className="button button--primary"
              onClick={() => sendInput(false)}
            >
              <SendIcon />
              送信
            </button>
            <button type="button" className="button" onClick={() => sendInput(true)}>
              <ReturnIcon />
              エンター
            </button>
            <button
              type="button"
              className="button button--compact"
              aria-label="1文字消す"
              onClick={() => {
                haptic();
                if (inputText) setInputText(inputText.slice(0, -1));
                else client.sendBackspace();
              }}
            >
              <BackspaceIcon />
            </button>
          </div>
          {/* パスワード入力の代行がこの機能のいちばん自然な使い道である一方、
              ws:// は暗号化されない。入力欄のすぐ横で伝えないと意味がないので、
              設定画面のセキュリティ欄と重複してでもここに置く。 */}
          <p className="keyboard-panel__caution">
            <span aria-hidden="true">🔓</span>
            送信内容は暗号化されません。パスワードの入力には使わないでください。
          </p>
        </div>

        <div className="gesture-card" aria-hidden="true">
          <div className="gesture-card__head">
            <span className="gesture-card__icon">
              {dragLocked ? <HandIcon /> : <TouchIcon />}
            </span>
            <div>
              <strong>{dragLocked ? "ドラッグ中" : "タッチ操作エリア"}</strong>
              <span>
                画面を指でなぞって
                <br />
                カーソルを動かします
              </span>
            </div>
          </div>
          <div className="gesture-card__hints">
            <span>1本指：タップ</span>
            <span>2本指：右クリック</span>
          </div>
        </div>

        <div className="action-buttons">
          <button
            type="button"
            className="button button--action"
            data-active={dragLocked}
            aria-pressed={dragLocked}
            onPointerDown={toggleDragLock}
          >
            {dragLocked ? <HandSlashIcon /> : <HandIcon />}
            {dragLocked ? "離す" : "つかむ"}
          </button>
          <button
            type="button"
            className="button button--action"
            onClick={() => {
              haptic();
              if (dragLocked) {
                setDragLocked(false);
                client.sendMouseUp();
                setTimeout(() => client.sendShortcut("copy"), 80);
              } else {
                client.sendShortcut("copy");
              }
            }}
          >
            <CopyIcon />
            コピー
          </button>
          <button
            type="button"
            className="button button--action"
            onClick={() => {
              haptic();
              client.sendShortcut("paste");
            }}
          >
            <PasteIcon />
            貼り付け
          </button>
          <button
            type="button"
            className="button button--action"
            onClick={() => {
              haptic();
              setDragLocked(false);
              client.sendReleaseAll();
            }}
          >
            <ReleaseAllIcon />
            全解除
          </button>
        </div>
      </div>

      <div className="rail-layer" data-left={preferences.leftHandedControls}>
        <ScrollRail
          onScroll={(amount) => client.sendScroll(amount * preferences.scrollSensitivity)}
          onInteract={dismissKeyboard}
        />
      </div>

      {showingSettings && (
        <SettingsSheet
          snapshot={snapshot}
          receiverAddress={receiverAddress}
          preferences={preferences}
          onChangeAddress={setReceiverAddress}
          onChangePreferences={setPreferences}
          onConnect={(address) => {
            connectTo(address);
            setShowingSettings(false);
          }}
          onDisconnect={() => client.disconnect()}
          onScanQR={() => {
            setShowingSettings(false);
            setShowingScanner(true);
          }}
          onReleaseAll={() => {
            setDragLocked(false);
            client.sendReleaseAll();
          }}
          onClose={() => setShowingSettings(false)}
        />
      )}

      {showingScanner && (
        <QRScanner
          fallbackHost={location.hostname}
          onDetected={(address) => {
            setShowingScanner(false);
            connectTo(address);
          }}
          onCancel={() => setShowingScanner(false)}
        />
      )}
    </div>
  );
}

/** ?token=… や #ws://… 付きで開かれたときに、その接続先を取り出す。 */
function addressFromLocation(): string | null {
  const hash = location.hash.replace(/^#/, "");
  const fromHash = hash ? addressFromScanResult(decodeURIComponent(hash), location.hostname) : null;
  if (fromHash) return fromHash;

  // ?token=… は Receiver 自身が配信しているページに付く形なので、
  // 接続先は「このページの配信元」＝ location.host（ポート込み）で組み立てる。
  const token = new URLSearchParams(location.search).get("token");
  return token ? addressFromScanResult(token, location.host) : null;
}

/** 対応端末だけ軽く振動させる。iOS Safari は未対応なので黙って無視される。 */
function haptic(): void {
  navigator.vibrate?.(8);
}
