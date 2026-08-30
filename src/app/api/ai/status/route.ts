import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const defaultModel = 'gemini-3.7-flash';

  return NextResponse.json({
    hasServerKey: false,
    defaultModel,
    serverReady: true,
  });
}
