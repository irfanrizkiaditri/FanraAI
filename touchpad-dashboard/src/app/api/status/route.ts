import { NextResponse } from 'next/server';
import { getHealth, getConfig, getIndex, TUNNEL_URL } from '@/lib/api';

export async function GET() {
  const [health, config, indexHtml] = await Promise.all([
    getHealth(),
    getConfig(),
    getIndex(),
  ]);

  return NextResponse.json({
    health,
    config,
    tunnelUrl: TUNNEL_URL,
    hasIndex: !!indexHtml,
    timestamp: new Date().toISOString(),
  });
}