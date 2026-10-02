'use client';

import { useState } from 'react';
import { remoteSocket } from '@/lib/socket';
import { audioManager } from '@/lib/audio';
import {
  Volume1,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  SunDim,
  Sun,
  Monitor,
  Layers,
  Maximize,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export function MediaControlBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const handleAction = (
    key: string,
    btnId: string,
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }
  ) => {
    setActiveBtn(btnId);
    setTimeout(() => setActiveBtn(null), 150);

    try {
      audioManager.playClick(900);
      audioManager.triggerHaptic(15);
    } catch {}

    if (btnId === 'play') {
      setIsPlaying((prev) => !prev);
    } else if (btnId === 'mute') {
      setIsMuted((prev) => !prev);
    }

    remoteSocket.sendKey(key, modifiers);
  };

  return (
    <div className="w-full border-t border-zinc-850/80 bg-black text-zinc-300">
      {/* Tombol Toggle 1-Tap Pintasan Cepat & Media */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          try { audioManager.playClick(); } catch {}
        }}
        className="w-full py-1.5 px-3 flex items-center justify-between text-[11px] font-normal cursor-pointer hover:bg-zinc-950 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3 text-zinc-500" />
          <span>Pintasan Cepat, Media & Layar</span>
        </span>
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          {isOpen ? (
            <>
              <span>Tutup</span>
              <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              <span>Buka</span>
              <ChevronDown className="w-3 h-3" />
            </>
          )}
        </span>
      </button>

      {/* Panel Pintasan Cepat saat Dibuka */}
      {isOpen && (
        <div className="px-2 pb-2 pt-1 border-t border-zinc-900 bg-[#050507] space-y-1.5">
          {/* Baris 1: Kontrol Volume & Kecerahan Layar Laptop */}
          <div>
            <span className="text-[9px] text-zinc-600 block mb-1">Volume & Kecerahan:</span>
            <div className="grid grid-cols-5 gap-1">
              {/* Vol Down */}
              <button
                type="button"
                onClick={() => handleAction('AudioVolumeDown', 'voldn')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'voldn'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Volume Turun"
              >
                <Volume1 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Vol -</span>
              </button>

              {/* Mute */}
              <button
                type="button"
                onClick={() => handleAction('AudioVolumeMute', 'mute')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'mute' || isMuted
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Mute / Senyap"
              >
                <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isMuted ? 'Muted' : 'Mute'}</span>
              </button>

              {/* Vol Up */}
              <button
                type="button"
                onClick={() => handleAction('AudioVolumeUp', 'volup')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'volup'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Volume Naik"
              >
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Vol +</span>
              </button>

              {/* Kecerahan Turun / Redup */}
              <button
                type="button"
                onClick={() => handleAction('BrightnessDown', 'brightdn')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'brightdn'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Kecerahan Layar Turun (Redup)"
              >
                <SunDim className="w-3.5 h-3.5 text-zinc-400" />
                <span>Redup</span>
              </button>

              {/* Kecerahan Naik / Terang */}
              <button
                type="button"
                onClick={() => handleAction('BrightnessUp', 'brightup')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'brightup'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Kecerahan Layar Naik (Terang)"
              >
                <Sun className="w-3.5 h-3.5 text-zinc-400" />
                <span>Terang</span>
              </button>
            </div>
          </div>

          {/* Baris 2: Pemutar Musik / Video & Manajemen Jendela */}
          <div>
            <span className="text-[9px] text-zinc-600 block mb-1">Media & Jendela:</span>
            <div className="grid grid-cols-6 gap-1">
              {/* Prev */}
              <button
                type="button"
                onClick={() => handleAction('MediaTrackPrevious', 'prev')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'prev'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Lagu Sebelumnya"
              >
                <SkipBack className="w-3 h-3 text-zinc-400" />
                <span>Prev</span>
              </button>

              {/* Play / Pause */}
              <button
                type="button"
                onClick={() => handleAction('MediaPlayPause', 'play')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'play'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Putar / Jeda"
              >
                {isPlaying ? (
                  <Pause className="w-3 h-3 text-zinc-300" />
                ) : (
                  <Play className="w-3 h-3 text-zinc-300" />
                )}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={() => handleAction('MediaTrackNext', 'next')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'next'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Lagu Selanjutnya"
              >
                <SkipForward className="w-3 h-3 text-zinc-400" />
                <span>Next</span>
              </button>

              {/* Desktop (Win+D / Minimize Semua) */}
              <button
                type="button"
                onClick={() => handleAction('d', 'desktop', { meta: true })}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'desktop'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Tampilkan Desktop / Minimize Semua (Win+D)"
              >
                <Monitor className="w-3 h-3 text-zinc-400" />
                <span>Desktop</span>
              </button>

              {/* Alt + Tab (Ganti Jendela Aplikasi) */}
              <button
                type="button"
                onClick={() => handleAction('Tab', 'alttab', { alt: true })}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'alttab'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Ganti Jendela Aplikasi (Alt+Tab)"
              >
                <Layers className="w-3 h-3 text-zinc-400" />
                <span>Alt+Tab</span>
              </button>

              {/* Layar Penuh Aplikasi Laptop (F11 / Maximize) */}
              <button
                type="button"
                onClick={() => handleAction('F11', 'f11')}
                className={`py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded border text-[10px] transition-colors cursor-pointer ${
                  activeBtn === 'f11'
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title="Layar Penuh Jendela (F11)"
              >
                <Maximize className="w-3 h-3 text-zinc-400" />
                <span>F11</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
