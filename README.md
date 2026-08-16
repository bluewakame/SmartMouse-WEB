# SmartMouse Web

スマホのブラウザから Windows PC のマウス・キーボードを操作する Web アプリです。
iOS 版 SmartMouse（SwiftUI）の画面と操作をそのまま移植したもので、
**Windows 側の Receiver は一切変更していません**。既存の `SmartMouseReceiver.exe` にそのまま繋がります。

- 画面構成・配色・ジェスチャは iOS 版 `ContentView.swift` / `TrackpadView.swift` に合わせてあります
- 通信仕様は `WindowsReceiver/receiver_protocol.py`（プロトコル `2`）と同じです
- QRコードの読み取り、合言葉切れの検知、自動再接続も iOS 版と同じ流れです

---

## 重要：ページは必ず `http://` で開く

Receiver は `ws://`（暗号化なし）で待ち受けています。ブラウザは **HTTPS のページから `ws://` への接続を必ず遮断する**ため、
このアプリを GitHub Pages などの HTTPS で配信すると接続できません。**同じ LAN 内の PC から `http://` で配信してください。**

この制約の副作用として、`http://` のページではブラウザがカメラ映像（`getUserMedia`）を許可しません。
そのため QR コードの読み取りは次の 3 通りを用意しています。

| 方法 | `http://` 配信時 | 備考 |
| --- | --- | --- |
| **`npm run pair` のQRを標準カメラで読む** | ✅ 使える | ブラウザが開いて接続まで自動。いちばん手軽 |
| **アプリ内でQRコードを撮影して読み取る** | ✅ 使える | カメラアプリで1枚撮る方式 |
| カメラ映像でリアルタイム読み取り | ❌ 使えない | `https://` か `localhost` で開いたときだけ自動的に有効 |
| 手入力（`ws://…?token=…` または合言葉32桁） | ✅ 使える | QR が読めないときの予備手段 |

PC のスクリーンショットを選んでも読み取れるので、Receiver の QR をスマホへ送っておく運用も可能です。

---

## 使いかた

### 1. ビルドして配信する（Receiver と同じ PC で）

```bash
npm install
npm run build
python serve.py          # http://<PCのIP>:8080/ で配信
```

`serve.py` は起動時に LAN 側の URL を表示します。`SmartMouseReceiver.exe` も起動したままにしてください。

### 2. スマホから開く

**おすすめ：標準のカメラで読むだけで繋ぐ**

```bash
npm run pair
```

Receiver が mDNS で公開している合言葉を拾って、**ブラウザ起動用の QR コード**を作ります。
PC の画面に出た QR を iPhone / Android の標準カメラで読み取ると、ブラウザが開いてそのまま接続まで終わります。

> Receiver 自身の QR は `ws://` で始まるため、標準のカメラアプリでは開けません（`ws:` を扱えるアプリが無いため）。
> `npm run pair` はそれを `http://…#ws://…` に作り直しているだけで、Receiver 側は変更していません。
> mDNS が届かない環境では、Receiver 画面のアドレスを渡してください:
> `node scripts/pair-qr.mjs "ws://192.168.1.2:8000/ws?token=..."`

**アプリの中で読み取る場合**

1. スマホのブラウザで `http://<PCのIP>:8080/` を開く
2. 2 秒待つと QR 読み取り画面が自動で開く
3. 「QRコードを撮影して読み取る」で Receiver の QR を撮る
4. 「接続済み」になれば操作できます

読み取った接続先は端末に保存され、次からは自動で繋ぎ直します。
Receiver を再起動すると合言葉が変わるため、その時は自動で読み取り画面が開きます。

> ホーム画面に追加するとアドレスバーの無い全画面で使えます（PWA 対応）。

### URL から直接つなぐ

`http://<PCのIP>:8080/#ws://192.168.1.2:8000/ws?token=…` のように接続先を付けて開くと、その場で接続します。
合言葉だけを渡す `?token=…` の形にも対応していて、その場合はページの配信元ホストを接続先として補います。

---

## 操作

| 操作 | 動き |
| --- | --- |
| 1本指でなぞる | カーソル移動 |
| 1本指でタップ | 左クリック |
| 1本指で2回タップ | ダブルクリック |
| 2本指でタップ | 右クリック |
| 2本指で上下になぞる | スクロール |
| 長押ししたまま動かす | ドラッグ |
| 右端のバーを上下に動かす | スクロール（端まで動かすと自動で連続スクロール） |
| つかむ / 離す | 左ボタンの押下状態を固定・解除 |
| コピー / 貼り付け | Windows 側で Ctrl+C / Ctrl+V |
| 全解除 | 押しっぱなしのボタン・キーをすべて解除 |
| 文字入力 → 送信 | スマホのキーボードで入力した文字を Windows に貼り付け |

設定（右上のチップ）でカーソル感度・加速・スクロール感度・スクロールバーの左右を変えられます。

---

## 開発

```bash
npm run dev        # 開発サーバー（http://localhost:5173）
npm run mock       # Windows PC 無しで動かすための にせ Receiver
npm run pair       # ブラウザ起動用のQRコードを作る
npm test           # 通信仕様と接続処理のテスト
npm run build      # 型チェック + 本番ビルド
```

`npm run mock` は `ws://localhost:8000/ws?token=0123456789abcdef0123456789abcdef` で待ち受け、
受け取ったメッセージを標準出力に流します（実際のマウスは動きません）。
`localhost` は安全なコンテキスト扱いなので、開発中はカメラ映像での QR 読み取りも試せます。

### 構成

```
src/
  lib/protocol.ts           通信仕様（URL正規化・合言葉の検証）
  lib/MouseSocketClient.ts  WebSocket接続・ハンドシェイク・自動再接続
  lib/qr.ts                 QR読み取り（BarcodeDetector → jsQR の順に試す）
  components/Trackpad.tsx   タッチ操作 → マウス操作の変換
  components/ScrollRail.tsx 右端のスクロールバー
  components/QRScanner.tsx  QR読み取り画面
  components/SettingsSheet.tsx 設定画面
scripts/mock-receiver.mjs   開発用のにせReceiver
scripts/pair-qr.mjs         ブラウザ起動用QRの生成（mDNSで合言葉を取得）
serve.py                    LAN配信用の簡易HTTPサーバー
```

---

## iOS 版との違い

| 項目 | iOS 版 | Web 版 |
| --- | --- | --- |
| QR 読み取り | カメラでリアルタイム | 撮影した写真から読み取り（`https`/`localhost` ならリアルタイムも可） |
| Receiver の自動検出 | Bonjour で検出 | ブラウザから mDNS を引けないため非対応。QR か手入力で接続 |
| 通信遅延の表示 | WebSocket の ping | `/health` への応答時間（ブラウザに ping API が無いため） |
| 触覚フィードバック | Taptic Engine | 対応端末のみ振動（iOS Safari は非対応） |
| チュートリアル画面 | あり | 未実装（接続時の案内は接続バナーと設定内のヘルプに集約） |

## 繋がらないときは

1. `SmartMouseReceiver.exe` が起動していて、QR コードが表示されているか
2. スマホと PC が同じ Wi‑Fi にいるか（ゲスト Wi‑Fi は端末間通信が塞がれていることがあります）
3. ページのアドレスが `http://` で始まっているか（`https://` だと ws:// を遮断されます）
4. Windows のファイアウォールで「プライベート ネットワーク」を許可したか
5. VPN を切って試したか
6. Receiver を再起動したなら、新しい QR コードを読み直したか
