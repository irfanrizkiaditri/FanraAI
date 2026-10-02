'use client';

import { useState, useEffect } from 'react';
import { remoteSocket, ConnectionState } from '@/lib/socket';
import { audioManager } from '@/lib/audio';
import { Volume2, VolumeX, Maximize2, Settings, X, Smartphone } from 'lucide-react';
import { AccelProfile } from '@/components/FullscreenTouchpad';

interface HeaderBarProps {
  onEnterFullscreen: () => void;
  isLandscape: boolean;
  onToggleOrientation: () => void;
  accelProfile: AccelProfile;
  onSetAccelProfile: (profile: AccelProfile) => void;
}

export function HeaderBar({
  onEnterFullscreen,
  isLandscape,
  onToggleOrientation,
  accelProfile,
  onSetAccelProfile,
}: HeaderBarProps) {
  const [status, setStatus] = useState<ConnectionState>(() => remoteSocket.getStatus());
  const [showConfig, setShowConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => remoteSocket.getUrl());
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const unsubscribe = remoteSocket.subscribe((newState) => {
      setStatus(newState);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (serverUrl.trim()) {
      remoteSocket.connect(serverUrl.trim());
      setShowConfig(false);
      try { audioManager.playBeep(980, 0.08); } catch {}
    }
  };

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !soundEnabled;
    setSoundEnabled(next);
    audioManager.enabled = next;
    if (next) {
      try { audioManager.playBeep(1100, 0.08); } catch {}
    }
  };

  return (
    <header className="w-full px-3 py-1.5 border-b border-zinc-800/80 bg-black/90 backdrop-blur-md text-zinc-300 transition-colors shrink-0">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
        {/* Judul Atas: Fanra Mouse */}
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-200 tracking-wide">Fanra Mouse</span>
              <span className="text-[9px] text-zinc-500 font-normal">v1.2</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowConfig(true);
                try { audioManager.playClick(); } catch {}
              }}
              className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === 'connected'
                    ? 'bg-emerald-500'
                    : status === 'connecting'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[10px]">{status === 'connected' ? 'Terhubung' : 'Lokal / Standalone'}</span>
              <Settings className="w-2.5 h-2.5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Tombol Kontrol: Suara, Orientasi Mendatar, Layar Penuh */}
        <div className="flex items-center gap-1">
          {/* Suara */}
          <button
            type="button"
            onClick={toggleSound}
            className={`px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer flex items-center gap-1 ${
              soundEnabled
                ? 'border-zinc-700 bg-zinc-900 text-zinc-200'
                : 'border-zinc-800/60 bg-black text-zinc-500'
            }`}
            title={soundEnabled ? 'Matikan Suara' : 'Aktifkan Suara'}
          >
            {soundEnabled ? <Volume2 className="w-3 h-3 text-zinc-300" /> : <VolumeX className="w-3 h-3 text-zinc-600" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Suara' : 'Bisu'}</span>
          </button>

          {/* Toggle Orientasi Mendatar (Landscape) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOrientation();
              try { audioManager.playClick(950); } catch {}
            }}
            className={`px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer flex items-center gap-1 ${
              isLandscape
                ? 'border-zinc-700 bg-zinc-900 text-zinc-200 font-medium'
                : 'border-zinc-850 bg-black text-zinc-400 hover:text-zinc-200'
            }`}
            title={isLandscape ? 'Kembali ke Orientasi Tegak (Portrait)' : 'Beralih ke Orientasi Mendatar (Landscape)'}
          >
            <Smartphone className={`w-3 h-3 ${isLandscape ? 'rotate-90 text-zinc-200' : 'text-zinc-400'}`} />
            <span className="hidden sm:inline">{isLandscape ? 'Tegak' : 'Mendatar'}</span>
          </button>

          {/* Layar Penuh */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnterFullscreen();
              try { audioManager.playClick(900); } catch {}
            }}
            className="px-2 py-1 text-[11px] rounded border border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer flex items-center gap-1"
            title="Layar Penuh (Touchpad Hitam Bersih)"
          >
            <Maximize2 className="w-3 h-3 text-zinc-300" />
            <span className="hidden sm:inline">Penuh</span>
          </button>
        </div>
      </div>

      {/* Modal Pengaturan Server & Profil Akselerasi */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm border border-zinc-800 rounded bg-zinc-950 text-zinc-200 p-4 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-xs font-medium text-zinc-200">Pengaturan Remote Touchpad</span>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profil Akselerasi Kursor */}
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1.5">
                Profil Akselerasi Kursor:
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['smooth', 'fast', 'linear'] as AccelProfile[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      onSetAccelProfile(p);
                      try {
                        localStorage.setItem('fanra_mouse_accel_profile', p);
                        audioManager.playClick(1000);
                      } catch {}
                    }}
                    className={`py-1.5 px-2 text-[10px] rounded border text-center transition-colors cursor-pointer ${
                      accelProfile === p
                        ? 'border-zinc-700 bg-zinc-800 text-zinc-100 font-medium'
                        : 'border-zinc-900 bg-black text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {p === 'smooth' ? 'Halus' : p === 'fast' ? 'Cepat' : 'Linier'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                {accelProfile === 'smooth'
                  ? 'Halus: Kurva lembut, presisi tinggi untuk memilih teks atau desain.'
                  : accelProfile === 'fast'
                  ? 'Cepat: Agresif melompat jauh untuk layar monitor lebar.'
                  : 'Linier: Rasio konstan 1:1 tanpa akselerasi kecepatan.'}
              </p>
            </div>

            <form onSubmit={handleSaveUrl} className="space-y-3 pt-1 border-t border-zinc-900">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Alamat WebSocket Server (FastAPI / Tunnel):
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="ws://192.168.1.5:8000/ws"
                  className="w-full px-2.5 py-1.5 text-xs border border-zinc-800 bg-black text-zinc-200 rounded focus:outline-hidden focus:border-zinc-600 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="px-2.5 py-1 text-xs border border-zinc-800 rounded text-zinc-400 hover:bg-zinc-900 cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded font-medium cursor-pointer"
                >
                  Simpan & Hubungkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
