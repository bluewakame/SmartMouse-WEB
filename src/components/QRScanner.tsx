import { useCallback, useEffect, useRef, useState } from "react";
import { canUseCameraStream, decodeFromCanvas, decodeFromImageFile } from "../lib/qr";
import { addressFromScanResult } from "../lib/protocol";

interface QRScannerProps {
  /** 合言葉だけの QR を読んだときに補うホスト名（通常はこのページの配信元）。 */
  fallbackHost: string;
  onDetected: (address: string) => void;
  onCancel: () => void;
}

const SCAN_INTERVAL_MS = 220;

/**
 * QRコードの読み取り画面。iOS版 QRScannerView の代わり。
 *
 * ブラウザのカメラ映像は https/localhost でしか開けないため、
 * http:// で配信しているときは「写真を撮って読み取る」に自動で切り替わる。
 * どちらも使えない場合に備えて、手入力も同じ画面に置いてある。
 */
export function QRScanner({ fallbackHost, onDetected, onCancel }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraAvailable = canUseCameraStream();

  const accept = useCallback(
    (raw: string): boolean => {
      const address = addressFromScanResult(raw, fallbackHost);
      if (!address) {
        setMessage("SmartMouseのQRコードではないようです。Receiver画面のQRコードを写してください。");
        return false;
      }
      onDetected(address);
      return true;
    },
    [fallbackHost, onDetected],
  );

  useEffect(() => {
    if (!cameraAvailable) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scan = async () => {
      const video = videoRef.current;
      if (cancelled || !video || video.readyState < video.HAVE_CURRENT_DATA) return;

      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) return;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(video, 0, 0, width, height);

      const result = await decodeFromCanvas(canvas);
      if (cancelled || !result) return;
      if (accept(result)) cancelled = true;
    };

    const loop = async () => {
      await scan();
      if (!cancelled) timer = setTimeout(() => void loop(), SCAN_INTERVAL_MS);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();
        void loop();
      })
      .catch(() => {
        setCameraError("カメラを開けませんでした。写真を撮って読み取るか、手入力で接続してください。");
      });

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [accept, cameraAvailable]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await decodeFromImageFile(file);
      if (!result) {
        setMessage("写真からQRコードを読み取れませんでした。明るい場所で、QR全体が入るように撮り直してください。");
        return;
      }
      accept(result);
    } catch {
      setMessage("画像を読み込めませんでした。別の写真で試してください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet sheet--scanner" role="dialog" aria-modal="true" aria-label="QRコードを読み取る">
      <div className="sheet__header">
        <h2>QRコードを読み取る</h2>
        <button type="button" className="sheet__close" onClick={onCancel}>
          閉じる
        </button>
      </div>

      <div className="scanner__body">
        {cameraAvailable && !cameraError ? (
          <div className="scanner__viewfinder">
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="scanner__frame" aria-hidden="true" />
          </div>
        ) : (
          <p className="scanner__notice">
            {cameraError ||
              "このページは http:// で開かれているため、ブラウザがカメラ映像を許可しません。下のボタンでQRコードを撮影すると読み取れます。"}
          </p>
        )}

        <label className="button button--primary scanner__capture">
          {busy ? "読み取り中…" : "QRコードを撮影して読み取る"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>

        <p className="scanner__hint">
          Windows画面のQRコードをカメラで撮る／PCのスクリーンショットを選ぶ、どちらでも読み取れます。
        </p>

        <form
          className="scanner__manual"
          onSubmit={(event) => {
            event.preventDefault();
            accept(manualValue);
          }}
        >
          <label htmlFor="manual-address">手入力で接続</label>
          <input
            id="manual-address"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ws://192.168.1.2:8000/ws?token=…"
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
          />
          <button type="submit" className="button">
            このアドレスで接続
          </button>
          <p className="scanner__hint">
            Receiver画面の ws:// で始まるアドレスを、末尾のtokenまで入力してください。合言葉（32桁）だけでも接続できます。
          </p>
        </form>

        {message && (
          <p className="scanner__message" role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
