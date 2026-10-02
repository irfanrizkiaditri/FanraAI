# Touchpad Dashboard

Next.js 15 dashboard untuk monitoring remote touchpad server.

## Struktur Project

```
touchpad-dashboard/     # Next.js app (deploy ke Vercel)
remote-touchpad/        # Python FastAPI server (jalan di laptop target)
```

## Fitur Dashboard

- ✅ Status server real-time (health check)
- ✅ Jumlah device terhubung
- ✅ Konfigurasi touchpad (sensitivitas, gesture, heartbeat, reconnect)
- ✅ Public tunnel URL (Cloudflare)
- ✅ Auto-refresh 10 detik

## Setup Lokal

### 1. Install dependencies
```bash
cd touchpad-dashboard
npm install
```

### 2. Environment variables
Buat `.env.local`:
```env
NEXT_PUBLIC_LOCAL_SERVER_URL=http://localhost:8000
NEXT_PUBLIC_TUNNEL_URL=https://your-tunnel.trycloudflare.com
```

### 3. Jalankan development
```bash
npm run dev
# Buka http://localhost:3000
```

### 4. Build production
```bash
npm run build
npm start
```

## Deploy ke Vercel

1. Push ke GitHub
2. Import di Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_LOCAL_SERVER_URL` = `http://localhost:8000` (atau IP LAN)
   - `NEXT_PUBLIC_TUNNEL_URL` = URL Cloudflare tunnel Anda

## Touchpad Server (Python)

Jalan di laptop yang dikontrol:
```bash
cd remote-touchpad
python server.py start
```

Akses internet via Cloudflare Tunnel:
```bash
cloudflared tunnel --url http://localhost:8000
```

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Vercel (deploy)
- Python FastAPI + WebSocket (server touchpad)
- Cloudflare Tunnel (internet access)
