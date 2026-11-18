import { NextRequest, NextResponse } from 'next/server';

// Server-side only — never exposed to browser
const CHAT_API = process.env.CHAT_API_BASE || 'http://localhost:8081/chat-service/chat/group/api';
const CHAT_KEY = process.env.CHAT_INTERNAL_KEY || '';

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  // Require caller to be authenticated (token from iamxapp session)
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const downstream = `${CHAT_API}/${path.join('/')}${request.nextUrl.search}`;

  const forwardHeaders: HeadersInit = {
    'X-Internal-Key': CHAT_KEY,
    'Content-Type': 'application/json',
  };

  let body: BodyInit | null = null;
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    body = await request.text();
  }

  try {
    const res = await fetch(downstream, {
      method: request.method,
      headers: forwardHeaders,
      body: body || undefined,
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Chat service unavailable' }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export const dynamic = 'force-dynamic';
