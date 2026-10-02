'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { remoteSocket } from '@/lib/socket';
import { audioManager } from '@/lib/audio';
import { Minimize2 } from 'lucide-react';

export type AccelProfile = 'smooth' | 'fast' | 'linear';

interface FullscreenTouchpadProps {
  onExit: () => void;
  sensitivity?: number;
  accelProfile?: AccelProfile;
}

export function FullscreenTouchpad({ onExit, sensitivity = 1.5, accelProfile = 'smooth' }: FullscreenTouchpadProps) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [showExitButton, setShowExitButton] = useState(true);
  const [isEdgeScrolling, setIsEdgeScrolling] = useState(false);

  const hideExitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetExitVisibility = useCallback(() => {
    setShowExitButton(true);
    if (hideExitTimeoutRef.current) clearTimeout(hideExitTimeoutRef.current);
    hideExitTimeoutRef.current = setTimeout(() => {
      setShowExitButton(false);
    }, 2800);
  }, []);

  useEffect(() => {
    hideExitTimeoutRef.current = setTimeout(() => {
      setShowExitButton(false);
    }, 2800);
    return () => {
      if (hideExitTimeoutRef.current) clearTimeout(hideExitTimeoutRef.current);
    };
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
    e.preventDefault();
    resetExitVisibility();
    const count = e.touches.length;
    const now = Date.now();
    touchState.current.fingerCount = count;
    touchState.current.startTime = now;
    touchState.current.lastTime = now;

    if (count === 1) {
      const t = e.touches[0];
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
      // Deteksi Zona Scroll Samping Kanan (12% paling kanan)
      const inEdgeZone = t.clientX > screenWidth * 0.88;
      touchState.current.isEdgeZone = inEdgeZone;

      if (!inEdgeZone) {
        setCursorPos({ x: t.clientX, y: t.clientY });
      } else {
        setIsEdgeScrolling(true);
        // Umpan Balik Haptic Khusus Tepi Layar (Edge Bump Vibration)
        try { audioManager.triggerEdgeHaptic(); } catch {}
      }

      touchState.current.startX = t.clientX;
      touchState.current.startY = t.clientY;
      touchState.current.lastX = t.clientX;
      touchState.current.lastY = t.clientY;
      touchState.current.movedDistance = 0;

      // Double-tap drag
      if (!inEdgeZone && now - touchState.current.lastTapTime < 280) {
        touchState.current.isDragging = true;
        remoteSocket.sendDown('left');
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
      setCursorPos(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
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

      // 1. Zona Scroll Samping Kanan
      if (touchState.current.isEdgeZone) {
        const scrollFactor = 3.2 * sensitivity;
        remoteSocket.sendScroll(0, Math.round(dy * scrollFactor));
        return;
      }

      setCursorPos({ x: t.clientX, y: t.clientY });

      // 2. Akselerasi Kursor Sesuai Profil (Halus / Cepat / Linier)
      const speed = Math.hypot(dx, dy) / dt;
      let accel = 1.0;

      if (accelProfile === 'smooth') {
        // Profil Halus (Presisi): kurva landai, max 2.2x
        accel = speed > 0.8 ? Math.min(2.2, 1.0 + (speed - 0.8) * 0.7) : 1.0;
      } else if (accelProfile === 'fast') {
        // Profil Cepat (Agresif): kurva responsif, max 3.4x
        accel = speed > 0.6 ? Math.min(3.4, 1.0 + (speed - 0.6) * 1.3) : 1.0;
      } else {
        // Profil Linier (Nonaktif): konstan 1:1
        accel = 1.0;
      }

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
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const duration = Date.now() - touchState.current.startTime;

    setIsEdgeScrolling(false);

    if (touchState.current.isDragging) {
      touchState.current.isDragging = false;
      remoteSocket.sendUp('left');
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
      }

      // 2 Jari Tap -> Klik Kanan
      if (touchState.current.fingerCount === 2 && touchState.current.twoFingerMoved < 14 && duration < 350) {
        remoteSocket.sendClick('right');
        try {
          audioManager.playClick(650);
          audioManager.triggerHaptic(30);
        } catch {}
      }

      // 3 Jari Tap -> Klik Tengah
      if (touchState.current.fingerCount === 3 && duration < 380) {
        remoteSocket.sendClick('middle');
        try {
          audioManager.playClick(850);
          audioManager.triggerHaptic(25);
        } catch {}
      }
    }

    if (e.touches.length === 0) {
      touchState.current.fingerCount = 0;
      setTimeout(() => setCursorPos(null), 250);
    }
  };

  const isMouseDown = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    resetExitVisibility();
    if (e.button === 0) {
      isMouseDown.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    resetExitVisibility();
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => {
        e.preventDefault();
        remoteSocket.sendClick('right');
        try {
          audioManager.playClick(650);
          audioManager.triggerHaptic(30);
        } catch {}
      }}
      className="fixed inset-0 z-50 w-screen h-screen bg-black cursor-crosshair select-none overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* Tombol Keluar Layar Penuh dengan Auto-Dim */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExit();
          try { audioManager.playClick(900); } catch {}
        }}
        className={`fixed top-3 right-3 z-50 p-2.5 bg-transparent border-0 text-zinc-600 hover:text-zinc-300 transition-opacity duration-500 cursor-pointer ${
          showExitButton ? 'opacity-40 hover:opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        title="Keluar Layar Penuh (Esc)"
        aria-label="Keluar Layar Penuh"
      >
        <Minimize2 className="w-5 h-5" />
      </button>

      {/* Indikator Garis Tipis Halus Zona Edge Scroll */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-1.5 transition-opacity duration-300 pointer-events-none ${
          isEdgeScrolling ? 'bg-zinc-700/60 opacity-100' : 'opacity-0'
        }`}
      />

      {/* Titik Sentuhan Halus */}
      {cursorPos && (
        <div
          className="absolute w-7 h-7 rounded-full border border-zinc-700/50 bg-zinc-800/20 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        >
          <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-zinc-400/70" />
        </div>
      )}
    </div>
  );
}
