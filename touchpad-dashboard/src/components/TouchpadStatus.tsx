'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface HealthData {
  status: string;
  connections: number;
}

interface ConfigData {
  touchpad: {
    sensitivity: {
      default: number;
      min: number;
      max: number;
      step: number;
    };
    gestures: {
      tap_max_ms: number;
      tap_max_px: number;
      double_tap_ms: number;
      scroll_factor: number;
    };
    reconnect: {
      base_ms: number;
      max_ms: number;
      factor: number;
    };
    heartbeat: {
      interval_ms: number;
      timeout_ms: number;
    };
  };
  ui: {
    theme: string;
    show_touch_indicator: boolean;
    show_keyboard: boolean;
  };
  server: {
    host: string;
    port: number;
  };
}

export function TouchpadStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string>('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Gagal memuat status');
      const data = await res.json();
      setHealth(data.health);
      setConfig(data.config);
      setTunnelUrl(data.tunnelUrl || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    const loadStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('Gagal memuat status');
        const data = await res.json();
        if (!ignore) {
          setHealth(data.health);
          setConfig(data.config);
          setTunnelUrl(data.tunnelUrl || '');
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Kesalahan jaringan');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 py-1">
        <div className="h-6 bg-zinc-900 rounded w-1/3 animate-pulse" />
        <div className="h-16 bg-zinc-900 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded text-xs space-y-1.5">
        <p className="text-zinc-400 font-medium">Gagal memuat status server</p>
        <p className="text-zinc-500 text-[11px]">{error}</p>
        <button
          type="button"
          onClick={fetchData}
          className="px-2.5 py-1 text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 cursor-pointer"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-xs text-zinc-300">
      {/* Server Status Card */}
      <div className="p-2.5 rounded border border-zinc-850 bg-zinc-950">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-zinc-300">Status Server</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-[11px] text-zinc-400">{health?.status === 'ok' ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-semibold text-zinc-300">{health?.connections ?? 0}</span>
            <p className="text-[10px] text-zinc-500">Perangkat</p>
          </div>
        </div>

        {tunnelUrl && (
          <div className="mt-2 p-2 bg-black border border-zinc-800 rounded">
            <p className="text-[10px] text-zinc-500">Public Tunnel</p>
            <a
              href={tunnelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-zinc-400 underline break-all hover:text-zinc-200 block mt-0.5"
            >
              {tunnelUrl}
            </a>
          </div>
        )}
      </div>

      {/* Config Card */}
      {config && (
        <div className="p-2.5 bg-zinc-950 rounded border border-zinc-850">
          <span className="text-[11px] font-medium text-zinc-300 block mb-1.5">Konfigurasi</span>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
            <div>
              <span className="text-zinc-500 block">Sensitivitas</span>
              <span className="text-zinc-300">{config.touchpad.sensitivity.default}x</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Tap / Double-tap</span>
              <span className="text-zinc-300">{config.touchpad.gestures.tap_max_ms}ms</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Scroll Multiplier</span>
              <span className="text-zinc-300">{config.touchpad.gestures.scroll_factor}x</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Port Server</span>
              <span className="text-zinc-300">{config.server.port}</span>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={fetchData}
        className="w-full py-1.5 px-3 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded text-[11px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <RefreshCw className="w-3 h-3 text-zinc-500" />
        <span>Muat Ulang Status</span>
      </button>
    </div>
  );
}
