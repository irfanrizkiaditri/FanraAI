import Link from 'next/link';
import { TouchpadStatus } from '@/components/TouchpadStatus';

export const metadata = {
  title: 'Touchpad Dashboard',
  description: 'Monitor & control remote touchpad server',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            🖱️ Touchpad Dashboard
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Monitor server touchpad remote, lihat konfigurasi, dan akses tunnel publik untuk kontrol dari HP.
          </p>
        </header>

        {/* Main Status */}
        <section className="mb-8">
          <TouchpadStatus />
        </section>

        {/* Quick Actions */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Aksi Cepat</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-lg border border-gray-200 text-center">
              <p className="font-medium text-gray-900">📱 Buka Touchpad di HP</p>
              <p className="text-sm text-gray-500 mt-1">Buka URL tunnel Cloudflare di browser HP</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-gray-200 text-center">
              <p className="font-medium text-gray-900">🔧 Server Lokal</p>
              <p className="text-sm text-gray-500 mt-1">Jalankan: <code className="bg-gray-100 px-1 rounded">python server.py start</code></p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-gray-200 text-center">
              <p className="font-medium text-gray-900">☁️ Cloudflare Tunnel</p>
              <p className="text-sm text-gray-500 mt-1">Jalankan: <code className="bg-gray-100 px-1 rounded">cloudflared tunnel --url http://localhost:8000</code></p>
            </div>
          </div>
        </section>

        {/* Info Cards */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Info Project</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-2">📁 Project Files</h3>
              <ul className="text-sm text-gray-600 space-y-1 font-mono">
                <li><code>remote-touchpad/server.py</code> — FastAPI WebSocket server</li>
                <li><code>remote-touchpad/config.json</code> — Sensitivitas, gesture, reconnect</li>
                <li><code>remote-touchpad/templates/index.html</code> — Touchpad client (HP)</li>
                <li><code>touchpad-dashboard/</code> — Next.js dashboard (ini)</li>
              </ul>
            </div>
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-2">🔗 Deploy Info</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>Vercel: Dashboard monitoring only</li>
                <li>Touchpad server: Lokal (Windows)</li>
                <li>Internet access: Cloudflare Tunnel</li>
                <li>HP connect: HTTPS tunnel URL</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-sm text-gray-500 border-t border-gray-200 pt-8">
          <p>Built with Next.js 15 + Tailwind + TypeScript</p>
          <p className="mt-1">Deployed on Vercel • Server runs locally</p>
        </footer>
      </div>
    </main>
  );
}
