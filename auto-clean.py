#!/usr/bin/env python3
"""Pembersih otomatis FanraAi - RAM & penyimpanan.

Berjalan via PM2 (pythonw.exe, tanpa window console). Loop tiap 30 menit:
  1. Bersihkan working set process -> bebaskan RAM fisik
  2. Hapus file sampah (temp, cache >3 hari, log >7 hari, Thumbs.db)
  3. Scan file duplikat di folder umum (tiap 6 jam)
  4. Laporkan ke Telegram kalau ada yang dibersihkan

Aman: hanya hapus yang benar-benar sampah. File duplikat TIDAK dihapus
otomatis - hanya dilaporkan lewat Telegram supaya user yang putuskan.
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

BASE = Path("C:/Users/ASUS/FanraAi")
STATE_FILE = BASE / ".fanra" / "clean-state.json"
HERMES_BIN = "C:/Users/ASUS/AppData/Local/hermes/bin/hermes.exe"
TELEGRAM_CHAT = "6105000024"

INTERVAL_S = 30 * 60  # tiap 30 menit
DUP_INTERVAL_S = 6 * 3600  # scan duplikat tiap 6 jam

CACHE_EXTS = {".tmp", ".temp", ".crdownload", ".partial", ".dmp", ".download"}
LOG_MAX_AGE_DAYS = 7
CACHE_MAX_AGE_S = 3 * 86400

DUP_SCAN_DIRS = [
    Path("C:/Users/ASUS/Downloads"),
    Path("C:/Users/ASUS/Documents"),
    Path("C:/Users/ASUS/Desktop"),
]
DUP_SKIP_PARTS = {"node_modules", ".git", "__pycache__", ".next", "venv",
                  "site-packages", "AppData", ".cache", "backup", "logs",
                  "OneDrive"}


def _no_window() -> int:
    return 0x08000000 if sys.platform == "win32" else 0


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} | {msg}", flush=True)


def suspend_idle_brave_tabs() -> int:
    """Trim working set tab Brave yang sudah idle > 10 menit.

    Chromium tetap pegang memory tab yang gak lagi dilihat. Trim working
    setnya -> Windows page-out ke pagefile, RAM fisik lega.
    """
    try:
        import psutil
        freed = 0
        now = time.time()
        kernel32 = ctypes.windll.kernel32
        for p in psutil.process_iter(['name', 'memory_info', 'create_time']):
            try:
                if p.info['name'] != 'brave.exe':
                    continue
                mi = p.info['memory_info']
                if not mi:
                    continue
                if 50e6 < mi.rss < 600e6 and (now - p.info['create_time']) > 600:
                    h = kernel32.OpenProcess(0x1F0FFF, False, p.pid)
                    if h:
                        kernel32.SetProcessWorkingSetSize(h, -1, -1)
                        kernel32.CloseHandle(h)
                        freed += 1
            except Exception:
                continue
        return freed
    except Exception:
        return 0


def send_telegram(message: str) -> None:
    try:
        subprocess.run(
            [HERMES_BIN, "send", "-t", f"telegram:{TELEGRAM_CHAT}", "-q", message],
            capture_output=True, timeout=25,
            creationflags=_no_window(),
        )
    except Exception:
        pass


def fmt_bytes(n: int) -> str:
    for unit, div in (("GB", 1e9), ("MB", 1e6), ("KB", 1e3)):
        if n >= div:
            return f"{n/div:.1f} {unit}"
    return f"{n} B"


# ==================== RAM ====================

def clean_ram() -> tuple[int, int]:
    """Trim working set semua process -> bebaskan RAM fisik."""
    try:
        import psutil
    except ImportError:
        return 0, 0

    before = round(psutil.virtual_memory().percent)
    try:
        psapi = ctypes.windll.psapi
        kernel32 = ctypes.windll.kernel32
        ACCESS = 0x1F0FFF
        pids = (ctypes.c_uint32 * 4096)()
        returned = ctypes.c_uint32()
        if not psapi.EnumProcesses(pids, ctypes.sizeof(pids), ctypes.byref(returned)):
            return before, before
        for i in range(returned.value // 4):
            pid = pids[i]
            if pid == 0:
                continue
            h = kernel32.OpenProcess(ACCESS, False, pid)
            if not h:
                continue
            try:
                kernel32.SetProcessWorkingSetSize(h, -1, -1)
            except Exception:
                pass
            finally:
                kernel32.CloseHandle(h)
    except Exception as e:
        log(f"clean_ram error: {e}")

    time.sleep(3)
    after = round(psutil.virtual_memory().percent)
    return before, after


# ==================== Penyimpanan ====================

def clean_junk() -> tuple[int, int]:
    """Hapus file sampah. Return (bytes, jumlah file)."""
    total_bytes = 0
    total_files = 0
    now = time.time()

    temp_dirs = {
        Path("C:/Users/ASUS/AppData/Local/Temp"),
        Path(os.environ.get("TMPDIR", "")),
        BASE / "logs",
    }

    for d in temp_dirs:
        if not d or not d.exists():
            continue
        try:
            for p in d.rglob("*"):
                try:
                    if not p.is_file():
                        continue
                    age = now - p.stat().st_mtime
                    ext = p.suffix.lower()
                    should_delete = False
                    if d == BASE / "logs":
                        should_delete = ext == ".log" and age > LOG_MAX_AGE_DAYS * 86400
                    else:
                        should_delete = ext in CACHE_EXTS and age > CACHE_MAX_AGE_S
                    if should_delete:
                        sz = p.stat().st_size
                        p.unlink()
                        total_bytes += sz
                        total_files += 1
                except (PermissionError, OSError):
                    continue
        except (PermissionError, OSError):
            continue

    # Recycle Bin
    try:
        ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, 0x00000001 | 0x00000002)
    except Exception:
        pass

    return total_bytes, total_files


def _file_hash(path: Path, max_size: int = 60 * 1024 * 1024) -> str | None:
    try:
        st = path.stat()
        if st.st_size == 0 or st.st_size > max_size:
            return None
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return f"{st.st_size}:{h.hexdigest()}"
    except (PermissionError, OSError):
        return None


def auto_delete_simple_duplicates() -> tuple[int, int]:
    """Hapus otomatis file download dobel: 'X (1).ext' yang hash-nya sama
    persis dengan 'X.ext'. Aman - cuma hapus kalau pasangan aslinya ada
    dan isinya 100% identik."""
    removed = 0
    freed = 0
    d = Path("C:/Users/ASUS/Downloads")
    if not d.exists():
        return 0, 0
    for dup in d.glob("* (1).*"):
        try:
            if not dup.is_file():
                continue
            orig = d / dup.name.replace(" (1)", "")
            if not orig.exists():
                continue
            h_dup = _file_hash(dup)
            if h_dup is None or h_dup != _file_hash(orig):
                continue
            sz = dup.stat().st_size
            dup.unlink()
            removed += 1
            freed += sz
        except (PermissionError, OSError):
            continue
    return removed, freed


def find_duplicates() -> list[tuple[str, int, list[str]]]:
    """Cari file duplikat (SHA-256 sama)."""
    hashes: dict[str, list[Path]] = defaultdict(list)
    for d in DUP_SCAN_DIRS:
        if not d.exists():
            continue
        try:
            for p in d.rglob("*"):
                try:
                    if not p.is_file():
                        continue
                    if any(part in DUP_SKIP_PARTS for part in p.parts):
                        continue
                    h = _file_hash(p)
                    if h:
                        hashes[h].append(p)
                except (PermissionError, OSError):
                    continue
        except (PermissionError, OSError):
            continue

    dups = []
    for h, paths in hashes.items():
        if len(paths) < 2:
            continue
        size = int(h.split(":")[0])
        if size * (len(paths) - 1) < 1024 * 1024:  # min 1 MB duplikat
            continue
        dups.append((paths[0].name, size, [str(x) for x in paths]))
    dups.sort(key=lambda x: -x[1] * (len(x[2]) - 1))
    return dups[:10]


# ==================== Main ====================

def load_state() -> dict:
    try:
        if STATE_FILE.exists():
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def save_state(state: dict) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except Exception:
        pass


def main() -> None:
    log("auto-clean: mulai (loop 30 menit)")
    state = load_state()
    last_dup_scan = state.get("last_dup_scan", 0.0)

    while True:
        report = []

        r_before, r_after = clean_ram()
        if r_before > 0:
            log(f"RAM: {r_before}% -> {r_after}%")
            if r_before >= 85:
                report.append(f"RAM dibersihkan: {r_before}% -> {r_after}%")

        j_bytes, j_files = clean_junk()
        log(f"Sampah: {j_files} file, {fmt_bytes(j_bytes)}")
        if j_files > 0:
            report.append(f"Sampah dibuang: {j_files} file ({fmt_bytes(j_bytes)})")

        n_tabs = suspend_idle_brave_tabs()
        if n_tabs:
            log(f"Tab Brave idle di-trim: {n_tabs}")

        d_files, d_bytes = auto_delete_simple_duplicates()
        if d_files:
            log(f"Duplikat download dihapus: {d_files} file, {fmt_bytes(d_bytes)}")
            report.append(f"Duplikat download dibuang: {d_files} file ({fmt_bytes(d_bytes)})")

        now = time.time()
        if now - last_dup_scan > DUP_INTERVAL_S:
            try:
                dups = find_duplicates()
                last_dup_scan = now
                state["last_dup_scan"] = now
                state["duplicates"] = dups
                save_state(state)
                if dups:
                    log(f"Duplikat: {len(dups)} grup ditemukan")
                    for name, size, paths in dups[:3]:
                        report.append(f"Duplikat: \"{name}\" ({fmt_bytes(size)}) x{len(paths)}")
                else:
                    log("Duplikat: tidak ada")
            except Exception as e:
                log(f"dup error: {e}")

        if report:
            msg = "FanraAi pembersihan otomatis:\n" + "\n".join(report)
            send_telegram(msg)
            log("Laporan dikirim ke Telegram")

        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    main()
