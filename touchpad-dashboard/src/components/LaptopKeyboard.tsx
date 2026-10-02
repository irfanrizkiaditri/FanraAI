'use client';

import { useState, useEffect } from 'react';
import { remoteSocket } from '@/lib/socket';
import { audioManager } from '@/lib/audio';
import { ChevronDown, ChevronUp, CornerDownLeft, Delete } from 'lucide-react';

export function LaptopKeyboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [capsLock, setCapsLock] = useState(false);
  const [shiftActive, setShiftActive] = useState(false);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [winActive, setWinActive] = useState(false);
  const [fnActive, setFnActive] = useState(false);
  const [activePressedKey, setActivePressedKey] = useState<string | null>(null);

  const [testLog, setTestLog] = useState<string>('Uji coba tombol di sini...');

  useEffect(() => {
    const unsub = remoteSocket.subscribeAction((ev) => {
      if (ev.type === 'click') {
        const label = ev.button === 'left' ? ' [Klik Kiri]' : ev.button === 'right' ? ' [Klik Kanan]' : ' [Klik Tengah]';
        setTestLog((prev) => (prev ? prev + label : label));
      }
    });
    return () => unsub();
  }, []);

  const handleKeyPress = (key: string, isSpecial = false) => {
    setActivePressedKey(key);
    setTimeout(() => setActivePressedKey(null), 140);

    try {
      audioManager.playClick(isSpecial ? 700 : 1050);
      audioManager.triggerHaptic(12);
    } catch {}

    if (key === 'Caps') {
      setCapsLock((prev) => !prev);
      return;
    }
    if (key === 'Shift') {
      setShiftActive((prev) => !prev);
      return;
    }
    if (key === 'Ctrl') {
      setCtrlActive((prev) => !prev);
      return;
    }
    if (key === 'Alt') {
      setAltActive((prev) => !prev);
      return;
    }
    if (key === 'Win') {
      setWinActive((prev) => !prev);
      return;
    }
    if (key === 'Fn') {
      setFnActive((prev) => !prev);
      return;
    }

    let finalKey = key;

    if (fnActive && key.startsWith('F')) {
      const mediaMap: Record<string, string> = {
        F1: 'VolumeMute',
        F2: 'VolumeDown',
        F3: 'VolumeUp',
        F4: 'BrightnessDown',
        F5: 'BrightnessUp',
        F6: 'DisplayToggle',
        F7: 'MediaTrackPrevious',
        F8: 'MediaPlayPause',
        F9: 'MediaTrackNext',
        F10: 'AirplaneMode',
        F11: 'Fullscreen',
        F12: 'Settings',
      };
      finalKey = mediaMap[key] || key;
    } else if (key.length === 1 && /[a-z]/i.test(key)) {
      finalKey = (capsLock !== shiftActive) ? key.toUpperCase() : key.toLowerCase();
    } else if (shiftActive) {
      const shiftSymbolMap: Record<string, string> = {
        '`': '~', '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
        '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?',
      };
      if (shiftSymbolMap[key]) {
        finalKey = shiftSymbolMap[key];
      }
    }

    if (finalKey === 'Backspace' || finalKey === 'Del') {
      setTestLog((prev) => prev.slice(0, -1));
    } else if (finalKey === 'Enter') {
      setTestLog((prev) => prev + '\n');
    } else if (finalKey === 'Tab') {
      setTestLog((prev) => prev + '    ');
    } else if (finalKey === ' ') {
      setTestLog((prev) => prev + ' ');
    } else if (finalKey.length === 1) {
      setTestLog((prev) => prev + finalKey);
    } else {
      setTestLog((prev) => `${prev} [${finalKey}]`);
    }

    remoteSocket.sendKey(finalKey, {
      ctrl: ctrlActive,
      shift: shiftActive,
      alt: altActive,
      meta: winActive,
    });

    if (shiftActive) setShiftActive(false);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText) return;
    remoteSocket.sendText(inputText);
    setTestLog((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : ' ') + inputText);
    try {
      audioManager.playClick(850);
      audioManager.triggerHaptic(15);
    } catch {}
    setInputText('');
  };

  const sendShortcut = (label: string, key: string, ctrl = true, alt = false) => {
    try {
      audioManager.playClick(950);
      audioManager.triggerHaptic(15);
    } catch {}
    remoteSocket.sendKey(key, { ctrl, alt });
    setTestLog((prev) => `${prev} [${label}]`);
  };

  const fnRowStandard = ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Del'];
  const fnRowMedia = ['Esc', 'Mute', 'Vol-', 'Vol+', 'Redup', 'Terang', 'Layar', 'Prev', 'Play', 'Next', 'Pesawat', 'Penuh', 'Setelan', 'Del'];

  const numRowNormal = ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'];
  const numRowShift = ['~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', 'Backspace'];

  const rowQNormal = ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'];
  const rowQShift = ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '|'];

  const rowANormal = ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'];
  const rowAShift = ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', 'Enter'];

  const rowZNormal = ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '↑', 'Shift'];
  const rowZShift = ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?', '↑', 'Shift'];

  return (
    <div className="w-full border-t border-zinc-850 bg-black text-zinc-300 transition-colors">
      {/* Tombol Buka / Tutup Keyboard (Ukuran ringkas) */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          try { audioManager.playClick(); } catch {}
        }}
        className="w-full py-2 px-3 flex items-center justify-between text-[11px] font-normal cursor-pointer hover:bg-zinc-950 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>{isOpen ? 'Tutup Keyboard' : 'Buka Keyboard Laptop'}</span>
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          {isOpen ? (
            <>
              <span>Sembunyikan</span>
              <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              <span>Tampilkan</span>
              <ChevronDown className="w-3 h-3" />
            </>
          )}
        </span>
      </button>

      {/* Konten Keyboard saat Dibuka */}
      {isOpen && (
        <div className="p-2 border-t border-zinc-900 bg-[#050507] space-y-2">
          {/* Input Cepat Keyboard HP */}
          <form onSubmit={handleSendText} className="flex gap-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ketik langsung dari keyboard HP..."
              className="flex-1 px-2 py-1 text-xs border border-zinc-800 bg-black text-zinc-200 rounded focus:outline-hidden focus:border-zinc-700"
            />
            <button
              type="submit"
              className="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-normal cursor-pointer"
            >
              Kirim
            </button>
          </form>

          {/* Kotak Hasil Uji Coba */}
          <div className="border border-zinc-850 rounded bg-black p-1.5">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5 border-b border-zinc-900 pb-0.5">
              <span>Hasil Uji Coba:</span>
              <button
                type="button"
                onClick={() => {
                  setTestLog('');
                  try { audioManager.playClick(); } catch {}
                }}
                className="text-[10px] text-zinc-500 hover:text-rose-400 cursor-pointer"
              >
                Hapus
              </button>
            </div>
            <p className="text-xs text-zinc-300 whitespace-pre-wrap break-all min-h-[24px] max-h-14 overflow-y-auto font-normal">
              {testLog || <span className="text-zinc-600 italic">Tekan tombol keyboard di bawah...</span>}
            </p>
          </div>

          {/* Shortcut Aksi Cepat (Kotak agak kecil) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px] no-scrollbar">
            <span className="text-zinc-500 text-[10px] whitespace-nowrap mr-0.5">Shortcut:</span>
            {[
              { label: 'Ctrl+C', key: 'c', ctrl: true, alt: false },
              { label: 'Ctrl+V', key: 'v', ctrl: true, alt: false },
              { label: 'Ctrl+A', key: 'a', ctrl: true, alt: false },
              { label: 'Ctrl+Z', key: 'z', ctrl: true, alt: false },
              { label: 'Alt+Tab', key: 'Tab', ctrl: false, alt: true },
              { label: 'Win+D', key: 'd', ctrl: false, alt: false, meta: true },
            ].map((sc) => (
              <button
                key={sc.label}
                type="button"
                onClick={() => {
                  if (sc.meta) {
                    remoteSocket.sendKey('d', { meta: true });
                    setTestLog((prev) => `${prev} [Win+D]`);
                    try { audioManager.playClick(); } catch {}
                  } else {
                    sendShortcut(sc.label, sc.key, sc.ctrl, sc.alt);
                  }
                }}
                className="px-1.5 py-0.5 border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 rounded text-[10px] whitespace-nowrap cursor-pointer"
              >
                {sc.label}
              </button>
            ))}
          </div>

          {/* Layout Keyboard Laptop Lengkap (Kotak agak kecil) */}
          <div className="overflow-x-auto pb-1 -mx-0.5 px-0.5">
            <div className="min-w-[540px] max-w-full space-y-0.5 select-none text-xs">
              {/* Row 1: Function Keys */}
              <div className="flex gap-0.5">
                {(fnActive ? fnRowMedia : fnRowStandard).map((k, idx) => {
                  const originalKey = fnRowStandard[idx];
                  return (
                    <button
                      key={`${originalKey}-${idx}`}
                      type="button"
                      onClick={() => handleKeyPress(originalKey, true)}
                      className={`h-6 px-1 flex-1 flex items-center justify-center border rounded text-[9px] transition-colors cursor-pointer ${
                        activePressedKey === originalKey
                          ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                          : fnActive && originalKey.startsWith('F')
                          ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                          : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>

              {/* Row 2: Numbers */}
              <div className="flex gap-0.5">
                {(shiftActive ? numRowShift : numRowNormal).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeyPress(k, k === 'Backspace')}
                    className={`h-6 px-1 ${
                      k === 'Backspace' ? 'w-14' : 'flex-1'
                    } flex items-center justify-center border border-zinc-850 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 rounded text-[10px] transition-colors cursor-pointer ${
                      activePressedKey === k ? 'bg-zinc-700 text-zinc-100' : ''
                    }`}
                  >
                    {k === 'Backspace' ? <Delete className="w-3 h-3 text-zinc-400" /> : k}
                  </button>
                ))}
              </div>

              {/* Row 3: Tab & QWERTY */}
              <div className="flex gap-0.5">
                {(shiftActive ? rowQShift : rowQNormal).map((k, idx) => {
                  const baseKey = rowQNormal[idx];
                  const display = (capsLock && baseKey.length === 1) ? k.toUpperCase() : k;
                  return (
                    <button
                      key={`${baseKey}-${idx}`}
                      type="button"
                      onClick={() => handleKeyPress(k, baseKey === 'Tab')}
                      className={`h-6 px-1 ${
                        baseKey === 'Tab' ? 'w-10' : 'flex-1'
                      } flex items-center justify-center border border-zinc-850 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 rounded text-[10px] transition-colors cursor-pointer ${
                        activePressedKey === k ? 'bg-zinc-700 text-zinc-100' : ''
                      }`}
                    >
                      {display}
                    </button>
                  );
                })}
              </div>

              {/* Row 4: Caps & Home Row */}
              <div className="flex gap-0.5">
                {(shiftActive ? rowAShift : rowANormal).map((k, idx) => {
                  const baseKey = rowANormal[idx];
                  const isCaps = baseKey === 'Caps';
                  const isEnter = baseKey === 'Enter';
                  const display = (capsLock && baseKey.length === 1) ? k.toUpperCase() : k;
                  return (
                    <button
                      key={`${baseKey}-${idx}`}
                      type="button"
                      onClick={() => handleKeyPress(isCaps ? 'Caps' : k, isCaps || isEnter)}
                      className={`h-6 px-1 ${
                        isCaps ? 'w-12' : isEnter ? 'w-14' : 'flex-1'
                      } flex items-center justify-center border rounded text-[10px] transition-colors cursor-pointer ${
                        isCaps && capsLock
                          ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                          : activePressedKey === (isCaps ? 'Caps' : k)
                          ? 'bg-zinc-700 text-zinc-100'
                          : 'border-zinc-850 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                      }`}
                    >
                      {isCaps ? 'Caps' : isEnter ? <CornerDownLeft className="w-3 h-3 text-zinc-400" /> : display}
                    </button>
                  );
                })}
              </div>

              {/* Row 5: Shift & Z Row */}
              <div className="flex gap-0.5">
                {(shiftActive ? rowZShift : rowZNormal).map((k, idx) => {
                  const baseKey = rowZNormal[idx];
                  const isShift = baseKey === 'Shift';
                  const display = (capsLock && baseKey.length === 1) ? k.toUpperCase() : k;
                  return (
                    <button
                      key={`${baseKey}-${idx}`}
                      type="button"
                      onClick={() => handleKeyPress(isShift ? 'Shift' : k, isShift || k === '↑')}
                      className={`h-6 px-1 ${
                        isShift ? 'w-14' : 'flex-1'
                      } flex items-center justify-center border rounded text-[10px] transition-colors cursor-pointer ${
                        isShift && shiftActive
                          ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                          : activePressedKey === (isShift ? 'Shift' : k)
                          ? 'bg-zinc-700 text-zinc-100'
                          : 'border-zinc-850 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                      }`}
                    >
                      {isShift ? 'Shift' : display}
                    </button>
                  );
                })}
              </div>

              {/* Row 6: Controls & Arrows */}
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => handleKeyPress('Ctrl', true)}
                  className={`h-6 px-2 border rounded text-[9px] transition-colors cursor-pointer ${
                    ctrlActive
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                      : 'border-zinc-850 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Ctrl
                </button>

                <button
                  type="button"
                  onClick={() => handleKeyPress('Fn', true)}
                  className={`h-6 px-1.5 border rounded text-[9px] transition-colors cursor-pointer ${
                    fnActive
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                      : 'border-zinc-850 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Fn
                </button>

                <button
                  type="button"
                  onClick={() => handleKeyPress('Win', true)}
                  className={`h-6 px-1.5 border rounded text-[9px] transition-colors cursor-pointer ${
                    winActive
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                      : 'border-zinc-850 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Win
                </button>

                <button
                  type="button"
                  onClick={() => handleKeyPress('Alt', true)}
                  className={`h-6 px-1.5 border rounded text-[9px] transition-colors cursor-pointer ${
                    altActive
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                      : 'border-zinc-850 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Alt
                </button>

                <button
                  type="button"
                  onClick={() => handleKeyPress(' ')}
                  className="h-6 flex-1 border border-zinc-850 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 rounded text-[10px] transition-colors cursor-pointer"
                >
                  Spasi
                </button>

                <button
                  type="button"
                  onClick={() => handleKeyPress('Alt', true)}
                  className="h-6 px-1.5 border border-zinc-850 bg-zinc-950 text-zinc-400 hover:text-zinc-200 rounded text-[9px] transition-colors cursor-pointer"
                >
                  Alt
                </button>

                {/* Panah */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('←', true)}
                  className="h-6 px-2 border border-zinc-850 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 rounded text-[9px] transition-colors cursor-pointer"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('↓', true)}
                  className="h-6 px-2 border border-zinc-850 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 rounded text-[9px] transition-colors cursor-pointer"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('→', true)}
                  className="h-6 px-2 border border-zinc-850 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 rounded text-[9px] transition-colors cursor-pointer"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
