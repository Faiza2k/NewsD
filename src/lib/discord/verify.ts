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
  console.log('[discord verify] starting verification...', {
    hasPublicKey: Boolean(publicKeyHex),
    hasSignature: Boolean(signatureHex),
    hasTimestamp: Boolean(timestamp),
    rawBodyLength: rawBody.length
  });

  if (!publicKeyHex || !signatureHex || !timestamp) {
    console.error('[discord verify] missing params');
    return false;
  }

  // Reject stale timestamps (replay protection)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    console.error('[discord verify] invalid timestamp format', timestamp);
    return false;
  }
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  console.log('[discord verify] age seconds:', ageSec);
  if (ageSec > 60 * 60) { // Broadened to 1 hour to prevent timezone/drift issues
    console.error('[discord verify] timestamp too stale:', ageSec);
    return false;
  }

  try {
    const rawKey = Buffer.from(publicKeyHex, 'hex');
    const signature = Buffer.from(signatureHex, 'hex');
    if (rawKey.length !== 32 || signature.length !== 64) {
      console.error('[discord verify] key or signature length invalid');
      return false;
    }

    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: 'der',
      type: 'spki',
    });

    const message = Buffer.from(timestamp + rawBody, 'utf8');
    const isValid = verify(null, message, keyObject, signature);
    console.log('[discord verify] signature valid:', isValid);
    return isValid;
  } catch (err: any) {
    console.error('[discord verify] error during cryptographic verification:', err.message);
    return false;
  }
}
