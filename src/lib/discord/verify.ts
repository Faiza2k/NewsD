import { createPublicKey, verify } from 'crypto';

/** SPKI DER prefix for a 32-byte Ed25519 public key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Verify Discord interaction Ed25519 signature.
 * Signed message = timestamp + raw body (UTF-8).
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
): boolean {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;

  // Reject stale timestamps (replay protection)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 60 * 5) return false;

  try {
    const rawKey = Buffer.from(publicKeyHex, 'hex');
    const signature = Buffer.from(signatureHex, 'hex');
    if (rawKey.length !== 32 || signature.length !== 64) return false;

    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: 'der',
      type: 'spki',
    });

    const message = Buffer.from(timestamp + rawBody, 'utf8');
    return verify(null, message, keyObject, signature);
  } catch {
    return false;
  }
}
