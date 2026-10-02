'use client';

import { useState } from 'react';
import { HeaderBar } from '@/components/HeaderBar';
import { Touchpad } from '@/components/Touchpad';
import { LaptopKeyboard } from '@/components/LaptopKeyboard';
import { MediaControlBar } from '@/components/MediaControlBar';
import { TouchpadStatus } from '@/components/TouchpadStatus';
import { FullscreenTouchpad, AccelProfile } from '@/components/FullscreenTouchpad';
import { audioManager } from '@/lib/audio';

export function MainApp() {
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [isFullscreenTouchpad, setIsFullscreenTouchpad] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [accelProfile, setAccelProfile] = useState<AccelProfile>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fanra_mouse_accel_profile');
        if (saved === 'smooth' || saved === 'fast' || saved === 'linear') {
          return saved;
        }
      } catch {}
    }
    return 'smooth';
  });

  const toggleOrientation = () => {
    const next = !isLandscape;
    setIsLandscape(next);
    if (typeof window !== 'undefined' && 'screen' in window && 'orientation' in window.screen) {
      try {
        const orientation = window.screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
          unlock?: () => void;
        };
        if (next && orientation.lock) {
          orientation.lock('landscape').catch(() => {});
        } else if (!next && orientation.unlock) {
          orientation.unlock();
        }
      } catch {}
    }
  };

  return (
    <div className="w-full min-h-screen bg-black flex justify-center overflow-hidden">
      {/* 1. Mode Layar Penuh: Halaman Hitam Bersih Murni Sebagai Touchpad */}
      {isFullscreenTouchpad && (
        <FullscreenTouchpad
          onExit={() => setIsFullscreenTouchpad(false)}
          accelProfile={accelProfile}
        />
      )}

      {/* 2. Tampilan Utama Gelap Pekat (Stealth Dark) */}
      <div
        className={`flex flex-col h-screen w-full bg-black text-zinc-300 border-x border-zinc-900/50 select-none transition-all duration-300 ${
          isLandscape ? 'max-w-3xl' : 'max-w-md'
        }`}
      >
        {/* Header Bar */}
        <HeaderBar
          onEnterFullscreen={() => setIsFullscreenTouchpad(true)}
          isLandscape={isLandscape}
          onToggleOrientation={toggleOrientation}
          accelProfile={accelProfile}
          onSetAccelProfile={setAccelProfile}
        />

        {/* Touchpad Area */}
        <main className="flex-1 flex flex-col p-2 overflow-hidden bg-black">
          <Touchpad
            accelProfile={accelProfile}
            onSetAccelProfile={setAccelProfile}
          />
        </main>

        {/* Bar Multimedia Mini (Collapsible) */}
        <section className="shrink-0 bg-black">
          <MediaControlBar />
        </section>

        {/* Keyboard Laptop */}
        <section className="shrink-0 bg-black">
          <LaptopKeyboard />
        </section>

        {/* Footer Info & Diagnostik */}
        <footer className="px-3 py-1.5 flex items-center justify-between text-[10px] border-t border-zinc-900/80 bg-black text-zinc-500 shrink-0">
          <span>Fanra Remote Touchpad</span>
          <button
            type="button"
            onClick={() => {
              setShowStatusPanel(!showStatusPanel);
              try { audioManager.playClick(); } catch {}
            }}
            className="hover:text-zinc-300 cursor-pointer font-normal"
          >
            {showStatusPanel ? 'Tutup Diagnostik' : 'Diagnostik Server'}
          </button>
        </footer>

        {/* Drawer Diagnostik Server */}
        {showStatusPanel && (
          <div className="max-h-60 overflow-y-auto p-3 border-t border-zinc-900 bg-black text-xs shrink-0 text-zinc-300">
            <TouchpadStatus />
          </div>
        )}
      </div>
    </div>
  );
}
