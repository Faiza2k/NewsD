import { groqTranscribe } from '@/lib/groq';

export const dynamic = 'force-dynamic';

const MIN_CHARS = 2;
const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

const AUDIO_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
};

function extFor(mime: string, urlHint = ''): string {
  const fromMime = AUDIO_EXT[mime.toLowerCase()];
  if (fromMime) return fromMime;
  const m = urlHint.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m?.[1]?.toLowerCase() || 'ogg';
}

async function fetchMedia(url: string): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'audio/*,*/*' },
    });
    if (!res.ok) {
      throw new Error(`Failed to download media (${res.status})`);
    }
    const mime = (res.headers.get('content-type') || 'audio/ogg').split(';')[0].trim();
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (!buffer.length) throw new Error('Empty audio file');
    if (buffer.length > MAX_BYTES) throw new Error('Audio file too large');
    const filename = `voice.${extFor(mime, url)}`;
    return { buffer, mime, filename };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/transcribe
 * - multipart: field `file` (or `audio`)
 * - JSON: { mediaUrl: string, mimeType?: string, filename?: string }
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let buffer: Buffer | null = null;
    let mime = 'audio/ogg';
    let filename = 'voice.ogg';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = (form.get('file') || form.get('audio')) as File | null;
      if (!file || typeof file.arrayBuffer !== 'function') {
        return Response.json(
          { error: 'Provide multipart field `file` (or `audio`).' },
          { status: 400 },
        );
      }
      const ab = await file.arrayBuffer();
      buffer = Buffer.from(ab);
      mime = file.type || mime;
      filename = file.name || `voice.${extFor(mime)}`;
    } else {
      const body = (await request.json().catch(() => null)) as {
        mediaUrl?: string;
        mimeType?: string;
        filename?: string;
      } | null;
      if (!body?.mediaUrl || typeof body.mediaUrl !== 'string') {
        return Response.json(
          {
            error:
              'Provide JSON `{ mediaUrl }` or multipart `file`. Couldn’t hear that—please retry or type.',
          },
          { status: 400 },
        );
      }
      const media = await fetchMedia(body.mediaUrl);
      buffer = media.buffer;
      mime = body.mimeType || media.mime;
      filename = body.filename || media.filename;
    }

    if (!buffer || buffer.length < 64) {
      return Response.json(
        {
          error: 'Couldn’t hear that—please retry or type.',
          text: '',
        },
        { status: 400 },
      );
    }
    if (buffer.length > MAX_BYTES) {
      return Response.json({ error: 'Audio file too large.' }, { status: 413 });
    }

    const result = await groqTranscribe(buffer, filename, mime);
    const text = result.text.trim();
    if (text.length < MIN_CHARS) {
      return Response.json(
        {
          error: 'Couldn’t hear that—please retry or type.',
          text: '',
          language: result.language,
        },
        { status: 422 },
      );
    }

    return Response.json({
      text,
      language: result.language,
      chars: text.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    const missingKey = /GROQ_API_KEY/i.test(message);
    return Response.json(
      {
        error: missingKey
          ? 'Speech transcription is not configured.'
          : 'Couldn’t hear that—please retry or type.',
        detail: message,
        text: '',
      },
      { status: missingKey ? 503 : 502 },
    );
  }
}
