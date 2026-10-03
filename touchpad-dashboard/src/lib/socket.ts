// Pengelola koneksi WebSocket untuk touchpad remote dan keyboard
export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export interface TouchpadEvent {
  type: 'move' | 'click' | 'scroll' | 'down' | 'up' | 'key' | 'text';
  dx?: number;
  dy?: number;
  button?: 'left' | 'right' | 'middle';
  key?: string;
  text?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

class RemoteSocketManager {
  private ws: WebSocket | null = null;
  private url: string = '';
  private state: ConnectionState = 'disconnected';
  private listeners: Set<(state: ConnectionState) => void> = new Set();
  private actionListeners: Set<(event: TouchpadEvent) => void> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private autoReconnect: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedUrl = localStorage.getItem('fanra_mouse_ws_url');
      if (savedUrl) {
        this.url = savedUrl;
      }
      // Auto-connect ke server touchpad default saat dashboard pertama kali dibuka.
      // Tanpa ini status selalu "Standalone" dan kontrol mouse tidak pernah terkirim.
      const publicWs = process.env.NEXT_PUBLIC_TOUCHPAD_WS;
      if (publicWs) {
        this.url = publicWs;
      } else if (!this.url) {
        const secure = window.location.protocol === 'https:';
        const host = window.location.hostname; // tanpa port
        const proto = secure ? 'wss' : 'ws';
        // Akses langsung di WiFi rumah: pakai port 8000 server touchpad
        this.url = `${proto}://${host}:8000/ws`;
      }
      // Sambungkan setelah load agar tidak memblokir render
      setTimeout(() => this.connect(), 100);
    }
  }

  public getStatus(): ConnectionState {
    return this.state;
  }

  public getUrl(): string {
    return this.url;
  }

  public subscribe(callback: (state: ConnectionState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public subscribeAction(callback: (event: TouchpadEvent) => void): () => void {
    this.actionListeners.add(callback);
    return () => this.actionListeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.state));
  }

  public connect(targetUrl?: string): void {
    if (typeof window === 'undefined') return;

    if (targetUrl) {
      this.url = targetUrl;
      localStorage.setItem('fanra_mouse_ws_url', targetUrl);
    }

    // Tentukan URL WebSocket default jika belum diset
    let wsUrl = this.url;
    if (!wsUrl) {
      const defaultHost = process.env.NEXT_PUBLIC_TUNNEL_URL || process.env.NEXT_PUBLIC_LOCAL_SERVER_URL || 'http://localhost:8000';
      wsUrl = defaultHost.replace(/^http/, 'ws');
      if (!wsUrl.endsWith('/ws')) {
        wsUrl = `${wsUrl.replace(/\/$/, '')}/ws`;
      }
      this.url = wsUrl;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Abaikan
      }
      this.ws = null;
    }

    this.state = 'connecting';
    this.notify();

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.state = 'connected';
        this.notify();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onclose = () => {
        this.state = 'disconnected';
        this.notify();
        if (this.autoReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.state = 'disconnected';
        this.notify();
      };
      // Balas ping server agar koneksi tidak dianggap timeout
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
          if (msg?.type === 'ping' && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
          }
        } catch {
          // Bukan JSON, abaikan
        }
      };
    } catch {
      this.state = 'disconnected';
      this.notify();
      if (this.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state === 'disconnected') {
        this.connect();
      }
    }, 4000);
  }

  public disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Abaikan
      }
      this.ws = null;
    }
    this.state = 'disconnected';
    this.notify();
  }

  public send(payload: TouchpadEvent): boolean {
    // Selalu kirim ke subscriber action lokal agar semua tombol & aksi terverifikasi berfungsi
    this.actionListeners.forEach((cb) => cb(payload));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  // Fungsi shortcut
  public sendMove(dx: number, dy: number): void {
    this.send({ type: 'move', dx: Math.round(dx), dy: Math.round(dy) });
  }

  public sendClick(button: 'left' | 'right' | 'middle'): void {
    this.send({ type: 'click', button });
  }

  public sendScroll(dx: number, dy: number): void {
    this.send({ type: 'scroll', dx: Math.round(dx), dy: Math.round(dy) });
  }

  public sendDown(button: 'left' | 'right'): void {
    this.send({ type: 'down', button });
  }

  public sendUp(button: 'left' | 'right'): void {
    this.send({ type: 'up', button });
  }

  public sendKey(key: string, modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }): void {
    this.send({
      type: 'key',
      key,
      ctrl: modifiers?.ctrl,
      shift: modifiers?.shift,
      alt: modifiers?.alt,
      meta: modifiers?.meta,
    });
  }

  public sendText(text: string): void {
    this.send({ type: 'text', text });
  }
}

export const remoteSocket = new RemoteSocketManager();
