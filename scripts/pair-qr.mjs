/**
 * iPhone の標準カメラで読める「ブラウザ起動用 QR コード」を作る。
 *
 *     npm run pair
 *
 * Receiver が出す QR は ws:// で始まるため、標準のカメラアプリでは開けない。
 * このスクリプトは Receiver が mDNS（_smartmouse._tcp）で公開している合言葉を拾い、
 *
 *     http://<PCのIP>:8080/#ws://<PCのIP>:8000/ws?token=<合言葉>
 *
 * という http:// の QR を作り直す。これならカメラで読むだけでブラウザが開き、
 * SmartMouse Web がその場で接続まで済ませる。Receiver 側は一切変更しない。
 *
 * mDNS が届かない環境では、Receiver 画面に出ている ws:// のアドレスを引数で渡す。
 *
 *     node scripts/pair-qr.mjs "ws://192.168.1.2:8000/ws?token=..."
 */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bonjour } from "bonjour-service";
import QRCode from "qrcode";

const SERVICE_TYPE = "smartmouse";
const DISCOVERY_TIMEOUT_MS = 6000;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

const webPort = Number(process.env.WEB_PORT ?? 8080);

/** Receiver 画面の ws:// アドレスから、IP と合言葉を取り出す。 */
function parseReceiverURL(value) {
  const url = new URL(value.trim());
  const token = url.searchParams.get("token") ?? "";
  if (!TOKEN_PATTERN.test(token)) throw new Error("合言葉（32桁）が含まれていません");
  return { host: url.hostname, port: Number(url.port || 8000), token };
}

/** Receiver が mDNS で公開している接続情報を探す。 */
function discoverReceiver() {
  return new Promise((resolve, reject) => {
    const bonjour = new Bonjour();
    const browser = bonjour.find({ type: SERVICE_TYPE, protocol: "tcp" });

    const finish = (result, error) => {
      clearTimeout(timer);
      browser.stop();
      bonjour.destroy();
      error ? reject(error) : resolve(result);
    };

    const timer = setTimeout(
      () => finish(null, new Error("Receiver を見つけられませんでした")),
      DISCOVERY_TIMEOUT_MS,
    );

    browser.on("up", (service) => {
      // 合言葉は TXT レコードに入っている。古い Receiver 向けに、
      // サービス名の末尾（SmartMouse-192-168-1-2-<合言葉>）からも拾えるようにする。
      const fromTxt = service.txt?.token;
      const fromName = service.name?.split("-").at(-1);
      const token = [fromTxt, fromName].find((value) => TOKEN_PATTERN.test(value ?? ""));
      if (!token) return;

      const host =
        service.txt?.address ??
        service.addresses?.find((address) => address.includes(".")) ??
        service.host;
      finish({ host, port: service.port ?? 8000, token });
    });
  });
}

async function main() {
  const [manualURL] = process.argv.slice(2);
  let receiver;

  if (manualURL) {
    receiver = parseReceiverURL(manualURL);
  } else {
    console.log("Receiver を探しています…（SmartMouseReceiver.exe を起動しておいてください）");
    try {
      receiver = await discoverReceiver();
    } catch (error) {
      console.error(`\n${error.message}`);
      console.error("Receiver 画面に出ている ws:// のアドレスを渡して、もう一度実行してください:");
      console.error('  node scripts/pair-qr.mjs "ws://192.168.1.2:8000/ws?token=..."\n');
      process.exitCode = 1;
      return;
    }
  }

  const receiverURL = `ws://${receiver.host}:${receiver.port}/ws?token=${receiver.token}`;
  const pageURL = `http://${receiver.host}:${webPort}/#${encodeURIComponent(receiverURL)}`;

  console.log("\n" + (await QRCode.toString(pageURL, { type: "terminal", small: true })));
  console.log("iPhone / Android の標準カメラで読み取ってください。");
  console.log(`開く URL: http://${receiver.host}:${webPort}/`);
  console.log("（このQRには合言葉が入っています。画面共有や配布はしないでください）\n");

  const file = join(tmpdir(), "smartmouse-pair.html");
  writeFileSync(file, pairPage(pageURL, await QRCode.toDataURL(pageURL, { width: 512, margin: 2 })));
  openInBrowser(file);
  console.log(`大きい QR をブラウザでも開きました: ${file}`);
  console.log("Receiver を再起動したら合言葉が変わるので、このコマンドを実行し直してください。");
}

function pairPage(pageURL, dataURL) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>SmartMouse Web の接続用QR</title>
<style>
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:16px;background:#0b0d0e;color:#fff;
    font-family:"Yu Gothic UI","Hiragino Sans",system-ui,sans-serif}
  img{width:min(72vmin,520px);border-radius:16px;background:#fff;padding:12px}
  p{margin:0;color:rgba(255,255,255,.65);font-size:14px;text-align:center;line-height:1.7}
  code{color:#33db9e;word-break:break-all}
</style></head>
<body>
  <h1>スマホのカメラで読み取ってください</h1>
  <img src="${dataURL}" alt="SmartMouse Web の接続用QRコード">
  <p>読み取るとブラウザが開き、そのまま接続されます。<br><code>${pageURL.split("#")[0]}</code></p>
  <p>このQRには合言葉が含まれます。共有しないでください。</p>
</body></html>`;
}

function openInBrowser(file) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", file]]
      : process.platform === "darwin"
        ? ["open", [file]]
        : ["xdg-open", [file]];
  execFile(command, args, () => undefined);
}

await main();
