// End-to-end encryption for the relay spike: AES-GCM with a 256-bit key
// that lives only in the link's fragment (#key=…), which browsers never
// send to a server. Excalidraw's model (prior-art.md, §5), with a fresh
// random IV per message, since one key encrypts many messages here.

const subtle = globalThis.crypto.subtle;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const toUrl = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = (url: string) => url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (url.length % 4)) % 4);

/** A random ID for a new room, safe in a URL path. */
export function newRoomId(): string {
  return toUrl(toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16))));
}

/** A new key, and its text form for the link's fragment. */
export async function newKey(): Promise<{ key: CryptoKey; text: string }> {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return { key: await importKey(toUrl(toBase64(raw))), text: toUrl(toBase64(raw)) };
}

export async function importKey(text: string): Promise<CryptoKey> {
  return subtle.importKey('raw', fromBase64(fromUrl(text)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt `plain`, bound to `room` as additional data, so the relay can't
 * move a message from one room to another. Returns base64 of IV + ciphertext.
 */
export async function seal(key: CryptoKey, room: string, plain: Uint8Array): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    // Copied, since WebCrypto won't take a view of a shared buffer.
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(room) }, key, new Uint8Array(plain)),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64(out);
}

/** Decrypt what `seal` made. Throws if the key is wrong or the message was changed. */
export async function unseal(key: CryptoKey, room: string, text: string): Promise<Uint8Array> {
  const bytes = fromBase64(text);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: new TextEncoder().encode(room) },
    key,
    bytes.subarray(12),
  );
  return new Uint8Array(plain);
}
