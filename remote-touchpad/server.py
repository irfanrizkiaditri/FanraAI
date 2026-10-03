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
import signal
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
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


# ==================== Lifecycle Commands ====================
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