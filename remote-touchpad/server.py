"""
Remote Touchpad Server
Jalankan di laptop: python server.py
Akses dari HP: http://<IP_LAPTOP>:8000
Atau lewat tunnel: https://<tunnel_url>

Lifecycle commands:
  python server.py start    # Start server in background
  python server.py stop     # Stop running server
  python server.py restart  # Restart server
  python server.py status   # Check server status
  python server.py          # Run in foreground (default)
"""
import asyncio
import json
import os
import re
import signal
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import cv2
import psutil
import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pynput.mouse import Controller as MouseController, Button
from pynput.keyboard import Controller as KeyboardController, Key

# ==================== Load Config ====================
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    CONFIG = json.load(f)

# Sensitivity & config from config.json
MOUSE_SENSITIVITY = CONFIG["touchpad"]["sensitivity"]["default"]
SCROLL_SENSITIVITY = CONFIG["touchpad"]["gestures"]["two_finger"]["scroll_factor"]
PINCH_ZOOM_THRESHOLD = 0.05
CLICK_THRESHOLD_MS = CONFIG["touchpad"]["gestures"]["one_finger"]["tap_max_ms"]
CLICK_THRESHOLD_PX = CONFIG["touchpad"]["gestures"]["one_finger"]["tap_max_px"] / 100  # normalize
DOUBLE_TAP_WINDOW_MS = CONFIG["touchpad"]["gestures"]["one_finger"]["double_tap_max_ms"]

HEARTBEAT_INTERVAL = CONFIG["touchpad"]["heartbeat"]["interval_ms"] / 1000
HEARTBEAT_TIMEOUT = CONFIG["touchpad"]["heartbeat"]["timeout_ms"] / 1000

# Track touch state per connection
connection_states = {}

# Global heartbeat task reference for cleanup
_heartbeat_task: Optional[asyncio.Task] = None

# Initialize mouse and keyboard controllers
mouse = MouseController()
keyboard = KeyboardController()

# ==================== PIN Protection ====================
# Hash PIN (SHA-256) disimpan di file terpisah, TIDAK di-commit ke git.
# PIN asli tidak pernah disimpan di mana pun.
PIN_HASH_FILE = Path("C:/Users/ASUS/FanraAi/pin.hash")


def _load_pin_hash() -> str | None:
    """Baca hash PIN dari file. Return None kalau proteksi dimatikan."""
    try:
        if PIN_HASH_FILE.exists():
            return PIN_HASH_FILE.read_text(encoding="utf-8").strip().lower()
    except Exception:
        pass
    return None


def _verify_pin(pin: str | None) -> bool:
    """True kalau PIN cocok atau proteksi dimatikan."""
    expected = _load_pin_hash()
    if expected is None:
        return True  # tidak ada pin.hash = tidak ada proteksi
    if not pin:
        return False
    import hashlib
    return hashlib.sha256(pin.encode("utf-8")).hexdigest() == expected


async def require_pin(x_pin: str | None = Header(default=None, alias="X-PIN")):
    """Dependency FastAPI: tolak akses tanpa PIN yang benar."""
    if not _verify_pin(x_pin):
        raise HTTPException(status_code=401, detail="PIN salah atau tidak dikirim")


def move_mouse(dx: float, dy: float):
    """Move mouse relatively"""
    x, y = mouse.position
    mouse.position = (x + dx * MOUSE_SENSITIVITY, y + dy * MOUSE_SENSITIVITY)


def click_mouse(button: str, down: bool):
    """Click mouse button"""
    btn = Button.left if button == "left" else Button.right
    if down:
        mouse.press(btn)
    else:
        mouse.release(btn)


def scroll_mouse(dy: float):
    """Scroll mouse wheel"""
    mouse.scroll(0, dy * SCROLL_SENSITIVITY)


def type_key(key_str: str):
    """Type a key (for virtual keyboard)"""
    special_keys = {
        "enter": Key.enter,
        "space": Key.space,
        "backspace": Key.backspace,
        "tab": Key.tab,
        "escape": Key.esc,
        "shift": Key.shift,
        "ctrl": Key.ctrl,
        "alt": Key.alt,
        "cmd": Key.cmd,
        "up": Key.up,
        "down": Key.down,
        "left": Key.left,
        "right": Key.right,
    }
    if key_str in special_keys:
        keyboard.press(special_keys[key_str])
        keyboard.release(special_keys[key_str])
    else:
        keyboard.type(key_str)


# ==================== FastAPI App ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _heartbeat_task
    print(f"\n🚀 Remote Touchpad Server running!")
    print(f"📱 Local access: http://<IP_LAPTOP>:8000")
    print(f"🌐 Tunnel: npx ngrok http 8000  (or cloudflared tunnel --url http://localhost:8000)")
    print(f"🛑 Stop: Ctrl+C\n")
    
    # Start heartbeat task and store reference
    _heartbeat_task = asyncio.create_task(heartbeat_loop())
    
    try:
        yield
    finally:
        print("\n🔄 Shutting down...")
        # Cancel heartbeat task properly
        if _heartbeat_task and not _heartbeat_task.done():
            _heartbeat_task.cancel()
            try:
                await _heartbeat_task
            except asyncio.CancelledError:
                pass
        print("👋 Server stopped")


app = FastAPI(title="Remote Touchpad", lifespan=lifespan)

# Izinkan dashboard (host/port berbeda, termasuk via tunnel) mengakses server touchpad.
# Tanpa ini browser memblokir WebSocket & fetch dari origin lain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load HTML template at startup
with open("templates/index.html", "r", encoding="utf-8") as f:
    INDEX_HTML = f.read()


# ==================== WebSocket Handler ====================
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = {
            "connected_at": time.time(),
            "last_pong": time.time(),
            "touch_state": {}
        }
        print(f"📱 Device connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]
        print(f"📱 Device disconnected. Total: {len(self.active_connections)}")

    async def send_ping(self, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps({"type": "ping", "t": time.time()}))
        except Exception:
            pass

    def update_pong(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections[websocket]["last_pong"] = time.time()


manager = ConnectionManager()


# Heartbeat task
async def heartbeat_loop():
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            now = time.time()
            dead = []
            for ws, state in manager.active_connections.items():
                if now - state["last_pong"] > HEARTBEAT_TIMEOUT:
                    dead.append(ws)
                else:
                    await manager.send_ping(ws)
            for ws in dead:
                print(f"💀 Connection timeout, closing")
                try:
                    await ws.close()
                except Exception:
                    pass
                manager.disconnect(ws)
        except asyncio.CancelledError:
            print("💓 Heartbeat task cancelled")
            break
        except Exception as e:
            print(f"❌ Heartbeat error: {e}")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Touchpad = akses kursor & keyboard langsung, wajib PIN.
    # PIN dikirim via query: /ws?pin=1234
    if not _verify_pin(websocket.query_params.get("pin")):
        await websocket.close(code=1008, reason="PIN salah atau tidak dikirim")
        return
    await manager.connect(websocket)
    conn_state = manager.active_connections[websocket]
    touch_state = conn_state["touch_state"]
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            # Handle pong
            if msg.get("type") == "pong":
                manager.update_pong(websocket)
                continue
                
            await handle_message(msg, touch_state, websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        manager.disconnect(websocket)


async def handle_message(msg: dict, touch_state: dict, websocket: WebSocket):
    """Process incoming touchpad/keyboard events"""
    msg_type = msg.get("type")

    if msg_type == "move":
        # Relative mouse movement from primary finger (already scaled by client)
        dx = msg.get("dx", 0)
        dy = msg.get("dy", 0)
        move_mouse(dx, dy)

    elif msg_type == "scroll":
        # Scroll from two-finger drag (dy is already in pixel-like units from client)
        dy = msg.get("dy", 0)
        scroll_mouse(dy)

    elif msg_type == "click":
        # Direct click from client (simpler & more reliable)
        button = msg.get("button", "left")
        if button == "left":
            click_mouse("left", True)
            click_mouse("left", False)
        elif button == "right":
            click_mouse("right", True)
            click_mouse("right", False)
        elif button == "double":
            click_mouse("left", True)
            click_mouse("left", False)
            click_mouse("left", True)
            click_mouse("left", False)

    elif msg_type == "touch_start":
        # Finger down (legacy, kept for compatibility)
        touch_id = msg.get("touchId", 0)
        x = msg.get("x", 0)
        y = msg.get("y", 0)
        timestamp = msg.get("t", time.time() * 1000)

        touch_state[touch_id] = {
            "start_x": x,
            "start_y": y,
            "last_x": x,
            "last_y": y,
            "start_time": timestamp,
            "moved": False,
            "tap_count": 0,
            "last_tap_time": 0,
            "ended": False,
        }

        # Check for double tap on same finger
        t = touch_state[touch_id]
        if timestamp - t["last_tap_time"] < DOUBLE_TAP_WINDOW_MS:
            t["tap_count"] += 1
        else:
            t["tap_count"] = 1
        t["last_tap_time"] = timestamp

    elif msg_type == "touch_move":
        # Finger dragging (legacy)
        touch_id = msg.get("touchId", 0)
        x = msg.get("x", 0)
        y = msg.get("y", 0)

        if touch_id not in touch_state:
            return

        t = touch_state[touch_id]
        dx = x - t["last_x"]
        dy = y - t["last_y"]
        t["last_x"] = x
        t["last_y"] = y

        # Check if moved enough to cancel tap
        total_dx = x - t["start_x"]
        total_dy = y - t["start_y"]
        if (total_dx ** 2 + total_dy ** 2) ** 0.5 > CLICK_THRESHOLD_PX:
            t["moved"] = True

        # Count active touches (not ended)
        active_touches = [(tid, td) for tid, td in touch_state.items() if not td.get("ended", False)]
        active_ids = [tid for tid, _ in active_touches]

        if len(active_touches) == 1 and active_ids[0] == touch_id and not t["moved"]:
            # Single finger drag = move mouse (dx, dy are already normalized 0-1, scale by 100 for pixels)
            move_mouse(dx * 100, dy * 100)
        elif len(active_touches) == 2:
            # Two finger drag = scroll
            other = next((td for tid, td in active_touches if tid != touch_id), None)
            if other:
                other_dy = y - other["last_y"]
                avg_dy = (dy + other_dy) / 2
                scroll_mouse(-avg_dy * 100)

    elif msg_type == "touch_end":
        # Finger lifted (legacy)
        touch_id = msg.get("touchId", 0)
        timestamp = msg.get("t", time.time() * 1000)

        if touch_id not in touch_state:
            return

        t = touch_state[touch_id]
        t["ended"] = True
        t["end_time"] = timestamp

        # Count OTHER active touches (not ended, excluding this one)
        other_active_count = sum(1 for tid, td in touch_state.items() 
                                 if tid != touch_id and not td.get("ended", False))

        # Determine action based on tap count and other active touches
        if not t["moved"] and (timestamp - t["start_time"]) < CLICK_THRESHOLD_MS:
            if t["tap_count"] >= 2:
                click_mouse("left", True)
                click_mouse("left", False)
                click_mouse("left", True)
                click_mouse("left", False)
            elif other_active_count == 0:
                click_mouse("left", True)
                click_mouse("left", False)
            elif other_active_count == 1:
                click_mouse("right", True)
                click_mouse("right", False)

        # Clean up ended touches older than 500ms
        now = time.time() * 1000
        to_delete = []
        for tid, td in touch_state.items():
            if td.get("ended", False) and (now - td.get("end_time", now)) > 500:
                to_delete.append(tid)
        for tid in to_delete:
            del touch_state[tid]

    elif msg_type == "pinch":
        # Pinch zoom (two-finger) - legacy support
        touch_id = msg.get("touchId", "0")
        x = msg.get("x", 0)
        y = msg.get("y", 0)
        handle_pinch_zoom(touch_id, x, y)

    elif msg_type == "key":
        key = msg.get("key", "")
        if key:
            type_key(key)

    elif msg_type == "text":
        text = msg.get("text", "")
        keyboard.type(text)

    elif msg_type == "config":
        global MOUSE_SENSITIVITY, SCROLL_SENSITIVITY, PINCH_ZOOM_THRESHOLD
        MOUSE_SENSITIVITY = msg.get("mouseSensitivity", MOUSE_SENSITIVITY)
        SCROLL_SENSITIVITY = msg.get("scrollSensitivity", SCROLL_SENSITIVITY)
        PINCH_ZOOM_THRESHOLD = msg.get("pinchThreshold", PINCH_ZOOM_THRESHOLD)


def handle_pinch_zoom(touch_id: str, x: float, y: float):
    """Handle pinch zoom with two touch points"""
    if not hasattr(handle_pinch_zoom, "points"):
        handle_pinch_zoom.points = {}
    handle_pinch_zoom.points[touch_id] = (x, y)

    if len(handle_pinch_zoom.points) >= 2:
        points = list(handle_pinch_zoom.points.values())
        dx = points[0][0] - points[1][0]
        dy = points[0][1] - points[1][1]
        distance = (dx ** 2 + dy ** 2) ** 0.5

        if not hasattr(handle_pinch_zoom, "last_distance"):
            handle_pinch_zoom.last_distance = distance
            return

        diff = distance - handle_pinch_zoom.last_distance
        if abs(diff) > PINCH_ZOOM_THRESHOLD:
            with keyboard.pressed(Key.ctrl):
                mouse.scroll(0, diff * 2)
            handle_pinch_zoom.last_distance = distance
    else:
        handle_pinch_zoom.last_distance = None


# ==================== HTTP Routes ====================
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return HTMLResponse(content=INDEX_HTML)


@app.get("/config", response_class=JSONResponse)
async def get_config():
    return CONFIG


@app.get("/health")
async def health():
    return {"status": "ok", "connections": len(manager.active_connections)}


# ==================== System Monitor ====================
# Dipakai portal FanraAi (Vercel) untuk tampilkan baterai, RAM, CPU, uptime
# laptop Irfan. CORS allow_origins ["*"] wajib supaya bisa di-fetch cross-origin.


def _get_wifi_ssid() -> str | None:
    """Ambil nama WiFi yang sedang terhubung (Windows: netsh)."""
    try:
        r = subprocess.run(
            ["netsh", "wlan", "show", "interfaces"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode != 0:
            return None
        for line in r.stdout.splitlines():
            line = line.strip()
            if line.startswith("SSID"):
                # "SSID : nama" atau "SSID 1 : nama"
                parts = line.split(":", 1)
                if len(parts) == 2:
                    val = parts[1].strip()
                    # "BSSID ..." juga match, lewati
                    if val and "BSSID" not in line.upper().split(":")[0]:
                        return val
        return None
    except Exception:
        return None


def _get_local_ip() -> str | None:
    """IP lokal di jaringan saat ini (bukan 127.0.0.1)."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


@app.get("/system")
async def system_info(_: None = Depends(require_pin)):
    import platform
    import psutil

    # Baterai
    try:
        battery = psutil.sensors_battery()
        batt = {
            "percent": round(battery.percent) if battery else None,
            "plugged": bool(battery.power_plugged) if battery else None,
            "secs_left": battery.secsleft if battery else None,
        }
    except Exception:
        batt = {"percent": None, "plugged": None, "secs_left": None}

    # RAM
    vm = psutil.virtual_memory()
    ram = {
        "total_gb": round(vm.total / (1024**3), 1),
        "used_gb": round(vm.used / (1024**3), 1),
        "percent": round(vm.percent),
    }

    # CPU
    try:
        cpu_percent = round(psutil.cpu_percent(interval=0.4))
    except Exception:
        cpu_percent = None
    try:
        cpu_freq = round(psutil.cpu_freq().current / 1000, 1) if psutil.cpu_freq() else None
    except Exception:
        cpu_freq = None
    try:
        load5 = round(os.getloadavg()[1], 2)
    except Exception:
        load5 = None

    # Uptime (detik sejak boot)
    try:
        uptime_s = int(time.time() - psutil.boot_time())
    except Exception:
        uptime_s = None

    # Penyimpanan (semua partisi)
    try:
        disks = []
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append({
                    "mount": part.mountpoint,
                    "device": part.device,
                    "total_gb": round(usage.total / (1024**3), 1),
                    "used_gb": round(usage.used / (1024**3), 1),
                    "free_gb": round(usage.free / (1024**3), 1),
                    "percent": round(usage.percent),
                })
            except (PermissionError, OSError):
                continue
    except Exception:
        disks = []

    # Suhu CPU (Windows jarang ada, coba dulu)
    try:
        temps = []
        for name, entries in (psutil.sensors_temperatures() or {}).items():
            for e in entries[:2]:
                temps.append({"label": e.label or name, "current": e.current})
        temps = temps[:4]
    except Exception:
        temps = []

    # Jaringan: WiFi + interface aktif
    try:
        import socket
        net = {
            "wifi_ssid": _get_wifi_ssid(),
            "local_ip": _get_local_ip(),
            "bytes_sent_mb": round(psutil.net_io_counters().bytes_sent / (1024**2), 1),
            "bytes_recv_mb": round(psutil.net_io_counters().bytes_recv / (1024**2), 1),
        }
    except Exception:
        net = {"wifi_ssid": None, "local_ip": None,
               "bytes_sent_mb": None, "bytes_recv_mb": None}

    return {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "cpu_percent": cpu_percent,
        "cpu_freq_ghz": cpu_freq,
        "cpu_cores": psutil.cpu_count(logical=False),
        "cpu_threads": psutil.cpu_count(logical=True),
        "load5": load5,
        "ram": ram,
        "battery": batt,
        "uptime_s": uptime_s,
        "disks": disks,
        "temps": temps,
        "net": net,
        "ts": int(time.time()),
    }



# ==================== Clipboard Sync ====================
CLIPBOARD_FILE = Path(__file__).parent / "clipboard.json"
_clipboard_lock = asyncio.Lock()
# Sinkron teks antara HP (portal) dan laptop. Disimpan di memori + file
# (clipboard.json) supaya tidak hilang saat server restart.


async def _read_clipboard() -> dict:
    try:
        if CLIPBOARD_FILE.exists():
            return json.loads(CLIPBOARD_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"text": "", "updated": 0, "from": ""}


async def _write_clipboard(data: dict) -> None:
    try:
        CLIPBOARD_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


@app.get("/clipboard")
async def clipboard_get(_: None = Depends(require_pin)):
    async with _clipboard_lock:
        return await _read_clipboard()


@app.post("/clipboard")
async def clipboard_set(request: Request, _: None = Depends(require_pin)):
    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "Body bukan JSON valid"}
    text = str(body.get("text", ""))
    if len(text) > 100_000:
        return {"ok": False, "error": "Teks terlalu panjang (maks 100KB)"}
    data = {"text": text, "updated": int(time.time()), "from": str(body.get("from", "portal"))}
    async with _clipboard_lock:
        await _write_clipboard(data)
    # Sinkron ke clipboard laptop (pynput sudah diimport di file ini)
    try:
        import pyperclip

        pyperclip.copy(text)
    except Exception:
        pass
    return {"ok": True, **data}


# ==================== File Transfer ====================
# Akses folder dari HP: list, download, upload. Dibatasi ke beberapa folder
# aman untuk menghindari expose seluruh isi laptop.
ALLOWED_DIRS = {
    "downloads": Path.home() / "Downloads",
    "documents": Path.home() / "Documents",
    "fanraai": Path("C:/Users/ASUS/FanraAi"),
    "scratch": Path("C:/Users/ASUS/AppData/Local/hermes/cache/scratch"),
}
MAX_UPLOAD_MB = 50


def _resolve(folder: str, name: str) -> Path | None:
    base = ALLOWED_DIRS.get(folder)
    if base is None:
        return None
    # Cegah path traversal: nama tidak boleh mengandung .. atau path absolut
    if not name or ".." in name.split("/") or ".." in name.split("\\") or Path(name).is_absolute():
        return None
    return (base / name).resolve()


@app.get("/files/{folder}")
async def files_list(folder: str, _: None = Depends(require_pin)):
    base = ALLOWED_DIRS.get(folder)
    if base is None:
        return JSONResponse({"ok": False, "error": "Folder tidak diizinkan"}, status_code=403)
    try:
        entries = []
        for p in sorted(base.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            try:
                st = p.stat()
                entries.append({
                    "name": p.name,
                    "is_dir": p.is_dir(),
                    "size": st.st_size if p.is_file() else None,
                    "modified": int(st.st_mtime),
                })
            except (PermissionError, OSError):
                continue
        return {"ok": True, "folder": folder, "path": str(base), "entries": entries}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/files/{folder}/{name:path}")
async def files_download(folder: str, name: str, _: None = Depends(require_pin)):
    target = _resolve(folder, name)
    if target is None or not target.exists() or not target.is_file():
        return JSONResponse({"ok": False, "error": "File tidak ditemukan"}, status_code=404)
    return FileResponse(str(target), filename=target.name)


@app.post("/files/{folder}")
async def files_upload(folder: str, _: None = Depends(require_pin)):
    base = ALLOWED_DIRS.get(folder)
    if base is None:
        return JSONResponse({"ok": False, "error": "Folder tidak diizinkan"}, status_code=403)
    # Sanitasi nama file
    safe = Path(file.filename or "upload.bin").name
    if not safe or safe.startswith("."):
        safe = f"upload_{int(time.time())}"
    target = base / safe
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
            return JSONResponse(
                {"ok": False, "error": f"File terlalu besar (maks {MAX_UPLOAD_MB}MB)"}, status_code=413
            )
        target.write_bytes(content)
        return {"ok": True, "name": safe, "size": len(content)}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==================== Media & Volume Control ====================
# Kontrol media playback & volume Windows via media key pynput.
_kb = KeyboardController()


@app.post("/media/{action}")
async def media_control(action: str, _: None = Depends(require_pin)):
    """Aksi: play_pause, next, prev, vol_up, vol_down, mute."""
    keys = {
        "play_pause": Key.media_play_pause,
        "next": Key.media_next,
        "prev": Key.media_previous,
        "vol_up": Key.media_volume_up,
        "vol_down": Key.media_volume_down,
        "mute": Key.media_volume_mute,
    }
    key = keys.get(action)
    if key is None:
        return JSONResponse({"ok": False, "error": f"Aksi tidak dikenal: {action}"}, status_code=400)
    try:
        _kb.press(key)
        _kb.release(key)
        return {"ok": True, "action": action}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/volume")
async def volume_get(_: None = Depends(require_pin)):
    """Baca volume saat ini (0-100). Butuh pycaw; kalau tidak ada tetap jalan."""
    try:
        from ctypes import cast, POINTER
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume

        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        volume = cast(interface, POINTER(IAudioEndpointVolume))
        return {"ok": True, "percent": round(volume.GetMasterVolumeLevelScalar() * 100), "muted": bool(volume.GetMute())}
    except Exception:
        return {"ok": True, "percent": None, "muted": None}


# ==================== Screenshot ====================
# Ambil screenshot layar laptop. Disimpan ke scratch, dikembalikan sebagai JPEG
# (lebih kecil dari PNG untuk transfer via tunnel).
SCREENSHOT_DIR = Path("C:/Users/ASUS/AppData/Local/hermes/cache/scratch")


@app.get("/screenshot")
async def screenshot(_: None = Depends(require_pin)):
    try:
        from PIL import ImageGrab

        img = ImageGrab.grab()
        # Resize jika terlalu lebar untuk mempercepat transfer
        if img.width > 1280:
            ratio = 1280 / img.width
            img = img.resize((1280, int(img.height * ratio)), 3)
        target = SCREENSHOT_DIR / f"live-shot-{int(time.time())}.jpg"
        img.save(str(target), "JPEG", quality=70)
        return FileResponse(str(target), media_type="image/jpeg")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==================== Text To Speech ====================
# Generate suara dari teks. Default voice: Jean (Pocket TTS, lokal CPU).
# Voice state ada di C:/Users/ASUS/FanraAi/voice-jean.safetensors
VOICE_STATE_FILE = "C:/Users/ASUS/FanraAi/voice-jean.safetensors"
TTS_CONFIG = "C:/Users/ASUS/AppData/Roaming/Python/Python314/site-packages/pocket_tts/config/english_2026-09.yaml"
_tts_model = None


def _get_tts_model():
    global _tts_model
    if _tts_model is None:
        from pocket_tts import TTSModel

        _tts_model = TTSModel.load_model(config=TTS_CONFIG)
    return _tts_model


# ==================== Chat History (persistent) ====================
# Riwayat chat disimpan di server laptop, bukan di browser.
# Survive refresh, ganti device, chat lain kali.
CHAT_HISTORY_FILE = Path("C:/Users/ASUS/FanraAi/chat-history.json")
_chat_lock = asyncio.Lock()


@app.get("/chat-history")
async def chat_history_get(_: None = Depends(require_pin)):
    """Ambil seluruh riwayat chat."""
    async with _chat_lock:
        try:
            if CHAT_HISTORY_FILE.exists():
                data = json.loads(CHAT_HISTORY_FILE.read_text(encoding="utf-8"))
                return {"ok": True, "messages": data}
        except Exception:
            pass
    return {"ok": True, "messages": []}


@app.post("/chat-history")
async def chat_history_append(request: Request, _: None = Depends(require_pin)):
    """Tambah satu pesan ke riwayat. Body: {"role": "user"|"assistant", "content": "..."}"""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Body bukan JSON valid"}, status_code=400)
    role = str(body.get("role", ""))
    content = str(body.get("content", ""))
    if role not in ("user", "assistant") or not content:
        return JSONResponse({"ok": False, "error": "role/content tidak valid"}, status_code=400)
    if len(content) > 100_000:
        return JSONResponse({"ok": False, "error": "Pesan terlalu panjang"}, status_code=400)

    entry = {"role": role, "content": content, "ts": int(time.time())}
    async with _chat_lock:
        try:
            data = json.loads(CHAT_HISTORY_FILE.read_text(encoding="utf-8")) if CHAT_HISTORY_FILE.exists() else []
        except Exception:
            data = []
        data.append(entry)
        # Batasi 500 pesan terakhir biar file tidak membesar tanpa batas
        data = data[-500:]
        CHAT_HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "entry": entry}


@app.delete("/chat-history")
async def chat_history_clear(_: None = Depends(require_pin)):
    """Hapus seluruh riwayat."""
    async with _chat_lock:
        try:
            CHAT_HISTORY_FILE.write_text("[]", encoding="utf-8")
        except Exception:
            pass
    return {"ok": True}


@app.post("/tts")
async def text_to_speech(request: Request, _: None = Depends(require_pin)):
    """Body: {"text": "..."} -> audio/wav 24kHz mono."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Body bukan JSON valid"}, status_code=400)
    text = str(body.get("text", "")).strip()
    if not text:
        return JSONResponse({"ok": False, "error": "Teks tidak boleh kosong"}, status_code=400)
    if len(text) > 2000:
        return JSONResponse({"ok": False, "error": "Teks terlalu panjang (maks 2000 karakter)"}, status_code=400)
    try:
        import scipy.io.wavfile
        import numpy as np

        model = _get_tts_model()
        voice = model.get_state_for_audio_prompt(VOICE_STATE_FILE)
        audio = model.generate_audio(voice, text)
        a = audio.numpy().astype(np.float32)
        a = a / (np.max(np.abs(a)) + 1e-9)
        a = (a * 32767).astype(np.int16)

        out = Path("C:/Users/ASUS/AppData/Local/hermes/cache/scratch/tts-out.wav")
        out.parent.mkdir(parents=True, exist_ok=True)
        scipy.io.wavfile.write(str(out), model.sample_rate, a)
        return FileResponse(str(out), media_type="audio/wav")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==================== Task Manager ====================
@app.get("/processes")
async def list_processes(_: None = Depends(require_pin)):
    """Daftar proses yang aktif, diurutkan berdasarkan RAM."""
    try:
        procs = []
        for p in psutil.process_iter(['pid', 'name', 'memory_info', 'cpu_percent']):
            try:
                mem = p.info['memory_info']
                procs.append({
                    "pid": p.info['pid'],
                    "name": p.info['name'] or "?",
                    "ram_mb": round(mem.rss / 1024 / 1024, 1) if mem else 0,
                    "cpu": p.info['cpu_percent'] or 0,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        procs.sort(key=lambda x: x["ram_mb"], reverse=True)
        return {"ok": True, "processes": procs[:60]}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/processes/kill")
async def kill_process(request: Request, _: None = Depends(require_pin)):
    """Hentikan proses berdasarkan PID. Body: {"pid": 1234}"""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Body bukan JSON valid"}, status_code=400)
    try:
        pid = int(body.get("pid", 0))
    except (TypeError, ValueError):
        return JSONResponse({"ok": False, "error": "PID tidak valid"}, status_code=400)
    if pid <= 4:
        return JSONResponse({"ok": False, "error": "PID sistem tidak boleh dihentikan"}, status_code=400)
    # Daftar proses kritikal yang tidak boleh dimatikan
    try:
        proc = psutil.Process(pid)
        name = (proc.name() or "").lower()
        critical = ("pm2", "node.exe", "python.exe", "brave", "explorer", "dwm", "svchost", "csrss", "wininit", "services")
        if any(c in name for c in critical):
            return JSONResponse({"ok": False, "error": f"Proses '{name}' diblokir (sistem/kritis)"}, status_code=403)
        proc.terminate()
        gone = proc.wait(timeout=5)
        return {"ok": True, "killed": True, "pid": pid}
    except psutil.NoSuchProcess:
        return JSONResponse({"ok": False, "error": "Proses tidak ditemukan"}, status_code=404)
    except psutil.AccessDenied:
        return JSONResponse({"ok": False, "error": "Akses ditolak (butuh admin)"}, status_code=403)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==================== Remote Terminal ====================
# Menyimpan working directory per-sesi (default: home user)
_terminal_cwd = str(Path.home())


@app.post("/terminal")
async def run_terminal(request: Request, _: None = Depends(require_pin)):
    """Jalankan command shell di laptop. Body: {"cmd": "..."}"""
    global _terminal_cwd
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Body bukan JSON valid"}, status_code=400)
    cmd = str(body.get("cmd", "")).strip()
    if not cmd:
        return JSONResponse({"ok": False, "error": "Command tidak boleh kosong"}, status_code=400)
    if len(cmd) > 5000:
        return JSONResponse({"ok": False, "error": "Command terlalu panjang"}, status_code=400)

    # Block command berbahaya
    blocked = ("format ", "del /f", "rd /s", "shutdown", "reg delete", "diskpart")
    low = cmd.lower()
    if low.startswith(blocked) or any(b in low for b in ("rm -rf /", "mkfs")):
        return JSONResponse({"ok": False, "error": "Command diblokir (berbahaya)"}, status_code=403)

    # Handle cd khusus karena subprocess tidak persist cwd
    if low.startswith("cd ") or low == "cd":
        parts = cmd[3:].strip() if low.startswith("cd ") else ""
        if not parts:
            return {"ok": True, "output": _terminal_cwd, "cwd": _terminal_cwd}
        new_path = Path(parts) if Path(parts).is_absolute() else Path(_terminal_cwd) / parts
        try:
            new_path = new_path.resolve()
            if new_path.is_dir():
                _terminal_cwd = str(new_path)
                return {"ok": True, "output": "", "cwd": _terminal_cwd}
            return {"ok": False, "error": f"Direktori tidak ditemukan: {parts}"}, 400
        except Exception as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=400)

    try:
        # Jalankan via cmd.exe /c agar command Windows native jalan
        result = subprocess.run(
            ["cmd.exe", "/c", cmd],
            cwd=_terminal_cwd,
            capture_output=True,
            text=True,
            timeout=30,
            shell=False,
        )
        output = (result.stdout or "") + (result.stderr or "")
        if not output:
            output = "(tidak ada output)"
        # Batasi output
        if len(output) > 20000:
            output = output[:20000] + "\n...(output dipotong)"
        return {"ok": True, "output": output, "cwd": _terminal_cwd}
    except subprocess.TimeoutExpired:
        return JSONResponse({"ok": False, "error": "Command timeout (maks 30 detik)"}, status_code=504)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==================== Webcam Viewer ====================
_webcam_lock = asyncio.Lock()
_webcam_device = None


def _find_webcam_device():
    """Cari device index webcam pertama yang tersedia."""
    global _webcam_device
    if _webcam_device is not None:
        return _webcam_device
    for i in range(5):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        if cap.isOpened():
            cap.release()
            _webcam_device = i
            return i
        cap.release()
    return None


# ==================== Quick Actions ====================
# Aksi cepat yang sering dipakai: lock laptop, buka aplikasi, restart service.
# Semua aksi sudah didefinisikan di sini (tidak menerima command bebas),
# jadi tidak bisa disalahgunakan untuk menjalankan apa pun.

QUICK_ACTIONS: dict[str, list[str]] = {
    # Kunci laptop (Windows)
    "lock": ["rundll32.exe", "user32.dll,LockWorkStation"],
    # Buka Explorer
    "explorer": ["cmd.exe", "/c", "explorer.exe"],
    # Buka browser default
    "browser": ["cmd.exe", "/c", "start", ""],
    # Buka Pengaturan Windows
    "settings": ["cmd.exe", "/c", "start", "ms-settings:"],
    # Restart touchpad server (PM2)
    "restart-touchpad": ["cmd.exe", "/c", "npx pm2 restart touchpad"],
}


@app.post("/quick-action/{name}")
async def quick_action(name: str, _: None = Depends(require_pin)):
    """Jalankan aksi cepat yang sudah didefinisikan. Aksi bebas ditolak."""
    args = QUICK_ACTIONS.get(name)
    if args is None:
        return JSONResponse(
            {"ok": False, "error": f"Aksi tidak dikenal: {name}"},
            status_code=400,
        )
    try:
        subprocess.Popen(args, close_fds=True)
        return {"ok": True, "action": name}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==================== Now Playing (media yang sedang diputar) ====================
# Baca judul lagu/video yang sedang play di Brave via title window aktif.
# Cara: cari process brave yang punya window title (judul tab YouTube/TikTok/dll).

NOW_PLAYING_RE = re.compile(r"^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]\s*(.+?)$")


def _get_brave_titles() -> list[str]:
    """Ambil judul window Brave (judul tab aktif).

    Pakai ctypes murni (win32gui/pywin32 tidak terpasang di interpreter PM2).
    Deteksi dari akhiran " - Brave" di judul window.
    """
    try:
        import ctypes

        user32 = ctypes.windll.user32
        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
        titles: list[str] = []

        def _enum(hwnd: int, _lparam: int) -> bool:
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return True
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            if buf.value and buf.value.endswith(" - Brave"):
                titles.append(buf.value)
            return True

        user32.EnumWindows(WNDENUMPROC(_enum), 0)
        return titles
    except Exception:
        return []


def _parse_title(title: str) -> dict[str, str | None]:
    """Ubah judul tab browser jadi {title, artist, source}.

    Format umum: "Artist - Title - YouTube" / "Title - TikTok" / "Artist - Title - Brave"
    """
    source = None
    for src in ("YouTube", "TikTok", "Instagram", "Spotify", "SoundCloud", "Twitch", "Netflix"):
        if src in title:
            source = src
            title = title.replace(f" - {src}", "").replace(f" {src}", "").strip()
            break

    # strip akhiran " - Brave" / "Video Musik Resmi" / "Official Music Video"
    title = re.sub(r"\s*[-–—]\s*Brave\s*$", "", title).strip()
    title = re.sub(r"\s*\((?:Official|Video Musik Resmi|Resmi|Lyric|Audio|Official Music Video)[^)]*\)\s*$", "", title, flags=re.IGNORECASE).strip()

    m = NOW_PLAYING_RE.match(title)
    if m:
        # "Artist - Title - sisa" -> ambil 2 pertama
        parts = re.split(r"\s*[-–—]\s*", title)
        if len(parts) >= 2:
            return {"title": parts[1].strip(), "artist": parts[0].strip(), "source": source}
    return {"title": title or None, "artist": None, "source": source}

@app.get("/now-playing")
async def now_playing(_: None = Depends(require_pin)):
    """Lagu/video yang sedang diputar di Brave (berdasarkan judul tab)."""
    titles = _get_brave_titles()
    if not titles:
        return {"ok": True, "playing": False, "title": None, "artist": None, "source": None}

    # Cari yang mengandung indikator media
    media_titles = [t for t in titles if any(s in t for s in ("YouTube", "TikTok", "Spotify", "SoundCloud", "Twitch"))]
    if not media_titles:
        return {"ok": True, "playing": False, "title": None, "artist": None, "source": None}

    info = _parse_title(media_titles[0])
    return {"ok": True, "playing": True, **info}


# ==================== Notifikasi Telegram ====================
# Kirim notifikasi ke Telegram user via `hermes send` (aman, pakai gateway
# yang sudah terkonfigurasi, tanpa token tambahan).

TELEGRAM_CHAT_ID = "6105000024"
HERMES_BIN = str(Path("C:/Users/ASUS/AppData/Local/hermes/bin/hermes.exe"))
_last_notify: dict[str, float] = {}
NOTIFY_COOLDOWN = 300.0  # 5 menit per topik


@app.post("/notify")
async def send_notify(request: Request, _: None = Depends(require_pin)):
    """Kirim notifikasi ke Telegram. Body: {"topic": "...", "message": "..."}.

    Cooldown 5 menit per topik biar tidak spam.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Body bukan JSON valid"}, status_code=400)

    topic = str(body.get("topic", "")).strip() or "Umum"
    message = str(body.get("message", "")).strip()
    if not message:
        return JSONResponse({"ok": False, "error": "Pesan tidak boleh kosong"}, status_code=400)
    if len(message) > 1000:
        return JSONResponse({"ok": False, "error": "Pesan terlalu panjang (maks 1000 karakter)"}, status_code=400)

    # Cooldown per topik
    now = time.time()
    if now - _last_notify.get(topic, 0) < NOTIFY_COOLDOWN:
        return {"ok": True, "skipped": True, "reason": "Cooldown"}

    if not Path(HERMES_BIN).exists():
        return JSONResponse(
            {"ok": False, "error": "Hermes CLI tidak ditemukan"},
            status_code=500,
        )

    try:
        proc = subprocess.run(
            [HERMES_BIN, "send", "-t", f"telegram:{TELEGRAM_CHAT_ID}", "-q", message],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if proc.returncode != 0:
            return JSONResponse(
                {"ok": False, "error": (proc.stderr or "Gagal kirim").strip()[:200]},
                status_code=502,
            )
        _last_notify[topic] = now
        return {"ok": True, "skipped": False}
    except subprocess.TimeoutExpired:
        return JSONResponse({"ok": False, "error": "Timeout kirim notifikasi"}, status_code=504)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)[:200]}, status_code=500)


@app.get("/webcam")
async def webcam_snapshot(_: None = Depends(require_pin)):
    """Ambil satu frame dari webcam laptop."""
    async with _webcam_lock:
        tmp = Path("C:/Users/ASUS/AppData/Local/hermes/cache/scratch/webcam.jpg")
        tmp.parent.mkdir(parents=True, exist_ok=True)
        try:
            dev = _find_webcam_device()
            if dev is None:
                return JSONResponse({"ok": False, "error": "Webcam tidak ditemukan"}, status_code=404)
            cap = cv2.VideoCapture(dev, cv2.CAP_DSHOW)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            # Buang beberapa frame pertama biar eksposur benar
            for _ in range(8):
                cap.read()
            ok, frame = cap.read()
            cap.release()
            if not ok or frame is None:
                return JSONResponse({"ok": False, "error": "Gagal mengambil frame webcam"}, status_code=500)
            # Mirror biar natural kayak cermin
            frame = cv2.flip(frame, 1)
            cv2.imwrite(str(tmp), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            return FileResponse(str(tmp), media_type="image/jpeg")
        except Exception as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


PID_FILE = Path(__file__).parent / ".server.pid"
PORT = CONFIG.get("server", {}).get("port", 8000)
HOST = CONFIG.get("server", {}).get("host", "0.0.0.0")


def check_port_in_use(port: int) -> bool:
    """Check if port is in use"""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.connect_ex(('127.0.0.1', port)) == 0


def read_pid() -> Optional[int]:
    """Read PID from pid file"""
    if PID_FILE.exists():
        try:
            return int(PID_FILE.read_text().strip())
        except Exception:
            return None
    return None


def write_pid(pid: int):
    """Write PID to pid file"""
    PID_FILE.write_text(str(pid))


def clear_pid():
    """Clear PID file"""
    if PID_FILE.exists():
        PID_FILE.unlink()


def is_process_running(pid: int) -> bool:
    """Check if process with PID is running"""
    import psutil
    try:
        return psutil.Process(pid).is_running()
    except Exception:
        return False


def get_server_pid() -> Optional[int]:
    """Get server PID if running"""
    pid = read_pid()
    if pid and is_process_running(pid):
        return pid
    return None


def stop_server() -> bool:
    """Stop the running server"""
    pid = get_server_pid()
    if not pid:
        print("⚠️  Server tidak berjalan (PID file tidak ditemukan atau proses sudah mati)")
        clear_pid()
        return False
    
    print(f"🛑 Menghentikan server (PID: {pid})....")
    try:
        import psutil
        proc = psutil.Process(pid)
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2)
        print("✅ Server dihentikan")
    except Exception as e:
        print(f"❌ Gagal menghentikan server: {e}")
        return False
    finally:
        clear_pid()
    return True


def start_server(background: bool = False) -> bool:
    """Start the server"""
    # Check if already running
    existing_pid = get_server_pid()
    if existing_pid:
        print(f"⚠️  Server sudah berjalan (PID: {existing_pid})")
        return False
    
    # Check port
    if check_port_in_use(PORT):
        print(f"⚠️  Port {PORT} sudah digunakan. Coba stop server yang lain dulu.")
        return False
    
    print(f"🚀 Memulai server di port {PORT}...")
    
    if background:
        # Run in background using subprocess - use a separate entry point
        import subprocess
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "server:app", "--host", HOST, "--port", str(PORT), "--log-level", "info"],
            cwd=Path(__file__).parent,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True
        )
        write_pid(proc.pid)
        # Wait a moment and verify
        time.sleep(3)
        if is_process_running(proc.pid):
            # Check if port is listening
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                if s.connect_ex(('127.0.0.1', PORT)) == 0:
                    print(f"✅ Server berjalan di background (PID: {proc.pid})")
                    print(f"📱 Akses: http://<IP_LAPTOP>:{PORT}")
                    return True
            print("❌ Server gagal start (port tidak listening)")
            stdout, stderr = proc.communicate(timeout=1)
            if stdout:
                print("STDOUT:", stdout.decode()[:500])
            if stderr:
                print("STDERR:", stderr.decode()[:500])
            clear_pid()
            return False
        else:
            print("❌ Server gagal start (proses mati)")
            stdout, stderr = proc.communicate(timeout=1)
            if stdout:
                print("STDOUT:", stdout.decode()[:500])
            if stderr:
                print("STDERR:", stderr.decode()[:500])
            clear_pid()
            return False
    else:
        # Run in foreground (blocking)
        write_pid(os.getpid())
        try:
            server_config = CONFIG.get("server", {})
            uvicorn.run(app, host=server_config.get("host", "0.0.0.0"), port=server_config.get("port", 8000), log_level=server_config.get("log_level", "info"))
        finally:
            clear_pid()
        return True


def restart_server() -> bool:
    """Restart the server"""
    print("🔄 Restart server...")
    stop_server()
    time.sleep(1)
    return start_server(background=True)


def status_server():
    """Show server status"""
    pid = get_server_pid()
    if pid:
        print(f"✅ Server BERJALAN (PID: {pid})")
        print(f"📱 Port: {PORT}")
        print(f"🌐 URL: http://192.168.1.11:{PORT}")
        # Try health check
        try:
            import urllib.request
            resp = urllib.request.urlopen(f"http://localhost:{PORT}/health", timeout=2)
            data = json.loads(resp.read().decode())
            print(f"💓 Health: {data}")
        except Exception as e:
            print(f"⚠️  Health check gagal: {e}")
    else:
        print("❌ Server TIDAK berjalan")


def run_foreground():
    """Run server in foreground (for direct execution)"""
    # Check if already running
    existing_pid = get_server_pid()
    if existing_pid:
        print(f"⚠️  Server sudah berjalan (PID: {existing_pid})")
        print("   Gunakan 'python server.py stop' untuk menghentikan dulu")
        return
    
    # Check port (with SO_REUSEADDR to avoid TIME_WAIT issues)
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if s.connect_ex(('127.0.0.1', PORT)) == 0:
            print(f"⚠️  Port {PORT} sudah digunakan")
            return
    
    write_pid(os.getpid())
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        except Exception:
            local_ip = "127.0.0.1"
        finally:
            s.close()

        print(f"\n🌐 Local IP: {local_ip}")
        print(f"📱 Access from phone: http://{local_ip}:8000")
        print()

        server_config = CONFIG.get("server", {})
        uvicorn.run(app, host=server_config.get("host", "0.0.0.0"), port=server_config.get("port", 8000), log_level=server_config.get("log_level", "info"))
    finally:
        clear_pid()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "start":
            start_server(background=True)
        elif cmd == "stop":
            stop_server()
        elif cmd == "restart":
            restart_server()
        elif cmd == "status":
            status_server()
        else:
            print(f"❌ Command tidak dikenal: {cmd}")
            print("Gunakan: start | stop | restart | status")
            sys.exit(1)
    else:
        # Default: run in foreground
        run_foreground()