#!/usr/bin/env python3
"""Sinkronisasi URL tunnel Cloudflare ke public-tunnels.json.

Versi Python dari sync-tunnels.bat. Berjalan tanpa window console
(dipanggil pakai pythonw.exe atau CREATE_NO_WINDOW), jadi tidak ada
jendela hitam yang kebuka-tutup di layar.

Loop tiap 30 detik: baca log cloudflared, ambil URL terbaru, tulis JSON.
Kalau URL berubah, commit & push ke GitHub supaya portal bisa baca.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path

BASE = Path("C:/Users/ASUS/FanraAi")
LOGS = BASE / "logs"
OUT = BASE / "public-tunnels.json"

SERVICES = ("ruang", "touchpad", "dashboard", "llm")
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def read_tunnel_url(service: str) -> str | None:
    """Baca URL tunnel terbaru dari log cloudflared."""
    log = LOGS / f"cloudflared-{service}.log"
    if not log.exists():
        return None
    try:
        text = log.read_text(encoding="utf-8", errors="ignore")
        urls = URL_RE.findall(text)
        return urls[-1] if urls else None
    except Exception:
        return None


def build_urls() -> dict[str, str]:
    urls: dict[str, str] = {}
    for svc in SERVICES:
        url = read_tunnel_url(svc)
        if url:
            urls[svc] = url
    return urls


def git_push() -> None:
    """Commit & push public-tunnels.json."""
    try:
        for cmd in (
            ["git", "add", "public-tunnels.json"],
            ["git", "commit", "-m", "chore: sync tunnel URLs"],
            ["git", "push"],
        ):
            subprocess.run(
                cmd,
                cwd=str(BASE),
                capture_output=True,
                timeout=60,
                creationflags=0x08000000,  # CREATE_NO_WINDOW
            )
    except Exception:
        pass


def main() -> None:
    print("sync-tunnels: mulai (loop 30s)", flush=True)
    last_urls: dict[str, str] = {}
    while True:
        try:
            urls = build_urls()
            if not urls:
                time.sleep(30)
                continue

            if urls != last_urls:
                payload = {**urls, "updated": time.strftime("%Y-%m-%d %H:%M:%S")}
                tmp = OUT.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
                tmp.replace(OUT)
                print(f"sync-tunnels: update {sorted(urls)}", flush=True)
                git_push()
                last_urls = urls
        except Exception as e:
            print(f"sync-tunnels: error {e}", flush=True)

        time.sleep(30)


if __name__ == "__main__":
    main()
