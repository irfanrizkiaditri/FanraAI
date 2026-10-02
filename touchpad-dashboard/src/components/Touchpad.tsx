'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { remoteSocket, TouchpadEvent } from '@/lib/socket';
import { audioManager } from '@/lib/audio';
import { AccelProfile } from '@/components/FullscreenTouchpad';

interface TouchpadProps {
  accelProfile: AccelProfile;
  onSetAccelProfile: (profile: AccelProfile) => void;
}

export function Touchpad({ accelProfile, onSetAccelProfile }: TouchpadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [sensitivity, setSensitivity] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fanra_mouse_sensitivity');
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed)) return parsed;
        }
      } catch {}
    }
    return 1.5;
  });

  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string>('Siap');
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [showCursor, setShowCursor] = useState(false);
  const [pressedBtn, setPressedBtn] = useState<'left' | 'middle' | 'right' | null>(null);
  const [isEdgeScrolling, setIsEdgeScrolling] = useState(false);

  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayAction = useCallback((text: string) => {
    setActiveGesture(text);
    setLastAction(text);
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => {
      setActiveGesture(null);
    }, 1100);
  }, []);

  const handleSetSensitivity = (val: number) => {
    setSensitivity(val);
    try {
      localStorage.setItem('fanra_mouse_sensitivity', String(val));
      audioManager.playClick(1000);
    } catch {}
    displayAction(`Kecepatan: ${val.toFixed(1)}x`);
  };

  const handleSwitchProfile = (p: AccelProfile) => {
    onSetAccelProfile(p);
    try {
      localStorage.setItem('fanra_mouse_accel_profile', p);
      audioManager.playClick(1150);
    } catch {}
    displayAction(`Akselerasi: ${p === 'smooth' ? 'Halus' : p === 'fast' ? 'Cepat' : 'Linier'}`);
  };

  useEffect(() => {
    const unsub = remoteSocket.subscribeAction((ev: TouchpadEvent) => {
      if (ev.type === 'key') {
        setLastAction(`Tombol: ${ev.key}`);
      } else if (ev.type === 'text') {
        setLastAction(`Ketik: "${ev.text?.slice(0, 14)}"`);
      } else if (ev.type === 'click') {
        setLastAction(`Klik ${ev.button === 'left' ? 'Kiri' : ev.button === 'right' ? 'Kanan' : 'Tengah'}`);
      }
    });
    return () => unsub();
  }, []);

  const touchState = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    startTime: number;
    movedDistance: number;
    fingerCount: number;
    twoFingerStartY: number;
    twoFingerLastY: number;
    twoFingerMoved: number;
    lastTapTime: number;
    isDragging: boolean;
    isEdgeZone: boolean;
  }>({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    startTime: 0,
    movedDistance: 0,
    fingerCount: 0,
    twoFingerStartY: 0,
    twoFingerLastY: 0,
    twoFingerMoved: 0,
    lastTapTime: 0,
    isDragging: false,
    isEdgeZone: false,
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const count = e.touches.length;
    const now = Date.now();
    touchState.current.fingerCount = count;
    touchState.current.startTime = now;
    touchState.current.lastTime = now;

    if (count === 1) {
      const t = e.touches[0];
      const pad = padRef.current;
      let inEdgeZone = false;

      if (pad) {
        const rect = pad.getBoundingClientRect();
        const relX = (t.clientX - rect.left) / rect.width;
        // Zona tepi kanan 12% untuk scroll 1 jari
        inEdgeZone = relX > 0.88;
        setCursorPos({
          x: relX * 100,
          y: ((t.clientY - rect.top) / rect.height) * 100,
        });
        if (!inEdgeZone) setShowCursor(true);
      }

      touchState.current.isEdgeZone = inEdgeZone;
      if (inEdgeZone) {
        setIsEdgeScrolling(true);
        // Umpan Balik Haptic Khusus Tepi Layar (Edge Bump Vibration)
        try { audioManager.triggerEdgeHaptic(); } catch {}
      }

      touchState.current.startX = t.clientX;
      touchState.current.startY = t.clientY;
      touchState.current.lastX = t.clientX;
      touchState.current.lastY = t.clientY;
      touchState.current.movedDistance = 0;

      // Double-Tap Drag
      if (!inEdgeZone && now - touchState.current.lastTapTime < 280) {
        touchState.current.isDragging = true;
        remoteSocket.sendDown('left');
        displayAction('Tahan & Geser');
        try { audioManager.playClick(600); } catch {}
      }
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midY = (t1.clientY + t2.clientY) / 2;

      touchState.current.twoFingerStartY = midY;
      touchState.current.twoFingerLastY = midY;
      touchState.current.twoFingerMoved = 0;
      touchState.current.isEdgeZone = false;
      setIsEdgeScrolling(false);
      setShowCursor(false);
    } else if (count === 3) {
      setShowCursor(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const count = e.touches.length;
    const now = Date.now();
    const dt = Math.max(10, now - touchState.current.lastTime);

    if (count === 1) {
      const t = e.touches[0];
      const dx = t.clientX - touchState.current.lastX;
      const dy = t.clientY - touchState.current.lastY;

      touchState.current.movedDistance += Math.hypot(dx, dy);
      touchState.current.lastX = t.clientX;
      touchState.current.lastY = t.clientY;
      touchState.current.lastTime = now;

      // 1. Zona Scroll Tepi Kanan (Edge Scroll 1 Jari)
      if (touchState.current.isEdgeZone) {
        const scrollFactor = 3.0 * sensitivity;
        remoteSocket.sendScroll(0, Math.round(dy * scrollFactor));
        displayAction(dy > 0 ? 'Scroll Bawah' : 'Scroll Atas');
        return;
      }

      // 2. Akselerasi Kursor Dinamis Berdasarkan Profil
      const speed = Math.hypot(dx, dy) / dt;
      let accel = 1.0;

      if (accelProfile === 'smooth') {
        // Halus / Presisi: kurva lembut, max 2.2x
        accel = speed > 0.8 ? Math.min(2.2, 1.0 + (speed - 0.8) * 0.7) : 1.0;
      } else if (accelProfile === 'fast') {
        // Cepat / Agresif: kurva responsif, max 3.4x
        accel = speed > 0.6 ? Math.min(3.4, 1.0 + (speed - 0.6) * 1.3) : 1.0;
      } else {
        // Linier / Nonaktif
        accel = 1.0;
      }

      setCursorPos((prev) => ({
        x: Math.max(2, Math.min(98, prev.x + ((dx / 3) * sensitivity * accel))),
        y: Math.max(2, Math.min(98, prev.y + ((dy / 3) * sensitivity * accel))),
      }));

      remoteSocket.sendMove(dx * sensitivity * accel, dy * sensitivity * accel);
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midY = (t1.clientY + t2.clientY) / 2;
      const dy = midY - touchState.current.twoFingerLastY;

      touchState.current.twoFingerMoved += Math.abs(dy);
      touchState.current.twoFingerLastY = midY;

      const scrollFactor = 2.6 * sensitivity;
      remoteSocket.sendScroll(0, Math.round(dy * scrollFactor));
      displayAction(dy > 0 ? 'Gulir Bawah' : 'Gulir Atas');
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const duration = Date.now() - touchState.current.startTime;
    setIsEdgeScrolling(false);

    if (touchState.current.isDragging) {
      touchState.current.isDragging = false;
      remoteSocket.sendUp('left');
      displayAction('Lepas Drag');
      try { audioManager.playClick(400); } catch {}
      return;
    }

    if (!touchState.current.isEdgeZone) {
      // 1 Jari Tap -> Klik Kiri
      if (touchState.current.fingerCount === 1 && touchState.current.movedDistance < 12 && duration < 300) {
        touchState.current.lastTapTime = Date.now();
        remoteSocket.sendClick('left');
        try {
          audioManager.playClick(1100);
          audioManager.triggerHaptic(20);
        } catch {}
        displayAction('Klik Kiri');
      }

      // 2 Jari Tap -> Klik Kanan
      if (touchState.current.fingerCount === 2 && touchState.current.twoFingerMoved < 14 && duration < 350) {
        remoteSocket.sendClick('right');
        try {
          audioManager.playClick(650);
          audioManager.triggerHaptic(30);
        } catch {}
        displayAction('Klik Kanan');
      }

      // 3 Jari Tap -> Klik Tengah
      if (touchState.current.fingerCount === 3 && duration < 380) {
        remoteSocket.sendClick('middle');
        try {
          audioManager.playClick(850);
          audioManager.triggerHaptic(25);
        } catch {}
        displayAction('Klik Tengah');
      }
    }

    if (e.touches.length === 0) {
      touchState.current.fingerCount = 0;
      setTimeout(() => setShowCursor(false), 700);
    }
  };

  const triggerClick = (button: 'left' | 'middle' | 'right') => {
    remoteSocket.sendClick(button);
    try {
      if (button === 'left') {
        audioManager.playClick(1100);
        audioManager.triggerHaptic(20);
      } else if (button === 'middle') {
        audioManager.playClick(850);
        audioManager.triggerHaptic(25);
      } else {
        audioManager.playClick(650);
        audioManager.triggerHaptic(30);
      }
    } catch {}

    const label = button === 'left' ? 'Klik Kiri' : button === 'middle' ? 'Klik Tengah' : 'Klik Kanan';
    displayAction(label);
  };

  const isMouseDown = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      isMouseDown.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMouseDown.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      remoteSocket.sendMove(dx * sensitivity, dy * sensitivity);
    }
  };

  const handleMouseUp = () => {
    isMouseDown.current = false;
  };

  return (
    <div className="w-full flex flex-col flex-1 min-h-[290px] text-zinc-300">
      {/* 1. Bar Kecepatan Kursor & Profil Akselerasi */}
      <div className="flex items-center justify-between px-1 py-1 mb-1 text-[11px] border-b border-zinc-900 gap-1 overflow-x-auto no-scrollbar">
        {/* Tombol Profil Akselerasi (Halus / Cepat / Linier) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-zinc-500 text-[10px]">Profil:</span>
          {(['smooth', 'fast', 'linear'] as AccelProfile[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleSwitchProfile(p)}
              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                accelProfile === p
                  ? 'border-zinc-700 bg-zinc-800 text-zinc-100 font-medium'
                  : 'border-zinc-900 bg-black text-zinc-500 hover:text-zinc-300'
              }`}
              title={
                p === 'smooth'
                  ? 'Akselerasi Halus (Presisi teks & desain)'
                  : p === 'fast'
                  ? 'Akselerasi Cepat (Agresif melompat jauh)'
                  : 'Linier / Konstan 1:1'
              }
            >
              {p === 'smooth' ? 'Halus' : p === 'fast' ? 'Cepat' : 'Linier'}
            </button>
          ))}
        </div>

        {/* Tombol Kecepatan Kursor */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-zinc-500 text-[10px] hidden sm:inline">Speed:</span>
          {[1.0, 1.5, 2.0, 2.5, 3.0].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSetSensitivity(s)}
              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                Math.abs(sensitivity - s) < 0.1
                  ? 'border-zinc-700 bg-zinc-800 text-zinc-100 font-medium'
                  : 'border-zinc-900 bg-black text-zinc-500 hover:text-zinc-300 hover:border-zinc-800'
              }`}
            >
              {s.toFixed(1)}x
            </button>
          ))}
        </div>
      </div>

      {/* 2. Area Permukaan Touchpad Gelap Pekat */}
      <div
        ref={padRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => {
          e.preventDefault();
          triggerClick('right');
        }}
        className="relative flex-1 w-full min-h-[260px] bg-[#070709] border border-zinc-800/80 rounded flex flex-col justify-between overflow-hidden cursor-crosshair select-none transition-colors"
        style={{ touchAction: 'none' }}
      >
        {/* Indikator Halus Zona Scroll Tepi Kanan */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-1 transition-opacity duration-200 pointer-events-none ${
            isEdgeScrolling ? 'bg-zinc-600 opacity-90' : 'bg-zinc-850/40 opacity-30'
          }`}
          title="Zona Scroll Tepi Kanan"
        />

        {/* Label Atas & Badge Aksi */}
        <div className="p-2.5 flex items-start justify-between pointer-events-none">
          <span className="text-[9px] uppercase tracking-wider text-zinc-600 font-normal truncate max-w-[60%]">
            Touchpad • {lastAction}
          </span>
          {activeGesture && (
            <div className="px-2 py-0.5 text-[10px] rounded border border-zinc-800 bg-zinc-900 text-zinc-200">
              {activeGesture}
            </div>
          )}
        </div>

        {/* Kursor Visual saat disentuh */}
        {showCursor && (
          <div
            className="absolute w-7 h-7 rounded-full border border-zinc-700/60 bg-zinc-800/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
            style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
          >
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-zinc-400" />
          </div>
        )}

        {/* Petunjuk Gestur di Tengah */}
        <div className="pointer-events-none text-center px-4 py-4">
          <p className="text-[11px] text-zinc-500">
            Geser jari untuk menggerakkan kursor
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 mt-1.5 text-[10px] text-zinc-600">
            <span>1 Tap: Kiri</span>
            <span>•</span>
            <span>2 Tap: Kanan</span>
            <span>•</span>
            <span>3 Tap: Tengah</span>
            <span>•</span>
            <span>Tepi Kanan: Scroll (Getar)</span>
          </div>
        </div>

        <div className="h-2 pointer-events-none" />
      </div>

      {/* 3. Tombol Fisik: Klik Kiri, Klik Tengah, Klik Kanan */}
      <div className="w-full grid grid-cols-3 gap-1 mt-1.5">
        <button
          type="button"
          onClick={() => triggerClick('left')}
          onMouseDown={() => setPressedBtn('left')}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          className={`py-2 text-[11px] rounded border transition-colors cursor-pointer select-none text-center ${
            pressedBtn === 'left'
              ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
              : 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900 hover:border-zinc-700'
          }`}
        >
          Klik Kiri
        </button>

        <button
          type="button"
          onClick={() => triggerClick('middle')}
          onMouseDown={() => setPressedBtn('middle')}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          className={`py-2 text-[11px] rounded border transition-colors cursor-pointer select-none text-center ${
            pressedBtn === 'middle'
              ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
              : 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900 hover:border-zinc-700'
          }`}
        >
          Klik Tengah
        </button>

        <button
          type="button"
          onClick={() => triggerClick('right')}
          onMouseDown={() => setPressedBtn('right')}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          className={`py-2 text-[11px] rounded border transition-colors cursor-pointer select-none text-center ${
            pressedBtn === 'right'
              ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
              : 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900 hover:border-zinc-700'
          }`}
        >
          Klik Kanan
        </button>
      </div>
    </div>
  );
}
