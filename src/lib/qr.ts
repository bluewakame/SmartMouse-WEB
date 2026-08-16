import jsQR from "jsqr";

/**
 * QRコードの読み取り。
 *
 * ブラウザのカメラ映像（getUserMedia）は https か localhost でしか使えない一方、
 * Receiver は ws:// なので実運用ではページを http:// で開く必要がある。
 * そのため「カメラ映像」と「写真を1枚撮って読む」の両方を用意し、
 * 環境に合わせて使い分けられるようにしてある。
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

/** カメラ映像が使えるか（＝安全なコンテキストか）。 */
export function canUseCameraStream(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    (window.isSecureContext ?? false)
  );
}

function barcodeDetector(): BarcodeDetectorLike | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/** Canvas に描かれた1フレームから QR を読む。ブラウザ内蔵の検出器があれば優先する。 */
export async function decodeFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const detector = barcodeDetector();
  if (detector) {
    try {
      const results = await detector.detect(canvas);
      if (results.length > 0 && results[0].rawValue) return results[0].rawValue;
    } catch {
      // 内蔵検出器が失敗したら jsQR にフォールバックする。
    }
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
  return result?.data ?? null;
}

/** 画像ファイル（カメラで撮った写真やスクリーンショット）から QR を読む。 */
export async function decodeFromImageFile(file: File): Promise<string | null> {
  const bitmap = await loadImage(file);
  // 長辺 1400px 程度まで縮めると、iPhone の高解像度写真でも十分速く読める。
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return decodeFromCanvas(canvas);
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari の古い版では失敗することがあるので <img> で読み直す。
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像を読み込めませんでした"));
      image.src = url;
    });
  } finally {
    // 読み込み後に revoke してもデコード済みの内容は使える。
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
