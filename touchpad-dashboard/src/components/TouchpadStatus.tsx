'use client';

import { useState, useEffect } from 'react';

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
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setHealth(data.health);
      setConfig(data.config);
      setTunnelUrl(data.tunnelUrl || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-lg border border-red-200">
        <p className="font-medium">Gagal memuat status</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const statusColor = health?.status === 'ok' ? 'text-green-600' : 'text-red-600';
  const statusBg = health?.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';

  return (
    <div className="space-y-4">
      {/* Server Status Card */}
      <div className={`p-4 rounded-lg border ${statusBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Touchpad Server</h3>
            <p className={`text-sm ${statusColor}`}>
              {health?.status === 'ok' ? '🟢 Online' : '🔴 Offline'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{health?.connections ?? 0}</p>
            <p className="text-xs text-gray-500">Device Terhubung</p>
          </div>
        </div>
        {tunnelUrl && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-900">Public Tunnel (Cloudflare)</p>
            <a
              href={tunnelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-700 underline break-all hover:text-blue-900"
            >
              {tunnelUrl}
            </a>
            <p className="text-xs text-blue-600 mt-1">Buka di HP untuk kontrol touchpad</p>
          </div>
        )}
      </div>

      {/* Config Card */}
      {config && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Konfigurasi Aktif</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Sensitivitas</p>
              <p className="font-mono text-lg">{config.touchpad.sensitivity.default}x</p>
              <p className="text-xs text-gray-400">
                Range: {config.touchpad.sensitivity.min}x – {config.touchpad.sensitivity.max}x
              </p>
            </div>
            <div>
              <p className="text-gray-500">Tap / Double-tap</p>
              <p className="font-mono">
                {config.touchpad.gestures.tap_max_ms}ms / {config.touchpad.gestures.double_tap_ms}ms
              </p>
            </div>
            <div>
              <p className="text-gray-500">Scroll Factor</p>
              <p className="font-mono text-lg">{config.touchpad.gestures.scroll_factor}x</p>
            </div>
            <div>
              <p className="text-gray-500">Heartbeat</p>
              <p className="font-mono">
                {config.touchpad.heartbeat.interval_ms}ms / timeout {config.touchpad.heartbeat.timeout_ms}ms
              </p>
            </div>
            <div>
              <p className="text-gray-500">Reconnect</p>
              <p className="font-mono">
                {config.touchpad.reconnect.base_ms}ms → {config.touchpad.reconnect.max_ms}ms
              </p>
            </div>
            <div>
              <p className="text-gray-500">Theme</p>
              <p className="font-mono capitalize">{config.ui.theme}</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={fetchData}
        className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
      >
        🔄 Refresh Status
      </button>
    </div>
  );
}