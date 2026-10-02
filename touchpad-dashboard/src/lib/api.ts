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
  return fetchLocal<{ status: string; connections: number }>('/health') ||
         fetchTunnel<{ status: string; connections: number }>('/health');
}

export async function getConfig() {
  return fetchLocal<any>('/config') || fetchTunnel<any>('/config');
}

export async function getIndex() {
  return fetchLocal<string>('/') || fetchTunnel<string>('/');
}