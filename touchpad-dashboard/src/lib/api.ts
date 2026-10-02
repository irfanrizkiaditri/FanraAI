export const LOCAL_SERVER_URL = process.env.NEXT_PUBLIC_LOCAL_SERVER_URL || 'http://localhost:8000';
export const TUNNEL_URL = process.env.NEXT_PUBLIC_TUNNEL_URL || '';

export async function fetchLocal<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${LOCAL_SERVER_URL}${endpoint}`, {
      next: { revalidate: 0 },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchTunnel<T>(endpoint: string): Promise<T | null> {
  if (!TUNNEL_URL) return null;
  try {
    const res = await fetch(`${TUNNEL_URL}${endpoint}`, {
      next: { revalidate: 0 },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getHealth() {
  const local = await fetchLocal<{ status: string; connections: number }>('/health');
  if (local) return local;
  return await fetchTunnel<{ status: string; connections: number }>('/health');
}

export async function getConfig() {
  const local = await fetchLocal<Record<string, unknown>>('/config');
  if (local) return local;
  return await fetchTunnel<Record<string, unknown>>('/config');
}

export async function getIndex() {
  const local = await fetchLocal<string>('/');
  if (local) return local;
  return await fetchTunnel<string>('/');
}