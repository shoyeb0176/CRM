// Encryption for secrets we store on behalf of companies (AI provider keys, SMTP passwords).
// AES-256-GCM via WebCrypto, so it runs the same on Cloudflare Workers and Node.
//
// Key: APP_ENCRYPTION_KEY = 32 random bytes, base64. Set it once and never change it.
// Stored format: "enc:v1:<iv base64>:<ciphertext base64>". Values without that prefix are
// legacy plaintext (saved before encryption was enabled) and are returned as they are.

const PREFIX = "enc:v1:";

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey | null> {
  const raw = process.env.APP_ENCRYPTION_KEY; // read per call: Workers bind env per request
  if (!raw) return null;
  const bytes = fromB64(raw.trim());
  if (bytes.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypt a secret for storage. Without APP_ENCRYPTION_KEY it is stored as-is (legacy behaviour). */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  if (!key) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `${PREFIX}${toB64(iv)}:${toB64(ct)}`;
}

/** Decrypt a stored secret. Legacy plaintext values pass through unchanged. */
export async function decryptSecret(stored: string): Promise<string> {
  if (!isEncrypted(stored)) return stored;
  const key = await getKey();
  if (!key) throw new Error("A saved secret is encrypted but APP_ENCRYPTION_KEY is not set on this server.");
  const [ivB64, ctB64] = stored.slice(PREFIX.length).split(":");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("A saved secret could not be decrypted: APP_ENCRYPTION_KEY has changed since it was saved.");
  }
}
