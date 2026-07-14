export const dynamic = 'force-dynamic';

// Allowed destination origins — only redirect to trusted news/article domains
// We validate that the decoded URL starts with http/https and is a real URL.
function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function decodeId(id: string): string | null {
  try {
    // The id is Base64url-encoded (URL-safe base64: + → -, / → _, no padding)
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return new Response('Missing id', { status: 400 });
  }

  const url = decodeId(id);

  if (!url || !isSafeUrl(url)) {
    return new Response('Invalid or unsafe redirect target', { status: 400 });
  }

  // 302 temporary redirect — browser follows immediately, no caching
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'no-store',
    },
  });
}
