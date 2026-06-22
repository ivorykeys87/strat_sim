/**
 * shareLink.ts
 *
 * Encode/decode Blockly workspace JSON into a URL-safe hash fragment so
 * strategies can be shared via a link.
 *
 * Hash format:  #strat=<base64url-encoded payload>
 *
 * The payload is either:
 *   - A deflate-raw compressed JSON string (preferred, when CompressionStream
 *     is available — Chrome 80+, Firefox 113+, Safari 16.4+).
 *   - A plain base64url-encoded JSON string (fallback for older environments).
 *
 * To distinguish the two at decode time the compressed payload is prefixed
 * with a single byte `0x01` before base64url-encoding; the plain fallback
 * is prefixed with `0x00`.
 *
 * Maximum encoded payload length: 7000 characters (browser URL safety).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HASH_LENGTH = 7000;
const HASH_PREFIX = '#strat=';

// Payload-type markers (prepended before base64url encoding)
const MARKER_PLAIN = 0x00;
const MARKER_DEFLATE = 0x01;

// ---------------------------------------------------------------------------
// base64url helpers (no external dependencies)
// ---------------------------------------------------------------------------

/** Encodes a Uint8Array to a base64url string. */
function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes a base64url string to a Uint8Array. */
function fromBase64url(str: string): Uint8Array {
  // Restore standard base64 padding
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** UTF-8 encode a string to bytes. */
function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** UTF-8 decode bytes to a string. */
function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Compression helpers
// ---------------------------------------------------------------------------

async function deflate(input: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cs = new (globalThis as any).CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  void writer.write(input);
  void writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await (reader.read() as Promise<{ done: boolean; value: Uint8Array }>);
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function inflate(input: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ds = new (globalThis as any).DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(input);
  void writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await (reader.read() as Promise<{ done: boolean; value: Uint8Array }>);
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function isCompressionStreamAvailable(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).CompressionStream === 'function'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encodes a workspace JSON object to a URL-safe base64url string suitable
 * for embedding in a URL hash.
 *
 * Tries deflate-raw compression first; falls back to plain base64url if
 * CompressionStream is unavailable.
 *
 * Throws if the encoded result would exceed MAX_HASH_LENGTH characters.
 */
export async function encodeWorkspaceToHash(json: object): Promise<string> {
  const jsonStr = JSON.stringify(json);
  const jsonBytes = encodeUtf8(jsonStr);

  let marker: number;
  let payloadBytes: Uint8Array;

  if (isCompressionStreamAvailable()) {
    const compressed = await deflate(jsonBytes);
    marker = MARKER_DEFLATE;
    payloadBytes = compressed;
  } else {
    marker = MARKER_PLAIN;
    payloadBytes = jsonBytes;
  }

  // Prepend the marker byte
  const withMarker = new Uint8Array(payloadBytes.length + 1);
  withMarker[0] = marker;
  withMarker.set(payloadBytes, 1);

  const encoded = toBase64url(withMarker);

  if (encoded.length > MAX_HASH_LENGTH) {
    throw new Error(
      'Strategy too large to share via URL — use Export JSON instead.',
    );
  }

  return encoded;
}

/**
 * Decodes a base64url payload (as returned by `encodeWorkspaceToHash`) back
 * to a workspace JSON object.
 *
 * Returns `null` if the payload is malformed or decompression fails.
 */
export async function decodeWorkspaceFromHash(hash: string): Promise<object | null> {
  try {
    const bytes = fromBase64url(hash);
    if (bytes.length < 2) return null;

    const marker = bytes[0];
    const payload = bytes.slice(1);

    let jsonStr: string;

    if (marker === MARKER_DEFLATE) {
      if (!isCompressionStreamAvailable()) {
        // Cannot decompress; try to treat as plain as a last resort
        return null;
      }
      const decompressed = await inflate(payload);
      jsonStr = decodeUtf8(decompressed);
    } else if (marker === MARKER_PLAIN) {
      jsonStr = decodeUtf8(payload);
    } else {
      return null;
    }

    const parsed = JSON.parse(jsonStr) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as object;
  } catch {
    return null;
  }
}

/**
 * Builds a full shareable URL embedding the encoded workspace in the hash.
 *
 * Throws (from `encodeWorkspaceToHash`) if the payload is too large.
 */
export async function buildShareUrl(json: object): Promise<string> {
  const encoded = await encodeWorkspaceToHash(json);
  return `${location.origin}${location.pathname}${HASH_PREFIX}${encoded}`;
}

/**
 * If `window.location.hash` starts with `#strat=`, extract and return the
 * raw hash payload (the part after `#strat=`). Otherwise returns null.
 */
export function extractHashPayload(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return hash.slice(HASH_PREFIX.length);
}
