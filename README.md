# FanraAi - All Services in One Folder

Struktur folder:
```
C:/Users/ASUS/FanraAi/
├── ruang/                    # Builder 3D (Vite + React + Three.js)
│   ├── src/pages/Builder.tsx
│   ├── src/builder/BuilderSystem.tsx
│   └── package.json
├── remote-touchpad/          # Touchpad Server (Python FastAPI + WebSocket)
│   ├── server.py
│   ├── requirements.txt
│   └── start-server.bat
├── touchpad-dashboard/       # Touchpad Dashboard (Next.js)
│   ├── src/app/page.tsx
│   └── package.json
├── ecosystem.config.js       # PM2 config untuk 3 service
├── start-all.bat             # 1 klik: install deps + start semua
├── stop-all.bat              # 1 klik: stop semua
├── restart-all.bat           # 1 klik: restart semua
├── status.bat                # Cek status + port
├── auto-start.bat            # Dipakai Windows Startup (otomatis saat boot)
├── create-startup-shortcut.ps1 # Bikin shortcut di Startup folder
├── logs/                     # Log gabungan semua service
└── README.md                 # File ini
```

## Cara Pakai

### Pertama kali (setup):
1. **Klik 2x `start-all.bat`** → install PM2, install deps semua service, start semua
2. Tunggu selesai → buka browser:
   - **Builder 3D (ruang)**: http://localhost:5173
   - **Touchpad Server**: http://localhost:8000
   - **Touchpad Dashboard**: http://localhost:3000

### Sehari-hari:
| Aksi | File |
|------|------|
| Start semua | `start-all.bat` |
| Stop semua | `stop-all.bat` |
| Restart semua | `restart-all.bat` |
| Cek status | `status.bat` |
| Lihat log real-time | `pm2 logs` (di terminal) |

### Otomatis saat Windows Boot:
1. **Klik 2x `create-startup-shortcut.ps1`** (atau jalankan via PowerShell)
2. Shortcut `FanraAi Auto Start` dibuat di Startup folder
3. Saat laptop restart → service jalan otomatis di background

### Manual PM2 commands (di terminal di folder FanraAi):
```bash
pm2 status              # Status semua
pm2 logs                # Log real-time (Ctrl+C keluar)
pm2 logs ruang          # Log service tertentu
pm2 stop ruang          # Stop 1 service
pm2 restart touchpad    # Restart 1 service
pm2 save                # Simpan process list untuk boot
pm2 resurrect           # Restore dari save
```

## Service Detail

### 1. ruang (Builder 3D) - Port 5173
- Vite + React + Three.js + React Three Fiber
- Fitur: Undo/Redo, AI Generate Layout, Lock Background, Full-page Mode, Collapsible Sidebar, Drag Sensitivity, Export/Import JSON
- Katalog 35+ aset: Struktur, Furniture, Decor, Tech, Lighting, Khas Indonesia, Outdoor, Game

### 2. remote-touchpad - Port 8000
- FastAPI + WebSocket + REST API
- Kontrol mouse/keyboard HP → PC
- Endpoints: `/ws` (WebSocket), `/api/mouse`, `/api/keyboard`, `/api/status`

### 3. touchpad-dashboard - Port 3000
- Next.js dashboard monitoring touchpad
- Real-time status, config, log viewer

## Troubleshooting

**Port sudah dipakai?**
```bash
# Cek & kill proses di port
netstat -ano | findstr "5173 8000 3000"
taskkill /PID <PID> /F
```

**PM2 error?**
```bash
pm2 delete all
pm2 start ecosystem.config.js
```

**Reset total:**
```bash
stop-all.bat
# Hapus folder logs/
start-all.bat
```

## Catatan
- Semua service jalan di **background** (PM2 daemon)
- Log tersimpan di `logs/` (rotasi otomatis PM2)
- `auto-start.bat` pakai `pm2 resurrect` → butuh `pm2 save` setelah jalan normal
- Dependencies: Node.js 18+, Python 3.10+, PM2 (`npm i -g pm2`)