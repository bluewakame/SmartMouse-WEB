"""ビルド済みの SmartMouse Web を LAN へ配信する簡易サーバー。

Receiver と同じ Windows PC で実行し、スマホのブラウザから
http://<PCのIP>:8080/ を開いて使う。

    npm install && npm run build
    python serve.py

Receiver（ws://）へ繋ぐ都合上、ページは必ず http:// で配信する。
https:// で配信するとブラウザが ws:// への接続を遮断して繋がらない。
"""

from __future__ import annotations

import argparse
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_PORT = 8080
DIST_DIR = Path(__file__).resolve().parent / "dist"


class NoCacheHandler(SimpleHTTPRequestHandler):
    """作り直した dist が確実に反映されるよう、キャッシュを無効にする。"""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        print(f"[web] {format % args}")


def get_lan_ip() -> str:
    """WindowsReceiver/main.py と同じ方法で LAN 側の IP を調べる。"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return str(sock.getsockname()[0])
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description="SmartMouse Web を LAN へ配信する")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--dir", type=Path, default=DIST_DIR, help="配信するディレクトリ")
    args = parser.parse_args()

    if not args.dir.is_dir():
        raise SystemExit(f"{args.dir} がありません。先に `npm run build` を実行してください。")

    handler = partial(NoCacheHandler, directory=str(args.dir))
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)

    print()
    print("=" * 48)
    print("SmartMouse Web")
    print(f"スマホのブラウザで開く: http://{get_lan_ip()}:{args.port}/")
    print()
    print("SmartMouseReceiver.exe も起動したままにしてください。")
    print("停止するには Ctrl+C を押します。")
    print("=" * 48)
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("停止しました。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
