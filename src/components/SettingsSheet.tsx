import { useState } from "react";
import { REQUIRED_PROTOCOL, canConnect } from "../lib/protocol";
import { stateLabel, type ClientSnapshot } from "../lib/MouseSocketClient";

export interface Preferences {
  sensitivity: number;
  pointerAcceleration: boolean;
  scrollSensitivity: number;
  leftHandedControls: boolean;
}

interface SettingsSheetProps {
  snapshot: ClientSnapshot;
  receiverAddress: string;
  preferences: Preferences;
  onChangeAddress: (address: string) => void;
  onChangePreferences: (preferences: Preferences) => void;
  onConnect: (address: string) => void;
  onDisconnect: () => void;
  onScanQR: () => void;
  onReleaseAll: () => void;
  onClose: () => void;
}

/** 設定シート。iOS版 ContentView.settingsSheet の移植。 */
export function SettingsSheet({
  snapshot,
  receiverAddress,
  preferences,
  onChangeAddress,
  onChangePreferences,
  onConnect,
  onDisconnect,
  onScanQR,
  onReleaseAll,
  onClose,
}: SettingsSheetProps) {
  const [draftAddress, setDraftAddress] = useState(receiverAddress);
  const [showingHelp, setShowingHelp] = useState(false);
  const reconnectable = canConnect(draftAddress);

  const patch = (changes: Partial<Preferences>) =>
    onChangePreferences({ ...preferences, ...changes });

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="SmartMouse設定">
      <div className="sheet__header">
        <h2>SmartMouse設定</h2>
        <button type="button" className="sheet__close" onClick={onClose}>
          完了
        </button>
      </div>

      <div className="sheet__body">
        <section className="settings__section">
          <h3>Windows受信機</h3>
          <button type="button" className="button button--primary" onClick={onScanQR}>
            QRコードを読み取って接続
          </button>
          <p className="settings__status">{stateLabel(snapshot)}</p>
          {snapshot.recoveryHint && <p className="settings__hint">{snapshot.recoveryHint}</p>}
          {snapshot.state === "connected" ? (
            <button type="button" className="button" onClick={onDisconnect}>
              切断
            </button>
          ) : (
            reconnectable && (
              <button type="button" className="button" onClick={() => onConnect(draftAddress)}>
                今すぐ再接続
              </button>
            )
          )}
        </section>

        <section className="settings__section">
          <h3>手入力で接続</h3>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ws://192.168.1.2:8000/ws?token=…"
            value={draftAddress}
            onChange={(event) => {
              setDraftAddress(event.target.value);
              onChangeAddress(event.target.value);
            }}
          />
          <button
            type="button"
            className="button"
            disabled={!reconnectable}
            onClick={() => onConnect(draftAddress)}
          >
            入力したアドレスで接続
          </button>
          <p className="settings__hint">
            Receiver画面に表示されている ws:// で始まるアドレスを、末尾のtokenまで含めて入力してください。QRコードが読めないときの予備手段です。
          </p>
        </section>

        <section className="settings__section">
          <h3>カーソル感度</h3>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={preferences.sensitivity}
            aria-label="カーソル感度"
            onChange={(event) => patch({ sensitivity: Number(event.target.value) })}
          />
          <p className="settings__value">{preferences.sensitivity.toFixed(1)}x</p>
          <label className="settings__toggle">
            <input
              type="checkbox"
              checked={preferences.pointerAcceleration}
              onChange={(event) => patch({ pointerAcceleration: event.target.checked })}
            />
            カーソル加速
          </label>
        </section>

        <section className="settings__section">
          <h3>スクロール</h3>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={preferences.scrollSensitivity}
            aria-label="スクロール感度"
            onChange={(event) => patch({ scrollSensitivity: Number(event.target.value) })}
          />
          <p className="settings__value">{preferences.scrollSensitivity.toFixed(1)}x</p>
          <label className="settings__toggle">
            <input
              type="checkbox"
              checked={preferences.leftHandedControls}
              onChange={(event) => patch({ leftHandedControls: event.target.checked })}
            />
            スクロールバーを左側に配置
          </label>
        </section>

        <section className="settings__section">
          <h3>接続情報</h3>
          {snapshot.receiverVersion && (
            <p className="settings__row">
              <span>Receiver</span>
              <span>v{snapshot.receiverVersion}</span>
            </p>
          )}
          {snapshot.receiverProtocol && (
            <p className="settings__row">
              <span>プロトコル</span>
              <span>
                {snapshot.receiverProtocol}（必要: {REQUIRED_PROTOCOL}）
              </span>
            </p>
          )}
          {snapshot.state === "connected" && (
            <p className="settings__row">
              <span>通信遅延</span>
              <span>
                {snapshot.latencyMilliseconds === null
                  ? "計測中"
                  : `${snapshot.latencyMilliseconds} ms`}
              </span>
            </p>
          )}
          <button type="button" className="button button--danger" onClick={onReleaseAll}>
            すべてのキーとボタンを解除
          </button>
        </section>

        <section className="settings__section">
          <h3>安全に使うために</h3>
          <p className="settings__caution">
            <span aria-hidden="true">🔓</span>
            このアプリとPCの通信は暗号化されていません。
          </p>
          <ul className="settings__rules">
            <li>
              <strong>自宅など、信頼できるWi‑Fiでだけ使ってください。</strong>
              社内・学校・カフェ・ホテル・寮などの共有Wi‑Fiでは、同じネットワークにいる第三者に通信を読み取られる可能性があります。
            </li>
            <li>
              <strong>パスワードやクレジットカード番号は送らないでください。</strong>
              「文字入力 → 送信」で送った内容はそのまま流れます。
            </li>
            <li>
              <strong>使い終わったらReceiverを終了してください。</strong>
              合言葉はReceiverを起動し直すたびに新しくなり、古い合言葉は使えなくなります。
            </li>
          </ul>
          <p className="settings__hint">
            合言葉を知っている端末は、PCのマウスとキーボードを自由に操作できます。QRコードを他人に見せたり、画面を共有したまま表示したりしないでください。
          </p>
        </section>

        <section className="settings__section">
          <h3>ヘルプ</h3>
          <button type="button" className="button" onClick={() => setShowingHelp(!showingHelp)}>
            接続できないとき
          </button>
          {showingHelp && <ConnectionHelp />}
        </section>
      </div>
    </div>
  );
}

const HELP_STEPS: [string, string][] = [
  ["受信機を確認", "WindowsでSmartMouseReceiver.exeを開き、QRコードが表示されたままにします。"],
  [
    "同じWi‑Fiを確認",
    "スマホとPCを同じWi‑Fiへ接続します。ゲスト・ホテル・公共Wi‑Fiでは通信できない場合があります。",
  ],
  ["Windowsの許可を確認", "ファイアウォールの確認画面では「プライベート ネットワーク」を許可します。"],
  ["VPNを一時的に切る", "スマホまたはPCでVPNを使っている場合は、一度オフにして接続を試します。"],
  [
    "ページのアドレスを確認",
    "この画面が https:// で開かれていると、ブラウザが ws:// への接続を遮断します。http:// で開き直してください。",
  ],
  ["QRコードを読み直す", "PCのIPアドレスが変わることがあるため、現在表示されているQRコードを読み取ります。"],
];

function ConnectionHelp() {
  return (
    <ol className="help">
      {HELP_STEPS.map(([title, detail], index) => (
        <li key={title}>
          <span className="help__number">{index + 1}</span>
          <span>
            <strong>{title}</strong>
            <span className="help__detail">{detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
